import { randomUUID } from 'node:crypto';
import type {
  Comparison,
  ComparisonAlternative,
  ConversationDetail,
  ConversationSummary,
  CountryCode,
  GatewayStats,
  IngestRun,
  Offer,
  PricePoint,
  Product,
  ProductVisual,
} from '../shared/types.ts';
import { MARKETS, PLATFORMS } from '../shared/types.ts';
import { config } from './config.ts';
import { db, type DbExecutor } from './db.ts';

type Row = Record<string, any>;

function freshnessCutoff(): string | null {
  if (config.offerFreshnessHours <= 0) return null;
  return new Date(Date.now() - config.offerFreshnessHours * 3_600_000).toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function mapProduct(row: Row): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    brand: String(row.brand),
    category: String(row.category),
    tagline: String(row.tagline || ''),
    visual: String(row.visual || 'phone') as ProductVisual,
    specs: String(row.specs || ''),
    aliases: parseJson<string[]>(row.aliases, []),
  };
}

export function mapOffer(row: Row, history: PricePoint[] = []): Offer {
  const finalPrice = Number(row.final_price);
  const prices = history.map((point) => point.price);
  return {
    id: String(row.id),
    productId: String(row.product_id),
    platformId: String(row.platform_id),
    platform: PLATFORMS[String(row.platform_id)]?.name || String(row.platform_id),
    seller: String(row.seller),
    country: String(row.country) as CountryCode,
    currency: String(row.currency),
    itemPrice: Number(row.item_price),
    shippingFee: Number(row.shipping_fee),
    discount: Number(row.discount),
    landedPriceConfidence:
      row.landed_price_confidence === 'exact' ? 'exact' : 'estimated',
    finalPrice,
    url: String(row.url),
    rating: Number(row.rating),
    reviews: Number(row.reviews),
    inStock: Boolean(row.in_stock),
    isOfficial: Boolean(row.is_official),
    lastSeen: String(row.last_seen),
    low30d: prices.length ? Math.min(...prices, finalPrice) : finalPrice,
    history: prices,
  };
}

export async function listProducts(executor: DbExecutor = db): Promise<Product[]> {
  const rows = await executor.all<Row>('SELECT * FROM products ORDER BY name');
  return rows.map(mapProduct);
}

export async function getProduct(id: string, executor: DbExecutor = db): Promise<Product | null> {
  const row = await executor.get<Row>('SELECT * FROM products WHERE id = ?', [id]);
  return row ? mapProduct(row) : null;
}

function downsample(points: PricePoint[], limit: number): PricePoint[] {
  if (points.length <= limit) return points;
  const sampled: PricePoint[] = [];
  const step = (points.length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }
  return sampled;
}

export async function getPriceHistory(offerId: string, executor: DbExecutor = db): Promise<PricePoint[]> {
  // A real 30-day window, not "last 30 writes": the mock crawler can add many
  // points per day, and the 30-day low must stay meaningful.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await executor.all<Row>(
    `SELECT recorded_at, price FROM price_points
     WHERE offer_id = ? AND recorded_at >= ?
     ORDER BY recorded_at ASC`,
    [offerId, cutoff],
  );
  const points = rows.map((row) => ({ date: String(row.recorded_at), price: Number(row.price) }));
  return downsample(points, 24);
}

export async function getOffers(
  productId: string,
  country: CountryCode,
  includeOutOfStock = false,
  executor: DbExecutor = db,
): Promise<Offer[]> {
  const cutoff = freshnessCutoff();
  const rows = cutoff
    ? await executor.all<Row>(
        `SELECT * FROM offers
         WHERE product_id = ? AND country = ? ${includeOutOfStock ? '' : 'AND in_stock = 1'}
           AND last_seen >= ?
         ORDER BY final_price ASC`,
        [productId, country, cutoff],
      )
    : await executor.all<Row>(
        `SELECT * FROM offers
         WHERE product_id = ? AND country = ? ${includeOutOfStock ? '' : 'AND in_stock = 1'}
         ORDER BY final_price ASC`,
        [productId, country],
      );
  const offers: Offer[] = [];
  for (const row of rows) {
    offers.push(mapOffer(row, await getPriceHistory(String(row.id), executor)));
  }
  return offers;
}

export async function getRegionalOfferCount(
  productId?: string,
  executor: DbExecutor = db,
): Promise<number> {
  const cutoff = freshnessCutoff();
  const fresh = cutoff ? 'AND last_seen >= ?' : '';
  const values: unknown[] = productId ? [productId] : [];
  if (cutoff) values.push(cutoff);
  const row = await executor.get<Row>(
    `SELECT COUNT(*) AS count FROM offers
     WHERE in_stock = 1 ${productId ? 'AND product_id = ?' : ''} ${fresh}`,
    values,
  );
  return Number(row?.count || 0);
}

