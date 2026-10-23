/**
 * Mock crawler — a stand-in for the separate crawler app described in the
 * README. It walks the demo catalog, nudges prices a little on every tick and
 * pushes a normal ingest batch to the API, so the gateway panel, "today's
 * updates", stock flags and price history all behave like a live feed.
 *
 * Usage:
 *   tsx mock/crawler.ts                 # run forever (default 120s interval)
 *   tsx mock/crawler.ts --once          # one batch, useful in CI / smoke tests
 *   tsx mock/crawler.ts --reset         # forget local price state and restart
 *   tsx mock/crawler.ts --interval=30000 --batch=12
 *
 * Environment:
 *   PICOLAH_API_BASE     default http://127.0.0.1:8787
 *   PICOLAH_INGEST_KEY   required outside the compose stack (falls back to .env value)
 *   MOCK_INTERVAL_MS     default 120000
 *   MOCK_BATCH_SIZE      default 8 (1-100)
 *   MOCK_STATE_FILE      default /app/mock-state/state.json (falls back to ./mock-state/state.json)
 *   MOCK_MARKETS         optional comma list, e.g. SG,MY
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MARKETS, COUNTRY_CODES, type CountryCode } from '../shared/types.ts';
import {
  CURRENCY_STEP,
  PRODUCTS,
  generateOffers,
  roundTo,
  type GeneratedOffer,
  type SeedProduct,
} from '../shared/catalog.ts';

const SOURCE = 'picolah-mock';

const API_BASE = (process.env.PICOLAH_API_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const INGEST_KEY =
  process.env.PICOLAH_INGEST_KEY || process.env.INGEST_API_KEY || 'pcl_dev_crawler_key';
const INTERVAL_MS = clampNumber(
  Number(process.env.MOCK_INTERVAL_MS || process.argv.find((arg) => arg.startsWith('--interval='))?.split('=')[1]),
  120_000,
  5_000,
  3_600_000,
);
const BATCH_SIZE = clampNumber(
  Number(process.env.MOCK_BATCH_SIZE || process.argv.find((arg) => arg.startsWith('--batch='))?.split('=')[1]),
  8,
  1,
  100,
);
const STATE_FILE = resolve(
  process.env.MOCK_STATE_FILE || resolve(process.cwd(), 'mock-state', 'state.json'),
);
const DRIFT = 0.004;
const ONCE = process.argv.includes('--once');
const RESET = process.argv.includes('--reset');
const MARKETS_TO_USE = parseMarkets(process.env.MOCK_MARKETS);

interface OfferState {
  /** Anchor price used to keep the random walk from drifting away forever. */
  baseItemPrice: number;
  itemPrice: number;
  shippingFee: number;
  discount: number;
  inStock: boolean;
}

interface CrawlerState {
  version: 1;
  tick: number;
  cursor: number;
  offers: Record<string, OfferState>;
}

let state: CrawlerState = loadState();
let running = true;

function clampNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function parseMarkets(raw: string | undefined): CountryCode[] {
  if (!raw) return [...COUNTRY_CODES];
  const wanted = raw
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is CountryCode => (COUNTRY_CODES as readonly string[]).includes(item));
  return wanted.length ? wanted : [...COUNTRY_CODES];
}

function externalId(offer: GeneratedOffer): string {
  return `mock-${offer.country.toLowerCase()}-${offer.productId}-${offer.platformId}`;
}

function loadState(): CrawlerState {
  if (!RESET && existsSync(STATE_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as CrawlerState;
      if (parsed?.version === 1 && parsed.offers) return parsed;
    } catch (error) {
      console.warn(`[mock-crawler] cannot read ${STATE_FILE}, starting fresh:`, errorMessage(error));
    }
  }

  const offers: Record<string, OfferState> = {};
  for (const offer of generateOffers()) {
    offers[externalId(offer)] = {
      baseItemPrice: offer.itemPrice,
      itemPrice: offer.itemPrice,
      shippingFee: offer.shippingFee,
      discount: offer.discount,
      inStock: offer.inStock,
    };
  }
  return { version: 1, tick: 0, cursor: 0, offers };
}

function saveState(): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  writeFileSync(temp, JSON.stringify(state));
  renameSync(temp, STATE_FILE);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pickBatch(market: CountryCode, all: GeneratedOffer[]): GeneratedOffer[] {
  const pool = all.filter((offer) => offer.country === market);
  if (!pool.length) return [];
  const start = (state.tick * BATCH_SIZE) % pool.length;
  const picked: GeneratedOffer[] = [];
  for (let index = 0; index < Math.min(BATCH_SIZE, pool.length); index += 1) {
    picked.push(pool[(start + index) % pool.length]);
  }
  return picked;
}

