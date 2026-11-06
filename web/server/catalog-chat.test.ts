import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Comparison, Product } from '../shared/types.ts';

let crawlerCalls = 0;
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
const crawler = createServer((_req, res) => { crawlerCalls++; res.writeHead(500).end(); });
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.PICOLAH_DB_PATH = ':memory:';
process.env.AUTH_REQUIRED = 'false';
process.env.LLM_API_KEY = '';
process.env.PRODUCT_SEARCH_SOURCE = 'catalog';
process.env.CRAWLER_TOOL_URL = await listen(crawler);
process.env.CRAWLER_TOOL_TOKEN = 'catalog-test-crawler-must-not-run';

const { app } = await import('./index.ts');
const { db } = await import('./db.ts');
const { config } = await import('./config.ts');
const { getOffers, getRegionalOfferCount } = await import('./repo.ts');
const server = createServer(app);
const baseUrl = await listen(server);
// Snapshot of the 58 public catalog identities and natural queries that were
// exercised against production. Prices deliberately aren't test fixtures.
const catalogQueries: Array<{ product: Product; query: string }> = JSON.parse(
  readFileSync(new URL('./fixtures/catalog-query-products.json', import.meta.url), 'utf8'),
);
for (const { product } of catalogQueries) {
  await db.run(
    `INSERT INTO products (id, name, brand, category, tagline, visual, specs, aliases, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    [product.id, product.name, product.brand, product.category, product.tagline, product.visual,
      product.specs, JSON.stringify(product.aliases), new Date().toISOString(), new Date().toISOString()],
  );
}
beforeEach(async () => {
  crawlerCalls = 0;
  config.productSearchSource = 'catalog';
  config.offerFreshnessHours = 24;
  await db.run("UPDATE offers SET source = 'picolah-mock', last_seen = ?", [new Date().toISOString()]);
});
after(async () => {
  for (const listener of [server, crawler]) {
    await new Promise<void>((resolve, reject) => {
      listener.close((error) => error ? reject(error) : resolve());
      listener.closeAllConnections();
    });
  }
  await db.close();
});
async function realQuotes() {
  await db.run("UPDATE offers SET source = 'picolah-crawler', item_price = 399, shipping_fee = 5, discount = 0, final_price = 404 WHERE product_id = 'sony-wh1000xm5'");
}
async function ask(message: string, conversationId?: string, market = 'SG') {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-picolah-user': 'anon-catalog-mode-test' },
    body: JSON.stringify({ message, conversationId, market }), signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  const events = (await response.text()).trim().split('\n\n').map((frame) => {
    const lines = frame.split('\n');
    return { name: lines[0].slice(7), data: JSON.parse(lines.find((line) => line.startsWith('data: '))!.slice(6)) };
  });
  assert.ok(events.some((event) => event.name === 'done'));
  assert.equal(crawlerCalls, 0, 'catalog mode must never call the configured crawler');
  const reply = events.filter((event) => event.name === 'delta').map((event) => event.data.text).join('');
  assert.doesNotMatch(reply, /商品库|数据库|入库|采集|抓取|爬虫/);
  if (events.some(event => event.name === 'results')) assert.ok(events.some((event) => event.name === 'status' && event.data.label === '正在查找商品报价…'));
  return {
    comparison: events.find((event) => event.name === 'results')?.data as Comparison,
    conversationId: events.find((event) => event.name === 'meta')!.data.conversationId as string,
    answer: events.filter((event) => event.name === 'delta').map((event) => event.data.text).join(''),
  };
}
test('catalog mode returns stored real quotes and preserves their collection time', async () => {
  await realQuotes();
  const result = await ask('Sony WH-1000XM5');
  assert.equal(result.comparison.product?.id, 'sony-wh1000xm5');
  assert.equal(result.comparison.offers.length, 4);
  assert.ok(result.comparison.offers.every((offer) => offer.country === 'SG' && offer.finalPrice === 404));
  assert.equal(result.comparison.search, undefined);
  assert.ok(result.comparison.offers.every((offer) => offer.source === 'catalog'));

  assert.match(result.answer, /商品价/);
  assert.match(result.answer, /预估合计|合计/);
  assert.doesNotMatch(result.answer, /商品库|数据库|入库|采集|抓取|爬虫/);
});
test('unknown model does not substitute a nearby model or trigger live fallback', async () => {
  await realQuotes();
  const result = await ask('Sony WH-1000XM6');
  assert.equal(result.comparison.product, null);
  assert.deepEqual(result.comparison.alternatives, []);
  assert.deepEqual(result.comparison.offers, []);
  assert.match(result.answer, /暂未找到/);
});
test('full catalog titles preserve product identity despite generic model parsing', async () => {
  for (const [name, id] of [
    ['iPhone 16 Pro 256GB', 'iphone-16-pro-256'],
    ['Samsung Galaxy S24 Ultra 256GB', 'galaxy-s24-ultra'],
    ['Xiaomi 14T Pro 512GB', 'xiaomi-14t-pro'],
    ['New Balance 530 复古跑鞋', 'new-balance-530'],
    ['Soundcore Liberty 4 NC 降噪豆', 'soundcore-liberty-4-nc'],
  ]) {
    const result = await ask(name);
    assert.equal(result.comparison.product?.id, id);
    assert.deepEqual(result.comparison.alternatives, []);
    assert.deepEqual(result.comparison.offers, []);
  }
});
test('missing imported fees and ratings retain unknown status', async () => {
  await realQuotes();
  await db.run("UPDATE offers SET shipping_fee = 0, rating = 0, reviews = 0, landed_price_confidence = 'estimated' WHERE product_id = 'sony-wh1000xm5'");
  const result = await ask('Sony WH-1000XM5');
  assert.ok(result.comparison.offers.length > 0);
  assert.ok(result.comparison.offers.every((offer) => offer.shippingKnown === false && offer.ratingKnown === false && offer.reviewsKnown === false));
});
test('catalog retains the last in-stock quote and its original date across the freshness cutoff', async () => {
  const demo = await ask('Sony WH-1000XM5');
  assert.deepEqual(demo.comparison.offers, []);
  const capturedAt = '2020-01-01T00:00:00.000Z';
  await realQuotes();
  await db.run("UPDATE offers SET last_seen = ? WHERE product_id = 'sony-wh1000xm5'", [capturedAt]);
  const stored = await ask('Sony WH-1000XM5');
  assert.equal(stored.comparison.offers.length, 4);
  assert.equal(stored.comparison.updatedAt, capturedAt);
  assert.ok(stored.comparison.offers.every(offer => offer.lastSeen === capturedAt && offer.finalPrice === 404));
  const id = stored.comparison.offers[0].id;
  try {
    await db.run('UPDATE offers SET in_stock = 0 WHERE id = ?', [id]);
    const result = await ask('Sony WH-1000XM5');
    assert.equal(result.comparison.offers.length, 3);
    assert.ok(result.comparison.offers.every(offer => offer.inStock && offer.id !== id));
  } finally {
    await db.run('UPDATE offers SET in_stock = 1 WHERE id = ?', [id]);
  }
});
test('regional counts follow the catalog or live offer policy', async () => {
  assert.equal(await getRegionalOfferCount('sony-wh1000xm5'), 0);
  await realQuotes();
  await db.run("UPDATE offers SET last_seen = '2020-01-01T00:00:00.000Z' WHERE product_id = 'sony-wh1000xm5'");
  assert.ok(await getRegionalOfferCount('sony-wh1000xm5') > 0);
  config.productSearchSource = 'live';
  assert.deepEqual(await getOffers('sony-wh1000xm5', 'SG'), []);
  assert.equal(await getRegionalOfferCount('sony-wh1000xm5'), 0);
});
test('follow-up platform selection uses all catalog platforms, including TikTok', async () => {
  await realQuotes();
  const first = await ask('Sony WH-1000XM5');
  const second = await ask('只看 TikTok', first.conversationId);
  assert.equal(second.comparison.product?.id, 'sony-wh1000xm5');
  assert.equal(second.comparison.offers.length, 1);
  assert.equal(second.comparison.offers[0].platformId, 'tiktok');
  const excluded = await ask('不要 Shopee', first.conversationId);
  assert.equal(excluded.comparison.offers.length, 3);
  assert.ok(excluded.comparison.offers.every((offer) => offer.platformId !== 'shopee'));
});
test('market and budget filters apply to stored landed prices', async () => {
  await realQuotes();
  const result = await ask('Sony WH-1000XM5 预算400', undefined, 'MY');
  assert.equal(result.comparison.market, 'MY');
  assert.deepEqual(result.comparison.offers, []);
  assert.match(result.answer, /预算/);
  const affordable = await ask('Sony WH-1000XM5 预算405', undefined, 'MY');
  assert.ok(affordable.comparison.offers.length > 0);
  assert.ok(affordable.comparison.offers.every((offer) => offer.country === 'MY' && offer.currency === 'MYR'));
});
test('category search returns catalog candidates and never guesses unknown capacities', async () => {
  const category = await ask('推荐耳机');
  assert.ok(category.comparison.alternatives.length > 1);
  assert.ok(category.comparison.alternatives.every((item) => item.product.category === '耳机'));
  const unknown = await ask('iPhone 15 512GB');
  assert.equal(unknown.comparison.product, null);
  assert.deepEqual(unknown.comparison.alternatives, []);
});
test('greeting and unsupported platform requests do not launch a crawler', async () => {
  const hello = await ask('你好');
  assert.equal(hello.comparison, undefined);
  assert.match(hello.answer, /帮你比价/);
  await realQuotes();
  const unsupported = await ask('Amazon Sony WH-1000XM5', undefined, 'MY');
  assert.ok(unsupported.comparison.unsupportedPlatforms?.includes('amazon-sg'));
  assert.deepEqual(unsupported.comparison.offers, []);
});

test('repeated catalog follow-ups preserve category and budget constraints', async () => {
  await realQuotes();
  const first = await ask('推荐耳机 预算400');
  const second = await ask('只看 Lazada', first.conversationId);
  const third = await ask('不要 Shopee', first.conversationId);
  for (const result of [first, second, third]) {
    assert.ok(result.comparison.alternatives.length > 1);
    assert.ok(result.comparison.alternatives.every((item) => item.offer === null));
  }
});

test('all 58 catalog products resolve by full name and everyday request', async (t) => {
  assert.equal(catalogQueries.length, 58);
  for (const { product, query } of catalogQueries) {
    await t.test(product.id, async () => {
      for (const message of [product.name, query]) {
        const result = await ask(message);
        assert.equal(result.comparison.product?.id, product.id, message);
        assert.deepEqual(result.comparison.alternatives, [], message);
      }
    });
  }
});

test('catalog questions keep complete identities in English and compact spellings', async () => {
  for (const [message, id] of [
    ['Where is iPhone 16 Pro 256GB cheapest in Singapore?', 'iphone-16-pro-256'],
    ['找一下iPhone16pro', 'iphone-16-pro-256'],
    ['Find New Balance 530 in Singapore', 'new-balance-530'],
    ['Find Philips NA221/09 in Singapore', 'philips-na221-09'],
    ['What is the price of SK-II Facial Treatment Essence 230ml in Singapore?', 'skii-facial-essence-230'],
    ["What's the current price for Sony WH-1000XM5 in Singapore?", 'sony-wh1000xm5'],
    ['How much is Philips HD3170/62 in Singapore?', 'philips-hd3170-62'],
    ['帮我查一下小米 G20 Max 吸尘器', 'xiaomi-vacuum-g20-max'],
    ['帮我查一下小米 G20 吸尘器', 'xiaomi-vacuum-g20'],
  ]) {
    const result = await ask(message);
    assert.equal(result.comparison.product?.id, id, message);
    assert.deepEqual(result.comparison.alternatives, [], message);
  }
});

test('absent model suffixes, generations, editions and capacities never substitute nearby products', async () => {
  for (const message of [
    'Philips NA221/08', '帮我查一下飞利浦 HD3170/61', 'Philips NA221/090',
    '小米 G20 Ultra', 'iPhone 17 Pro 256GB', 'iPhone 16 Pro 512GB',
    'iPhone 15 512GB', 'Sony WF-1000XM6', 'Philips NA221/09 4.3L',
    'What is the price of SK-II Facial Treatment Essence 250ml in Singapore?',
  ]) {
    const result = await ask(message);
    assert.equal(result.comparison.product, null, message);
    assert.deepEqual(result.comparison.alternatives, [], message);
    assert.deepEqual(result.comparison.offers, [], message);
  }
});

test('catalog follow-ups retain the repaired identity and apply capacity and price filters', async () => {
  const first = await ask('帮我查一下iPhone 16 Pro 256GB，新加坡有报价吗？');
  const second = await ask('只看 Lazada', first.conversationId);
  const third = await ask('预算400以内', first.conversationId);
  for (const result of [first, second, third]) assert.equal(result.comparison.product?.id, 'iphone-16-pro-256');
  const changed = await ask('换成512GB', first.conversationId);
  assert.equal(changed.comparison.product, null);
  assert.deepEqual(changed.comparison.alternatives, []);
});

test('removing a seeded catalog item survives startup and keeps its existing watch history', async () => {
  const { seedDatabase } = await import('./seed.ts');
  const { addWatchlist, listWatchlist } = await import('./watchlist.ts');
  const id = 'sony-wh1000xm5';
  const owner = 'anon-archived-watch';
  await realQuotes();
  const watch = await addWatchlist(owner, id, 'SG', null);
  assert.ok(watch);
  try {
    await db.run('UPDATE products SET catalog_removed_at = ? WHERE id = ?', [new Date().toISOString(), id]);
    await seedDatabase(false);
    const catalog = await (await fetch(`${baseUrl}/api/catalog?q=WH-1000XM5`)).json();
    assert.equal(catalog.total, 0);
    const { comparison } = await ask('Sony WH-1000XM5');
    assert.equal(comparison.product, null);
    assert.deepEqual(comparison.alternatives, []);
    assert.deepEqual(await getOffers(id, 'SG'), []);
    assert.equal(await getRegionalOfferCount(id), 0);
    assert.equal(await addWatchlist('another-owner', id, 'SG', null), null);
    const [saved] = await listWatchlist(owner);
    assert.equal(saved.id, watch.id);
    assert.equal(saved.product.id, id);
    assert.equal(saved.currentOffer, null);
  } finally {
    await db.run('UPDATE products SET catalog_removed_at = NULL WHERE id = ?', [id]);
    await db.run('DELETE FROM watchlist WHERE id = ?', [watch.id]);
  }
});

test('a removed short model cannot resolve to another vacuum via a category alias', async () => {
  const id = 'xiaomi-vacuum-g20';
  await db.run('UPDATE products SET catalog_removed_at = ? WHERE id = ?', [new Date().toISOString(), id]);
  try {
    const { comparison } = await ask('小米 G20 无线吸尘器');
    assert.equal(comparison.product, null);
    assert.deepEqual(comparison.alternatives, []);
    assert.equal((await ask('小米 G20 Max 无线吸尘器')).comparison.product?.id, 'xiaomi-vacuum-g20-max');
  } finally {
    await db.run('UPDATE products SET catalog_removed_at = NULL WHERE id = ?', [id]);
  }
});
