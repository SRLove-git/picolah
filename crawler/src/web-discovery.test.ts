import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverProduct } from './discovery.ts';
import type { WebSearchCandidate } from './brightdata/serp.ts';

const input = { scope: 'web' as const, market: 'SG' as const, platforms: [], query: 'Sony WF-1000XM6', model: 'WF-1000XM6' };
const candidate = (url: string): WebSearchCandidate => ({ url, title: 'Sony WF-1000XM6' });
function page(url: string, override: Record<string, unknown> = {}): string {
  return `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Sony WF-1000XM6', url,
    offers: { '@type': 'Offer', price: '399', priceCurrency: 'SGD', availability: 'https://schema.org/InStock', url }, ...override })}</script>`;
}

test('web discovery verifies independent shops rather than only predefined platforms', async () => {
  const urls = ['https://store.sony.com.sg/products/wf-1000xm6', 'https://www.bestdenki.com.sg/sony-wf1000xm6'];
  const result = await discoverProduct(input, { web: { search: async () => urls.map(candidate), fetchPage: async (url) => page(url) } });
  assert.equal(result.scope, 'web');
  assert.deepEqual(result.platforms, []);
  assert.deepEqual(result.listings.map((item) => item.platform === 'web' && item.sourceHost), ['store.sony.com.sg', 'bestdenki.com.sg']);
  assert.deepEqual(result.summary, { requests: 3, matched: 2, skipped: 0, failed: 0 });
});

test('web discovery has a hard page budget, three workers and host diversity', async () => {
  const urls = Array.from({ length: 12 }, (_, n) => `https://shop${Math.floor(n / 3)}.example.com/products/${n}`);
  const visited: string[] = [];
  let active = 0; let peak = 0;
  const result = await discoverProduct(input, { web: { search: async () => urls.map(candidate), fetchPage: async (url) => {
    visited.push(url); peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--; return page(url);
  } } });
  assert.equal(peak, 3); assert.equal(visited.length, 8); assert.equal(result.summary.requests, 9);
  assert.equal(new Set(visited.slice(0, 4).map((url) => new URL(url).hostname)).size, 4);
  assert.equal(result.listings.length, 8);
});

test('unsafe, excluded, foreign-market and duplicate links are skipped before page fetch', async () => {
  const good = 'https://store.sony.com.sg/products/wf-1000xm6';
  const urls = ['https://127.0.0.1/product', 'https://localhost/product', 'https://shop.lan/product',
    'https://www.lazada.sg/products/one', 'https://www.lazada.com.my/products/one',
    'https://www.amazon.com/product', 'https://shopee.com.my/product', `${good}?token=secret`, good, `${good}#same`];
  const visited: string[] = [];
  const result = await discoverProduct({ ...input, excludedPlatforms: ['lazada'] }, { web: {
    search: async () => urls.map(candidate), fetchPage: async (url) => { visited.push(url); return page(url); },
  } });
  assert.deepEqual(visited, [good]); assert.equal(result.listings.length, 1);
  assert.deepEqual(result.excludedPlatforms, ['lazada']);
});

test('wrong models, accessories, wrong currency, stock and budget never become offers', async () => {
  const variants = [
    { name: 'Sony WH-1000XM6' }, { name: 'Sony WF-1000XM6 case' },
    { offers: { '@type': 'Offer', price: 100, priceCurrency: 'USD', availability: 'InStock' } },
    { offers: { '@type': 'Offer', price: 100, priceCurrency: 'SGD', availability: 'OutOfStock' } },
    {},
  ];
  let n = 0;
  const result = await discoverProduct({ ...input, maxPrice: 300 }, { web: {
    search: async () => variants.map((_, i) => candidate(`https://store${i}.example.com/product`)),
    fetchPage: async (url) => page(url, variants[n++]),
  } });
  assert.equal(result.listings.length, 0); assert.equal(result.summary.skipped, 5); assert.equal(result.summary.failed, 0);
});

test('missing SERP configuration fails explicitly without a fallback to Lazada', async () => {
  let fetched = false;
  const result = await discoverProduct(input, { search: async () => { throw new Error('must not use adapters'); }, web: {
    search: async () => { throw Object.assign(new Error('private provider message'), { code: 'SERP_NOT_CONFIGURED' }); },
    fetchPage: async () => { fetched = true; return ''; },
  } });
  assert.equal(fetched, false); assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.summary.failureCodes, ['SERP_NOT_CONFIGURED']);
  assert.equal(JSON.stringify(result).includes('private provider'), false);
});

test('one page failure keeps other verified sources and sanitizes failure codes', async () => {
  const result = await discoverProduct(input, { web: {
    search: async () => ['https://a.example.com/product', 'https://b.example.com/product'].map(candidate),
    fetchPage: async (url) => {
      if (url.includes('a.example')) throw Object.assign(new Error('secret'), { code: 'TOKEN_VALUE_SHOULD_NOT_LEAK' });
      return page(url);
    },
  } });
  assert.equal(result.listings.length, 1); assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.summary.failureCodes, ['SOURCE_REQUEST_FAILED']);
});

test('an empty completed search is distinct from a failed search', async () => {
  const result = await discoverProduct(input, { web: { search: async () => [] } });
  assert.deepEqual(result.summary, { requests: 1, matched: 0, skipped: 0, failed: 0 });
});