async function bestOfferFor(
  productId: string,
  country: CountryCode,
  platformIds: string[] = [],
  executor: DbExecutor = db,
): Promise<Offer | null> {
  const offers = await getOffers(productId, country, false, executor);
  return offers.find((offer) => !platformIds.length || platformIds.includes(offer.platformId)) || null;
}

async function getAlternatives(
  product: Product,
  market: CountryCode,
  platformIds: string[] = [],
  executor: DbExecutor = db,
): Promise<ComparisonAlternative[]> {
  const all = (await listProducts(executor)).filter((candidate) => candidate.id !== product.id);
  const sameCategory = all.filter((candidate) => candidate.category === product.category);
  const rest = all.filter((candidate) => candidate.category !== product.category);
  const ordered = [...sameCategory, ...rest].slice(0, 3);
  const alternatives: ComparisonAlternative[] = [];
  for (const candidate of ordered) {
    alternatives.push({
      product: candidate,
      offer: await bestOfferFor(candidate.id, market, platformIds, executor),
      market,
    });
  }
  return alternatives;
}

async function getSuggestions(
  market: CountryCode,
  platformIds: string[] = [],
  executor: DbExecutor = db,
): Promise<ComparisonAlternative[]> {
  const preferred = ['sony-wh1000xm5', 'iphone-15-128', 'skii-facial-essence-230', 'airpods-pro-2'];
  const products = await listProducts(executor);
  const ordered = [
    ...preferred.map((id) => products.find((product) => product.id === id)).filter(Boolean),
    ...products.filter((product) => !preferred.includes(product.id)),
  ] as Product[];
  const alternatives: ComparisonAlternative[] = [];
  for (const product of ordered.slice(0, 4)) {
    alternatives.push({
      product,
      offer: await bestOfferFor(product.id, market, platformIds, executor),
      market,
    });
  }
  return alternatives;
}

export async function buildComparison(
  options: {
    query: string;
    market: CountryCode;
    product: Product | null;
    kind?: Comparison['kind'];
    platformIds?: string[];
    unsupportedPlatforms?: string[];
  },
  executor: DbExecutor = db,
): Promise<Comparison> {
  const { query, market, product } = options;
  const platformIds = options.platformIds ?? [];
  const offers = product
    ? (await getOffers(product.id, market, false, executor)).filter(
        (offer) => !platformIds.length || platformIds.includes(offer.platformId),
      )
    : [];
  const kind = options.kind || (product ? 'comparison' : 'suggestions');
  const alternatives = product
    ? await getAlternatives(product, market, platformIds, executor)
    : await getSuggestions(market, platformIds, executor);
  const latest = offers.reduce((max, offer) => (offer.lastSeen > max ? offer.lastSeen : max), '');
  return {
    kind,
    query,
    market,
    product,
    offers,
    alternatives,
    totalOffers: platformIds.length ? offers.length : await getRegionalOfferCount(product?.id, executor),
    updatedAt: latest || new Date().toISOString(),
    sourceCount: new Set(offers.map((offer) => offer.platformId)).size,
    platformFilter: platformIds.length ? platformIds : undefined,
    unsupportedPlatforms: options.unsupportedPlatforms?.length
      ? options.unsupportedPlatforms
      : undefined,
  };
}

export async function buildRecommendationComparison(
  options: {
    query: string;
    market: CountryCode;
    productIds: string[];
    platformIds?: string[];
    unsupportedPlatforms?: string[];
  },
  executor: DbExecutor = db,
): Promise<Comparison> {
  const chosen: Product[] = [];
  for (const id of options.productIds) {
    if (chosen.length >= 4) break;
    const product = await getProduct(id, executor);
    if (product && !chosen.some((item) => item.id === product.id)) chosen.push(product);
  }

  const alternatives: ComparisonAlternative[] = [];
  if (chosen.length) {
    for (const product of chosen) {
      alternatives.push({
        product,
        offer: await bestOfferFor(product.id, options.market, options.platformIds, executor),
        market: options.market,
      });
    }
  } else {
    alternatives.push(...(await getSuggestions(options.market, options.platformIds, executor)));
  }

  const lastSeen = alternatives.reduce(
    (max, item) => (item.offer && item.offer.lastSeen > max ? item.offer.lastSeen : max),
    '',
  );

  return {
    kind: chosen.length ? 'recommendation' : 'suggestions',
    query: options.query,
    market: options.market,
    product: null,
    offers: [],
    alternatives,
    totalOffers: options.platformIds?.length
      ? alternatives.filter((item) => item.offer).length
      : await getRegionalOfferCount(undefined, executor),
    updatedAt: lastSeen || new Date().toISOString(),
    sourceCount: new Set(
      alternatives.flatMap((item) => (item.offer ? [item.offer.platformId] : [])),
    ).size,
    platformFilter: options.platformIds?.length ? options.platformIds : undefined,
    unsupportedPlatforms: options.unsupportedPlatforms?.length
      ? options.unsupportedPlatforms
      : undefined,
  };
}

