import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Comparison } from '../shared/types.ts';
import { liveSearchQuery } from './agent/live-query.ts';

function previous(query: string): Comparison {
  return {
    kind: 'empty', query, market: 'SG', product: null, offers: [], alternatives: [],
    totalOffers: 0, updatedAt: '', sourceCount: 0,
    search: { query, model: query, platforms: ['lazada'], status: 'not_found' },
  };
}

test('query cleaning preserves a known product and its requested capacity without catalog matching', () => {
  assert.deepEqual(liveSearchQuery('帮我找一下 iPhone 15 128GB'), { query: 'iPhone 15 128GB' });
  assert.deepEqual(liveSearchQuery('只看 Lazada 的 iPhone 15 256GB'), { query: 'iPhone 15 256GB' });
  const result = liveSearchQuery('请帮我找 iPhone 15 256GB 黑色，预算 6000 元以内');
  const query = result?.query || '';
  assert.match(query, /iPhone\s*15/i);
  assert.match(query, /256\s*GB/i);
  assert.match(query, /黑色|\bBlack\b/i);
  assert.equal(result?.maxPrice, 6000);
  assert.doesNotMatch(query, /预算|以内|6000/);
});

test('a full model is normalized without dropping brand, color or budget constraints', () => {
  assert.deepEqual(liveSearchQuery('帮我找一下wf1000xm6'), { query: 'WF-1000XM6', model: 'WF-1000XM6' });
  const result = liveSearchQuery('Sony WH-1000XM5 黑色，预算 400 SGD');
  assert.equal(result?.model, 'WH-1000XM5');
  assert.match(result?.query || '', /Sony/i);
  assert.match(result?.query || '', /WH-1000XM5/);
  assert.match(result?.query || '', /黑色|\bBlack\b/i);
  assert.equal(result?.maxPrice, 400);
  assert.doesNotMatch(result?.query || '', /预算|400|SGD/i);

  const variant = liveSearchQuery('查一下 Sony WF1000XM6 银色');
  assert.equal(variant?.model, 'WF-1000XM6');
  assert.match(variant?.query || '', /Sony/i);
  assert.match(variant?.query || '', /银色|\bSilver\b/i);
  assert.doesNotMatch(variant?.query || '', /WH-1000XM5/);
});

test('platform-only and retry followups retain the prior product and translated constraints', () => {
  const context = previous('iPhone 15 256GB 黑色');
  context.search!.maxPrice = 6000;
  for (const message of ['只看 Shopee', '价格呢', '重试', '恢复全部平台']) {
    const result = liveSearchQuery(message, context);
    assert.equal(result?.query, 'iPhone 15 256GB Black');
    assert.equal(result?.maxPrice, 6000);
  }
});

test('CH720N spellings create one canonical model with independent brand, budget and followup filters', () => {
  for (const model of ['whch720n', 'WH CH720N', 'WH-CH720N']) {
    assert.deepEqual(liveSearchQuery(model), { query: 'WH-CH720N', model: 'WH-CH720N' });
    const request = liveSearchQuery(`帮我找一下索尼 ${model} 黑色，只看 Lazada，预算 200 SGD`);
    assert.equal(request?.model, 'WH-CH720N');
    assert.match(request?.query || '', /Sony/i);
    assert.match(request?.query || '', /WH-CH720N/);
    assert.match(request?.query || '', /Black|黑色/i);
    assert.equal(request?.maxPrice, 200);
    assert.doesNotMatch(request?.query || '', /Lazada|预算|200|SGD/i);
  }
  const context = previous('Sony WH-CH720N Black');
  context.search!.model = 'WH-CH720N';
  for (const followup of ['只看 Shopee', '价格呢', '重试']) {
    assert.equal(liveSearchQuery(followup, context)?.model, 'WH-CH720N');
    assert.equal(liveSearchQuery(followup, context)?.query, 'Sony WH-CH720N Black');
  }
});

test('capacity color and budget refinements retain the product while replacing conflicting variants', () => {
  const context = previous('iPhone 15 128GB 黑色');
  const capacity = liveSearchQuery('换成256GB', context)?.query || '';
  assert.match(capacity, /iPhone\s*15/i);
  assert.match(capacity, /256\s*GB/i);
  assert.doesNotMatch(capacity, /128\s*GB/i);
  assert.match(capacity, /黑色|\bBlack\b/i);

  const color = liveSearchQuery('白色的呢', context)?.query || '';
  assert.match(color, /iPhone\s*15/i);
  assert.match(color, /128\s*GB/i);
  assert.match(color, /白色|\bWhite\b/i);
  assert.doesNotMatch(color, /黑色|\bBlack\b/i);

  const budget = liveSearchQuery('预算500以内', previous('Sony WH-1000XM5 黑色'));
  assert.match(budget?.query || '', /WH-1000XM5/);
  assert.match(budget?.query || '', /黑色|\bBlack\b/i);
  assert.equal(budget?.maxPrice, 500);
  assert.doesNotMatch(budget?.query || '', /预算|以内|500/);
});

test('a newly requested product or model does not inherit unrelated previous search constraints', () => {
  const context = previous('iPhone 15 128GB 黑色 预算6000元');
  context.search!.maxPrice = 6000;
  const result = liveSearchQuery('帮我查 Sony WF1000XM6 价格', context);
  assert.equal(result?.model, 'WF-1000XM6');
  assert.match(result?.query || '', /WF-1000XM6/);
  assert.doesNotMatch(result?.query || '', /iPhone|128GB|6000/i);
  assert.equal(result?.maxPrice, undefined);
  assert.deepEqual(liveSearchQuery('iPhone 16 256GB', previous('WF-1000XM6')), { query: 'iPhone 16 256GB' });
});

test('empty or platform-only input without prior live query asks for a product', () => {
  for (const message of ['', '只看 Lazada', '价格呢', '重试', '你好']) {
    assert.equal(liveSearchQuery(message), null);
  }
});

test('incomplete prior result is safe and legacy product names are only textual query context', () => {
  const partial = { kind: 'empty', market: 'SG' } as Comparison;
  assert.equal(liveSearchQuery('只看 Shopee', partial), null);
  assert.equal(liveSearchQuery('第一个', partial), null);
  const stale = {
    ...previous(''), search: undefined,
    product: { id: 'seed-product', name: 'Sony WH-1000XM5' },
  } as Comparison;
  assert.deepEqual(liveSearchQuery('只看 Shopee', stale), {
    query: 'Sony WH-1000XM5', model: 'WH-1000XM5',
  });
});
