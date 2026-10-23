import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuery, dropPriceOutliers, matchListing, pickBestListing } from './match.ts';
import type { CatalogProduct, RawListing } from './types.ts';

const product: CatalogProduct = {
  id: 'sony-wh1000xm5',
  name: 'Sony WH-1000XM5 无线降噪耳机',
  brand: 'Sony',
};

function listing(title: string, price = 499, overrides: Partial<RawListing> = {}): RawListing {
  return {
    platform: 'lazada',
    market: 'SG',
    itemId: String(Math.random()),
    title,
    url: 'https://www.lazada.sg/products/pdp-i1.html',
    price,
    currency: 'SGD',
    inStock: true,
    ...overrides,
  };
}

test('builds a latin search query from a localized catalog name', () => {
  assert.equal(buildQuery(product), 'Sony WH-1000XM5');
  assert.equal(
    buildQuery({ id: 'x', name: 'Adidas Samba OG 复古德训鞋', brand: 'Adidas' }),
    'Adidas Samba OG',
  );
});

test('accepts the real product title', () => {
  const result = matchListing(product, listing('SONY WH-1000XM5 / WH1000XM5 Wireless Noise Cancelling Headphones'));
  assert.ok(result);
  assert.ok(result.score > 0.5);
});

test('rejects accessories that mention the model', () => {
  assert.equal(matchListing(product, listing('For WH-1000XM5 Wireless Bluetooth Headphones')), null);
  assert.equal(matchListing(product, listing('WH-1000XM5 replacement ear pads')), null);
  assert.equal(matchListing(product, listing('Sony WH-1000XM5 silicone case')), null);
});

test('rejects other models and unrelated products', () => {
  assert.equal(matchListing(product, listing('Sony WH-1000XM4 Wireless Headphones')), null);
  assert.equal(matchListing(product, listing('Sony | Active Noise Cancellation Touch Control Headset')), null);
});

test('drops accessory-priced outliers before picking', () => {
  const listings = [
    listing('SONY WH-1000XM5 Headphones', 499),
    listing('SONY WH-1000XM5 Headphones', 489),
    listing('SONY WH-1000XM5 Headphones', 509),
    listing('WH-1000XM5 Headphones cheap', 17.59),
  ];
  assert.equal(dropPriceOutliers(listings).length, 3);
  const best = pickBestListing(product, listings);
  assert.ok(best);
  assert.ok(best.listing.price >= 489);
});
