import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { after, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Comparison } from '../shared/types.ts';

type Payload = { market: string; scope?: 'web' | 'platforms'; platforms: string[]; excludedPlatforms?: string[]; query: string; model?: string };
type RequestRecord = { path: string; authorization?: string; payload: Payload };
type Event = { name: string; data: Record<string, unknown> };
type ResultMode = 'not_found' | 'failed' | 'http_error' | 'invalid_price' | 'wrong_model' | 'valid';

const requests: RequestRecord[] = [];
let mode: ResultMode = 'not_found';
let searchGate: Promise<void> | undefined;
let onSearchEntered: (() => void) | undefined;

// Only this loopback stub is configured as the crawler. These tests never call a
// paid provider, and their in-memory catalog is independent of local app data.
const crawler = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const payload = JSON.parse(raw) as Payload;
  // Match the real crawler tool contract: direct platform lists are already filtered.
  if (payload.scope !== 'web') assert.equal(payload.excludedPlatforms, undefined);
  requests.push({ path: request.url || '', authorization: request.headers.authorization, payload });

  if (request.url !== '/search') {
    response.writeHead(404).end();
    return;
  }

  onSearchEntered?.();
  await searchGate;
  response.setHeader('content-type', 'application/json');
  if (mode === 'http_error') {
    response.writeHead(500).end(JSON.stringify({ error: 'mock provider failure' }));
    return;
  }
  const matched = mode === 'invalid_price' || mode === 'wrong_model' || mode === 'valid';
  response.end(JSON.stringify({
    ok: true, market: payload.market, scope: payload.scope, platforms: payload.platforms, query: payload.query, model: payload.model,
    listings: matched ? [{
      platform: payload.scope === 'web' ? 'web' : payload.platforms.includes('lazada') ? 'lazada' : payload.platforms[0],
      ...(payload.scope === 'web' ? { sourceHost: 'retailer.sg' } : {}), market: payload.market,
      itemId: 'fixture-item-001', title: mode === 'wrong_model' ? 'Sony WH-1000XM5' : payload.model || payload.query,
      url: payload.scope === 'web' ? 'https://www.retailer.sg/products/fixture-item-001.html' : 'https://www.lazada.sg/products/fixture-item-001.html',
      price: mode === 'invalid_price' ? -399 : 399, currency: 'SGD',
      shippingFee: 5, discount: 10, rating: 4.8, reviews: 42,
      seller: 'Fixture Store', inStock: true, isOfficial: false,
    }] : [],
    summary: {
      requests: 1, matched: matched ? 1 : 0,
      skipped: mode === 'not_found' ? 1 : 0, failed: mode === 'failed' ? 1 : 0,
    },
  }));
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'false';
process.env.DATABASE_URL = '';
process.env.PICOLAH_DB_PATH = ':memory:';
process.env.LLM_API_KEY = '';
process.env.CRAWLER_TOOL_URL = await listen(crawler);
process.env.CRAWLER_TOOL_TOKEN = 'model-search-test-token';
process.env.CRAWLER_TOOL_DEFAULT_PLATFORMS = 'lazada';
process.env.CRAWLER_SEARCH_SCOPE = 'platforms';

const { app } = await import('./index.ts');
const { config } = await import('./config.ts');
const { db, dbPath } = await import('./db.ts');
const server = createServer(app);
const baseUrl = await listen(server);

beforeEach(() => {
  config.crawlerTool.searchScope = 'platforms';
  mode = 'not_found';
  searchGate = undefined;
  onSearchEntered = undefined;
});

after(async () => {
  await Promise.all([server, crawler].map((listener) => new Promise<void>((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
    listener.closeAllConnections();
  })));
  await db.close();
});

