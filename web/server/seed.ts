import { randomUUID } from 'node:crypto';
import type { CountryCode } from '../shared/types.ts';
import { DEMO_CONVERSATIONS } from '../shared/demo-conversations.ts';
import { generateOffers, PRODUCTS, type GeneratedOffer } from '../shared/catalog.ts';
import { db, dbPath } from './db.ts';
import { addMessage, buildComparison, createConversationWithId, getProduct } from './repo.ts';
import { parseQuery } from './query.ts';
import { writeFallbackAnswer } from './copy.ts';

const MOCK_SOURCE = 'picolah-mock';

/** Stable id shared with mock/crawler.ts so crawler batches update seeded rows. */
function externalIdFor(offer: GeneratedOffer): string {
  return `mock-${offer.country.toLowerCase()}-${offer.productId}-${offer.platformId}`;
}

const insertProductSql = `
  INSERT INTO products (id, name, brand, category, tagline, visual, specs, aliases, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    brand = excluded.brand,
    category = excluded.category,
    tagline = excluded.tagline,
    visual = excluded.visual,
    specs = excluded.specs,
    aliases = excluded.aliases,
    updated_at = excluded.updated_at
`;

const insertOfferSql = `
  INSERT OR IGNORE INTO offers (
    id, external_id, source, product_id, platform_id, seller, country, currency,
    item_price, shipping_fee, discount, final_price, url, rating, reviews,
    in_stock, is_official, last_seen, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function writeOffers(offers: GeneratedOffer[], now: string): void {
  const insertOffer = db.prepare(insertOfferSql);
  const insertPoint = db.prepare(
    'INSERT OR REPLACE INTO price_points (offer_id, recorded_at, price) VALUES (?, ?, ?)',
  );
  for (const offer of offers) {
    insertOffer.run(
      offer.id,
      externalIdFor(offer),
      MOCK_SOURCE,
      offer.productId,
      offer.platformId,
      offer.seller,
      offer.country,
      offer.currency,
      offer.itemPrice,
      offer.shippingFee,
      offer.discount,
      offer.finalPrice,
      offer.url,
      offer.rating,
      offer.reviews,
      offer.inStock ? 1 : 0,
      offer.isOfficial ? 1 : 0,
      offer.lastSeen,
      now,
      now,
    );
    for (const point of offer.history) {
      insertPoint.run(offer.id, point.date, point.price);
    }
  }
}

function upsertProducts(now: string): void {
  const statement = db.prepare(insertProductSql);
  for (const product of PRODUCTS) {
    statement.run(
      product.id,
      product.name,
      product.brand,
      product.category,
      product.tagline,
      product.visual,
      product.specs,
      JSON.stringify(product.aliases),
      now,
      now,
    );
  }
}

/**
 * Older databases stored the demo rows with source='seed' and no external id.
 * Rewrite them to the crawler's identity so the mock crawler updates in place
 * instead of inserting duplicate offers.
 */
function adoptLegacySeedOffers(): number {
  const legacy = db
    .prepare("SELECT id, product_id, country, platform_id FROM offers WHERE source = 'seed' AND external_id IS NULL")
    .all() as { id: string; product_id: string; country: string; platform_id: string }[];

  const findExisting = db.prepare('SELECT id FROM offers WHERE source = ? AND external_id = ?');
  const update = db.prepare('UPDATE offers SET source = ?, external_id = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM offers WHERE id = ?');
  let adopted = 0;

  for (const row of legacy) {
    const externalId = `mock-${row.country.toLowerCase()}-${row.product_id}-${row.platform_id}`;
    const clash = findExisting.get(MOCK_SOURCE, externalId) as { id: string } | undefined;
    if (clash && clash.id !== row.id) {
      remove.run(row.id);
      continue;
    }
    update.run(MOCK_SOURCE, externalId, row.id);
    adopted += 1;
  }
  return adopted;
}

function syncCatalog(): { added: number } {
  const now = new Date().toISOString();
  upsertProducts(now);
  adoptLegacySeedOffers();

  const existing = new Set(
    (db.prepare('SELECT id FROM offers').all() as { id: string }[]).map((row) => row.id),
  );
  const missing = generateOffers().filter((offer) => !existing.has(offer.id));
  writeOffers(missing, now);
  return { added: missing.length };
}

export function seedDatabase(force = false): {
  seeded: boolean;
  offers: number;
  conversations: number;
  added?: number;
} {
  const productCount = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }).count,
  );

  if (productCount > 0 && !force) {
    const { added } = syncCatalog();
    return { seeded: false, offers: 0, conversations: 0, added };
  }

  const offers = generateOffers();
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    if (force) {
      db.exec(`
        DELETE FROM messages;
        DELETE FROM conversations;
        DELETE FROM ingest_runs;
        DELETE FROM price_points;
        DELETE FROM offers;
        DELETE FROM products;
      `);
    }

    upsertProducts(now);
    writeOffers(offers, now);

    db.prepare(
      `INSERT INTO ingest_runs (id, source, country, received, upserted, status, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      MOCK_SOURCE,
      'SG',
      offers.length,
      offers.length,
      'ok',
      '演示价格目录已装载',
      now,
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const conversations = seedDemoConversations();
  return { seeded: true, offers: offers.length, conversations };
}

function seedDemoConversations(): number {
  const existing = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM conversations').get() as { count: number }).count,
  );
  if (existing > 0) return 0;

  let created = 0;
  for (const demo of DEMO_CONVERSATIONS) {
    const parsed = parseQuery(demo.message, demo.market);
    const product = parsed.product || getProduct(demo.id);
    const comparison = buildComparison({
      query: demo.message,
      market: parsed.market,
      product,
    });
    const answer = writeFallbackAnswer(comparison);
    const createdAt = new Date(Date.now() - demo.hoursAgo * 60 * 60 * 1000).toISOString();

    createConversationWithId(demo.id, parsed.title, parsed.market, createdAt);
    addMessage({
      conversationId: demo.id,
      role: 'user',
      content: demo.message,
      createdAt,
    });
    addMessage({
      conversationId: demo.id,
      role: 'assistant',
      content: answer,
      metadata: { comparison },
      createdAt: new Date(Date.now() - demo.hoursAgo * 60 * 60 * 1000 + 20_000).toISOString(),
    });
    created += 1;
  }
  return created;
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('/server/seed.ts');
if (invokedDirectly) {
  const force = process.argv.includes('--force');
  const result = seedDatabase(force);
  console.log(
    result.seeded
      ? `Seeded ${result.offers} offers and ${result.conversations} demo conversations.`
      : `Catalog already present; added ${result.added ?? 0} missing offers.`,
  );
  console.log(`Database: ${dbPath}`);
}
