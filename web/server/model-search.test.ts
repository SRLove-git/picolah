import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalModelCode, explicitModelCodes, extractSearchModel } from '../shared/model-search.ts';
import { findProduct } from '../shared/query.ts';
import { catalogProducts } from '../shared/catalog.ts';
import { createModelSearchTool, liveSearchInputSchema, ModelSearchError } from './agent/tools/model-search.ts';
import { liveComparison } from './agent/live-comparison.ts';
import { writeFallbackAnswer } from '../shared/copy.ts';
import { buildLiveMessages } from './llm.ts';

test('compact brand names are not mistaken for part of the requested model', () => {
  assert.equal(extractSearchModel('sonywhch720n'), 'WH-CH720N');
  assert.equal(extractSearchModel('sonywh1000xm5'), 'WH-1000XM5');
  assert.equal(extractSearchModel('philipsna221/09'), 'NA-221/09');
  assert.equal(extractSearchModel('sonywhch720n 和 sonywhch710n'), null);
  assert.equal(extractSearchModel('sonywhch720n replacement pads'), null);
  assert.equal(canonicalModelCode('sonywhch720n'), null, 'tool model arguments must contain only the model');
  assert.deepEqual(explicitModelCodes('Sony500 budget400 SGD300'), []);
});

test('global search preserves foreign currencies and never feeds them into local cheapest-price ranking', async () => {
  const input = { scope: 'web' as const, geography: 'global' as const, market: 'SG' as const, platforms: [], query: 'Sony WF-1000XM6', model: 'WF-1000XM6' };
  const search = createModelSearchTool({ url: 'http://crawler.internal', token: 'test', fetchImpl: async () => Response.json({
    ok: true, ...input, summary: { requests: 3, matched: 2, skipped: 0, failed: 0 },
    listings: ['USD', 'CNY'].map((currency, n) => ({ platform: 'web', market: 'SG', sourceHost: n ? 'shop.cn' : 'amazon.com',
      itemId: 'item-' + n, title: input.query, url: n ? 'https://shop.cn/product' : 'https://amazon.com/product',
      price: n ? 999 : 199, currency, inStock: true, verification: { source: 'product-page', checkedAt: new Date().toISOString() } })),
  }) });
  const result = await search.invoke(input);
  const comparison = liveComparison('全网搜索索尼耳机价格', input, result);
  assert.equal(comparison.kind, 'recommendation');
  assert.deepEqual(comparison.offers, []);
  assert.deepEqual(comparison.alternatives.map((row) => row.offer?.currency), ['USD', 'CNY']);
  const payload = JSON.parse(buildLiveMessages(comparison, input.query)[1].content as string);
  assert.equal(payload.geography, 'global');
  assert.match(payload.market, /全球/);
  assert.match(payload.liveResults[0].itemPrice, /USD/);
  assert.match(payload.liveResults[1].itemPrice, /CNY/);
  const fallback = writeFallbackAnswer(comparison);
  assert.match(fallback, /USD/); assert.match(fallback, /CNY/); assert.doesNotMatch(fallback, /S\$|新加坡|最低/);
  assert.throws(() => liveSearchInputSchema.parse({ ...input, scope: 'platforms', platforms: ['lazada'] }));
});

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

test('web validation accepts an appliance base SKU colour suffix but not another family', async () => {
  let title = 'KitchenAid 5KSM175PSB 4.8 L Tilt-Head Stand Mixer';
  const search = createModelSearchTool({ url: 'http://crawler.internal', token: 'test-token',
    fetchImpl: (async (_url, init) => {
      const input = JSON.parse(String(init?.body));
      return Response.json({ ...input, ok: true, summary: { requests: 1, matched: 1, skipped: 0, failed: 0 },
        listings: [{ platform: 'web', sourceHost: 'electromart.sg', market: 'SG', itemId: '5ksm175psb', title,
          url: 'https://electromart.sg/products/kitchenaid-5ksm175psb-stand-mixer', price: 923, currency: 'SGD',
          inStock: false, priceQuote: { kind: 'exact', availability: 'unknown', source: 'fetch' },
          verification: { source: 'product-page', checkedAt: new Date().toISOString() } }] });
    }) as typeof fetch });
  const input = { scope: 'web' as const, market: 'SG' as const, platforms: [],
    query: 'KitchenAid Artisan 5KSM175PS Stand Mixer', model: '5KSM175PS' };
  assert.equal((await search.invoke(input)).listings.length, 1);
  title = 'KitchenAid 5KSM185PSB 4.8 L Tilt-Head Stand Mixer';
  await assert.rejects(search.invoke(input), /型号不一致/);
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
          url: 'https://www.lazada.sg/products/ch720n.html', price: 159, currency: 'SGD', inStock: true, verification: { source: 'product-page', checkedAt: new Date().toISOString() } }] });
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
      url: 'https://www.lazada.sg/products/test.html', imageUrl: 'https://sg-live-01.slatic.net/p/wf1000xm6.jpg',
      price: 390, currency: 'SGD', verification:{source:'product-page' as const,checkedAt:new Date().toISOString()}, inStock: true as const }] };
  const comparison = liveComparison('帮我找一下wf1000xm6', input, result);
  assert.equal(comparison.search?.failedPlatforms, 1);
  assert.equal(comparison.offers[0].shippingKnown, false);
  assert.equal(comparison.offers[0].ratingKnown, false);
  assert.equal(comparison.offers[0].imageUrl, result.listings[0].imageUrl);
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
        url: 'https://www.lazada.sg/products/test.html', price: 101, currency: 'SGD', inStock: true, verification: { source: 'product-page', checkedAt: new Date().toISOString() } }] })) as typeof fetch });
  await assert.rejects(search.invoke(input), /无效报价/);
});

