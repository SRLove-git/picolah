import { randomUUID } from 'node:crypto';
import type { CountryCode } from '../shared/types.ts';
import { DEMO_CONVERSATIONS } from '../shared/demo-conversations.ts';
import { generateOffers, PRODUCTS, type GeneratedOffer } from '../shared/catalog.ts';
import { db, dbPath, type DbExecutor } from './db.ts';
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
  INSERT INTO offers (
    id, external_id, source, product_id, platform_id, seller, country, currency,
    item_price, shipping_fee, discount, final_price, url, rating, reviews,
    in_stock, is_official, last_seen, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (source, external_id) DO NOTHING
`;

async function writeOffers(
  offers: GeneratedOffer[],
  now: string,
  executor: DbExecutor = db,
): Promise<void> {
  for (const offer of offers) {
    await executor.run(insertOfferSql, [
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
    ]);
    for (const point of offer.history) {
      await executor.run(
        `INSERT INTO price_points (offer_id, recorded_at, price) VALUES (?, ?, ?)
         ON CONFLICT(offer_id, recorded_at) DO UPDATE SET price = excluded.price`,
        [offer.id, point.date, point.price],
      );
    }
  }
}

async function upsertProducts(now: string, executor: DbExecutor = db): Promise<void> {
  for (const product of PRODUCTS) {
    await executor.run(insertProductSql, [
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
    ]);
  }
}

/**
 * Older databases stored the demo rows with source='seed' and no external id.
 * Rewrite them to the crawler's identity so the mock crawler updates in place
 * instead of inserting duplicate offers.
 */
async function adoptLegacySeedOffers(executor: DbExecutor = db): Promise<number> {
  const legacy = await executor.all<{
    id: string;
    product_id: string;
    country: string;
    platform_id: string;
  }>("SELECT id, product_id, country, platform_id FROM offers WHERE source = 'seed' AND external_id IS NULL");

  let adopted = 0;
  for (const row of legacy) {
    const externalId = `mock-${row.country.toLowerCase()}-${row.product_id}-${row.platform_id}`;
    const clash = await executor.get<{ id: string }>(
      'SELECT id FROM offers WHERE source = ? AND external_id = ?',
      [MOCK_SOURCE, externalId],
    );
    if (clash && clash.id !== row.id) {
      await executor.run('DELETE FROM offers WHERE id = ?', [row.id]);
      continue;
    }
    await executor.run('UPDATE offers SET source = ?, external_id = ? WHERE id = ?', [
      MOCK_SOURCE,
      externalId,
      row.id,
    ]);
    adopted += 1;
  }
  return adopted;
}

async function syncCatalog(): Promise<{ added: number }> {
  const now = new Date().toISOString();
  let added = 0;
  await db.transaction(async (tx) => {
    await upsertProducts(now, tx);
    await adoptLegacySeedOffers(tx);
    const existing = new Set(
      (await tx.all<{ id: string }>('SELECT id FROM offers')).map((row) => row.id),
    );
    const missing = generateOffers().filter((offer) => !existing.has(offer.id));
    await writeOffers(missing, now, tx);
    added = missing.length;
  });
  return { added };
}

export async function seedDatabase(force = false): Promise<{
  seeded: boolean;
  offers: number;
  conversations: number;
  added?: number;
}> {
  const productCount = Number(
    (await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM products'))?.count || 0,
  );

  if (productCount > 0 && !force) {
    const { added } = await syncCatalog();
    return { seeded: false, offers: 0, conversations: 0, added };
  }

  const offers = generateOffers();
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    if (force) {
      await tx.run('DELETE FROM messages');
      await tx.run('DELETE FROM conversations');
      await tx.run('DELETE FROM ingest_runs');
      await tx.run('DELETE FROM price_points');
      await tx.run('DELETE FROM offers');
      await tx.run('DELETE FROM products');
    }

    await upsertProducts(now, tx);
    await writeOffers(offers, now, tx);

    await tx.run(
      `INSERT INTO ingest_runs (id, source, country, received, upserted, status, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        MOCK_SOURCE,
        'SG',
        offers.length,
        offers.length,
        'ok',
        '演示价格目录已装载',
        now,
      ],
    );
  });

  const conversations = await seedDemoConversations();
  return { seeded: true, offers: offers.length, conversations };
}

async function seedDemoConversations(): Promise<number> {
  const existing = Number(
    (await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM conversations'))?.count || 0,
  );
  if (existing > 0) return 0;

  let created = 0;
  for (const demo of DEMO_CONVERSATIONS) {
    const parsed = await parseQuery(demo.message, demo.market as CountryCode);
    const product = parsed.product || (await getProduct(demo.id));
    const comparison = await buildComparison({
      query: demo.message,
      market: parsed.market,
      product,
    });
    const answer = writeFallbackAnswer(comparison);
    const createdAt = new Date(Date.now() - demo.hoursAgo * 60 * 60 * 1000).toISOString();

    await createConversationWithId(demo.id, parsed.title, parsed.market, createdAt);
    await addMessage({
      conversationId: demo.id,
      role: 'user',
      content: demo.message,
      createdAt,
    });
    await addMessage({
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
  const result = await seedDatabase(force);
  console.log(
    result.seeded
      ? `Seeded ${result.offers} offers and ${result.conversations} demo conversations.`
      : `Catalog already present; added ${result.added ?? 0} missing offers.`,
  );
  console.log(`Database: ${dbPath}`);
}
