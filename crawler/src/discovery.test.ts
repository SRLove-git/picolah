import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { discoverProduct } from './discovery.ts';
import { exactDiscoveryListing, normalizeDiscoveryModel, normalizeSearchQuery, queryMatchesListing } from './discovery-match.ts';
import type { RawListing } from './types.ts';

const options = { market: 'SG' as const, platforms: ['lazada' as const], query: 'Sony WF-1000XM6', model: 'WF-1000XM6' };
function listing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    platform: 'lazada', market: 'SG', itemId: '123', title: 'Sony WF-1000XM6 Wireless Earbuds',
    url: 'https://www.lazada.sg/products/sony-i123.html', price: 399, currency: 'SGD',
    inStock: true, ...overrides,
  };
}

test('live search accepts bounded plain query and optional single complete model code', () => {
  assert.equal(normalizeDiscoveryModel('wf-1000xm6'), 'WF-1000XM6');
  assert.equal(normalizeSearchQuery('  iPhone 17 Pro 256GB  '), 'iPhone 17 Pro 256GB');
  for (const value of ['Sony WF-1000XM6', 'WF-1000XM6 WH-1000XM6', 'XM6', 'iphone 15', 'https://example.com', 'A1000', 'WF1000XM6'.repeat(10)]) assert.throws(() => normalizeDiscoveryModel(value));
  for (const value of ['', 'a', 'a'.repeat(121), 'https://example.com', 'iPhone\n17', '🔎🔎']) assert.throws(() => normalizeSearchQuery(value));
});

test('full model guard rejects adjacent models, ambiguous variants and non-products', () => {
  for (const title of ['Sony WF-1000XM6', 'Sony WF1000XM6 Wireless Earbuds', 'Sony WF 1000 XM 6 Headphones', 'Sony WF-1000XM6 Bluetooth 5.3 ANC 24h']) {
    assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), true, title);
  }
  for (const title of [
    'Sony WH-1000XM6', 'Sony WF-1000XM5', 'Sony XM6', 'Sony WF-1000XM6B',
    'Sony WF-1000XM6 and WH-1000XM6', 'Sony WF-1000XM6 / XM5', 'Sony WF-1000XM6 / 5',
    'Sony WF-1000XM6 and XM5', 'Replacement ear tips for Sony WF-1000XM6',
    'Sony WF-1000XM6 case', 'Sony WF-1000XM6 refurbished', 'Used Sony WF1000XM6',
    'Replica Sony WF-1000XM6', 'WF-1000XM6 保护壳', 'WF-1000XM6 二手',
  ]) assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), false, title);
});

test('repeated full and shortened aliases are accepted only after an exact complete model', () => {
  const sameModelTitles = [
    'Sony WF1000XM6 | WF-1000XM6 | 1000XM6 | Wireless Noise Cancelling Headphones | 1 Year + 3 Months Warranty',
    'Sony WF-1000XM6 / WF1000XM6 / 1000XM6 / XM6 Wireless Earbuds',
    'Sony WF 1000 XM 6 + WF-1000XM6 + 1000 XM 6 + XM 6',
    'Sony WF1000XM6 WF-1000XM6 1000XM6 XM6',
  ];
  for (const title of sameModelTitles) {
    assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), true, title);
    assert.equal(queryMatchesListing('Sony WF-1000XM6', listing({ title }), 'SG', 'lazada', options.model), true, title);
  }
  for (const title of ['Sony 1000XM6 | XM6 Earbuds', 'Sony XM6 Wireless Earbuds']) {
    assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), false, title);
  }
});

test('duplicate aliases cannot hide other model families generations or variant suffixes', () => {
  for (const title of [
    'Sony WF1000XM6 | WF-1000XM6 | WH-1000XM6',
    'Sony WF1000XM6 | WF-1000XM6 | WF-1000XM5',
    'Sony WF1000XM6 | 1000XM6 | 1000XM5',
    'Sony WF1000XM6 | 1000XM6 | 2000XM6',
    'Sony WF1000XM6 | 1000XM6 | XM5',
    'Sony WF1000XM6 | WF-1000XM6 | 5',
    'Sony WF1000XM6 | XM6 / 5',
    'Sony WF1000XM6 | WF-1000XM6B',
    'Sony WF1000XM6 | 1000XM6B',
    'Sony WH1000XM6 | WH-1000XM6 | 1000XM6 | XM6',
  ]) assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), false, title);

  assert.equal(queryMatchesListing('Sony WF-1000XM6 Black', listing({
    title: 'Sony WF1000XM6 | WF-1000XM6 | 1000XM6 Silver',
  }), 'SG', 'lazada', options.model), false);
  assert.equal(queryMatchesListing('iPhone 17 Pro 256GB', listing({
    title: 'Apple iPhone 17 Pro 256GB / 512GB',
  }), 'SG', 'lazada'), false);
  assert.equal(queryMatchesListing('Sony WF-1000XM6', listing({
    title: 'Sony WF1000XM6 | 1000XM6 | 128 / 256GB',
  }), 'SG', 'lazada', options.model), false);
});

