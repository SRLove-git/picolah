import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyLiveComparison } from './agent/live-comparison.ts';
import { writeFallbackAnswer } from '../shared/copy.ts';

test('queue failures say the search has not run, not that the product is unavailable', () => {
  for (const code of ['CRAWLER_QUEUE_FULL', 'CRAWLER_QUEUE_TIMEOUT'] as const) {
    const comparison = emptyLiveComparison('whch720n', 'SG', 'WH-CH720N', ['lazada']);
    comparison.search!.status = 'failed';
    comparison.search!.errorCode = code;
    const answer = writeFallbackAnswer(comparison);
    assert.match(answer, /WH-CH720N/);
    assert.match(answer, code === 'CRAWLER_QUEUE_FULL' ? /尚未进入搜索队列/ : /排队超时.*尚未开始抓取/);
    assert.doesNotMatch(answer, /连接或数据读取失败|本次返回结果暂未找到|S\$/);
    assert.equal(comparison.offers.length, 0);
  }
});
