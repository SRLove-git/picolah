import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { ChatMessage, Comparison } from '../shared/types.ts';

test('intent inference sees the active topic while normal conversation retains personal memory', async () => {
  let captured: { messages: { role: string; content: string }[] } | undefined;
  const api = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    captured = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ id: 'context-fixture', object: 'chat.completion', created: 1, model: 'deepseek-flash',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ action: 'clarify_product', query: '', continuesProductContext: false }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const address = api.address(); assert.ok(address && typeof address !== 'string');
  Object.assign(process.env, { LLM_API_KEY: 'local-test-key', LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`, LLM_MODEL: 'deepseek-flash' });
  const { planConversationTurn, needsProductClarification } = await import('./agent/conversation-turn.ts');
  const { buildChatMessages } = await import('./llm.ts');
  const previous: Comparison = { kind: 'empty', totalOffers: 0, sourceCount: 0, updatedAt: '2026-11-06T00:00:00Z', query: '小米14', market: 'SG', product: null, alternatives: [], offers: [],
    search: { query: 'Xiaomi 14', model: 'Xiaomi 14', platforms: [], status: 'failed' } };
  const entry = (role: ChatMessage['role'], content: string, extra = {}): ChatMessage => ({ id: content, role, content, createdAt: '2026-11-06T00:00:00Z', ...extra });
  const history = [entry('user', '叫我阿林'), entry('assistant', '好的，阿林'), entry('user', '小米14'),
    entry('assistant', '小米14历史页面价 SGD 669', { comparison: previous }),
    entry('user', '换个话题，写生日祝福'), entry('assistant', '生日快乐！')];
  const context = { market: 'SG' as const, previous: null, history };
  try {
    const turn = await planConversationTurn('刚刚说到的东西大概什么价位？', context);
    assert.equal(turn.action, 'clarify_product');
    assert.ok(captured);
    const payload = JSON.parse(captured.messages.at(-1)!.content);
    assert.deepEqual(payload.history, history.slice(-2).map(({ role, content }) => ({ role, content })));
    assert.doesNotMatch(JSON.stringify(payload), /小米|669|SGD/);
    assert.equal(payload.previousProduct, null);
    const chat = JSON.parse(buildChatMessages('还记得我的称呼吗？', context)[1].content as string);
    assert.ok(chat.history.some((m: { content: string }) => m.content === '叫我阿林'));
    assert.equal(needsProductClarification('它多少钱', { ...context, previous }), false);
    assert.equal(needsProductClarification('小米14多少钱', context), false);
    assert.equal(needsProductClarification('帮我解释“它多少钱”这句话', context), false);
  } finally {
    api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
