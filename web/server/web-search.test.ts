import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownText } from '../src/components/MarkdownText.tsx';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.PICOLAH_DB_PATH = ':memory:';
process.env.AUTH_REQUIRED = 'false';
process.env.LLM_API_KEY = '';
process.env.WEB_SEARCH_ENABLED = 'true';
process.env.WEB_SEARCH_API_KEY = 'search-fixture-key';
process.env.PRODUCT_SEARCH_SOURCE = 'catalog';
const { config } = await import('./config.ts');
const { normalizeWebEvidence, searchWeb, planWebSearch, citeWebAnswer, answerWeb, webSearchTools } = await import('./agent/web-search.ts');
const { app } = await import('./index.ts');
const { db } = await import('./db.ts');
const { getConversation } = await import('./repo.ts');
const server = createServer(app);
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const row = { title: 'Official specs', url: 'https://www.philips.com.sg/product', summary: 'Model NA221/09 has 4.2 L capacity.', date: null };
const evidence = normalizeWebEvidence({ results: [row] }, 'Philips NA221/09 capacity');
const original = { ...webSearchTools };
after(async () => {
  Object.assign(webSearchTools, original);
  await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections(); });
  await db.close();
});

test('provider output rejects invalid data and unsafe links; deduplicates evidence', () => {
  const actual = normalizeWebEvidence({ results: [row, row, ...['javascript:alert(1)', 'http://127.0.0.1/a', 'http://localhost/a', 'https://user:pass@example.com/a', 'http://router.internal/a'].map(url => ({ ...row, url })), { url: 'https://example.com' }] }, 'query');
  assert.deepEqual(actual.sources, [row]);
  assert.throws(() => normalizeWebEvidence({ error: 'bad' }, 'q'), /INVALID_RESPONSE/);
});
test('search uses fixed provider, bounded query, no redirects, and does not expose error bodies', async () => {
  let called = false;
  const result = await searchWeb('😀'.repeat(150), async (input, options) => {
    called = true;
    assert.equal(input, 'https://api.deepseek.com/v1/tools/search');
    assert.equal(options?.redirect, 'error');
    assert.equal((options?.headers as Record<string, string>).authorization, 'Bearer search-fixture-key');
    const body = JSON.parse(String(options?.body));
    assert.equal(Array.from(body.query).length, 128);
    assert.equal(body.count, 5);
    return Response.json({ results: [row] });
  });
  assert.ok(called && result.sources.length === 1);
  await assert.rejects(searchWeb('q', async () => new Response('private upstream error', { status: 401 })), /^Error: SEARCH_HTTP_401$/);
  await assert.rejects(searchWeb('q', async () => new Response('x'.repeat(1_000_001))), /RESPONSE_TOO_LARGE/);
});
test('quotes, greetings and explicit opt out do not trigger network; explicit search survives planner failure', async () => {
  for (const q of ['全网搜索 Sony WH-1000XM5 价格', 'Search the web for Sony WH-1000XM5 prices', 'Sony WH-1000XM5多少钱', '预算300元', '只看Lazada', '你好', '不要联网搜索参数', "don't search online"]) {
    assert.equal(await planWebSearch(q, 'SG', null, []), null, q);
  }
  assert.equal(await planWebSearch('联网搜索飞利浦容量', 'SG', null, []), '联网搜索飞利浦容量');
  config.webSearch.enabled = false;
  assert.equal(await planWebSearch('联网搜索飞利浦容量', 'SG', null, []), null);
  config.webSearch.enabled = true;
});
test('only provider sources become citations, with safe clickable rendering', () => {
  const answer = citeWebAnswer('4.2 L [1] [99] [invented](https://evil.example/a) https://evil.example/b', evidence);
  assert.match(answer, /4\.2 L \[1\]\(<https:\/\/www.philips.com.sg\/product>\)/);
  assert.doesNotMatch(answer, /evil\.example|\[99\]/);
  const html = renderToStaticMarkup(createElement(MarkdownText, { text: answer + '\n[junk](javascript:alert(1))' }));
  assert.match(html, /href="https:\/\/www.philips.com.sg\/product"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /href="javascript:/);
});
test('empty search is honest without model completion', async () => {
  assert.match(await answerWeb('容量?', { ...evidence, sources: [] }), /没有找到/);
});
async function ask(message: string, conversationId?: string) {
  const res = await fetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-picolah-user': 'anon-web-search-test' }, body: JSON.stringify({ message, market: 'SG', conversationId }) });
  assert.equal(res.status, 200);
  const frames = (await res.text()).trim().split('\n\n').map(f => ({ name: f.split('\n')[0].slice(7), data: JSON.parse(f.split('\n')[1].slice(6)) }));
  assert.ok(frames.some(f => f.name === 'done'));
  return { frames, answer: frames.filter(f => f.name === 'delta').map(f => f.data.text).join(''), id: frames.find(f => f.name === 'meta')!.data.conversationId };
}
test('web chat streams and persists sources, without creating quotes; quote follow-up keeps catalog route', async () => {
  const offersBefore = await db.all('SELECT id, final_price, last_seen FROM offers ORDER BY id');
  webSearchTools.plan = async (q, _m, _p, history) => {
    if (q.includes('多少钱')) { assert.ok(history.includes('联网搜索NA221/09容量')); return null; }
    return 'Philips NA221/09 capacity';
  };
  webSearchTools.search = async () => evidence;
  webSearchTools.answer = async () => citeWebAnswer('NA221/09 容量为 4.2 L [1]', evidence);
  const result = await ask('联网搜索NA221/09容量');
  assert.ok(result.frames.some(f => f.name === 'status' && f.data.label === '正在联网搜索…'));
  assert.ok(!result.frames.some(f => f.name === 'results'));
  const stored = await getConversation(result.id, 'anon-web-search-test');
  assert.equal(stored?.messages.at(-1)?.content, result.answer);
  const metadata = await db.get<{ metadata: string }>("SELECT metadata FROM messages WHERE conversation_id = ? AND role = 'assistant'", [result.id]);
  assert.equal(JSON.parse(metadata!.metadata).source, 'web-search');
  assert.deepEqual(await db.all('SELECT id, final_price, last_seen FROM offers ORDER BY id'), offersBefore);
  const price = await ask('Sony WH-1000XM5多少钱', result.id);
  assert.ok(price.frames.some(f => f.name === 'results'));
  assert.ok(!price.frames.some(f => f.name === 'status' && f.data.label === '正在联网搜索…'));
});
test('search failure completes honestly, with no fake evidence or catalog fallback', async () => {
  webSearchTools.plan = async () => 'query';
  webSearchTools.search = async () => { throw new Error('upstream secret'); };
  const result = await ask('联网搜索最新参数');
  assert.match(result.answer, /连接失败.*未能完成核实/);
  assert.doesNotMatch(result.answer, /upstream|来源|http/);
  assert.ok(!result.frames.some(f => f.name === 'results'));
});
test('a web topic switch cannot reuse the old product for an ambiguous price question', async () => {
  webSearchTools.plan = async q => q.includes('联网') ? 'Philips NA221/09 capacity' : null;
  webSearchTools.search = async () => evidence;
  webSearchTools.answer = async () => citeWebAnswer('NA221/09 容量为 4.2 L [1]', evidence);
  const first = await ask('Sony WH-1000XM5多少钱');
  assert.equal(first.frames.find(f => f.name === 'results')?.data.product?.id, 'sony-wh1000xm5');
  await ask('联网搜索NA221/09容量', first.id);
  const after = await ask('它多少钱', first.id);
  assert.equal(after.frames.find(f => f.name === 'results')?.data.product, null);
  assert.doesNotMatch(after.answer, /Sony|WH.?1000XM5/i);
});

test('appliance price searches retain the brand alongside their full manufacturer model', async () => {
  const { liveSearchQuery } = await import('./agent/live-query.ts');
  assert.equal(liveSearchQuery('全网搜索 Philips NA221/09 价格')?.query, 'Philips NA-221/09');
  assert.equal(liveSearchQuery('全网搜索飞利浦 NA221/09 价格')?.query, 'Philips NA-221/09');
});
