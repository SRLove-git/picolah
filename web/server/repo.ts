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
import { db } from './db.ts';

type Row = Record<string, any>;

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

export function listProducts(): Product[] {
  return (db.prepare('SELECT * FROM products ORDER BY name').all() as Row[]).map(mapProduct);
}

export function getProduct(id: string): Product | null {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Row | undefined;
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

export function getPriceHistory(offerId: string): PricePoint[] {
  // A real 30-day window, not "last 30 writes": the mock crawler can add many
  // points per day, and the 30-day low must stay meaningful.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT recorded_at, price FROM price_points
       WHERE offer_id = ? AND recorded_at >= ?
       ORDER BY recorded_at ASC`,
    )
    .all(offerId, cutoff) as Row[];
  const points = rows.map((row) => ({ date: String(row.recorded_at), price: Number(row.price) }));
  return downsample(points, 24);
}

export function getOffers(productId: string, country: CountryCode, includeOutOfStock = false): Offer[] {
  const rows = db
    .prepare(
      `SELECT * FROM offers
       WHERE product_id = ? AND country = ? ${includeOutOfStock ? '' : 'AND in_stock = 1'}
       ORDER BY final_price ASC`,
    )
    .all(productId, country) as Row[];
  return rows.map((row) => mapOffer(row, getPriceHistory(String(row.id))));
}

export function getRegionalOfferCount(productId?: string): number {
  const row = productId
    ? (db
        .prepare('SELECT COUNT(*) AS count FROM offers WHERE product_id = ? AND in_stock = 1')
        .get(productId) as Row)
    : (db.prepare('SELECT COUNT(*) AS count FROM offers WHERE in_stock = 1').get() as Row);
  return Number(row?.count || 0);
}

function bestOfferFor(productId: string, country: CountryCode): Offer | null {
  const rows = db
    .prepare(
      'SELECT * FROM offers WHERE product_id = ? AND country = ? AND in_stock = 1 ORDER BY final_price ASC LIMIT 1',
    )
    .all(productId, country) as Row[];
  if (!rows[0]) return null;
  return mapOffer(rows[0], getPriceHistory(String(rows[0].id)));
}

function getAlternatives(product: Product, market: CountryCode): ComparisonAlternative[] {
  const all = listProducts().filter((candidate) => candidate.id !== product.id);
  const sameCategory = all.filter((candidate) => candidate.category === product.category);
  const rest = all.filter((candidate) => candidate.category !== product.category);
  return [...sameCategory, ...rest].slice(0, 3).map((candidate) => ({
    product: candidate,
    offer: bestOfferFor(candidate.id, market),
    market,
  }));
}

function getSuggestions(market: CountryCode): ComparisonAlternative[] {
  const preferred = ['sony-wh1000xm5', 'iphone-15-128', 'skii-facial-essence-230', 'airpods-pro-2'];
  const products = listProducts();
  const ordered = [
    ...preferred.map((id) => products.find((product) => product.id === id)).filter(Boolean),
    ...products.filter((product) => !preferred.includes(product.id)),
  ] as Product[];
  return ordered.slice(0, 4).map((product) => ({
    product,
    offer: bestOfferFor(product.id, market),
    market,
  }));
}

export function buildComparison(options: {
  query: string;
  market: CountryCode;
  product: Product | null;
  kind?: Comparison['kind'];
}): Comparison {
  const { query, market, product } = options;
  const offers = product ? getOffers(product.id, market) : [];
  const kind = options.kind || (product ? 'comparison' : 'suggestions');
  const alternatives = product ? getAlternatives(product, market) : getSuggestions(market);
  const latest = offers.reduce((max, offer) => (offer.lastSeen > max ? offer.lastSeen : max), '');
  return {
    kind,
    query,
    market,
    product,
    offers,
    alternatives,
    totalOffers: getRegionalOfferCount(product?.id),
    updatedAt: latest || new Date().toISOString(),
    sourceCount: new Set(offers.map((offer) => offer.platformId)).size,
  };
}

export function buildRecommendationComparison(options: {
  query: string;
  market: CountryCode;
  productIds: string[];
}): Comparison {
  const chosen: Product[] = [];
  for (const id of options.productIds) {
    if (chosen.length >= 4) break;
    const product = getProduct(id);
    if (product && !chosen.some((item) => item.id === product.id)) chosen.push(product);
  }

  const alternatives: ComparisonAlternative[] = chosen.length
    ? chosen.map((product) => ({
        product,
        offer: bestOfferFor(product.id, options.market),
        market: options.market,
      }))
    : getSuggestions(options.market);

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
    totalOffers: getRegionalOfferCount(),
    updatedAt: lastSeen || new Date().toISOString(),
    sourceCount: new Set(
      alternatives.flatMap((item) => (item.offer ? [item.offer.platformId] : [])),
    ).size,
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

export function listConversations(): ConversationSummary[] {
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.role = 'assistant'
         ORDER BY m.created_at DESC LIMIT 1) AS preview,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c
       ORDER BY c.updated_at DESC
       LIMIT 60`,
    )
    .all() as ConversationRow[];
  return rows.map(mapConversation);
}

export function getConversation(id: string): ConversationDetail | null {
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined;
  if (!row) return null;
  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(id) as Row[];
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

export function createConversation(title: string, market: CountryCode): ConversationSummary {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO conversations (id, title, market, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, title, market, now, now);
  return { id, title, market, preview: '', createdAt: now, updatedAt: now };
}

export function createConversationWithId(
  id: string,
  title: string,
  market: CountryCode,
  createdAt: string,
): void {
  db.prepare(
    'INSERT INTO conversations (id, title, market, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, title, market, createdAt, createdAt);
}

export function updateConversationTitle(id: string, title: string): void {
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(
    title,
    new Date().toISOString(),
    id,
  );
}

export function touchConversation(id: string, updatedAt = new Date().toISOString()): void {
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(updatedAt, id);
}

export function addMessage(options: {
  id?: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: object;
  createdAt?: string;
}): string {
  const id = options.id || randomUUID();
  const createdAt = options.createdAt || new Date().toISOString();
  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    options.conversationId,
    options.role,
    options.content,
    options.metadata ? JSON.stringify(options.metadata) : null,
    createdAt,
  );
  touchConversation(options.conversationId, createdAt);
  return id;
}

export function deleteConversation(id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function getIngestRuns(limit = 6): IngestRun[] {
  const rows = db
    .prepare('SELECT * FROM ingest_runs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Row[];
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

export function getGatewayStats(): GatewayStats {
  const offers = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM offers WHERE in_stock = 1').get() as Row).count,
  );
  const products = Number((db.prepare('SELECT COUNT(*) AS count FROM products').get() as Row).count);
  const markets = Number(
    (db.prepare('SELECT COUNT(DISTINCT country) AS count FROM offers').get() as Row).count,
  );
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayOffers = Number(
    (
      db
        .prepare('SELECT COUNT(*) AS count FROM offers WHERE updated_at >= ?')
        .get(todayStart.toISOString()) as Row
    ).count,
  );
  const runs = getIngestRuns();
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