interface ConversationRow extends Row {
  preview?: string | null;
  message_count?: number;
}

function mapConversation(row: ConversationRow): ConversationSummary {
  return {
    id: String(row.id),
    title: String(row.title),
    market: String(row.market) as CountryCode,
    preview: String(row.preview || ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listConversations(executor: DbExecutor = db): Promise<ConversationSummary[]> {
  const rows = await executor.all<ConversationRow>(
    `SELECT c.*,
      (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.role = 'assistant'
       ORDER BY m.created_at DESC LIMIT 1) AS preview,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
     FROM conversations c
     ORDER BY c.updated_at DESC
     LIMIT 60`,
  );
  return rows.map(mapConversation);
}

export async function getConversation(
  id: string,
  executor: DbExecutor = db,
): Promise<ConversationDetail | null> {
  const row = await executor.get<ConversationRow>('SELECT * FROM conversations WHERE id = ?', [id]);
  if (!row) return null;
  const messages = await executor.all<Row>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [id],
  );
  return {
    ...mapConversation(row),
    messages: messages.map((message) => {
      const metadata = parseJson<{ comparison?: Comparison; image?: string }>(message.metadata, {});
      return {
        id: String(message.id),
        role: String(message.role) as 'user' | 'assistant',
        content: String(message.content),
        createdAt: String(message.created_at),
        comparison: metadata.comparison,
        image: typeof metadata.image === 'string' ? metadata.image : undefined,
      };
    }),
  };
}

export async function createConversation(
  title: string,
  market: CountryCode,
  executor: DbExecutor = db,
): Promise<ConversationSummary> {
  const now = new Date().toISOString();
  const id = randomUUID();
  await executor.run(
    'INSERT INTO conversations (id, title, market, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, title, market, now, now],
  );
  return { id, title, market, preview: '', createdAt: now, updatedAt: now };
}

export async function createConversationWithId(
  id: string,
  title: string,
  market: CountryCode,
  createdAt: string,
  executor: DbExecutor = db,
): Promise<void> {
  await executor.run(
    'INSERT INTO conversations (id, title, market, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, title, market, createdAt, createdAt],
  );
}

export async function updateConversationTitle(
  id: string,
  title: string,
  executor: DbExecutor = db,
): Promise<void> {
  await executor.run('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?', [
    title,
    new Date().toISOString(),
    id,
  ]);
}

export async function touchConversation(
  id: string,
  updatedAt = new Date().toISOString(),
  executor: DbExecutor = db,
): Promise<void> {
  await executor.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [updatedAt, id]);
}

export async function addMessage(
  options: {
    id?: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: object;
    createdAt?: string;
  },
  executor: DbExecutor = db,
): Promise<string> {
  const id = options.id || randomUUID();
  const createdAt = options.createdAt || new Date().toISOString();
  await executor.run(
    'INSERT INTO messages (id, conversation_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      id,
      options.conversationId,
      options.role,
      options.content,
      options.metadata ? JSON.stringify(options.metadata) : null,
      createdAt,
    ],
  );
  await touchConversation(options.conversationId, createdAt, executor);
  return id;
}

export async function deleteConversation(id: string, executor: DbExecutor = db): Promise<void> {
  await executor.run('DELETE FROM conversations WHERE id = ?', [id]);
}

export async function getIngestRuns(limit = 6, executor: DbExecutor = db): Promise<IngestRun[]> {
  const rows = await executor.all<Row>(
    'SELECT * FROM ingest_runs ORDER BY created_at DESC LIMIT ?',
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    source: String(row.source),
    country: String(row.country) as CountryCode,
    received: Number(row.received),
    upserted: Number(row.upserted),
    status: String(row.status) as IngestRun['status'],
    message: String(row.message || ''),
    createdAt: String(row.created_at),
  }));
}

export async function getGatewayStats(executor: DbExecutor = db): Promise<GatewayStats> {
  const offers = Number(
    (await executor.get<Row>('SELECT COUNT(*) AS count FROM offers WHERE in_stock = 1'))?.count || 0,
  );
  const products = Number(
    (await executor.get<Row>('SELECT COUNT(*) AS count FROM products'))?.count || 0,
  );
  const markets = Number(
    (await executor.get<Row>('SELECT COUNT(DISTINCT country) AS count FROM offers'))?.count || 0,
  );
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayOffers = Number(
    (
      await executor.get<Row>('SELECT COUNT(*) AS count FROM offers WHERE updated_at >= ?', [
        todayStart.toISOString(),
      ])
    )?.count || 0,
  );
  const runs = await getIngestRuns(6, executor);
  return {
    offers,
    products,
    markets,
    todayOffers,
    lastRun: runs[0] || null,
    runs,
    endpoint: '/api/v1/ingest/offers',
    ingestConfigured: true,
  };
}

export function ensureMarket(value: string): CountryCode {
  if (!(value in MARKETS)) throw new Error(`Unsupported market: ${value}`);
  return value as CountryCode;
}
