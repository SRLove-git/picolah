import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCTS } from './catalog-data.ts';
import { formatMoney } from './format.ts';
import { generateOffers } from '../shared/catalog.ts';
import { MARKETS, COUNTRY_CODES } from '../shared/types.ts';
import { buildCatalogComparison, buildCatalogSuggestions } from '../shared/comparison.ts';

process.env.PICOLAH_DB_PATH = ':memory:';
const { detectMarket, detectRequestedPlatforms, findProduct, findProducts, isContextualFollowUp, resolvePlatformDirective } = await import('./query.ts');

const products = PRODUCTS.map(({ baseSgd: _baseSgd, ...product }) => product);

test('demo catalog covers every market and every platform of that market', async () => {
  const offers = generateOffers();
  const expected = COUNTRY_CODES.reduce(
    (total, code) => total + PRODUCTS.length * MARKETS[code].platformIds.length,
    0,
  );
  assert.equal(offers.length, expected);
  assert.equal(new Set(offers.map((offer) => offer.id)).size, offers.length);

  for (const code of COUNTRY_CODES) {
    const inMarket = offers.filter((offer) => offer.country === code);
    assert.equal(inMarket.length, PRODUCTS.length * MARKETS[code].platformIds.length);
    assert.ok(inMarket.every((offer) => offer.currency === MARKETS[code].currency));
    assert.ok(inMarket.every((offer) => offer.finalPrice > 0));
    for (const platformId of MARKETS[code].platformIds) {
      assert.ok(inMarket.some((offer) => offer.platformId === platformId), `${code}/${platformId}`);
    }
  }
});

test('comparison builder sorts landed prices and keeps a 30-day low', async () => {
  const offers = generateOffers();
  const product = products.find((item) => item.id === 'sony-wh1000xm5')!;
  const comparison = buildCatalogComparison({
    query: 'Sony XM5',
    market: 'SG',
    product,
    products,
    offers,
  });
  assert.equal(comparison.kind, 'comparison');
  assert.equal(comparison.product?.id, product.id);
  assert.ok(comparison.offers.length >= 2);
  const prices = comparison.offers.map((offer) => offer.finalPrice);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  for (const offer of comparison.offers) {
    assert.ok(offer.low30d <= offer.finalPrice + 0.001);
    assert.ok(offer.history.length > 0);
  }
  assert.equal(comparison.alternatives.length, 3);
});

test('suggestions are returned when nothing matches', async () => {
  const offers = generateOffers();
  const comparison = buildCatalogSuggestions({
    query: '伴手礼',
    market: 'SG',
    products,
    offers,
  });
  assert.equal(comparison.kind, 'suggestions');
  assert.equal(comparison.alternatives.length, 4);
  assert.ok(comparison.alternatives.every((item) => item.offer !== null));
});

test('detects named markets and cities in Chinese and English', async () => {
  assert.equal(detectMarket('Sony XM5 在泰国哪里买最便宜？', 'SG'), 'TH');
  assert.equal(detectMarket('吉隆坡的 iPhone 15 报价', 'SG'), 'MY');
  assert.equal(detectMarket('Which AirPods deal is best in Manila?', 'SG'), 'PH');
  assert.equal(detectMarket('Singapore or Malaysia?', 'VN'), 'SG');
});

test('uses the selected market when no market is mentioned', async () => {
  assert.equal(detectMarket('Sony XM5 哪里买最便宜？', 'MY'), 'MY');
  assert.equal(detectMarket('Find me a cheap coffee machine', 'ID'), 'ID');
});

test('does not confuse English words with two-letter country codes', async () => {
  assert.equal(detectMarket('checking with a friend', 'SG'), 'SG');
  assert.equal(detectMarket('which id should I use?', 'MY'), 'MY');
  assert.equal(detectMarket('my budget is 500', 'SG'), 'SG');
  assert.equal(detectMarket('I am in SG this week', 'MY'), 'SG');
});

test('matches product aliases and specific model names', async () => {
  assert.equal((await findProduct('Sony WH-1000XM5 在马来西亚', products)).product?.id, 'sony-wh1000xm5');
  assert.equal((await findProduct('AirPods Pro 2 划算吗？', products)).product?.id, 'airpods-pro-2');
  assert.equal((await findProduct('越南小米空气炸锅 6L 降价了吗？', products)).product?.id, 'xiaomi-air-fryer-6l');
  assert.equal((await findProduct('菲律宾 New Balance 530 多少钱', products)).product?.id, 'new-balance-530');
  assert.equal((await findProduct('SK-II 神仙水比价', products)).product?.id, 'skii-facial-essence-230');
  assert.equal((await findProduct('索尼 WH 1000 XM 5 多少钱', products)).product?.id, 'sony-wh1000xm5');
  assert.equal((await findProduct('iphone16pro 256 gb 新加坡价格', products)).product?.id, 'iphone-16-pro-256');
  assert.equal((await findProduct('华为 watch-gt-5 46 mm', products)).product?.id, 'huawei-watch-gt5');
  assert.equal((await findProduct('Airpod Pro 2 多少钱', products)).product?.id, 'airpods-pro-2');
});