test('source validation requires stock, correct market/currency, finite amounts and trusted source host', () => {
  for (const overrides of [
    { inStock: false }, { market: 'MY' as const }, { platform: 'shopee' as const },
    { price: NaN }, { price: Infinity }, { price: 0 }, { price: -1 }, { currency: 'USD' },
    { shippingFee: -1 }, { discount: 1000 }, { rating: 8 }, { reviews: Infinity },
    { itemId: '' }, { url: 'https://www.lazada.sg.evil.test/product' },
    { url: 'http://www.lazada.sg/product' }, { url: 'https://evil.test@www.lazada.sg/product' },
    { url: 'https://www.lazada.com.my/product' }, { url: 'https://www.lazada.sg:8443/product' },
  ]) assert.equal(exactDiscoveryListing(options.model, listing(overrides), 'SG', 'lazada'), false, JSON.stringify(overrides));
});

test('plain search preserves brand, numeric generation, capacity and product variants', () => {
  const query = 'iPhone 17 Pro 256GB';
  assert.equal(queryMatchesListing(query, listing({ title: 'Apple iPhone17 Pro 256 GB' }), 'SG', 'lazada'), true);
  for (const title of ['Apple iPhone 16 Pro 256GB', 'Apple iPhone 17 Pro Max 256GB', 'Apple iPhone 17 Pro 512GB', 'Apple iPhone 17 Pro 256GB / 512GB', 'Apple iPhone 17 Pro 256GB case']) {
    assert.equal(queryMatchesListing(query, listing({ title }), 'SG', 'lazada'), false, title);
  }
  assert.equal(queryMatchesListing('Sony headphones', listing({ title: 'Sony WH-1000XM5 headphones' }), 'SG', 'lazada'), true);
  assert.equal(queryMatchesListing('Sony headphones', listing({ title: 'Bose headphones' }), 'SG', 'lazada'), false);
  assert.equal(queryMatchesListing('WF1000XM6', listing({ title: 'WH1000XM6 and WF1000XM5' }), 'SG', 'lazada'), false);
  assert.equal(queryMatchesListing('iPhone 17 Pro', listing({ title: 'iPhone 17/16 Pro' }), 'SG', 'lazada'), false);
});

test('live search returns validated raw listings without any catalog or ingest dependency', async () => {
  const source = await readFile(new URL('./discovery.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"].*(?:catalog|ingest|pipeline)/);
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error('catalog/ingest network forbidden'); };
  try {
    const candidates = [listing({ price: 410 }), listing({ itemId: '124', price: 399 })];
    const result = await discoverProduct(options, { search: async (platform, market, query) => {
      assert.equal(platform, 'lazada'); assert.equal(market, 'SG'); assert.equal(query, options.query);
      return candidates;
    } });
    assert.equal(networkCalls, 0);
    assert.equal('productId' in result, false);
    assert.deepEqual(result.listings, [...candidates].sort((a, b) => a.price - b.price));
    assert.deepEqual(result.summary, { requests: 1, matched: 2, skipped: 0, failed: 0 });
  } finally { globalThis.fetch = originalFetch; }
});

test('live search bounds raw results to three unique listings per requested platform', async () => {
  const result = await discoverProduct({ ...options, platforms: ['lazada', 'amazon-sg'] }, { search: async (platform) =>
    Array.from({ length: 10 }, (_, index) => listing({ platform, itemId: String(Math.floor(index / 2)), price: 399 + index, url: platform === 'amazon-sg' ? 'https://www.amazon.sg/dp/B012345678' : listing().url })) });
  assert.equal(result.listings.length, 6);
  assert.equal(result.summary.requests, 2);
  assert.equal(result.summary.matched, 6);
});

test('no-match and provider failure are completed statuses with no invented result', async () => {
  const empty = await discoverProduct(options, { search: async () => [listing({ title: 'Sony WH-1000XM5' })] });
  assert.deepEqual(empty.listings, []);
  assert.deepEqual(empty.summary, { requests: 1, matched: 0, skipped: 1, failed: 0 });
  const failed = await discoverProduct(options, { search: async () => { throw new Error('provider down'); } });
  assert.deepEqual(failed.listings, []);
  assert.deepEqual(failed.summary, { requests: 1, matched: 0, skipped: 0, failed: 1, failedPlatforms: ['lazada'] });
});

test('all three marketplaces start in parallel and partial failure does not discard other quotes', async () => {
  const started: string[] = [];
  const finish: Array<() => void> = [];
  const pending = discoverProduct({ ...options, scope: 'platforms', platforms: ['shopee', 'lazada', 'amazon-sg'] }, {
    search: async (platform) => {
      started.push(platform);
      await new Promise<void>((resolve) => finish.push(resolve));
      if (platform === 'shopee') throw Object.assign(new Error('login required'), { code: 'SHOPEE_LOGIN_REQUIRED' });
      return [listing({ platform, url: platform === 'amazon-sg' ? 'https://www.amazon.sg/dp/B012345678' : listing().url })];
    },
  });
  assert.deepEqual(started, ['shopee', 'lazada', 'amazon-sg']);
  finish.reverse().forEach((resolve) => resolve());
  const result = await pending;
  assert.equal(result.scope, 'platforms');
  assert.deepEqual(result.listings.map((item) => item.platform), ['lazada', 'amazon-sg']);
  assert.deepEqual(result.summary, { requests: 3, matched: 2, skipped: 0, failed: 1, failedPlatforms: ['shopee'] });
});
