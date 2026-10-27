import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Comparison } from '../shared/types.ts';
import { buildChatMessages, buildLiveMessages } from './llm.ts';

function searchComparison(status: 'matched' | 'not_found' | 'failed' | 'unavailable', failed = false): Comparison {
  return {
    kind: 'empty', query: '我想买个 iPhone', market: 'SG', product: null, offers: [], alternatives: [],
    totalOffers: 0, updatedAt: '', sourceCount: 0,
    search: {
      query: 'iPhone', model: 'iPhone', platforms: ['shopee', 'lazada'], status,
      ...(failed ? { failedPlatforms: 2, failedSources: ['Shopee', 'Lazada'] } : {}),
    },
  };
}

test('the live payload carries the real search outcome for the answer writer', () => {
  const messages = buildLiveMessages(searchComparison('failed', true), '我想买个 iPhone');
  assert.match(messages[0].content as string, /searchStatus/);
  const payload = JSON.parse(messages[1].content as string);
  assert.equal(payload.searchStatus, 'failed');
  assert.deepEqual(payload.liveResults, []);
  assert.match(payload.coverage, /失败/);
  assert.equal(payload.question, '我想买个 iPhone');
});

test('every search status keeps the no-invention guard rails', () => {
  for (const status of ['matched', 'not_found', 'failed', 'unavailable'] as const) {
    const [system] = buildLiveMessages(searchComparison(status), 'iPhone');
    assert.match(system.content as string, /绝对不能编造/);
    assert.match(system.content as string, new RegExp(status));
  }
});

test('the chat payload has no price data and forbids inventing one', () => {
  const messages = buildChatMessages('你好');
  assert.match(messages[0].content as string, /绝对不能编造/);
  assert.equal(messages[1].content, '用户问题：你好');
  assert.doesNotMatch(JSON.stringify(messages), /SGD|S\$|liveResults/);
});