async function ask(
  message: string,
  options: { market?: string; conversationId?: string; onEvent?: (event: Event) => void } = {},
) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, market: options.market || 'SG', conversationId: options.conversationId }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200);
  assert.ok(response.body);
  const events: Event[] = [];
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    let boundary: number;
    while ((boundary = pending.indexOf('\n\n')) !== -1) {
      const frame = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      const name = frame.split('\n').find((line) => line.startsWith('event: '))?.slice(7) || '';
      const data = frame.split('\n').find((line) => line.startsWith('data: '));
      if (!data) continue;
      const event = { name, data: JSON.parse(data.slice(6)) as Record<string, unknown> };
      events.push(event);
      options.onEvent?.(event);
    }
  }
  const conversationId = events.find((event) => event.name === 'meta')?.data.conversationId;
  const comparison = events.find((event) => event.name === 'results')?.data as Comparison | undefined;
  assert.equal(typeof conversationId, 'string');
  assert.ok(comparison);
  assert.ok(events.some((event) => event.name === 'done'));
  return {
    conversationId: conversationId as string,
    comparison,
    answer: events.filter((event) => event.name === 'delta').map((event) => event.data.text).join(''),
    events,
  };
}

function assertNoInventedResults(result: Awaited<ReturnType<typeof ask>>) {
  assert.equal(result.comparison.product, null);
  assert.deepEqual(result.comparison.offers, []);
  assert.deepEqual(result.comparison.alternatives, []);
  assert.doesNotMatch(result.answer, /我还没有在价格库|热门选择|S\$\d/);
}

function assertSearch(result: Awaited<ReturnType<typeof ask>>, platforms: string[], status: string) {
  assert.equal(result.comparison.search?.model, 'WF-1000XM6');
  assert.equal(result.comparison.search?.status, status);
  assert.deepEqual(result.comparison.search?.platforms, platforms);
}

test('unknown full model searches before answering instead of the old catalog fallback', { timeout: 20_000 }, async () => {
  const start = requests.length;
  let releaseSearch!: () => void;
  searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
  const entered = new Promise<void>((resolve) => { onSearchEntered = resolve; });
  let signalStatus!: () => void;
  const status = new Promise<void>((resolve) => { signalStatus = resolve; });
  const received: Event[] = [];
  const pending = ask('帮我找一下wf1000xm6', {
    onEvent(event) {
      received.push(event);
      if (event.name === 'status' && event.data.label === '正在搜索商品信息') signalStatus();
    },
  });
  try {
    await Promise.all([entered, status]);
    assert.equal(received.some((event) => event.name === 'results' || event.name === 'delta'), false);
  } finally {
    releaseSearch();
  }
  const result = await pending;
  assert.deepEqual(requests.slice(start), [{
    path: '/search', authorization: 'Bearer model-search-test-token',
    payload: { market: 'SG', scope: 'platforms', platforms: ['shopee', 'lazada', 'amazon-sg'], query: 'WF-1000XM6', model: 'WF-1000XM6' },
  }]);
  assertSearch(result, ['shopee', 'lazada', 'amazon-sg'], 'not_found');
  assert.equal(result.comparison.search?.scope, 'platforms');
  assert.match(result.answer, /Shopee.*Lazada.*Amazon SG/);
  assert.doesNotMatch(result.answer, /全网搜索/);
  assert.match(result.answer, /WF-1000XM6/);
  assert.doesNotMatch(result.answer, /XM5|iPhone/);
  assertNoInventedResults(result);
});

test('platform, price and retry followups retain the missing model and requested platform', async () => {
  const first = await ask('帮我找一下wf1000xm6');
  const start = requests.length;
  for (const message of ['只看Shopee', '价格呢', '重试']) {
    const result = await ask(message, { conversationId: first.conversationId });
    assertSearch(result, ['shopee'], 'not_found');
    assertNoInventedResults(result);
  }
  assert.deepEqual(requests.slice(start).map(({ path, payload }) => ({ path, payload })),
    Array.from({ length: 3 }, () => ({
      path: '/search', payload: { market: 'SG', scope: 'platforms', platforms: ['shopee'], query: 'WF-1000XM6', model: 'WF-1000XM6' },
    })));
});

