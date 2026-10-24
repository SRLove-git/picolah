import assert from 'node:assert/strict';
import test from 'node:test';
import { amazonSearchUrl, parseAmazonSearch } from './amazon-sg.ts';

test('builds an Amazon Singapore search URL', () => {
  assert.equal(amazonSearchUrl('Sony WH-1000XM5'), 'https://www.amazon.sg/s?k=Sony%20WH-1000XM5');
});

test('parses priced Amazon cards and leaves accessories for central matching', () => {
  const html = `
    <div role="listitem" data-asin="B09XSDMT4F">
      <h2 aria-label="Sony WH-1000XM5 Wireless Noise-Cancelling Headphones &amp; Case"></h2>
      <div data-cy="price-recipe"><span class="a-offscreen">S$328.78</span></div>
      <i aria-label="4.3 out of 5 stars, rating details"></i><a aria-label="16,858 ratings"></a>
    </div>
    <div role="listitem" data-asin="B000000000"><h2 aria-label="Unpriced result"></h2></div>`;
  assert.deepEqual(parseAmazonSearch(html), [{
    platform: 'amazon-sg', market: 'SG', itemId: 'B09XSDMT4F',
    title: 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones & Case',
    url: 'https://www.amazon.sg/dp/B09XSDMT4F', price: 328.78, currency: 'SGD',
    rating: 4.3, reviews: 16858, seller: 'Amazon SG', inStock: true,
  }]);
});

test('marks unavailable products out of stock', () => {
  const html = `<div role="listitem" data-asin="B123456789"><h2 aria-label="Sony WH-1000XM5 Headphones"></h2><div data-cy="price-recipe"><span class="a-offscreen">S$12.00</span></div><span>Currently unavailable</span></div>`;
  assert.equal(parseAmazonSearch(html)[0].inStock, false);
});
