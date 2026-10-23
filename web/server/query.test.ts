import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCTS } from './catalog-data.ts';
import { formatMoney } from './format.ts';
import { generateOffers } from '../shared/catalog.ts';
import { MARKETS, COUNTRY_CODES } from '../shared/types.ts';
import { buildCatalogComparison, buildCatalogSuggestions } from '../shared/comparison.ts';

process.env.PICOLAH_DB_PATH = ':memory:';
const { detectMarket, findProduct } = await import('./query.ts');

const products = PRODUCTS.map(({ baseSgd: _baseSgd, ...product }) => product);

test('demo catalog covers every market and every platform of that market', () => {
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

test('comparison builder sorts landed prices and keeps a 30-day low', () => {
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

test('suggestions are returned when nothing matches', () => {
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

test('detects named markets and cities in Chinese and English', () => {
  assert.equal(detectMarket('Sony XM5 在泰国哪里买最便宜？', 'SG'), 'TH');
  assert.equal(detectMarket('吉隆坡的 iPhone 15 报价', 'SG'), 'MY');
  assert.equal(detectMarket('Which AirPods deal is best in Manila?', 'SG'), 'PH');
  assert.equal(detectMarket('Singapore or Malaysia?', 'VN'), 'SG');
});

test('uses the selected market when no market is mentioned', () => {
  assert.equal(detectMarket('Sony XM5 哪里买最便宜？', 'MY'), 'MY');
  assert.equal(detectMarket('Find me a cheap coffee machine', 'ID'), 'ID');
});

test('does not confuse English words with two-letter country codes', () => {
  assert.equal(detectMarket('checking with a friend', 'SG'), 'SG');
  assert.equal(detectMarket('which id should I use?', 'MY'), 'MY');
  assert.equal(detectMarket('my budget is 500', 'SG'), 'SG');
  assert.equal(detectMarket('I am in SG this week', 'MY'), 'SG');
});

test('matches product aliases and specific model names', () => {
  assert.equal(findProduct('Sony WH-1000XM5 在马来西亚', products).product?.id, 'sony-wh1000xm5');
  assert.equal(findProduct('AirPods Pro 2 划算吗？', products).product?.id, 'airpods-pro-2');
  assert.equal(findProduct('越南小米空气炸锅 6L 降价了吗？', products).product?.id, 'xiaomi-air-fryer-6l');
  assert.equal(findProduct('菲律宾 New Balance 530 多少钱', products).product?.id, 'new-balance-530');
  assert.equal(findProduct('SK-II 神仙水比价', products).product?.id, 'skii-facial-essence-230');
});

test('falls back to suggestions when no product matches', () => {
  assert.equal(findProduct('我想买一个适合露营的礼物', products).product, null);
});

test('formats local currencies without losing the market signal', () => {
  assert.equal(formatMoney(400, 'SG'), 'S$400.00');
  assert.equal(formatMoney(1204.9, 'MY'), 'RM 1,204.90');
  assert.equal(formatMoney(12575000, 'ID'), 'Rp 12.575.000');
});
