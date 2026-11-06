import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

test('explicit online shopping respects an empty model route; only planner errors use fallback', async () => {
  let query = '', failing = false;
  const api = createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume the local request */ }
    res.setHeader('Content-Type', 'application/json');
    if (failing) { res.writeHead(400).end(JSON.stringify({ error: { message: 'fixture unavailable' } })); return; }
    res.end(JSON.stringify({ id: 'route-test', object: 'chat.completion', created: 1, model: 'deepseek-flash',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ query }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const address = api.address(); assert.ok(address && typeof address !== 'string');
  Object.assign(process.env, { LLM_API_KEY: 'local-test-key', WEB_SEARCH_ENABLED: 'true', WEB_SEARCH_API_KEY: 'local-test-key',
    LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`, LLM_MODEL: 'deepseek-flash' });
  const { planWebSearch } = await import('./agent/web-search.ts');
  try {
    assert.equal(await planWebSearch('联网搜索小米14购买渠道', 'SG', null, []), null);
    assert.equal(await planWebSearch('哪里能买到小米14', 'SG', null, []), null);
    query = 'Xiaomi 14 official display size';
    assert.equal(await planWebSearch('联网查询小米14屏幕尺寸', 'SG', null, []), query);
    failing = true;
    assert.equal(await planWebSearch('联网搜索小米14参数', 'SG', null, []), '联网搜索小米14参数');
    assert.equal(await planWebSearch('小米14屏幕多大', 'SG', null, []), null);
  } finally {
    api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
