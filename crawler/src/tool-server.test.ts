import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import type { CrawlOptions } from './pipeline.ts';
import { createCrawlerToolServer } from './tool-server.ts';
import type { DiscoveryOptions } from './discovery.ts';

let received: CrawlOptions | null = null;
let searched: DiscoveryOptions | null = null;
const server = createCrawlerToolServer({
  token: 'crawler-test-token',
  run: async (options) => {
    received = options;
    return { requests: 1, matched: 1, skipped: 0, failed: 0, offers: [] };
  },
  search: async (options) => {
    searched = options;
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function queueServer(t: TestContext, options: Omit<Parameters<typeof createCrawlerToolServer>[0], 'token'>) {
  const instance = createCrawlerToolServer({ token: 'crawler-test-token', maxConcurrentSearches: 1, ...options });
  await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const bound = instance.address();
  if (!bound || typeof bound === 'string') throw new Error('test server did not bind');
  const url = `http://127.0.0.1:${bound.port}`;
  t.after(() => new Promise<void>((resolve, reject) => {
    instance.close((error) => (error ? reject(error) : resolve()));
    instance.closeAllConnections();
  }));
  return url;
}

function postSearch(url: string, query = 'WF-1000XM6', signal?: AbortSignal) {
  return fetch(`${url}/search`, {
    method: 'POST', headers, signal,
    body: JSON.stringify({ market: 'SG', platforms: ['lazada'], query }),
  });
}

function discoveryResult(options: DiscoveryOptions) {
  return { ok: true as const, ...options, listings: [], summary: { requests: 1, matched: 0, skipped: 1, failed: 0 } };
}

async function queueHealth(url: string) {
  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 200);
  return await response.json() as {
    ok: boolean; running: boolean; activeSearches: number; crawlRunning: boolean;
    searchConcurrency: number; queued: number; queueCapacity: number;
  };
}

async function waitForQueue(url: string, expected: number) {
  for (let attempts = 0; attempts < 100; attempts += 1) {
    const health = await queueHealth(url);
    if (health.queued === expected) return health;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`queue did not reach ${expected}`);
}

test('single-search mode waits in FIFO order without overlapping crawler work', async (t) => {
  const firstStarted = deferred();
  const releaseFirst = deferred();
  t.after(releaseFirst.resolve);
  const calls: string[] = [];
  let active = 0;
  let peakActive = 0;
  const url = await queueServer(t, { search: async (input) => {
    active += 1;
    peakActive = Math.max(peakActive, active);
    calls.push(input.query);
    if (calls.length === 1) {
      firstStarted.resolve();
      await releaseFirst.promise;
    }
    active -= 1;
    return discoveryResult(input);
  } });
  assert.deepEqual(await queueHealth(url), {
    ok: true, running: false, activeSearches: 0, crawlRunning: false,
    searchConcurrency: 1, queued: 0, queueCapacity: 8,
  });
  const first = postSearch(url, 'WF-1000XM6');
  await firstStarted.promise;
  const second = postSearch(url, 'WH-CH720N');
  assert.equal((await waitForQueue(url, 1)).running, true);
  const third = postSearch(url, 'iPhone 17 Pro');
  await waitForQueue(url, 2);
  assert.deepEqual(calls, ['WF-1000XM6']);
  releaseFirst.resolve();
  const responses = await Promise.all([first, second, third]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200]);
  assert.deepEqual(calls, ['WF-1000XM6', 'WH-CH720N', 'iPhone 17 Pro']);
  assert.equal(peakActive, 1);
  assert.deepEqual(await queueHealth(url), {
    ok: true, running: false, activeSearches: 0, crawlRunning: false,
    searchConcurrency: 1, queued: 0, queueCapacity: 8,
  });
});

test('bounded searches execute concurrently and queue only beyond the configured limit', async (t) => {
  const twoStarted = deferred();
  const release = deferred();
  t.after(release.resolve);
  const calls: string[] = [];
  let active = 0;
  let peakActive = 0;
  const url = await queueServer(t, { maxConcurrentSearches: 2, search: async (input) => {
    calls.push(input.query);
    active += 1;
    peakActive = Math.max(peakActive, active);
    if (active === 2) twoStarted.resolve();
    if (calls.length <= 2) await release.promise;
    active -= 1;
    return discoveryResult(input);
  } });
  const first = postSearch(url, 'WF-1000XM6');
  const second = postSearch(url, 'WH-CH720N');
  await twoStarted.promise;
  const third = postSearch(url, 'iPhone 17 Pro');
  const health = await waitForQueue(url, 1);
  assert.equal(health.activeSearches, 2);
  assert.equal(health.searchConcurrency, 2);
  assert.deepEqual(calls, ['WF-1000XM6', 'WH-CH720N']);
  release.resolve();
  assert.deepEqual((await Promise.all([first, second, third])).map((response) => response.status), [200, 200, 200]);
  assert.deepEqual(calls, ['WF-1000XM6', 'WH-CH720N', 'iPhone 17 Pro']);
  assert.equal(peakActive, 2);
});

test('search and persisted crawl share one queue and preserve crawl write options', async (t) => {
  const started = deferred();
  const release = deferred();
  t.after(release.resolve);
  let crawlInput: CrawlOptions | undefined;
  const url = await queueServer(t, {
    search: async (input) => { started.resolve(); await release.promise; return discoveryResult(input); },
    run: async (input) => {
      crawlInput = input;
      return { requests: 1, matched: 1, skipped: 0, failed: 0, offers: [] };
    },
  });
  const search = postSearch(url);
  await started.promise;
  const crawl = fetch(`${url}/crawl`, { method: 'POST', headers,
    body: JSON.stringify({ market: 'SG', platforms: ['lazada'], productIds: ['sony-wh1000xm5'] }) });
  await waitForQueue(url, 1);
  assert.equal(crawlInput, undefined);
  release.resolve();
  assert.equal((await search).status, 200);
  assert.equal((await crawl).status, 200);
  assert.deepEqual(crawlInput, {
    markets: ['SG'], platforms: ['lazada'], productIds: ['sony-wh1000xm5'], limit: 1, dryRun: false, concurrency: 2,
  });
});

test('queue is bounded and unauthorized or invalid requests never take a queue slot', async (t) => {
  const started = deferred();
  const release = deferred();
  t.after(release.resolve);
  const calls: string[] = [];
  const url = await queueServer(t, { maxQueuedRequests: 1, search: async (input) => {
    calls.push(input.query);
    started.resolve();
    await release.promise;
    return discoveryResult(input);
  } });
  const first = postSearch(url);
  await started.promise;
  for (const path of ['/search', '/crawl']) {
    const unauthorized = await fetch(`${url}${path}`, { method: 'POST', body: '{}' });
    assert.equal(unauthorized.status, 401);
    const invalid = await fetch(`${url}${path}`, { method: 'POST', headers, body: '{}' });
    assert.equal(invalid.status, 400);
    const malformed = await fetch(`${url}${path}`, { method: 'POST', headers, body: '{' });
    assert.equal(malformed.status, 400);
  }
  assert.equal((await queueHealth(url)).queued, 0);
  const second = postSearch(url, 'WH-CH720N');
  await waitForQueue(url, 1);
  const overflow = await postSearch(url, 'iPhone 17 Pro');
  assert.equal(overflow.status, 503);
  assert.equal(overflow.headers.get('retry-after'), '5');
  assert.equal((await overflow.json() as { error: string }).error, 'crawler_queue_full');
  assert.deepEqual(calls, ['WF-1000XM6']);
  release.resolve();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  assert.deepEqual(calls, ['WF-1000XM6', 'WH-CH720N']);
});

test('queued requests expire without running paid work or releasing the active slot', async (t) => {
  const started = deferred();
  const release = deferred();
  t.after(release.resolve);
  const calls: string[] = [];
  const url = await queueServer(t, { queueWaitTimeoutMs: 40, search: async (input) => {
    calls.push(input.query);
    started.resolve();
    await release.promise;
    return discoveryResult(input);
  } });
  const first = postSearch(url);
  await started.promise;
  const expired = await postSearch(url, 'WH-CH720N');
  assert.equal(expired.status, 503);
  assert.equal((await expired.json() as { error: string }).error, 'crawler_queue_timeout');
  assert.deepEqual(calls, ['WF-1000XM6']);
  const health = await queueHealth(url);
  assert.equal(health.running, true);
  assert.equal(health.queued, 0);
  release.resolve();
  assert.equal((await first).status, 200);
  assert.equal((await postSearch(url, 'iPhone 17 Pro')).status, 200);
  assert.deepEqual(calls, ['WF-1000XM6', 'iPhone 17 Pro']);
});

test('disconnected queued clients are removed without starting their search', async (t) => {
  const started = deferred();
  const release = deferred();
  t.after(release.resolve);
  const calls: string[] = [];
  const url = await queueServer(t, { search: async (input) => {
    calls.push(input.query);
    started.resolve();
    await release.promise;
    return discoveryResult(input);
  } });
  const first = postSearch(url);
  await started.promise;
  const controller = new AbortController();
  const abandoned = postSearch(url, 'WH-CH720N', controller.signal).catch((error: unknown) => error);
  await waitForQueue(url, 1);
  controller.abort();
  const error = await abandoned;
  assert.ok(error instanceof Error && error.name === 'AbortError');
  await waitForQueue(url, 0);
  release.resolve();
  assert.equal((await first).status, 200);
  assert.deepEqual(calls, ['WF-1000XM6']);
});

test('disconnected active clients keep the crawler slot until their job settles', async (t) => {
  const started = deferred();
  const release = deferred();
  t.after(release.resolve);
  const calls: string[] = [];
  const url = await queueServer(t, { search: async (input) => {
    calls.push(input.query);
    started.resolve();
    await release.promise;
    return discoveryResult(input);
  } });
  const controller = new AbortController();
  const first = postSearch(url, 'WF-1000XM6', controller.signal).catch((error: unknown) => error);
  await started.promise;
  controller.abort();
  const error = await first;
  assert.ok(error instanceof Error && error.name === 'AbortError');
  const second = postSearch(url, 'WH-CH720N');
  const health = await waitForQueue(url, 1);
  assert.equal(health.running, true);
  assert.deepEqual(calls, ['WF-1000XM6']);
  release.resolve();
  assert.equal((await second).status, 200);
  assert.deepEqual(calls, ['WF-1000XM6', 'WH-CH720N']);
});

test('crawler failure releases the slot to the next queued request', async (t) => {
  const started = deferred();
  const release = deferred();
  t.after(release.resolve);
  const url = await queueServer(t, { search: async (input) => {
    if (input.query === 'WF-1000XM6') {
      started.resolve();
      await release.promise;
      throw new Error('test upstream failure');
    }
    return discoveryResult(input);
  } });
  const failed = postSearch(url);
  await started.promise;
  const next = postSearch(url, 'WH-CH720N');
  await waitForQueue(url, 1);
  release.resolve();
  assert.equal((await failed).status, 400);
  assert.equal((await next).status, 200);
  assert.equal((await queueHealth(url)).running, false);
});

test('queue limits reject invalid configuration', () => {
  for (const maxConcurrentSearches of [0, 1.5, 9, Number.NaN]) {
    assert.throws(() => createCrawlerToolServer({ token: 'test', maxConcurrentSearches }), /maxConcurrentSearches/);
  }
  for (const maxQueuedRequests of [-1, 1.5, 101, Number.NaN]) {
    assert.throws(() => createCrawlerToolServer({ token: 'test', maxQueuedRequests }), /maxQueuedRequests/);
  }
  for (const queueWaitTimeoutMs of [0, -1, 420_001, Number.NaN]) {
    assert.throws(() => createCrawlerToolServer({ token: 'test', queueWaitTimeoutMs }), /queueWaitTimeoutMs/);
  }
});
