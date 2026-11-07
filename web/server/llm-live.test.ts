import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Comparison } from '../shared/types.ts';
import { buildChatMessages, buildLiveMessages } from './llm.ts';
import { asksForQuoteNextStep, liveSearchCoverageNote, writeFallbackAnswer } from '../shared/copy.ts';
import { fallbackConversationAnswer, fallbackConversationTurn } from './agent/conversation-turn.ts';

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
  assert.match(payload.coverage, /failed/);
  assert.equal(payload.question, '我想买个 iPhone');
});

test('a failed follow-up still tells the answer writer which product was searched', () => {
  const comparison = searchComparison('failed', true);
  comparison.search!.query = 'Philips AC1715/30';
  const [, message] = buildLiveMessages(comparison, '那在新加坡呢？');
  const data = JSON.parse(message.content as string);
  assert.equal(data.question, '那在新加坡呢？');
  assert.equal(data.searchedFor, 'Philips AC1715/30');
  assert.equal(data.searchCountry, 'SG');
  assert.deepEqual(data.liveResults, []);
});

test('every search status keeps the no-invention guard rails', () => {
  for (const status of ['matched', 'not_found', 'failed', 'unavailable'] as const) {
    const [system] = buildLiveMessages(searchComparison(status), 'iPhone');
    assert.match(system.content as string, /绝对不能编造|Never invent a price or stock status/);
    assert.match(system.content as string, new RegExp(status));
  }
});

test('the chat payload has no price data and forbids inventing one', () => {
  const messages = buildChatMessages('你好');
  assert.match(messages[0].content as string, /绝对不能编造/);
  assert.equal(messages[1].content, '用户问题：你好');
  assert.doesNotMatch(JSON.stringify(messages), /SGD|S\$|liveResults/);
});

test('coverage footer augments partial results but does not repeat a failed-search answer', () => {
  assert.equal(liveSearchCoverageNote(searchComparison('failed', true)), '');
  assert.equal(liveSearchCoverageNote(searchComparison('not_found', true)), '');
  assert.equal(liveSearchCoverageNote(searchComparison('matched')), '');
  assert.match(liveSearchCoverageNote(searchComparison('matched', true)), /另有 Shopee、Lazada/);
});

test('a missing price uses its own prompt and fallback asks for nothing on a plain lookup', () => {
  for (const status of ['failed', 'unavailable', 'not_found'] as const) {
    const comparison = searchComparison(status, true);
    comparison.search!.query = 'Philips AC1715/30';
    const [prompt, , request] = buildLiveMessages(comparison, '那新加坡呢？');
    assert.equal(request.content, '那新加坡呢？');
    assert.match(prompt.content as string, /one declarative sentence/);
    const result = writeFallbackAnswer(comparison);
    assert.match(result, /新加坡.*Philips AC1715\/30/);
    assert.doesNotMatch(result, /重试|试试|建议|提供|链接发|品牌官网/);
    const context = { previous: comparison, market: comparison.market, history: [] };
    const question = '接下来我可以怎么找？';
    const turn = fallbackConversationTurn(question, context);
    assert.equal(turn.action, 'reply');
    assert.equal(turn.continuesProductContext, true);
    assert.match(fallbackConversationAnswer(question, context), /品牌官网/);
  }
  assert.equal(asksForQuoteNextStep('只报价格，不要给下一步建议。'), false);
  assert.equal(asksForQuoteNextStep('If it isn’t listed, suggest one next step.'), true);
  assert.doesNotMatch(buildLiveMessages(searchComparison('matched'), '价格呢？')[0].content as string, /one declarative sentence/);
});
