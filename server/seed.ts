import { randomUUID } from 'node:crypto';
import type { CountryCode } from '../shared/types.ts';
import { db, dbPath } from './db.ts';
import { generateOffers, PRODUCTS } from './catalog-data.ts';
import { addMessage, buildComparison, createConversationWithId, getProduct } from './repo.ts';
import { parseQuery } from './query.ts';
import { writeFallbackAnswer } from './copy.ts';

export function seedDatabase(force = false): { seeded: boolean; offers: number; conversations: number } {
  const productCount = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }).count,
  );

  if (productCount > 0 && !force) {
    return { seeded: false, offers: 0, conversations: 0 };
  }

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

    const now = new Date().toISOString();
    const insertProduct = db.prepare(`
      INSERT INTO products (id, name, brand, category, tagline, visual, specs, aliases, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const product of PRODUCTS) {
      insertProduct.run(
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

    const offers = generateOffers();
    const insertOffer = db.prepare(`
      INSERT INTO offers (
        id, external_id, source, product_id, platform_id, seller, country, currency,
        item_price, shipping_fee, discount, final_price, url, rating, reviews,
        in_stock, is_official, last_seen, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPoint = db.prepare(
      'INSERT OR REPLACE INTO price_points (offer_id, recorded_at, price) VALUES (?, ?, ?)',
    );

    for (const offer of offers) {
      insertOffer.run(
        offer.id,
        null,
        'seed',
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

    db.prepare(
      `INSERT INTO ingest_runs (id, source, country, received, upserted, status, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      'demo-catalog',
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
  return { seeded: true, offers: generateOffers().length, conversations };
}

interface DemoSeed {
  id: string;
  message: string;
  market: CountryCode;
  hoursAgo: number;
}

const DEMOS: DemoSeed[] = [
  {
    id: 'demo-sony-malaysia',
    message: 'Sony WH-1000XM5 在马来西亚哪里买最便宜？',
    market: 'MY',
    hoursAgo: 2.2,
  },
  {
    id: 'demo-iphone-thailand',
    message: '泰国 iPhone 15 128G 现在到手价多少？',
    market: 'TH',
    hoursAgo: 26,
  },
  {
    id: 'demo-airpods-indonesia',
    message: '印尼买 AirPods Pro 2 划算吗？',
    market: 'ID',
    hoursAgo: 31,
  },
  {
    id: 'demo-nb-philippines',
    message: '菲律宾 New Balance 530 多少钱？',
    market: 'PH',
    hoursAgo: 53,
  },
  {
    id: 'demo-skii-singapore',
    message: '新加坡的 SK-II 神仙水 230ml，哪家更划算？',
    market: 'SG',
    hoursAgo: 75,
  },
  {
    id: 'demo-airfryer-vietnam',
    message: '越南小米空气炸锅 6L 最近降价了吗？',
    market: 'VN',
    hoursAgo: 121,
  },
];

function seedDemoConversations(): number {
  const existing = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM conversations').get() as { count: number }).count,
  );
  if (existing > 0) return 0;

  let created = 0;
  for (const demo of DEMOS) {
    const parsed = parseQuery(demo.message, demo.market);
    const product = parsed.product || getProduct(demo.id);
    if (!product) continue;
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
      : 'Database already has data. Use --force to reset.',
  );
  console.log(`Database: ${dbPath}`);
}
