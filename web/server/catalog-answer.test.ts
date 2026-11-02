import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCatalogAnswerMessages } from './agent/catalog-answer.ts';
import type { Comparison, Offer } from '../shared/types.ts';

const offer: Offer = {
  id: 'verified', productId: 'sony', platformId: 'lazada', platform: 'Lazada', seller: 'Sony',
  country: 'SG', currency: 'SGD', itemPrice: 329, shippingFee: 1.99, discount: 0, finalPrice: 330.99,
  landedPriceConfidence: 'estimated', url: 'https://www.lazada.sg/products/pdp-i2322132553-s13495652784.html',
  rating: 4.9, reviews: 684, inStock: true, isOfficial: false,
  lastSeen: '2026-11-02T11:19:19.076Z', low30d: 330.99, history: [330.99],
};
const comparison: Comparison = {
  kind: 'comparison', query: 'Sony WH-1000XM5', market: 'SG',
  product: { id: 'sony', name: 'Sony WH-1000XM5', brand: 'Sony', category: '耳机', visual: 'headphones', specs: 'Black', tagline: '', aliases: [] },
  offers: [offer], alternatives: [], sourceCount: 1, totalOffers: 1, updatedAt: offer.lastSeen,
};
test('catalog answer distinguishes a collected item price from estimated checkout total', () => {
  const messages = buildCatalogAnswerMessages(comparison, '价格');
  const payload = JSON.parse(messages[1].content as string);
  assert.deepEqual(payload.quotes[0], {
    product: 'Sony WH-1000XM5', platform: 'Lazada', seller: 'Sony', itemPrice: 'S$329.00', shipping: 'S$1.99',
    recordedDiscount: 'S$0.00', estimatedTotal: 'S$330.99', capturedAt: offer.lastSeen, sourceUrl: offer.url,
  });
  assert.match(messages[0].content as string, /0 不代表没有可用优惠券/);
});
test('one observation and an absent store certification are never exposed as historical or official claims', () => {
  const messages = buildCatalogAnswerMessages(comparison, '值得买吗');
  const payload = JSON.parse(messages[1].content as string);
  assert.equal(payload.quotes.length, 1);
  for (const key of ['low30d', 'thirtyDayLow', 'history', 'isOfficial', 'officialStore']) {
    assert.equal(Object.hasOwn(payload.quotes[0], key), false);
  }
  assert.match(messages[0].content as string, /不能宣称.*30 天最低/);
});
test('an unreported delivery fee is not described as free shipping', () => {
  const messages = buildCatalogAnswerMessages({ ...comparison, offers: [{ ...offer, shippingFee: 0, finalPrice: 329 }] }, '多少钱');
  assert.equal(JSON.parse(messages[1].content as string).quotes[0].shipping, null);
  assert.match(messages[0].content as string, /运费尚未核实/);
  const exact = buildCatalogAnswerMessages({ ...comparison, offers: [{ ...offer, shippingFee: 0, landedPriceConfidence: 'exact' }] }, '多少钱');
  assert.equal(JSON.parse(exact[1].content as string).quotes[0].shipping, 'S$0.00');
});