test('explicit platform restriction, exclusions, followups and reset keep the requested search scope', async () => {
  const first = await ask('只看 Lazada 的 WF1000XM6');
  assert.deepEqual(requests.at(-1)?.payload.platforms, ['lazada']);
  assert.equal(requests.at(-1)?.payload.scope, 'platforms');
  const prices = await ask('价格呢', { conversationId: first.conversationId });
  assert.equal(prices.comparison.search?.scope, 'platforms');
  assert.deepEqual(requests.at(-1)?.payload.platforms, ['lazada']);
  const excluded = await ask('不要 Shopee', { conversationId: first.conversationId });
  assert.equal(excluded.comparison.search?.scope, 'platforms');
  assert.deepEqual(excluded.comparison.search?.excludedPlatforms, ['shopee']);
  assert.equal(excluded.comparison.platformFilter, undefined);
  for (const message of ['价格呢', '重试']) {
    const followup = await ask(message, { conversationId: first.conversationId });
    assert.equal(followup.comparison.search?.scope, 'platforms');
    assert.deepEqual(requests.at(-1)?.payload.platforms, ['lazada', 'amazon-sg']);
    assert.deepEqual(followup.comparison.search?.excludedPlatforms, ['shopee']);
    assert.equal(requests.at(-1)?.payload.excludedPlatforms, undefined);
    assert.equal(requests.at(-1)?.payload.model, 'WF-1000XM6');
  }
  const anotherExcluded = await ask('排除 TikTok', { conversationId: first.conversationId });
  assert.deepEqual(anotherExcluded.comparison.search?.excludedPlatforms, ['shopee', 'tiktok']);
  const reset = await ask('恢复全部平台', { conversationId: first.conversationId });
  assert.equal(reset.comparison.search?.scope, 'platforms');
  assert.deepEqual(requests.at(-1)?.payload.platforms, ['shopee', 'lazada', 'amazon-sg']);
  assert.equal(requests.at(-1)?.payload.excludedPlatforms, undefined);
});

test('Chinese and English web search requests reset restrictions without losing the previous product', async () => {
  const first = await ask('只看 Lazada 的 WF1000XM6');
  for (const message of ['全网搜索', '全网搜', '所有网站', 'search the web', 'all websites']) {
    await ask('只看 Lazada', { conversationId: first.conversationId });
    const result = await ask(message, { conversationId: first.conversationId });
    assert.equal(result.comparison.search?.scope, 'platforms');
    assert.equal(result.comparison.search?.model, 'WF-1000XM6');
    assert.deepEqual(requests.at(-1)?.payload.platforms, ['shopee', 'lazada', 'amazon-sg']);
    assert.equal(requests.at(-1)?.payload.query, 'WF-1000XM6');
  }
});

test('English exclusion followups retain exclusions and query on retry', async () => {
  const first = await ask('WF1000XM6');
  for (const message of ['exclude Shopee', "don't use Lazada", 'without TikTok Shop']) {
    const result = await ask(message, { conversationId: first.conversationId });
    assert.equal(result.comparison.search?.scope, 'platforms');
    assert.equal(requests.at(-1)?.payload.query, 'WF-1000XM6');
  }
  const retry = await ask('retry', { conversationId: first.conversationId });
  assert.deepEqual(retry.comparison.search?.excludedPlatforms, ['shopee', 'lazada', 'tiktok']);
  assert.equal(requests.at(-1)?.payload.excludedPlatforms, undefined);
  assert.deepEqual(requests.at(-1)?.payload.platforms, ['amazon-sg']);
  await ask('search the web', { conversationId: first.conversationId });
  assert.equal(requests.at(-1)?.payload.excludedPlatforms, undefined);
  const bothExcluded = await ask('exclude Shopee and Lazada', { conversationId: first.conversationId });
  assert.equal(requests.at(-1)?.payload.query, 'WF-1000XM6');
  assert.deepEqual(bothExcluded.comparison.search?.excludedPlatforms, ['lazada', 'shopee']);
});

test('default multi-platform discovery is market-scoped and ignores legacy Lazada-only refresh config', async () => {
  assert.deepEqual(config.crawlerTool.defaultPlatforms, ['lazada']);
  for (const market of ['MY', 'TH', 'ID', 'PH', 'VN']) {
    const result = await ask('WF1000XM6', { market });
    assert.equal(result.comparison.search?.scope, 'platforms');
    assert.deepEqual(requests.at(-1)?.payload.platforms, ['shopee', 'lazada']);
  }
});

