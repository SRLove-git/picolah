import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRealCrawlerTool,
  requestsRealCrawler,
  shouldUseRealCrawler,
  supportedRealCrawlerPlatforms,
} from './agent/tools/real-crawler.ts';

test('real crawler LangChain tool sends only validated structured input', async () => {
  let authorization = '';
  let payload: unknown;
  const crawlerTool = createRealCrawlerTool({
    url: 'http://crawler.internal:8790',
    token: 'secret-token',
    fetchImpl: (async (_url, init) => {
      authorization = new Headers(init?.headers).get('authorization') || '';
      payload = JSON.parse(String(init?.body));
      return Response.json({
        ok: true,
        market: 'SG',
        platforms: ['lazada'],
        productIds: ['sony-wh1000xm5'],
        summary: { requests: 1, matched: 1, skipped: 0, failed: 0, offers: [] },
      });
    }) as typeof fetch,
  });

  const result = await crawlerTool.invoke({
    market: 'SG',
    platforms: ['lazada'],
    productIds: ['sony-wh1000xm5'],
  });

  assert.equal(result.summary.matched, 1);
  assert.equal(authorization, 'Bearer secret-token');
  assert.deepEqual(payload, {
    market: 'SG',
    platforms: ['lazada'],
    productIds: ['sony-wh1000xm5'],
  });
});

test('real crawler runs for ordinary confirmed-product comparisons and freshness requests', () => {
  assert.equal(requestsRealCrawler('Sony XM5 哪里便宜'), false);
  assert.equal(requestsRealCrawler('实时刷新 Lazada 的最新价格'), true);
  assert.equal(shouldUseRealCrawler('Sony XM5 哪里便宜', 'comparison', true), true);
  assert.equal(shouldUseRealCrawler('推荐一款耳机', 'recommendation', false), false);
  assert.equal(shouldUseRealCrawler('实时推荐一款耳机', 'recommendation', false), true);
  assert.equal(shouldUseRealCrawler('你好', 'empty', false), false);
  assert.deepEqual(
    supportedRealCrawlerPlatforms(['shopee', 'lazada', 'tiktok'], [], ['lazada']),
    ['lazada'],
  );
  assert.deepEqual(
    supportedRealCrawlerPlatforms(['shopee', 'lazada'], ['shopee', 'tiktok'], ['lazada']),
    ['shopee'],
  );
});
