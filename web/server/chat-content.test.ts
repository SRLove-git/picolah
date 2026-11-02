import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shoppingReplyText } from '../src/lib/chat-content.ts';

test('saved replies lose the old system footer while retaining the price and delivery caveat', () => {
  const advice = 'Dyson V12：商品价 S$859.00，运费尚未核实，预估合计 S$859.00。';
  const footer = '\n\n以上为已入库报价，最近采集时间：2026-11-02T11:30:38.700Z；本次未实时抓取，下单前请核对商家页面。';
  assert.equal(shoppingReplyText(advice + footer), advice);
  assert.equal(shoppingReplyText(advice + footer.replaceAll('\n', '\r\n')), advice);
});
test('saved empty results keep their actual outcome without backend implementation notes', () => {
  assert.equal(shoppingReplyText('商品库已找到 **iPhone 15**，但当前筛选条件下暂无有效报价。过期和演示报价不会用于比价，当前不会自动发起实时抓取。'),
    '找到 **iPhone 15**，但当前筛选条件下暂无有效报价。');
});
test('specific answers about quote age and ordinary shopping advice stay intact', () => {
  const answer = '这条报价核验于 2026-11-02 19:30，商品价 S$859，运费待确认。';
  assert.equal(shoppingReplyText(answer), answer);
});
