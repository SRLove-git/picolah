import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalModelCode, explicitModelCodes, extractSearchModel } from '../shared/model-search.ts';
import { findProduct } from '../shared/query.ts';
import { catalogProducts } from '../shared/catalog.ts';
import { createModelSearchTool, liveSearchInputSchema, ModelSearchError } from './agent/tools/model-search.ts';
import { liveComparison } from './agent/live-comparison.ts';
import { writeFallbackAnswer } from '../shared/copy.ts';

test('extracts the exact requested full model, without shopping phrases', () => {
  assert.equal(extractSearchModel('帮我找一下wf1000xm6'), 'WF-1000XM6');
  assert.equal(extractSearchModel('Sony WF 1000 XM 6 新加坡价格'), 'WF-1000XM6');
  assert.equal(extractSearchModel('请找ＷＦ１０００ＸＭ６'), 'WF-1000XM6');
  assert.equal(extractSearchModel('WH-1000XM6 哪里便宜'), 'WH-1000XM6');
  assert.equal(extractSearchModel('只看 Lazada 的'), null);
  assert.equal(extractSearchModel('推荐500以内的耳机'), null);
  assert.equal(extractSearchModel('XM6'), null);
  assert.equal(extractSearchModel('WF1000XM6 的保护套'), null);
  assert.equal(extractSearchModel('WF1000XM6 vs WH1000XM6'), null);
  assert.deepEqual(explicitModelCodes('WF1000XM6 和 WF-1000XM6'), ['WF-1000XM6']);
  assert.deepEqual(explicitModelCodes('WF1000XM6 WF-1000XM6'), ['WF-1000XM6']);
});

test('CH-family models retain their terminal letter without absorbing the brand or shopping constraints', () => {
  for (const model of ['whch720n', 'WH CH720N', 'WH-CH720N', 'WH CH 720 N', 'ＷＨＣＨ７２０Ｎ']) {
    assert.equal(extractSearchModel(model), 'WH-CH720N');
    assert.equal(canonicalModelCode(model), 'WH-CH720N');
    assert.equal(extractSearchModel(`Sony ${model} 黑色，预算 500 SGD`), 'WH-CH720N');
    assert.equal(extractSearchModel(`帮我找索尼${model}，只看 Lazada`), 'WH-CH720N');
  }
  assert.deepEqual(explicitModelCodes('WHCH720N、WH CH720N、WH-CH720N'), ['WH-CH720N']);
  assert.equal(extractSearchModel('WHCH720N 和 WHCH710N'), null);
  assert.equal(extractSearchModel('WH-CH720N 保护套'), null);
  for (const text of ['Sony 500', 'Lazada 500', 'Shopee 500', 'budget 500', 'under 500', 'SGD500', '推荐500以内的耳机']) {
    assert.deepEqual(explicitModelCodes(text), [], text);
    assert.equal(canonicalModelCode(text), null, text);
  }
  assert.equal(canonicalModelCode('Sony WH-CH720N'), null);
});

test('complete model prefixes override short catalog aliases', () => {
  assert.equal(findProduct('帮我找一下wf1000xm5', catalogProducts()).product, null);
  assert.equal(findProduct('Sony WH1000XM6 价格', catalogProducts()).product, null);
  assert.equal(findProduct('Sony WH1000XM5 价格', catalogProducts()).product?.id, 'sony-wh1000xm5');
});

test('model search is a structured LangChain tool, not a fake catalog lookup', async () => {
  const seen: unknown[] = [];
  const search = createModelSearchTool({
    url: 'http://crawler.internal', token: 'test-token',
    fetchImpl: (async (url, init) => {
      seen.push(url, JSON.parse(String(init?.body)));
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
      return Response.json({ ok: true, market: 'SG', query: 'WF-1000XM6', model: 'WF-1000XM6', platforms: ['lazada'],
        listings: [], summary: { requests: 1, matched: 0, skipped: 1, failed: 0 } });
    }) as typeof fetch,
  });
  const input = { market: 'SG' as const, query: 'WF-1000XM6', model: 'WF-1000XM6', platforms: ['lazada' as const] };
  const result = await search.invoke(input);
  assert.deepEqual(result.listings, []);
  assert.deepEqual(seen, ['http://crawler.internal/search', input]);
  await assert.rejects(search.invoke({ ...input, model: 'http://localhost/admin' }));
  assert.equal(seen.length, 2);
});

test('model search rejects mismatched responses and hides raw provider errors', async () => {
  const create = (response: Response) => createModelSearchTool({
    url: 'http://crawler.internal', token: 'test-token', fetchImpl: (async () => response) as typeof fetch,
  });
  const input = { market: 'SG' as const, query: 'WF-1000XM6', model: 'WF-1000XM6', platforms: ['lazada' as const] };
  await assert.rejects(create(Response.json({ ok: true, market: 'SG', query: 'WF-1000XM6', model: 'WH-1000XM6',
    platforms: ['lazada'], listings: [], summary: { requests: 1, matched: 0, skipped: 1, failed: 0 },
  })).invoke(input), /不一致/);
  await assert.rejects(create(Response.json({ message: 'private-provider-secret' }, { status: 500 })).invoke(input),
    (error: Error) => /HTTP 500/.test(error.message) && !error.message.includes('private-provider-secret'));
});

