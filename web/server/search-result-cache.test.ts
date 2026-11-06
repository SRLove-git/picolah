import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModelSearchTool, type LiveSearchInput, type LiveSearchResult } from './agent/tools/model-search.ts';
import { createSearchResultCache } from './agent/search-result-cache.ts';
import { liveComparison } from './agent/live-comparison.ts';
import { buildLiveMessages } from './llm.ts';
const input: LiveSearchInput = { scope: 'web', geography: 'global', market: 'SG', platforms: [], query: 'Xiaomi 14' };
function result(at: number, request = input): LiveSearchResult {
  return { ok: true, ...request, summary: { requests: 8, matched: 1, skipped: 0, failed: 7, failureCodes: ['PRODUCT_PAGE_UNVERIFIED'] },
    listings: [{ platform: 'web', sourceHost: 'merchant.com', market: request.market, itemId: '14', title: request.query,
      url: 'https://merchant.com/product/xiaomi-14', price: 599, currency: 'USD', inStock: true,
      verification: { source: 'product-page', checkedAt: new Date(at).toISOString() } }] };
}

test('cache reuses validated prices beyond one minute without inventing verification times, then expires', async () => {
  let clock = Date.now(), calls = 0;
  const initial = clock;
  const search = createModelSearchTool({ url: 'http://crawler.internal', token: 'test', cacheTtlMs: 300_000, now: () => clock,
    fetchImpl: async () => { calls++; return Response.json(result(clock)); } });
  const first = await search.invoke(input); assert.equal(first.cache?.hit, false);
  first.listings[0].price = 1; first.summary.failed = 0;
  clock += 120_000;
  const second = await search.invoke(input);
  assert.equal(calls, 1); assert.equal(second.cache?.hit, true); assert.equal(second.listings[0].price, 599);
  assert.equal(second.summary.failed, 7); assert.equal(second.listings[0].verification?.checkedAt, new Date(initial).toISOString());
  const comparison = liveComparison(input.query, input, second);
  assert.equal(comparison.search?.cache?.hit, true);
  const messages = buildLiveMessages(comparison, input.query);
  const payload = JSON.parse(messages[1].content as string);
  assert.equal(payload.searchCache.hit, true); assert.equal(payload.liveResults[0].verifiedAt, new Date(initial).toISOString());
  assert.match(messages[0].content as string, /并未在本次重新抓取/);
  clock = initial + 300_000;
  const third = await search.invoke(input); assert.equal(calls, 2); assert.equal(third.cache?.hit, false);
  assert.equal(third.listings[0].verification?.checkedAt, new Date(clock).toISOString());
});

test('cache key isolates identity, model, country, geography, budget and platform filters', async () => {
  const cache = createSearchResultCache({ ttlMs: 300_000 }); let calls = 0;
  const run = (q: LiveSearchInput) => cache.run(q, async () => { calls++; return result(Date.now(), q); });
  await run(input); await run(input); assert.equal(calls, 1);
  const variants: LiveSearchInput[] = [
    {...input,query:'Xiaomi 14 Pro'}, {...input,query:'Xiaomi 14 256GB'}, {...input,model:'WH-CH720N'},
    {...input,market:'MY'}, {...input,geography:undefined}, {...input,maxPrice:800},
    {...input,excludedPlatforms:['amazon-sg']}, {...input,scope:'platforms',geography:undefined,platforms:['lazada']},
  ];
  for (const q of variants) await run(q);
  assert.equal(calls, variants.length + 1);
  await run({...input,excludedPlatforms:['lazada','amazon-sg']});
  await run({...input,excludedPlatforms:['amazon-sg','lazada']});
  assert.equal(calls, variants.length + 2);
});

test('identical concurrent searches share one provider call and returned objects are isolated', async () => {
  const cache = createSearchResultCache({ ttlMs: 300_000 }); let calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const load = async () => { calls++; await gate; return result(Date.now()); };
  const a = cache.run(input, load), b = cache.run(input, load);
  await Promise.resolve(); assert.equal(calls, 1); release();
  const [first, second] = await Promise.all([a,b]); first.listings[0].price = 1;
  assert.equal(second.listings[0].price, 599);
  assert.equal((await cache.run(input, load)).cache?.hit, true); assert.equal(calls, 1);
});

test('errors, empty searches and known deal articles never become reusable cache entries', async () => {
  const cache = createSearchResultCache({ ttlMs: 300_000 }); let calls = 0;
  const fail = async (): Promise<LiveSearchResult> => { calls++; throw new Error('provider unavailable'); };
  await assert.rejects(cache.run(input,fail)); await assert.rejects(cache.run(input,fail)); assert.equal(calls,2);
  const empty = async () => { calls++; const r=result(Date.now());r.listings=[];r.summary.matched=0;return r; };
  await cache.run(input,empty); await cache.run(input,empty);assert.equal(calls,4);
  const article = async () => { calls++;const r=result(Date.now());r.listings[0].url='https://www.dealmoon.com/en/deal.html';return r; };
  await cache.run(input,article);await cache.run(input,article);assert.equal(calls,6);
});

test('stale or invalid provider prices are still rejected before caching; no stale-on-error fallback', async () => {
  let clock = Date.now(), calls=0;
  const search=createModelSearchTool({url:'http://crawler.internal',token:'test',cacheTtlMs:300_000,now:()=>clock,
    fetchImpl:async()=>{calls++;return Response.json(result(clock-120_000));}});
  await assert.rejects(search.invoke(input),/未经本次/);await assert.rejects(search.invoke(input),/未经本次/);assert.equal(calls,2);
  const cache=createSearchResultCache({ttlMs:1000,now:()=>clock});
  await cache.run(input,async()=>result(clock));clock+=1001;
  await assert.rejects(cache.run(input,async()=>{throw new Error('offline');}),/offline/);
});

test('TTL is anchored to the oldest verification, not the final response or each cache hit', async () => {
  let clock=Date.now(),calls=0;
  const cache=createSearchResultCache({ttlMs:300_000,now:()=>clock});
  const load=async()=>{calls++;return result(clock-200_000);};
  const first=await cache.run(input,load);assert.equal(Date.parse(first.cache!.expiresAt),clock+100_000);
  clock+=90_000;assert.equal((await cache.run(input,load)).cache?.hit,true);
  clock+=10_000;assert.equal((await cache.run(input,load)).cache?.hit,false);assert.equal(calls,2);
});

test('bounded LRU evicts least recently used results; oversized entries and disabled cache bypass storage', async () => {
  const cache=createSearchResultCache({ttlMs:300_000,maxEntries:2});let calls=0;
  const run=(query:string)=>cache.run({...input,query},async()=>{calls++;return result(Date.now(),{...input,query});});
  await run('A');await run('B');await run('A');await run('C');await run('B');assert.equal(calls,4);
  const big=createSearchResultCache({ttlMs:300_000});let hugeCalls=0;
  const load=async()=>{hugeCalls++;const r=result(Date.now());r.listings[0].title='x'.repeat(140_000);return r;};
  await big.run(input,load);await big.run(input,load);assert.equal(hugeCalls,2);
  const disabled=createSearchResultCache({ttlMs:0});await disabled.run(input,load);await disabled.run(input,load);assert.equal(hugeCalls,4);
});
