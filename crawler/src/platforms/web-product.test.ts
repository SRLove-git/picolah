import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWebProduct } from './web-product.ts';

const url = 'https://www.sony.com.sg/products/wf-1000xm6';
const offer = { '@type': 'Offer', price: '399.00', priceCurrency: 'SGD', availability: 'https://schema.org/InStock', url };
const product = { '@type': 'Product', name: 'Sony WF-1000XM6 Wireless Earbuds', url, offers: offer };
const html = (data: unknown, head = '') => `<html><head>${head}<script type="application/ld+json">${JSON.stringify(data)}</script></head></html>`;

test('a current product page yields an explicit source-bound price and stable URL hash', () => {
  const [listing] = parseWebProduct(html(product), url, 'SG');
  assert.equal(listing.platform, 'web'); assert.equal(listing.sourceHost, 'sony.com.sg');
  assert.equal(listing.seller, 'sony.com.sg'); assert.equal(listing.url, url);
  assert.equal(listing.title, product.name); assert.equal(listing.price, 399); assert.equal(listing.currency, 'SGD');
  assert.equal(listing.inStock, true); assert.match(listing.itemId, /^[a-f0-9]{64}$/);
  assert.equal(parseWebProduct(html(product), `${url}#details`, 'SG')[0].itemId, listing.itemId);
  for (const key of ['rating', 'reviews', 'shippingFee', 'discount', 'isOfficial']) assert.equal(key in listing, false, key);
});

test('graph, mainEntity and repeated identical product declarations still represent one page', () => {
  for (const data of [[product], { '@graph': [product] }, { '@type': 'WebPage', mainEntity: product },
    [product, product], { ...product, offers: [offer] }]) assert.equal(parseWebProduct(html(data), url, 'SG').length, 1);
  assert.equal(parseWebProduct(html(product).replace('type="application/ld+json"', "TYPE = 'application/ld+json'"), url, 'SG').length, 1);
});

test('URLs may be absent or relative, but explicit product/offer/canonical URLs must bind this page', () => {
  assert.equal(parseWebProduct(html({ ...product, url: undefined, offers: { ...offer, url: undefined } }), url, 'SG')[0].url, url);
  assert.equal(parseWebProduct(html({ ...product, url: '/products/wf-1000xm6' }), url, 'SG').length, 1);
  assert.equal(parseWebProduct(html(product, '<link rel="canonical" href="https://sony.com.sg/products/wf-1000xm6">'), url, 'SG')[0].url,
    'https://sony.com.sg/products/wf-1000xm6');
  for (const bad of ['https://evil.example.com/products/wf-1000xm6', '/products/wf-1000xm5',
    'http://www.sony.com.sg/products/wf-1000xm6', 'https://www.sony.com.sg:443/products/wf-1000xm6',
    'https://user:secret@www.sony.com.sg/products/wf-1000xm6', `${url}?api_key=secret`, null, '']) {
    assert.deepEqual(parseWebProduct(html({ ...product, url: bad }), url, 'SG'), [], String(bad));
    assert.deepEqual(parseWebProduct(html({ ...product, offers: { ...offer, url: bad } }), url, 'SG'), [], String(bad));
    assert.deepEqual(parseWebProduct(html(product, `<link rel="canonical" href="${bad}">`), url, 'SG'), [], String(bad));
  }
});

test('canonical and variant identity conflicts are rejected rather than choosing a cheap variant', () => {
  assert.deepEqual(parseWebProduct(html(product, `<link rel="canonical" href="${url}"><link rel="canonical" href="${url}?a=1">`), url, 'SG'), []);
  assert.deepEqual(parseWebProduct(html({ ...product, offers: { ...offer, url: `${url}?variant=black` } }), url, 'SG'), []);
  const variant = `${url}?variant=black`;
  assert.equal(parseWebProduct(html({ ...product, url: variant, offers: { ...offer, url: variant } }), variant, 'SG').length, 1);
  assert.deepEqual(parseWebProduct(html({ ...product, url: variant, offers: { ...offer, url: variant } }, `<link rel="canonical" href="${url}">`), variant, 'SG'), []);
});

