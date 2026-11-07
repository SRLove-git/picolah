import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';

test('chat cache shares verified quotes, retains owner isolation and includes fallback answer after cache notice', async () => {
  let calls = 0;
  const crawler = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body); calls++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, ...input, summary: { requests: 1, matched: 1, skipped: 0, failed: 0 },
      listings: [{ platform: 'web', sourceHost: 'merchant.sg', market: input.market, itemId: 'xiaomi-14',
        title: input.query, url: 'https://merchant.sg/product/xiaomi-14', price: 599, currency: 'SGD', inStock: false,
        priceQuote: { kind: 'exact', availability: 'out-of-stock', source: 'html' },
        verification: { source: 'product-page', checkedAt: new Date().toISOString() } }] }));
  });
  const listen = async (server: Server) => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    return `http://127.0.0.1:${address.port}`;
  };
  const close = async (server: Server) => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  };
  Object.assign(process.env, { NODE_ENV: 'test', AUTH_REQUIRED: 'false', DATABASE_URL: '', PICOLAH_DB_PATH: ':memory:',
    LLM_API_KEY: '', CRAWLER_TOOL_URL: await listen(crawler), CRAWLER_TOOL_TOKEN: 'cache-test-token',
    CRAWLER_SEARCH_SCOPE: 'web', PRICE_SEARCH_CACHE_TTL_SECONDS: '300' });
  const { app } = await import('./index.ts');
  const { db } = await import('./db.ts');
  const server = createServer(app), base = await listen(server);
  try {
    const ask = async (user: string) => {
      const response = await fetch(base + '/api/chat', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-picolah-user': user },
        body: JSON.stringify({ message: '小米14', market: 'SG' }), signal: AbortSignal.timeout(15_000) });
      assert.equal(response.status, 200);
      const events = (await response.text()).split('\n\n').filter(part => part.startsWith('event:')).map(part => {
        const lines = part.split('\n'); return { name: lines[0].slice(7).trim(), data: JSON.parse(lines.find(line => line.startsWith('data:'))!.slice(5)) };
      });
      const comparison = events.find(event => event.name === 'results')!.data;
      const text = events.filter(event => event.name === 'delta').map(event => event.data.text).join('');
      const id = events.find(event => event.name === 'meta')!.data.conversationId;
      return { comparison, text, id };
    };
    const first = await ask('anon-cache-first'), second = await ask('anon-cache-second');
    assert.equal(calls, 1); assert.equal(first.comparison.search.cache.hit, false);
    assert.equal(second.comparison.search.cache.hit, true);
    assert.equal(second.comparison.search.cache.checkedAt, first.comparison.search.cache.checkedAt);
    assert.match(second.text, /缓存报价.*核验时间/); assert.match(second.text, /599/);
    assert.match(first.text, /缺货/);
    assert.doesNotMatch(first.text, /部分结果包含起价/);
    assert.notEqual(first.id, second.id);
    const denied = await fetch(base + '/api/conversations/' + first.id, { headers: { 'x-picolah-user': 'anon-cache-second' } });
    assert.equal(denied.status, 404);
  } finally { await close(server); await close(crawler); await db.close(); }
});
