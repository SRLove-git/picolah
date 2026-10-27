import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.PICOLAH_DB_PATH = ':memory:';
process.env.CRAWLER_TOOL_URL = '';
process.env.CRAWLER_TOOL_TOKEN = '';
process.env.LLM_API_KEY = '';

const { app } = await import('./index.ts');
const server = await new Promise<import('node:http').Server>((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server did not bind a TCP port');
const baseUrl = `http://127.0.0.1:${address.port}`;

after(() => new Promise<void>((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
}));

async function ask(message: string, market = 'SG', conversationId?: string) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, market, conversationId }),
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  const events = body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, any>);
  const conversationIdValue = events.find((event) => event.conversationId)?.conversationId;
  const comparison = events.find((event) => event.kind);
  assert.equal(typeof conversationIdValue, 'string');
  assert.ok(comparison);
  return {
    conversationId: conversationIdValue as string,
    comparison,
    answer: events.filter((event) => typeof event.text === 'string').map((event) => event.text).join(''),
  };
}

test('chat keeps, excludes and resets platform filters without losing the product', async () => {
  const first = await ask('Sony WH-1000XM5 在新加坡多少钱');
  const lazada = await ask('只看 Lazada', 'SG', first.conversationId);
  assert.equal(lazada.comparison.search.model, 'WH-1000XM5');
  assert.equal(lazada.comparison.search.status, 'unavailable');
  assert.equal(lazada.comparison.product, null);
  assert.deepEqual(lazada.comparison.platformFilter, ['lazada']);
  assert.ok(lazada.comparison.offers.every((offer: any) => offer.platformId === 'lazada'));

  const inherited = await ask('哪个最便宜', 'SG', first.conversationId);
  assert.deepEqual(inherited.comparison.platformFilter, ['lazada']);
  assert.ok(inherited.comparison.offers.every((offer: any) => offer.platformId === 'lazada'));

  const excluded = await ask('不要 Shopee', 'SG', first.conversationId);
  assert.equal(excluded.comparison.platformFilter, undefined);
  assert.equal(excluded.comparison.search.scope, 'platforms');
  assert.deepEqual(excluded.comparison.search.excludedPlatforms, ['shopee']);
  assert.ok(excluded.comparison.offers.every((offer: any) => offer.platformId !== 'shopee'));

  const reset = await ask('恢复全部平台', 'SG', first.conversationId);
  assert.equal(reset.comparison.platformFilter, undefined);
  assert.equal(reset.comparison.search.scope, 'platforms');
  assert.equal(reset.comparison.search.excludedPlatforms, undefined);
  assert.equal(reset.comparison.search.model, 'WH-1000XM5');
  assert.deepEqual(reset.comparison.offers, []);
  assert.doesNotMatch(reset.answer, /S\$|我查了|价格库里/);
});

test('chat explains when a requested platform is unavailable in the market', async () => {
  const first = await ask('Sony WH-1000XM5', 'MY');
  const amazon = await ask('只看 Amazon', 'MY', first.conversationId);
  assert.deepEqual(amazon.comparison.unsupportedPlatforms, ['amazon-sg']);
  assert.match(amazon.answer, /马来西亚当前不支持 \*\*Amazon SG\*\*/);
});

test('chat sends a clean product name to the crawler after a measure word', async () => {
  const reply = await ask('我想买个 iPhone');
  assert.equal(reply.comparison.search.model, 'iPhone');
  assert.doesNotMatch(reply.answer, /个\s*iPhone/);
});