test('tool schema and title verification support canonical, compact and spaced CH model spellings', async () => {
  let title = 'Sony WH CH720N Wireless Headphones';
  const seen: string[] = [];
  const search = createModelSearchTool({ url: 'http://crawler.internal', token: 'test-token',
    fetchImpl: (async (_url, init) => {
      const input = JSON.parse(String(init?.body));
      seen.push(input.model);
      return Response.json({ ...input, ok: true, summary: { requests: 1, matched: 1, skipped: 0, failed: 0 },
        listings: [{ platform: 'lazada', market: 'SG', itemId: 'ch720n', title,
          url: 'https://www.lazada.sg/products/ch720n.html', price: 159, currency: 'SGD', inStock: true }] });
    }) as typeof fetch });
  for (const model of ['WH-CH720N', 'whch720n', 'WH CH720N', 'WH CH 720 N']) {
    const input = { market: 'SG' as const, platforms: ['lazada' as const], query: model, model };
    assert.equal(liveSearchInputSchema.parse(input).model, 'WH-CH720N');
    for (const spelling of ['WH-CH720N', 'WHCH720N', 'WH CH720N', 'ＷＨＣＨ７２０Ｎ']) {
      title = `Sony ${spelling} Wireless Headphones`;
      assert.equal((await search.invoke(input)).listings.length, 1);
    }
  }
  assert.ok(seen.every((model) => model === 'WH-CH720N'));
  const input = { market: 'SG' as const, platforms: ['lazada' as const], query: 'WH-CH720N', model: 'WH-CH720N' };
  for (const wrongModel of ['WH-CH710N', 'WH-CH720', 'WH-CH720N2', 'WH-CH720NB']) {
    title = `Sony ${wrongModel} Wireless Headphones`;
    await assert.rejects(search.invoke(input), /型号不一致/);
  }
  for (const model of ['Sony WH-CH720N', 'SGD500', 'Lazada500', 'WHCH720N WH1000XM6']) {
    assert.equal(liveSearchInputSchema.safeParse({ ...input, model }).success, false, model);
  }
});

test('queue overload and timeout receive safe typed errors without leaking provider messages', async () => {
  const input = { market: 'SG' as const, query: 'WH-CH720N', model: 'WH-CH720N', platforms: ['lazada' as const] };
  for (const [remoteCode, expectedCode] of [
    ['crawler_queue_full', 'CRAWLER_QUEUE_FULL'], ['crawler_queue_timeout', 'CRAWLER_QUEUE_TIMEOUT'],
  ] as const) {
    const search = createModelSearchTool({ url: 'http://crawler.internal', token: 'test-token',
      fetchImpl: (async () => Response.json({ error: remoteCode, message: 'private-provider-secret' }, { status: 503 })) as typeof fetch });
    await assert.rejects(search.invoke(input), (error: Error) => error instanceof ModelSearchError &&
      error.code === expectedCode && !error.message.includes('private-provider-secret'));
  }
  for (const response of [
    Response.json({ error: 'unknown', message: 'private-provider-secret' }, { status: 503 }),
    new Response('private-provider-secret', { status: 503 }),
    Response.json({ error: 'crawler_queue_full', message: 'private-provider-secret' }, { status: 500 }),
  ]) {
    const search = createModelSearchTool({ url: 'http://crawler.internal', token: 'test-token',
      fetchImpl: (async () => response) as typeof fetch });
    await assert.rejects(search.invoke(input), (error: Error) => !(error instanceof ModelSearchError) &&
      /HTTP 50[03]/.test(error.message) && !error.message.includes('private-provider-secret'));
  }
});

test('partial live results disclose failed platforms and do not invent missing fields', () => {
  const input = { market: 'SG' as const, query: 'WF-1000XM6', model: 'WF-1000XM6', platforms: ['lazada' as const, 'shopee' as const] };
  const result = { ...input, ok: true as const, summary: { requests: 2, matched: 1, skipped: 0, failed: 1 },
    listings: [{ platform: 'lazada' as const, market: 'SG' as const, itemId: 'test', title: 'Sony WF-1000XM6',
      url: 'https://www.lazada.sg/products/test.html', price: 390, currency: 'SGD', inStock: true as const }] };
  const comparison = liveComparison('帮我找一下wf1000xm6', input, result);
  assert.equal(comparison.search?.failedPlatforms, 1);
  assert.equal(comparison.offers[0].shippingKnown, false);
  assert.equal(comparison.offers[0].ratingKnown, false);
  assert.deepEqual(comparison.offers[0].history, []);
  assert.match(writeFallbackAnswer(comparison), /1 个平台暂未完成搜索/);
  assert.match(writeFallbackAnswer(comparison), /商品价/);
  const namedFailure = liveComparison('帮我找一下wf1000xm6', input,
    { ...result, summary: { ...result.summary, failedPlatforms: ['shopee'] } });
  assert.deepEqual(namedFailure.search?.failedSources, ['Shopee']);
  assert.match(writeFallbackAnswer(namedFailure), /Shopee暂未完成搜索/);
});