test('collections, related-item lists, product groups and multiple different products are not detail quotes', () => {
  for (const data of [
    { '@type': 'ItemList', itemListElement: [{ item: product }] },
    { '@type': 'CollectionPage', mainEntity: product },
    { ...product, '@type': ['Product', 'ProductGroup'] },
    { ...product, hasVariant: [{ ...product }] }, { ...product, sku: ['black', 'white'] },
    [product, { ...product, name: 'Sony WH-1000XM6' }],
    [product, { ...product, offers: { ...offer, price: 299 } }],
    [product, { ...product, offers: { ...offer, price: null } }],
    [{ ...product, sku: 'black' }, { ...product, sku: 'white' }],
    [{ ...product, gtin: '1234567890123' }, { ...product, gtin: '1234567890124' }],
  ]) assert.deepEqual(parseWebProduct(html(data), url, 'SG'), [], JSON.stringify(data));
});

test('only single scalar prices in market currency and precision are accepted', () => {
  for (const offers of [
    [offer, { ...offer, price: 499 }], [], { ...offer, '@type': 'AggregateOffer' },
    { ...offer, lowPrice: 299 }, { ...offer, highPrice: 499 }, { ...offer, priceRange: '299-499' },
    { ...offer, price: '399-499' }, { ...offer, price: 'S$399' }, { ...offer, price: 'from 399' },
    { ...offer, price: '399/499' }, { ...offer, price: '399,00' }, { ...offer, price: 399.005 },
    { ...offer, price: null }, { ...offer, price: 0 }, { ...offer, price: -1 }, { ...offer, price: 1e12 },
    { ...offer, priceCurrency: 'USD' }, { ...offer, priceCurrency: undefined },
    { ...offer, priceSpecification: { price: 299 } },
  ]) assert.deepEqual(parseWebProduct(html({ ...product, offers }), url, 'SG'), [], JSON.stringify(offers));
  assert.deepEqual(parseWebProduct(html({ ...product, priceRange: '399-499' }), url, 'SG'), []);
  const viet = { ...product, offers: { ...offer, priceCurrency: 'VND', price: 4000000 } };
  assert.equal(parseWebProduct(html(viet), url, 'VN').length, 1);
  assert.deepEqual(parseWebProduct(html({ ...viet, offers: { ...viet.offers, price: 4000000.01 } }), url, 'VN'), []);
});

test('unknown, out-of-stock and preorder offers are not manufactured into available quotes', () => {
  for (const availability of [undefined, null, '', 'OutOfStock', 'SoldOut', 'PreOrder', 'BackOrder', 'OnlineOnly', 'Unknown']) {
    assert.deepEqual(parseWebProduct(html({ ...product, offers: { ...offer, availability } }), url, 'SG'), [], String(availability));
  }
  assert.equal(parseWebProduct(html({ ...product, offers: { ...offer, availability: 'LimitedAvailability' } }), url, 'SG').length, 1);
});

test('ratings, written review counts and seller are explicit and individually validated', () => {
  const [listing] = parseWebProduct(html({ ...product,
    offers: { ...offer, seller: { '@type': 'Organization', name: 'Sony Store' } },
    aggregateRating: { ratingValue: '4.8', reviewCount: '23', ratingCount: 99 },
  }), url, 'SG');
  assert.equal(listing.rating, 4.8); assert.equal(listing.reviews, 23); assert.equal(listing.seller, 'Sony Store');
  for (const aggregateRating of [
    { ratingValue: null, reviewCount: null }, { ratingValue: '', reviewCount: '' },
    { ratingValue: '4.8/5', reviewCount: 'many' }, { ratingValue: 8, bestRating: 10, reviewCount: -1 },
    { ratingValue: 6, reviewCount: 1.5 }, { ratingCount: 99 },
  ]) {
    const [result] = parseWebProduct(html({ ...product, aggregateRating }), url, 'SG');
    assert.equal(result.rating, undefined); assert.equal(result.reviews, undefined);
  }
});

test('no script execution, price snippets, commented scripts or hydration guesses', () => {
  for (const markup of [
    '<h1>Sony WF-1000XM6</h1><p>SGD 299 In stock</p>',
    `<script>window.__DATA__=${JSON.stringify(product)}</script>`,
    `<script data-type="application/ld+json">${JSON.stringify(product)}</script>`,
    '<script type="application/ld+json">{broken}</script>',
    '<script type="application/ld+json">process.exit()</script>',
    `<!--${html(product)}-->`,
  ]) assert.deepEqual(parseWebProduct(markup, url, 'SG'), []);
  assert.deepEqual(parseWebProduct(html(product), 'https://127.0.0.1/product', 'SG'), []);
  assert.deepEqual(parseWebProduct(html(product), `${url}?token=secret`, 'SG'), []);
  assert.deepEqual(parseWebProduct(html(Array(20001).fill(null)), url, 'SG'), []);
});
