import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSearchLanguage } from '../shared/search-language.ts';
import { liveSearchQuery } from './agent/live-query.ts';
import { emptyLiveComparison } from './agent/live-comparison.ts';

test('known Chinese shopping terms become marketplace search words, not catalog products', () => {
  assert.deepEqual(liveSearchQuery('帮我找索尼耳机'), { query: 'Sony headphones' });
  assert.deepEqual(liveSearchQuery('只看 Lazada 的索尼真无线耳机'), { query: 'Sony wireless earbuds' });
  assert.deepEqual(liveSearchQuery('查一下三星手机'), { query: 'Samsung phone' });
  assert.deepEqual(liveSearchQuery('帮我找小米空气炸锅'), { query: 'Xiaomi air fryer' });
});

test('translations preserve model, variant, unknown terms and budget constraints', () => {
  assert.deepEqual(liveSearchQuery('找 iPhone 15 256GB 黑色，预算 500 SGD'), {
    query: 'iPhone 15 256GB Black', maxPrice: 500,
  });
  assert.equal(normalizeSearchLanguage('索尼 WH-CH720N 白色'), 'Sony WH-CH720N White');
  assert.equal(normalizeSearchLanguage('特别款耳机'), '特别款 headphones');
  assert.equal(normalizeSearchLanguage('Sony WH-1000XM5 256GB'), 'Sony WH-1000XM5 256GB');
  assert.equal(normalizeSearchLanguage('Ｓｏｎｙ　ＷＨ－ＣＨ７２０Ｎ'), 'Sony WH-CH720N');
});

test('translation does not turn greetings or platform-only requests into product searches', () => {
  for (const text of ['你好', '只看 Shopee', '只看亚马逊', '价格呢']) assert.equal(liveSearchQuery(text), null);
});

test('legacy Chinese query constraints are also translated on retries and variant followups', () => {
  const previous = emptyLiveComparison('旧对话', 'SG', '苹果 iPhone 15 256GB 黑色', ['lazada']);
  previous.search!.maxPrice = 500;
  for (const message of ['只看 Lazada', '重试', '价格呢']) {
    assert.deepEqual(liveSearchQuery(message, previous), {
      query: 'Apple iPhone 15 256GB Black', model: undefined, maxPrice: 500,
    });
  }
  assert.deepEqual(liveSearchQuery('换成白色', previous), {
    query: 'Apple iPhone 15 256GB White', model: undefined, maxPrice: 500,
  });
});

test('selecting a localized recommendation normalizes its name without truncating constraints', () => {
  const previous = emptyLiveComparison('耳机', 'SG', '耳机', ['lazada']);
  previous.alternatives = [{
    product: { id: 'fixture', name: '索尼 WH-CH720N 黑色', brand: 'Sony', category: '耳机', tagline: '', specs: '', visual: 'headphones', aliases: [] },
    market: 'SG', offer: null,
  }];
  assert.deepEqual(liveSearchQuery('第一个', previous), { query: 'Sony WH-CH720N Black', model: 'WH-CH720N' });
  previous.alternatives[0].product.name = '索尼耳机'.repeat(30);
  assert.equal(liveSearchQuery('第一个', previous), null);
});