test('live search rejects a price outside the requested budget', async () => {
  const input = { market: 'SG' as const, query: '耳机', maxPrice: 100, platforms: ['lazada' as const] };
  const search = createModelSearchTool({ url: 'http://crawler.internal', token: 'test-token',
    fetchImpl: (async () => Response.json({ ...input, ok: true,
      summary: { requests: 1, matched: 1, skipped: 0, failed: 0 },
      listings: [{ platform: 'lazada', market: 'SG', itemId: 'test', title: '耳机',
        url: 'https://www.lazada.sg/products/test.html', price: 101, currency: 'SGD', inStock: true }] })) as typeof fetch });
  await assert.rejects(search.invoke(input), /无效报价/);
});

const webInput = { market: 'SG' as const, scope: 'web' as const, platforms: [], query: 'WF-1000XM6', model: 'WF-1000XM6' };
function webListing(host = 'retailer.sg') {
  return { platform: 'web' as const, sourceHost: host, market: 'SG' as const, itemId: 'product-123',
    title: 'Sony WF-1000XM6', url: `https://www.${host}/sony-wf1000xm6`, price: 399, currency: 'SGD', inStock: true as const };
}
function webTool(listings: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  return createModelSearchTool({ url: 'http://crawler.internal', token: 'test-token',
    fetchImpl: (async () => Response.json({ ...webInput, ok: true, listings,
      summary: { requests: 3, matched: listings.length, skipped: 0, failed: 0 }, ...overrides })) as typeof fetch });
}

test('web searches accept multiple website sources, show hostnames and do not imply official stores', async () => {
  const result = await webTool([webListing(), { ...webListing('electronics.sg'), isOfficial: true }]).invoke(webInput);
  const comparison = liveComparison('WF1000XM6', webInput, result);
  assert.equal(comparison.search?.scope, 'web');
  assert.equal(comparison.sourceCount, 2);
  assert.deepEqual(comparison.offers.map((offer) => offer.platformId), ['web:retailer.sg', 'web:electronics.sg']);
  assert.deepEqual(comparison.offers.map((offer) => offer.platform), ['retailer.sg', 'electronics.sg']);
  assert.ok(comparison.offers.every((offer) => !offer.isOfficial && !offer.shippingKnown));
  assert.match(writeFallbackAnswer(comparison), /全网搜索.*2 个网站/);
});

test('web tool refuses unsafe, mismatched and excluded website sources', async () => {
  const invalid = [
    { sourceHost: 'other.sg' }, { sourceHost: undefined },
    { sourceHost: '127.0.0.1', url: 'https://127.0.0.1/product' },
    { sourceHost: 'shop.local', url: 'https://shop.local/product' },
    { sourceHost: 'shop.internal', url: 'https://shop.internal/product' },
    { url: 'http://www.retailer.sg/product' }, { url: 'https://user@www.retailer.sg/product' },
    { url: 'https://www.retailer.sg:8443/product' }, { market: 'MY' }, { currency: 'USD' }, { price: 101 },
  ];
  for (const patch of invalid) {
    await assert.rejects(webTool([{ ...webListing(), price: 99, ...patch }]).invoke({ ...webInput, maxPrice: 100 }));
  }
  for (const [platform, host] of [['shopee', 'shopee.com.my'], ['shopee', 'shope.ee'], ['lazada', 'lazada.co.th'],
    ['amazon-sg', 'amazon.com'], ['amazon-sg', 'amzn.to'], ['tiktok', 'shop-tokopedia.com'], ['tokopedia', 'tokopedia.com'], ['tiki', 'tiki.vn']] as const) {
    await assert.rejects(webTool([webListing(host)]).invoke({ ...webInput, excludedPlatforms: [platform] }), /无效报价/);
  }
  await assert.rejects(webTool([webListing()], { scope: 'platforms', platforms: ['lazada'] }).invoke(webInput), /不一致/);
  await assert.rejects(webTool([webListing()]).invoke({ ...webInput, scope: 'platforms', platforms: ['lazada'] }));
});

test('web result limit allows up to twelve listings and rejects excess', async () => {
  const listings = Array.from({ length: 12 }, (_, index) => ({ ...webListing(), itemId: String(index) }));
  assert.equal((await webTool(listings).invoke(webInput)).listings.length, 12);
  await assert.rejects(webTool([...listings, webListing()]).invoke(webInput));
});

test('unconfigured web discovery is explicit instead of pretending that no product exists', async () => {
  const result = await webTool([], { summary: { requests: 1, matched: 0, skipped: 0, failed: 1,
    failureCodes: ['SERP_NOT_CONFIGURED'] } }).invoke(webInput);
  const comparison = liveComparison('WF1000XM6', webInput, result);
  assert.equal(comparison.search?.errorCode, 'SERP_NOT_CONFIGURED');
  assert.equal(comparison.search?.status, 'failed');
  assert.match(writeFallbackAnswer(comparison), /全网搜索接口尚未配置/);
  assert.doesNotMatch(writeFallbackAnswer(comparison), /暂未找到/);
});