test('live search rejects unsafe product image URLs', async () => {
  const input = { market: 'SG' as const, query: '耳机', platforms: ['lazada' as const] };
  for (const imageUrl of ['http://images.test/product.jpg', 'https://127.0.0.1/product.jpg',
    'https://user:secret@images.example.org/product.jpg', 'https://images.internal/product.jpg']) {
    const search = createModelSearchTool({ url: 'http://crawler.internal', token: 'test-token',
      fetchImpl: (async () => Response.json({ ...input, ok: true,
        summary: { requests: 1, matched: 1, skipped: 0, failed: 0 },
        listings: [{ platform: 'lazada', market: 'SG', itemId: 'test', title: '耳机',
          url: 'https://www.lazada.sg/products/test.html', imageUrl, price: 99, currency: 'SGD', inStock: true, verification: { source: 'product-page', checkedAt: new Date().toISOString() } }] })) as typeof fetch });
    await assert.rejects(search.invoke(input));
  }
});

const webInput = { market: 'SG' as const, scope: 'web' as const, platforms: [], query: 'WF-1000XM6', model: 'WF-1000XM6' };
function webListing(host = 'retailer.sg') {
  return { platform: 'web' as const, sourceHost: host, market: 'SG' as const, itemId: 'product-123',
    title: 'Sony WF-1000XM6', url: `https://www.${host}/sony-wf1000xm6`, price: 399, currency: 'SGD', inStock: true as const,
    verification: { source: 'product-page' as const, checkedAt: new Date().toISOString() } };
}
function webTool(listings: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  return createModelSearchTool({ url: 'http://crawler.internal', token: 'test-token',
    fetchImpl: (async () => Response.json({ ...webInput, ok: true, listings,
      summary: { requests: 3, matched: listings.length, skipped: 0, failed: 0 }, ...overrides })) as typeof fetch });
}

test('chat rejects unverified search-card prices and stale page evidence', async () => {
  for (const verification of [undefined,
    { source: 'product-page', checkedAt: '2000-01-01T00:00:00.000Z' },
    { source: 'product-page', checkedAt: '2099-01-01T00:00:00.000Z' }]) {
    await assert.rejects(webTool([{ ...webListing(), verification }]).invoke(webInput), /商品详情页核验/);
  }
});

test('page title, details, source URL and checked time reach comparison and answer writer', async () => {
  const row = { ...webListing(), productDetails: { brand: 'Sony', model: 'WF-1000XM6', description: 'Noise cancelling earbuds' } };
  const result = await webTool([row], { summary: { requests: 2, matched: 1, skipped: 0, failed: 0,
    discovered: 1, pagesChecked: 1, pagesVerified: 1 } }).invoke(webInput);
  const comparison = liveComparison('查价格', webInput, result);
  assert.equal(comparison.alternatives[0].offer?.lastSeen, row.verification.checkedAt);
  assert.deepEqual(comparison.search?.pageVerification, { discovered: 1, checked: 1, verified: 1 });
  const payload = JSON.parse(buildLiveMessages(comparison, '查价格')[1].content as string);
  assert.equal(payload.liveResults[0].pageTitle, row.title);
  assert.deepEqual(payload.liveResults[0].details, row.productDetails);
  assert.equal(payload.liveResults[0].sourceUrl, row.url);
  assert.equal(payload.liveResults[0].verifiedAt, row.verification.checkedAt);
  assert.equal(comparison.alternatives[0].offer?.verification?.source, 'product-page');
});