function nudgePrice(offer: GeneratedOffer): void {
  const key = externalId(offer);
  const current = state.offers[key] ?? {
    baseItemPrice: offer.itemPrice,
    itemPrice: offer.itemPrice,
    shippingFee: offer.shippingFee,
    discount: offer.discount,
    inStock: offer.inStock,
  };
  const step = CURRENCY_STEP[offer.country];
  const roll = Math.random();

  let itemPrice = roundTo(current.itemPrice * (1 + (roll - 0.5) * 2 * DRIFT), step);
  const floor = current.baseItemPrice * 0.88;
  const ceiling = current.baseItemPrice * 1.12;
  itemPrice = Math.min(ceiling, Math.max(floor, itemPrice));

  // Occasional flash discount / coupon change.
  let discount = current.discount;
  if (Math.random() < 0.12) {
    discount = Math.random() < 0.35 ? 0 : roundTo(itemPrice * (0.02 + Math.random() * 0.06), step);
  }

  // Stock churn: mostly in stock, occasionally sold out for a few ticks.
  let inStock = current.inStock;
  if (Math.random() < 0.03) inStock = !inStock;
  else if (!inStock && Math.random() < 0.25) inStock = true;

  state.offers[key] = { ...current, itemPrice, discount, inStock };
}

function buildOfferPayload(offer: GeneratedOffer, capturedAt: string) {
  const current = state.offers[externalId(offer)];
  return {
    externalId: externalId(offer),
    productId: offer.productId,
    platformId: offer.platformId,
    seller: offer.seller,
    itemPrice: current.itemPrice,
    shippingFee: current.shippingFee,
    discount: current.discount,
    url: offer.url,
    rating: offer.rating,
    reviews: offer.reviews,
    inStock: current.inStock,
    isOfficial: offer.isOfficial,
    capturedAt,
  };
}

function productMetadata(ids: string[]) {
  return PRODUCTS.filter((product: SeedProduct) => ids.includes(product.id)).map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    tagline: product.tagline,
    visual: product.visual,
    specs: product.specs,
    aliases: product.aliases,
  }));
}

interface IngestResponse {
  ok?: boolean;
  created?: number;
  updated?: number;
  error?: string;
  missingProducts?: string[];
  message?: string;
}

async function postBatch(payload: object): Promise<{ status: number; body: IngestResponse }> {
  const response = await fetch(`${API_BASE}/api/v1/ingest/offers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${INGEST_KEY}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  let body: IngestResponse = {};
  try {
    body = (await response.json()) as IngestResponse;
  } catch {
    // Empty / non-JSON error page; the status code is enough to log.
  }
  return { status: response.status, body };
}

async function tick(): Promise<void> {
  const market = MARKETS_TO_USE[state.cursor % MARKETS_TO_USE.length];
  state.cursor += 1;
  state.tick += 1;

  const all = generateOffers();
  const batch = pickBatch(market, all);
  if (!batch.length) return;

  for (const offer of batch) nudgePrice(offer);

  const capturedAt = new Date().toISOString();
  const payload = {
    source: SOURCE,
    country: market,
    offers: batch.map((offer) => buildOfferPayload(offer, capturedAt)),
  };

  const started = Date.now();
  try {
    let result = await postBatch(payload);

    // Safety net: if the API does not know a product yet, resend the batch with
    // its metadata instead of failing forever.
    if (result.status === 422 && result.body.error === 'UNKNOWN_PRODUCT') {
      const missing = result.body.missingProducts || [];
      result = await postBatch({ ...payload, products: productMetadata(missing) });
    }

    if (result.status >= 200 && result.status < 300) {
      saveState();
      const { created = 0, updated = 0 } = result.body;
      console.log(
        `[mock-crawler] tick=${state.tick} market=${market} batch=${batch.length} created=${created} updated=${updated} ${Date.now() - started}ms`,
      );
      return;
    }

    console.error(
      `[mock-crawler] tick=${state.tick} market=${market} HTTP ${result.status} ${result.body.error || ''} ${result.body.message || ''}`.trim(),
    );
    saveState();
  } catch (error) {
    console.error(
      `[mock-crawler] tick=${state.tick} market=${market} request failed: ${errorMessage(error)}`,
    );
    saveState();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main(): Promise<void> {
  console.log(
    `[mock-crawler] api=${API_BASE} source=${SOURCE} interval=${INTERVAL_MS}ms batch=${BATCH_SIZE} markets=${MARKETS_TO_USE.join(',')} state=${STATE_FILE}`,
  );

  if (ONCE) {
    await tick();
    return;
  }

  const shutdown = (signal: string) => {
    if (!running) return;
    running = false;
    console.log(`[mock-crawler] ${signal} received, stopping after current tick…`);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  while (running) {
    await tick();
    if (!running) break;
    const jitter = 0.85 + Math.random() * 0.3;
    await sleep(Math.round(INTERVAL_MS * jitter));
  }

  saveState();
  console.log('[mock-crawler] stopped');
}

if (MARKETS_TO_USE.some((code) => !MARKETS[code])) {
  console.error('[mock-crawler] unknown market in MOCK_MARKETS');
  process.exit(1);
}

void main().catch((error) => {
  console.error('[mock-crawler] fatal:', errorMessage(error));
  process.exit(1);
});