test('web discovery is opt-in while explicit supported platform restrictions still work', async () => {
  config.crawlerTool.searchScope = 'web';
  const first = await ask('WF1000XM6');
  assert.equal(first.comparison.search?.scope, 'web');
  assert.deepEqual(requests.at(-1)?.payload.platforms, []);
  await ask('不要 Shopee', { conversationId: first.conversationId });
  assert.equal(requests.at(-1)?.payload.scope, 'web');
  assert.deepEqual(requests.at(-1)?.payload.excludedPlatforms, ['shopee']);
  await ask('只看 Lazada', { conversationId: first.conversationId });
  assert.equal(requests.at(-1)?.payload.scope, 'platforms');
  assert.deepEqual(requests.at(-1)?.payload.platforms, ['lazada']);
  await ask('全网搜', { conversationId: first.conversationId });
  assert.equal(requests.at(-1)?.payload.scope, 'web');
  assert.deepEqual(requests.at(-1)?.payload.platforms, []);
});

test('new explicit model does not inherit a previous product just because the query mentions price', async () => {
  for (const message of ['WF1000XM6 价格', 'wf1000xm6哪里便宜']) {
    mode = 'valid';
    const known = await ask('Sony WH-1000XM5');
    assert.match(known.comparison.product?.name || '', /WH-1000XM5/);
    mode = 'not_found';
    const start = requests.length;
    const result = await ask(message, { conversationId: known.conversationId });
    assert.equal(result.comparison.search?.model, 'WF-1000XM6');
    assert.equal(requests.length - start, 1);
    assert.equal(requests[start].path, '/search');
    assertNoInventedResults(result);
  }
});

test('known catalog products and generic product requests also search live, never refresh by catalog ID', async () => {
  for (const message of ['Sony WH-1000XM5', 'iPhone 15', '推荐无线耳机']) {
    const start = requests.length;
    const result = await ask(message);
    assert.equal(requests.length - start, 1);
    assert.equal(requests[start].path, '/search');
    assert.equal(typeof requests[start].payload.query, 'string');
    assert.ok(requests[start].payload.query.length > 1);
    assert.equal('productIds' in requests[start].payload, false);
    assert.equal(result.comparison.search?.status, 'not_found');
    assertNoInventedResults(result);
  }
});

test('crawler failures are not reported as no matching products', async () => {
  for (const failureMode of ['failed', 'http_error'] as const) {
    mode = failureMode;
    for (const message of ['帮我找一下wf1000xm6', 'Sony WH-1000XM5', 'iPhone 15']) {
      const result = await ask(message);
      assert.equal(result.comparison.search?.status, 'failed');
      assert.match(result.answer, /搜索暂时未完成/);
      assert.doesNotMatch(result.answer, /暂未找到.*完全匹配/);
      assertNoInventedResults(result);
    }
  }
});

test('a failed followup never reuses prices from the previous successful tool result', async () => {
  mode = 'valid';
  const first = await ask('Sony WH-1000XM5');
  assert.equal(first.comparison.offers[0].finalPrice, 394);
  mode = 'http_error';
  const start = requests.length;
  const result = await ask('只看 Shopee', { conversationId: first.conversationId });
  assert.equal(requests.length - start, 1);
  assert.equal(requests[start].path, '/search');
  assert.equal(requests[start].payload.model, 'WH-1000XM5');
  assert.deepEqual(requests[start].payload.platforms, ['shopee']);
  assert.equal(result.comparison.search?.status, 'failed');
  assertNoInventedResults(result);
});

test('unsupported market/platform cannot silently fall back to another platform search', async () => {
  const start = requests.length;
  const result = await ask('只看 Amazon 的 WF1000XM6', { market: 'MY' });
  assert.equal(requests.length, start);
  assert.equal(result.comparison.search?.status, 'unavailable');
  assert.deepEqual(result.comparison.unsupportedPlatforms, ['amazon-sg']);
  assert.match(result.answer, /马来西亚当前不支持.*Amazon SG/);
  assertNoInventedResults(result);

  const unsupportedCrawler = await ask('只看 TikTok Shop 的 WF1000XM6');
  assert.equal(requests.length, start);
  assert.equal(unsupportedCrawler.comparison.search?.status, 'unavailable');
  assertNoInventedResults(unsupportedCrawler);

  const mixedUnsupported = await ask('只看 Lazada 和 TikTok Shop 的 WF1000XM6');
  assert.equal(requests.length, start);
  assert.equal(mixedUnsupported.comparison.search?.status, 'unavailable');
  assert.deepEqual(mixedUnsupported.comparison.unsupportedPlatforms, ['tiktok']);
  assertNoInventedResults(mixedUnsupported);
});