test('failed detail verification reports candidate links without claiming the product is unavailable', async () => {
  const result = await webTool([], { summary: { requests: 2, matched: 0, skipped: 0, failed: 1,
    discovered: 1, pagesChecked: 1, pagesVerified: 0, failureCodes: ['PRODUCT_PAGE_UNVERIFIED'] } }).invoke(webInput);
  const comparison = liveComparison('查价格', webInput, result);
  assert.equal(comparison.search?.status, 'failed');
  assert.match(writeFallbackAnswer(comparison), /候选链接.*详情页/);
  assert.doesNotMatch(writeFallbackAnswer(comparison), /S\$/);
  assert.match(writeFallbackAnswer(comparison), /这不代表没有在售商品/);
});

test('web searches accept multiple website sources, show hostnames and do not imply official stores', async () => {
  const result = await webTool([webListing(), { ...webListing('electronics.sg'), isOfficial: true }]).invoke(webInput);
  const comparison = liveComparison('WF1000XM6', webInput, result);
  assert.equal(comparison.search?.scope, 'web');
  assert.equal(comparison.sourceCount, 2);
  assert.deepEqual(comparison.alternatives.map(({ offer }) => offer?.platformId), ['web:retailer.sg', 'web:electronics.sg']);
  assert.deepEqual(comparison.alternatives.map(({ offer }) => offer?.platform), ['retailer.sg', 'electronics.sg']);
  assert.ok(comparison.alternatives.every(({ offer }) => offer && !offer.isOfficial && !offer.shippingKnown));
  assert.match(writeFallbackAnswer(comparison), /新加坡相关站点/);
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

test('web result limit allows up to forty listings and rejects excess', async () => {
  const listings = Array.from({ length: 40 }, (_, index) => ({ ...webListing(), itemId: String(index) }));
  assert.equal((await webTool(listings).invoke(webInput)).listings.length, 40);
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

test('global search accepts expanded discovery and rejects counters above the response limit', async () => {
  const result = await webTool([webListing()], { summary: { requests: 14, matched: 1, skipped: 0, failed: 11, discovered: 18, pagesChecked: 12, pagesVerified: 1 } }).invoke(webInput);
  assert.equal(result.summary.discovered, 18);
  await assert.rejects(webTool([webListing()], { summary: { requests: 20, matched: 1, skipped: 0, failed: 18, discovered: 101, pagesChecked: 101, pagesVerified: 1 } }).invoke(webInput));
});

test('capacity-bearing product names are not synthetic model codes', () => {
 for (const text of ['SK-II Facial Treatment Essence 230ml', 'Essence230ml', 'Samsung SSD 512GB', 'Perfume 100ML']) {
  assert.deepEqual(explicitModelCodes(text), [], text);
  assert.equal(extractSearchModel(text), null, text);
 }
 assert.equal(extractSearchModel('Philips HX9911'), 'HX-9911');
 assert.equal(extractSearchModel('Sony WF1000XM6'), 'WF-1000XM6');
});

test('appliance SKU shapes are extracted without marketing-series collisions', () => {
  const cases: Array<[string,string]> = [
    ['KitchenAid Artisan 5KSM175PS Stand Mixer','5KSM175PS'],
    ['Nespresso Vertuo Pop ENV90','ENV-90'],
    ['Panasonic Lamdash Pro 6 ES-LS9A-K','ES-LS9A-K'],
    ['Philips Shaver Series 9000 S9987/54','S-9987/54'],
    ['Panasonic Hair Dryer EH-NA9N','EH-NA9N'],
    ['Philips Sonicare DiamondClean 9000 HX9914/62','HX-9914/62'],
  ];
  for (const [query,model] of cases) assert.equal(extractSearchModel(query),model,query);
  assert.deepEqual(explicitModelCodes('Philips Sonicare DiamondClean 9000 HX9914/62'),['HX-9914/62']);
  for (const model of cases.map(([,model])=>model)) assert.equal(canonicalModelCode(model),model);
});

test('brand set numbers, product descriptors and gram weights are not model hints',()=>{
 for(const value of ['LEGO 10328','Pro 9465cc','New Balance 2002R','CeraVe Cream 454g','Essence 100g','Body Lotion 500ml'])assert.equal(extractSearchModel(value),null,value);
 assert.equal(extractSearchModel('Philips AC1715/30'),'AC-1715/30');
});


test('country web response validation rejects foreign URLs even when the price uses local currency', async () => {
  for (const url of ['https://retailer.com.my/products/item', 'https://retailer.com/en-us/products/item', 'https://retailer.co.uk/products/item', 'https://shop.app/products/item']) {
    const row = { ...webListing(), url, sourceHost: new URL(url).hostname };
    await assert.rejects(webTool([row]).invoke({ ...webInput, geography: undefined }));
  }
});
