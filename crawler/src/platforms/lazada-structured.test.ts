import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLazadaStructured } from './lazada-structured.ts';

const url = 'https://www.lazada.sg/products/sony-wf-1000xm6-i123-s456.html';
const offer = { '@type': 'Offer', price: '399.00', priceCurrency: 'SGD', availability: 'https://schema.org/InStock', url };
const product = { '@type': 'Product', name: 'Sony WF-1000XM6', url, offers: offer };
const html = (data: unknown) => `<html><script type="application/ld+json">${JSON.stringify(data)}</script></html>`;

test('standalone JSON-LD product yields a single source-bound offer without DOM cards', () => {
  const result = parseLazadaStructured(html(product), 'SG');
  assert.deepEqual(result, [{ platform: 'lazada', market: 'SG', itemId: '123', title: product.name,
    url, price: 399, currency: 'SGD', inStock: true }]);
  for (const key of ['rating', 'reviews', 'shippingFee', 'discount', 'seller', 'isOfficial']) assert.equal(key in result[0], false, key);
});

test('products in ItemList, graph and arrays are parsed and identical duplicates are deduplicated', () => {
  for (const data of [
    [product], { '@graph': [product] },
    { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, item: product }] },
    [{ '@graph': [product] }, product],
    { ...product, offers: [offer] },
  ]) assert.equal(parseLazadaStructured(html(data), 'SG').length, 1);
  assert.equal(parseLazadaStructured(html(product).replace('type="application/ld+json"', "TYPE = 'application/ld+json'"), 'SG').length, 1);
});

test('structured data never executes JS or guesses hydration script fields', () => {
  assert.deepEqual(parseLazadaStructured('<script type="application/ld+json">window.anything()</script>', 'SG'), []);
  assert.deepEqual(parseLazadaStructured(`<script>window.__DATA__=${JSON.stringify(product)}</script>`, 'SG'), []);
  assert.deepEqual(parseLazadaStructured('<script type="application/ld+json">{invalid json}</script>', 'SG'), []);
});

test('prices must be a positive scalar single Offer in the correct currency', () => {
  for (const offers of [
    { ...offer, '@type': 'AggregateOffer', lowPrice: 300, highPrice: 500 },
    [offer, { ...offer, price: 500 }], [],
    { ...offer, price: '399-499' }, { ...offer, price: 'from S$399' },
    { ...offer, price: '0' }, { ...offer, price: -1 }, { ...offer, price: null },
    { ...offer, price: 399.005 }, { ...offer, priceCurrency: 'USD' },
    { ...offer, lowPrice: 399 }, { ...offer, price: undefined },
  ]) assert.deepEqual(parseLazadaStructured(html({ ...product, offers }), 'SG'), [], JSON.stringify(offers));
  assert.deepEqual(parseLazadaStructured(html({ ...product, priceRange: '399-499' }), 'SG'), []);
});

test('only explicit supported availability is mapped; missing stock is not guessed', () => {
  for (const availability of ['OutOfStock', 'SoldOut', 'Discontinued', 'PreOrder', 'BackOrder']) {
    const result = parseLazadaStructured(html({ ...product, offers: { ...offer, availability: `https://schema.org/${availability}` } }), 'SG');
    assert.equal(result[0].inStock, false, availability);
  }
  assert.equal(parseLazadaStructured(html({ ...product, offers: { ...offer, availability: 'LimitedAvailability' } }), 'SG')[0].inStock, true);
  for (const availability of [undefined, null, '', 'Unknown', 'OnlineOnly']) {
    assert.deepEqual(parseLazadaStructured(html({ ...product, offers: { ...offer, availability } }), 'SG'), []);
  }
});

test('reviews, ratings and seller require explicit valid fields, not zero-filled defaults', () => {
  const result = parseLazadaStructured(html({ ...product,
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '21', ratingCount: '99' },
    offers: { ...offer, seller: { '@type': 'Organization', name: 'Source Shop' } },
  }), 'SG')[0];
  assert.equal(result.rating, 4.8); assert.equal(result.reviews, 21); assert.equal(result.seller, 'Source Shop');
  for (const aggregateRating of [
    { ratingValue: null, reviewCount: null }, { ratingValue: '', reviewCount: '' },
    { ratingValue: '4.8 out of 5', reviewCount: 'many' }, { ratingCount: 99 },
    { ratingValue: 8, bestRating: 10, reviewCount: -1 },
  ]) {
    const parsed = parseLazadaStructured(html({ ...product, aggregateRating }), 'SG')[0];
    assert.equal(parsed.rating, undefined); assert.equal(parsed.reviews, undefined);
  }
});

test('product URL must bind a stable item id to the same market HTTPS host', () => {
  for (const bad of [
    'https://www.lazada.com.my/products/sony-i123.html', 'https://www.lazada.sg.evil.test/products/sony-i123.html',
    'http://www.lazada.sg/products/sony-i123.html', 'https://user:pass@www.lazada.sg/products/sony-i123.html',
    'https://www.lazada.sg:8443/products/sony-i123.html', 'javascript:alert(1)',
    'https://www.lazada.sg/catalog/?q=wf1000xm6', 'https://www.lazada.sg/products/unknown.html',
  ]) assert.deepEqual(parseLazadaStructured(html({ ...product, offers: { ...offer, url: bad } }), 'SG'), [], bad);
  for (const good of ['/products/pdp-i123.html', '//www.lazada.sg/products/sony-i123.html', 'https://lazada.sg/products/i123.html']) {
    const result = parseLazadaStructured(html({ ...product, url: good, offers: { ...offer, url: undefined } }), 'SG');
    assert.equal(result[0].itemId, '123', good);
  }
  assert.deepEqual(parseLazadaStructured(html({ ...product, offers: { ...offer, url: url.replace('i123', 'i124') } }), 'SG'), []);
  assert.deepEqual(parseLazadaStructured(html({ ...product, offers: { ...offer, url: url.replace('s456', 's457') } }), 'SG'), []);
});

test('conflicting prices/variants for one item are not collapsed into a guessed lowest price', () => {
  assert.deepEqual(parseLazadaStructured(html([product, { ...product, offers: { ...offer, price: 299 } }]), 'SG'), []);
  assert.deepEqual(parseLazadaStructured(html([product, { ...product, name: 'Sony WF-1000XM5' }]), 'SG'), []);
});
