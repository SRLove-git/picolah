import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Comparison } from '../shared/types.ts';
import { liveSearchQuery } from './agent/live-query.ts';

test('brand and model typed without spaces retain separate identities and constraints', () => {
  for (const text of ['sonywhch720n', 'SONYWH-CH720N', 'ｓｏｎｙｗｈｃｈ７２０ｎ']) {
    const target = liveSearchQuery(text);
    assert.equal(target?.model, 'WH-CH720N');
    assert.match(target?.query ?? '', /^sony WH-CH720N$/i);
  }
  const target = liveSearchQuery('全网搜索sonywh1000xm5黑色价格，预算400 SGD');
  assert.equal(target?.model, 'WH-1000XM5');
  assert.match(target?.query ?? '', /^sony WH-1000XM5 Black$/i);
  assert.equal(target?.maxPrice, 400);
  assert.deepEqual(liveSearchQuery('philipsna221/09价格'), { query: 'Philips NA-221/09', model: 'NA-221/09' });
});

function previous(query: string): Comparison {
  return {
    kind: 'empty', query, market: 'SG', product: null, offers: [], alternatives: [],
    totalOffers: 0, updatedAt: '', sourceCount: 0,
    search: { query, model: query, platforms: ['lazada'], status: 'not_found' },
  };
}

test('English price questions remove the request phrase while preserving product words and capacity', () => {
  assert.deepEqual(liveSearchQuery('What is the price of SK-II Facial Treatment Essence 230ml in Singapore?', null, 'catalog'),
    { query: 'SK-II Facial Treatment Essence 230ml' });
  assert.deepEqual(liveSearchQuery("What's the current price for The History of Whoo serum 30ml?", null, 'catalog'),
    { query: 'History of Whoo serum 30ml' });
  assert.deepEqual(liveSearchQuery('How much is Philips HD3170/62 under 100 SGD?', null, 'catalog'),
    { query: 'Philips HD3170/62', maxPrice: 100 });
});

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

test('a measure word left over after the verb is dropped from the search query', () => {
  assert.deepEqual(liveSearchQuery('我想买个 iPhone'), { query: 'iPhone' });
  assert.deepEqual(liveSearchQuery('买一个 iPhone 15 128GB'), { query: 'iPhone 15 128GB' });
  assert.deepEqual(liveSearchQuery('帮我买台 iPhone 15'), { query: 'iPhone 15' });
  assert.deepEqual(liveSearchQuery('买个耳机'), { query: 'headphones' });
  // Real words starting with a measure character keep their first character.
  assert.deepEqual(liveSearchQuery('买个台灯'), { query: '台灯' });
});

test('base edition phone price questions use the base identity instead of literal edition words', () => {
  for (const message of ['小米17标准版价格', '全网搜索小米17普通版价格', '小米17基础版多少钱',
    'Xiaomi 17 standard edition price', 'Xiaomi 17 base model price', 'Xiaomi 17 regular version price']) {
    assert.deepEqual(liveSearchQuery(message), { query: 'Xiaomi 17' }, message);
  }
  assert.deepEqual(liveSearchQuery('小米17标准版256GB黑色价格，预算500 SGD'), {
    query: 'Xiaomi 17 256GB Black', maxPrice: 500,
  });
  assert.deepEqual(liveSearchQuery('iPhone 17 standard 256GB price'), { query: 'iPhone 17 256GB' });
  assert.deepEqual(liveSearchQuery('Pixel 10 标准版价格'), { query: 'Pixel 10' });
});

test('base-edition handling preserves other editions, accessories and unrelated standard products', () => {
  assert.deepEqual(liveSearchQuery('小米17 Pro价格'), { query: 'Xiaomi 17 Pro' });
  assert.deepEqual(liveSearchQuery('小米17 Ultra价格'), { query: 'Xiaomi 17 Ultra' });
  assert.deepEqual(liveSearchQuery('小米17T价格'), { query: 'Xiaomi 17T' });
  assert.match(liveSearchQuery('小米17标准版手机壳价格')?.query || '', /壳/);
  assert.match(liveSearchQuery('Office 2024 标准版价格', null, 'catalog')?.query || '', /标准版/);
  assert.match(liveSearchQuery('小米17不要标准版价格')?.query || '', /标准版/);
  assert.match(liveSearchQuery('小米17 Pro 标准版价格')?.query || '', /Pro 标准版/);
});

test('base edition followups and retries normalize prior phone queries while retaining constraints', () => {
  const context = previous('Xiaomi 17 Pro 512GB Black'); context.search!.maxPrice = 1200;
  for (const message of ['标准版价格', '那普通版呢', 'base model price']) {
    assert.deepEqual(liveSearchQuery(message, context), {
      query: 'Xiaomi 17 512GB Black', model: undefined, maxPrice: 1200,
    }, message);
  }
  assert.deepEqual(liveSearchQuery('重试', previous('Xiaomi 17标准版')), { query: 'Xiaomi 17', model: undefined });
  assert.equal(liveSearchQuery('标准版价格'), null);
  assert.equal(liveSearchQuery('标准版价格', previous('Sony WH-CH720N')), null);
  assert.deepEqual(liveSearchQuery('小米17标准版价格', previous('iPhone 17 Pro 256GB')), { query: 'Xiaomi 17' });
});

test('live beauty searches retain the full identity instead of a fabricated capacity model', () => {
 for (const text of ['SK-II Facial Treatment Essence 230ml', 'What is the price of SK-II Facial Treatment Essence 230ml in Singapore?']) {
  assert.deepEqual(liveSearchQuery(text), {query: 'SK-II Facial Treatment Essence 230ml'});
 }
});

test('ordinary product names and measurements retain their full shopping identity',()=>{
 for(const query of ['LEGO 10328','Braun Series 9 Pro 9465cc','New Balance 2002R','CeraVe Moisturising Cream 454g','Insta360 X4'])assert.deepEqual(liveSearchQuery(query),{query});
 assert.deepEqual(liveSearchQuery('荣耀 Magic6 Pro 512GB'),{query:'Honor Magic6 Pro 512GB'});
 assert.deepEqual(liveSearchQuery('Find Acme Special Edition QX123 black under 500 SGD'),{query:'Acme Special Edition QX-123 black',model:'QX-123',maxPrice:500});
});

test('reply-format clauses stay out of merchant queries while SKU and budget are retained', () => {
  assert.equal(liveSearchQuery('查一下新加坡小米14的商品页价格。请用英文 Markdown 表格给出价格和商家链接。')?.query, 'Xiaomi 14');
  assert.deepEqual(liveSearchQuery('Philips AC1715/30 under 200 SGD. Reply in an English Markdown table.'),
    liveSearchQuery('Philips AC1715/30 under 200 SGD'));
  assert.deepEqual(liveSearchQuery('iPhone 15 256GB，请用表格回答，预算 500 SGD'),liveSearchQuery('iPhone 15 256GB，预算 500 SGD'));
  assert.equal(liveSearchQuery('Scrabble English Edition')?.query,'Scrabble English Edition');
});