test('malformed or wrong-model live listings never become comparison prices', async () => {
  for (const invalidMode of ['invalid_price', 'wrong_model'] as const) {
    mode = invalidMode;
    const result = await ask('帮我找一下wf1000xm6');
    assert.notEqual(result.comparison.search?.status, 'matched');
    assertNoInventedResults(result);
  }
});

test('unconfigured tool does not fall back to seeded catalog quotes', { timeout: 20_000 }, async () => {
  const script = `
    const { app } = await import(${JSON.stringify(new URL('./index.ts', import.meta.url).href)});
    const { db } = await import(${JSON.stringify(new URL('./db.ts', import.meta.url).href)});
    const server = await new Promise(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const results = [];
      for (const message of ['Sony WH-1000XM5', 'iPhone 15']) {
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/chat', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message, market: 'SG' })
        });
        const events = (await response.text()).split('\\n').filter(line => line.startsWith('data: '))
          .map(line => JSON.parse(line.slice(6)));
        results.push({ comparison: events.find(event => event.kind),
          answer: events.filter(event => typeof event.text === 'string').map(event => event.text).join('') });
      }
      console.log(JSON.stringify(results));
    } finally {
      await new Promise(resolve => server.close(resolve));
      await db.close();
    }
  `;
  const { stdout } = await promisify(execFile)(process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, CRAWLER_TOOL_URL: '', CRAWLER_TOOL_TOKEN: '', LLM_API_KEY: '',
        DATABASE_URL: '', PICOLAH_DB_PATH: ':memory:', NODE_ENV: 'test', AUTH_REQUIRED: 'false' },
      timeout: 15_000,
    });
  const results = JSON.parse(stdout.trim().split('\n').at(-1) || '[]') as Array<Awaited<ReturnType<typeof ask>>>;
  assert.equal(results.length, 2);
  for (const result of results) {
    assert.equal(result.comparison.search?.status, 'unavailable');
    assertNoInventedResults(result);
  }
});

test('verified live listings are compared directly with an empty catalog and never ingested', async () => {
  assert.equal(dbPath, ':memory:');
  await db.run('DELETE FROM products');
  assert.equal((await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM offers'))?.count, 0);
  const initialIngestRuns = (await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM ingest_runs'))?.count;
  mode = 'valid';
  const start = requests.length;
  const result = await ask('帮我找一下wf1000xm6');
  assert.equal(result.comparison.kind, 'comparison');
  assertSearch(result, ['shopee', 'lazada', 'amazon-sg'], 'matched');
  assert.match(result.comparison.product?.name || '', /WF-1000XM6/);
  assert.equal(result.comparison.offers.length, 1);
  assert.equal(result.comparison.offers[0].platformId, 'lazada');
  assert.equal(result.comparison.offers[0].seller, 'Fixture Store');
  assert.equal(result.comparison.offers[0].finalPrice, 394);
  assert.equal(result.comparison.offers[0].landedPriceConfidence, 'exact');
  assert.equal(result.comparison.offers[0].rating, 4.8);
  assert.equal(result.comparison.offers[0].reviews, 42);
  assert.match(result.answer, /WF-1000XM6/);
  assert.match(result.answer, /S\$394\.00/);
  assert.doesNotMatch(result.answer, /我还没有在价格库|暂未找到|XM5|iPhone/);
  assert.deepEqual(requests.slice(start).map(({ path }) => path), ['/search']);

  const repeatedStart = requests.length;
  const known = await ask('WF1000XM6 价格');
  assert.equal(known.comparison.kind, 'comparison');
  assert.equal(known.comparison.offers[0].finalPrice, 394);
  assert.deepEqual(requests.slice(repeatedStart).map(({ path, payload }) => ({ path, payload })), [{
    path: '/search',
    payload: { market: 'SG', scope: 'platforms', platforms: ['shopee', 'lazada', 'amazon-sg'], query: 'WF-1000XM6', model: 'WF-1000XM6' },
  }]);
  assert.equal((await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM products'))?.count, 0);
  assert.equal((await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM offers'))?.count, 0);
  assert.equal((await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM ingest_runs'))?.count, initialIngestRuns);
});
