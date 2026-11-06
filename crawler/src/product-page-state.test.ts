import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWebProduct } from './platforms/web-product.ts';
import { linkedProductPages } from './product-page-links.ts';

const url = 'https://retailer.example.com/products/whch720n-w';
const product = { '@type': 'Product', sku: 'whch720n-w', name: 'WHCH720N/W', brand: { name: 'Sony' },
  offers: { '@type': 'Offer', price: 89.99, priceCurrency: 'USD', url } };
const state = { code: product.sku, url: new URL(url).pathname, seoTitle: 'Sony WH-CH720N Headphones | White',
  price: { value: 89.99, currencyIso: 'USD', priceType: 'BUY' }, purchasable: true, preOrder: false,
  stock: { stockLevelStatus: 'inStock', stockLevel: 10 } };
function html(value: Record<string, unknown>, overrides: Record<string, unknown> = {}, flags: Record<string, unknown> = {}) {
  return `<script type="application/ld+json">${JSON.stringify({ ...product, ...overrides })}</script>` +
    `<script id="ng-state" type="application/json">${JSON.stringify({ 'cx-state': { product: { details: { entities: {
      [String(value.code)]: { details: { loading: false, error: false, success: true, value, ...flags } },
    } } } } })}</script>`;
}

test('missing JSON-LD availability is backed by the same SKU, URL, price and completed product state', () => {
  const result = parseWebProduct(html(state), url, 'SG', 'global');
  assert.equal(result.length, 1); assert.equal(result[0].price, 89.99); assert.equal(result[0].currency, 'USD');
  assert.equal(parseWebProduct(html(state), url + '?utm_source=search', 'SG', 'global').length, 1);
});

test('unrelated or conflicting state cannot supply product inventory', () => {
  for (const patch of [
    { code: 'whch720n-b' }, { url: '/products/other' }, { url: 'https://other.example.com/products/whch720n-w' },
    { price: { ...state.price, value: 99.99 } }, { price: { ...state.price, currencyIso: 'SGD' } },
    { stock: { stockLevelStatus: 'outOfStock', stockLevel: 0 } }, { stock: { stockLevelStatus: 'inStock', stockLevel: 0 } },
    { preOrder: true }, { purchasable: false }, { notSellable: true }, { stock: {} },
  ]) { const rows=parseWebProduct(html({ ...state, ...patch }), url, 'SG', 'global');assert.ok(rows.length);if(!('price' in patch))assert.equal(rows[0].inStock,false,JSON.stringify(patch)); }
  assert.equal(parseWebProduct(html(state, {}, { success: false }), url, 'SG', 'global')[0]?.priceQuote?.availability,'unknown');
  assert.equal(parseWebProduct(html(state, { offers: { ...product.offers, availability: 'OutOfStock' } }), url, 'SG', 'global')[0]?.price,89.99);
  assert.deepEqual(parseWebProduct(html(state), url + '?variant=other', 'SG', 'global'), []);
});

test('variant links never become offers and never inherit the selected color', () => {
  const variant = (code: string, color: string, target = `/products/${code}`) => ({ code, url: target, variants: [{ value: `#000 | ${color}` }] });
  const data = { ...state, stock: { stockLevelStatus: 'outOfStock', stockLevel: 0 }, baseOptions: [{
    selected: variant('whch720n-w', 'White'),
    options: [variant('whch720n-b', 'Black'), variant('whch710n-b', 'Black'), variant('whch720n-p', 'Pink'), variant('whch720n-w', 'White'), variant('whch720n-x', 'Blue', 'https://evil.example.com/product')],
  }] };
  const row=parseWebProduct(html(data), url, 'SG', 'global')[0];assert.equal(row.inStock,false);assert.equal(row.priceQuote?.availability,'out-of-stock');assert.equal(row.title,'Sony WHCH720N/W');
  assert.deepEqual(linkedProductPages(html(data), url + '?utm_source=search', 'Sony WH-CH720N Black', 'WH-CH720N').map((x) => x.url), ['https://retailer.example.com/products/whch720n-b']);
  assert.deepEqual(linkedProductPages(html(data), url, 'Sony WH-CH720N White', 'WH-CH720N'), []);
});
