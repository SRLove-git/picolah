import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { CrawlOptions } from './pipeline.ts';
import { createCrawlerToolServer } from './tool-server.ts';
import type { DiscoveryOptions } from './discovery.ts';

let received: CrawlOptions | null = null;
let searched: DiscoveryOptions | null = null;
let finishSearch: (() => void) | null = null;
let blockSearch = false;
const server = createCrawlerToolServer({
  token: 'crawler-test-token',
  run: async (options) => {
    received = options;
    return { requests: 1, matched: 1, skipped: 0, failed: 0, offers: [] };
  },
  search: async (options) => {
    searched = options;
    if (blockSearch) await new Promise<void>((resolve) => { finishSearch = resolve; });
    return { ok: true, ...options, listings: [], summary: { requests: 1, matched: 0, skipped: 1, failed: 0 } };
  },
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('crawler tool test server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;

after(() => new Promise<void>((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
}));

const headers = { 'content-type': 'application/json', authorization: 'Bearer crawler-test-token' };

test('crawler search requires bearer authorization', async () => {
  const response = await fetch(`${baseUrl}/search`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 401);
});

test('crawler search accepts exact model before it has a catalog product id', async () => {
  const response = await fetch(`${baseUrl}/search`, {
    method: 'POST', headers,
    body: JSON.stringify({ market: 'SG', platforms: ['lazada'], query: 'WF-1000XM6', model: 'wf-1000xm6' }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { model: string; query: string; listings: unknown[] };
  assert.equal(body.model, 'WF-1000XM6');
  assert.equal(body.query, 'WF-1000XM6');
  assert.deepEqual(body.listings, []);
  assert.deepEqual(searched, { market: 'SG', platforms: ['lazada'], query: 'WF-1000XM6', model: 'WF-1000XM6' });
});

test('crawler live search accepts named products without a model code', async () => {
  const response = await fetch(`${baseUrl}/search`, {
    method: 'POST', headers,
    body: JSON.stringify({ market: 'SG', platforms: ['lazada'], query: 'iPhone 17 Pro 256GB' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(searched, { market: 'SG', platforms: ['lazada'], query: 'iPhone 17 Pro 256GB' });
});

test('crawler search accepts bounded cross-web scope and platform exclusions', async () => {
  const input = { scope: 'web', market: 'SG', platforms: [], excludedPlatforms: ['lazada'], query: 'WF-1000XM6' };
  const response = await fetch(`${baseUrl}/search`, { method: 'POST', headers, body: JSON.stringify(input) });
  assert.equal(response.status, 200); assert.deepEqual(searched, input);
});

test('crawler search rejects malformed cross-web scopes without running the crawler', async () => {
  for (const extra of [
    { scope: 'everywhere' }, { platforms: ['lazada'] }, { platforms: 'lazada' },
    { excludedPlatforms: 'lazada' }, { excludedPlatforms: ['unknown'] }, { excludedPlatforms: [null] },
    { market: 'XX' },
  ]) {
    const response = await fetch(`${baseUrl}/search`, { method: 'POST', headers,
      body: JSON.stringify({ scope: 'web', market: 'SG', platforms: [], query: 'WF-1000XM6', ...extra }) });
    assert.equal(response.status, 400, JSON.stringify(extra));
  }
});

test('crawler search rejects prose, unsupported platforms and unsupported markets', async () => {
  for (const input of [
    { market: 'SG', platforms: ['lazada'], query: 'WF-1000XM6', model: '帮我找一下wf1000xm6' },
    { market: 'SG', platforms: ['lazada'], query: 'WF-1000XM6', model: 'WF1000XM6 WH1000XM6' },
    { market: 'SG', platforms: ['tiktok'], query: 'WF-1000XM6' },
    { market: 'MY', platforms: ['amazon-sg'], query: 'WF-1000XM6' },
    { market: 'XX', platforms: ['lazada'], query: 'WF-1000XM6' },
    { market: 'SG', platforms: ['lazada'], query: 'https://example.com' },
    { market: 'SG', platforms: ['lazada'], query: 'a'.repeat(121) },
  ]) {
    const response = await fetch(`${baseUrl}/search`, { method: 'POST', headers, body: JSON.stringify(input) });
    assert.equal(response.status, 400, JSON.stringify(input));
  }
});

test('discovery and regular crawls share a single bounded busy guard', async () => {
  blockSearch = true;
  const pending = fetch(`${baseUrl}/search`, {
    method: 'POST', headers, body: JSON.stringify({ market: 'SG', platforms: ['lazada'], query: 'WF-1000XM6', model: 'WF-1000XM6' }),
  });
  try {
    for (let attempts = 0; !finishSearch && attempts < 50; attempts += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(finishSearch, 'discovery request started');
    const busy = await fetch(`${baseUrl}/crawl`, {
      method: 'POST', headers, body: JSON.stringify({ market: 'SG', platforms: ['lazada'], productIds: ['sony-wh1000xm5'] }),
    });
    assert.equal(busy.status, 409);
  } finally {
    blockSearch = false;
    finishSearch?.();
    finishSearch = null;
    await pending;
  }
});
test('crawler tool server requires its bearer token', async () => {
  const response = await fetch(`${baseUrl}/crawl`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 401);
});

test('crawler tool server validates and runs a persisted real crawl', async () => {
  const response = await fetch(`${baseUrl}/crawl`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer crawler-test-token',
    },
    body: JSON.stringify({
      market: 'SG',
      platforms: ['lazada'],
      productIds: ['sony-wh1000xm5'],
    }),
  });
  const body = await response.json() as { ok: boolean; summary: { matched: number } };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.summary.matched, 1);
  assert.deepEqual(received, {
    markets: ['SG'],
    platforms: ['lazada'],
    productIds: ['sony-wh1000xm5'],
    limit: 1,
    dryRun: false,
    concurrency: 2,
  });
});
