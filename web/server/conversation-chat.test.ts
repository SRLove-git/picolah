import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'false';
process.env.DATABASE_URL = '';
process.env.PICOLAH_DB_PATH = ':memory:';
process.env.LLM_API_KEY = '';
process.env.WEB_SEARCH_ENABLED = 'false';
process.env.PRICE_SEARCH_CACHE_TTL_SECONDS = '0';
process.env.CRAWLER_TOOL_URL = 'http://127.0.0.1:1';
process.env.CRAWLER_TOOL_TOKEN = 'fixture';
process.env.CRAWLER_SEARCH_SCOPE = 'web';

const { app } = await import('./index.ts');
const { db } = await import('./db.ts');
const { getConversation } = await import('./repo.ts');
const { modelSearchTool } = await import('./agent/tools/model-search.ts');
const { conversationTools, fallbackConversationTurn } = await import('./agent/conversation-turn.ts');
const { buildChatMessages } = await import('./llm.ts');
const originalInvoke = modelSearchTool.invoke;
const originalPlan = conversationTools.plan;
const searches: Record<string, unknown>[] = [];
modelSearchTool.invoke = async input => {
  searches.push(input as unknown as Record<string, unknown>);
  throw new Error('fixture page unavailable');
};
const server = createServer(app);
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
after(async () => {
  modelSearchTool.invoke = originalInvoke;
  conversationTools.plan = originalPlan;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.close();
});
async function ask(message: string, conversationId?: string, market = 'SG') {
  const response = await fetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-picolah-user': 'anon-conversation-regression' }, body: JSON.stringify({ message, conversationId, market }) });
  assert.equal(response.status, 200);
  const frames = (await response.text()).trim().split('\n\n').filter(f => f.startsWith('event:')).map(f => ({ event: f.split('\n')[0].slice(7), data: JSON.parse(f.split('\n')[1].slice(6)) }));
  assert.ok(frames.some(f => f.event === 'done'));
  return { id: frames.find(f => f.event === 'meta')!.data.conversationId as string, comparison: frames.find(f => f.event === 'results')?.data,
    answer: frames.filter(f => f.event === 'delta').map(f => f.data.text).join(''), frames };
}

test('conversation and explaining a failed lookup do not invoke search or produce empty comparison cards', async () => {
  for (const message of ['你好', '你只能查商品吗？', '今天心情不太好，陪我聊聊天', '不要搜索，先解释一下价格是什么意思']) {
    const count = searches.length;
    const result = await ask(message);
    assert.equal(result.comparison, undefined, message);
    assert.equal(searches.length, count, message);
    assert.ok(!result.frames.some(f => f.event === 'status' && /搜索商品/.test(f.data.label)));
    const stored = await getConversation(result.id, 'anon-conversation-regression');
    assert.equal(stored?.messages.at(-1)?.content, result.answer);
  }
  const first = await ask('小米14');
  const count = searches.length;
  const why = await ask('为什么刚才没有查到价格？', first.id);
  assert.equal(why.comparison, undefined);
  assert.equal(searches.length, count);
  assert.match(why.answer, /不代表商品没有在售/);
  const stored = await getConversation(first.id, 'anon-conversation-regression');
  assert.equal(stored?.messages.at(-1)?.continuesProductContext, true);
  const retry = await ask('重新查一下', first.id);
  assert.equal(retry.comparison?.search.query, first.comparison.search.query);
  assert.equal(searches.length, count + 1);
});

test('country complaints retain the product across explanatory replies and use the requested country', async () => {
  const first = await ask('Xiaomi 14', undefined, 'MY');
  await ask('为什么失败？', first.id, 'MY');
  for (const question of ['我要在新加坡的,你怎么不是新加坡的', '只看新加坡本地商家', 'I want Singapore, why are these not Singapore results?']) {
    const result = await ask(question, first.id, 'MY');
    assert.equal(result.comparison?.search.query, 'Xiaomi 14');
    assert.equal(result.comparison?.market, 'SG');
    assert.equal(searches.at(-1)?.market, 'SG');
  }
  const next = await ask('我要新加坡的 iPhone 16', first.id);
  assert.match(next.comparison?.search.query, /iPhone 16/i);
  assert.doesNotMatch(next.comparison?.search.query, /Xiaomi/i);
});

test('unrelated conversation clears product reuse; acknowledgements and explanation preserve it', async () => {
  const first = await ask('Sony WH-1000XM5');
  await ask('谢谢', first.id);
  assert.equal((await ask('价格呢', first.id)).comparison?.search.query, first.comparison.search.query);
  await ask('讲个笑话', first.id);
  const count = searches.length;
  const ambiguous = await ask('它多少钱', first.id);
  assert.equal(searches.length, count);
  assert.doesNotMatch(ambiguous.answer, /Sony|WH.?1000XM5/i);
});

test('normal replies receive bounded history and distinguish old global results from the selected country', async () => {
  const first = await ask('小米14');
  first.comparison.search.geography = 'global';
  first.comparison.search.failedPlatforms = 22;
  const stored = await getConversation(first.id, 'anon-conversation-regression');
  assert.ok(stored);
  const context = { market: 'SG' as const, previous: first.comparison, history: stored.messages };
  const payload = JSON.parse(buildChatMessages('为什么不是新加坡的？', context)[1].content as string);
  assert.equal(payload.currentMarket, '新加坡');
  assert.equal(payload.searchedThisTurn, false);
  assert.equal(payload.previousSearch.geography, 'global');
  assert.equal(payload.previousSearch.coverage, undefined);
  assert.ok(payload.history.some((m: { content: string }) => m.content === '小米14'));
  assert.equal(fallbackConversationTurn('不要搜索小米14价格，先解释刚才的结果', context).action, 'reply');
});

test('model-resolved conversation intent can answer arbitrary non-shopping topics without search', async () => {
  const count = searches.length;
  conversationTools.plan = async (question, context) => {
    assert.equal(question, '帮我把这段话改得自然一点');
    assert.equal(context.market, 'SG');
    return { action: 'reply', query: '', continuesProductContext: false };
  };
  try { assert.equal((await ask('帮我把这段话改得自然一点')).comparison, undefined); }
  finally { conversationTools.plan = originalPlan; }
  assert.equal(searches.length, count);
});


test('resolved product queries preserve explicit and inherited budgets without carrying them to a new product', async () => {
  const first = await ask('Xiaomi 14 预算700');
  assert.equal(searches.at(-1)?.maxPrice, 700);
  const country = await ask('我要新加坡的', first.id);
  assert.equal(country.comparison?.search.maxPrice, 700);
  conversationTools.plan = async () => ({ action: 'product_search', query: 'Xiaomi 14', continuesProductContext: true });
  try {
    await ask('预算500以内', first.id);
    assert.equal(searches.at(-1)?.maxPrice, 500);
  } finally { conversationTools.plan = originalPlan; }
  await ask('iPhone 16', first.id);
  assert.equal(searches.at(-1)?.maxPrice, undefined);
});