test('finds multiple explicitly named products without collapsing to one', async () => {
  assert.deepEqual(
    (await findProducts('Sony XM5 和 Bose QC Ultra 哪个好', products)).map((item) => item.product?.id),
    ['bose-qc-ultra', 'sony-wh1000xm5'],
  );
});

test('recognizes short contextual follow-up questions', async () => {
  assert.equal(isContextualFollowUp('那黑色的呢？'), true);
  assert.equal(isContextualFollowUp('第二个有没有官方店'), true);
  assert.equal(isContextualFollowUp('推荐一款适合跑步的新耳机'), false);
  assert.equal(isContextualFollowUp('只看lazada的'), true);
  assert.deepEqual(detectRequestedPlatforms('只看 Lazada 的'), ['lazada']);
  assert.deepEqual(detectRequestedPlatforms('对比 Shopee 和 Amazon SG'), ['shopee', 'amazon-sg']);
  assert.deepEqual(detectRequestedPlatforms('只看虾皮'), ['shopee']);
  assert.deepEqual(detectRequestedPlatforms('只看 TikTok Shop / 抖音'), ['tiktok']);
  assert.deepEqual(detectRequestedPlatforms('只看 Tokopedia 和 Tiki'), ['tokopedia', 'tiki']);
  assert.deepEqual(detectRequestedPlatforms('只看品牌官网'), ['official']);
  assert.equal((await findProduct('只看 Lazada 的', products)).product, null);
  assert.equal((await findProduct('只看 Shopee 和 TikTok Shop', products)).product, null);
});

test('keeps, excludes and resets platform filters across follow-up turns', async () => {
  const lazada = resolvePlatformDirective('只看 Lazada', 'SG');
  assert.deepEqual(lazada.platformIds, ['lazada']);
  assert.equal(lazada.mode, 'include');

  const inherited = resolvePlatformDirective('哪个最便宜', 'SG', lazada.platformIds);
  assert.deepEqual(inherited.platformIds, ['lazada']);
  assert.equal(inherited.mode, 'none');

  const excluded = resolvePlatformDirective('不要 Shopee', 'SG', inherited.platformIds);
  assert.equal(excluded.mode, 'exclude');
  assert.equal(excluded.platformIds.includes('shopee'), false);
  assert.equal(excluded.platformIds.includes('lazada'), true);

  const reset = resolvePlatformDirective('恢复全部平台', 'SG', excluded.platformIds);
  assert.deepEqual(reset.platformIds, []);
  assert.equal(reset.mode, 'reset');
});

test('marks platforms that are unavailable in the selected market', async () => {
  const amazonInMalaysia = resolvePlatformDirective('只看 Amazon', 'MY');
  assert.deepEqual(amazonInMalaysia.unsupported, ['amazon-sg']);
});

test('does not mistake a brand or category for a concrete product model', async () => {
  assert.equal((await findProduct('Sony 耳机有什么推荐', products)).product, null);
  assert.equal((await findProduct('苹果手机哪个比较好', products)).product, null);
  assert.equal((await findProduct('想买一个空气炸锅', products)).product, null);
  assert.equal((await findProduct('蓝牙音箱推荐', products)).product, null);
});

test('rejects unknown models and conflicting capacity variants', async () => {
  assert.equal((await findProduct('Sony WH-1000XM6 哪里便宜', products)).product, null);
  assert.equal((await findProduct('iPhone 15 256GB 多少钱', products)).product, null);
  assert.equal((await findProduct('小米空气炸锅 5L', products)).product, null);
});

test('falls back to suggestions when no product matches', async () => {
  assert.equal((await findProduct('我想买一个适合露营的礼物', products)).product, null);
});

test('formats local currencies without losing the market signal', async () => {
  assert.equal(formatMoney(400, 'SG'), 'S$400.00');
  assert.equal(formatMoney(1204.9, 'MY'), 'RM 1,204.90');
  assert.equal(formatMoney(12575000, 'ID'), 'Rp 12.575.000');
});
