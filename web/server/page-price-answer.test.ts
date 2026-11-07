import assert from 'node:assert/strict';
import test from 'node:test';
import type { Comparison, Offer, PriceQuote } from '../shared/types.ts';
import { isPriceRestatement, pagePriceAnswer, wantsPagePriceOnly } from './page-price-answer.ts';

const verified=(price:number,priceQuote?:PriceQuote,currency='SGD') => ({
  source:'live',itemPrice:price,currency,verification:{source:'product-page'},priceQuote,
}) as Offer;
const result=(offers:Offer[]) => ({market:'SG',offers,alternatives:[]}) as unknown as Comparison;
test('price view gives each distinct verified page amount, preserving qualifiers and original currency',()=>{
  const low=verified(585,{kind:'from',availability:'out-of-stock',source:'html'});
  const range=verified(59,{kind:'range',maxPrice:79,availability:'unknown',source:'html'});
  assert.equal(pagePriceAnswer(result([verified(4.8),verified(4.8),low,range]),'只给价格'),'S$4.80\n\nS$585 起\n\nS$59–S$79');
  assert.equal(pagePriceAnswer(result([verified(0),{...verified(200),verification:undefined}]),'价格'),'暂无页面价');
  assert.equal(pagePriceAnswer(result([{...verified(12.5),currency:'USD'}]),'Price only').replace(/\s+/g,' '),'USD 12.50');
});
test('the web price preference respects explicit detail requests and a previous-price restatement',()=>{
  for(const q of ['小米14','只要价格，不要链接','What is the price of this item?'])assert.equal(wantsPagePriceOnly(q,true),true);
  for(const q of ['列出价格和库存','商品链接给我','Compare both stores','为什么没查到？'])assert.equal(wantsPagePriceOnly(q,true),false);
  assert.equal(wantsPagePriceOnly('只要显示价格就可以',false),true);
  assert.equal(isPriceRestatement('只要显示价格就可以'),true);
  assert.equal(isPriceRestatement('只要小米14的价格'),false);
});

test('the amount-only view prefers the named item over a kit whenever an exact title is verified',()=>{
  const offer=(title:string,price:number)=>({...verified(price),productTitle:title});
  const cmp=result([offer('Acme Cleansing Gel 200ml + Gift Set',27),offer('Acme Cleansing Gel – 200ml（缺货，页面标价）',18)]);
  cmp.search={status:'matched',query:'Acme Cleansing Gel 200ml',model:'Acme Cleansing Gel 200ml',platforms:[]};
  assert.equal(pagePriceAnswer(cmp,'多少钱'),'S$18');
  cmp.offers[0]=offer('Acme Cleansing Gel 200ml Pump Bottle',19);
  cmp.offers[1].verification=undefined;
  assert.equal(pagePriceAnswer(cmp,'多少钱'),'S$19');
});

test('the price-only reply keeps voucher and unconditional marketplace prices distinct', () => {
  const voucher = verified(293.9, { kind:'exact', availability:'unknown', source:'fetch', note:'券后价' });
  assert.equal(pagePriceAnswer(result([voucher, verified(293.9)]),'只看价格'),'S$293.90 券后\n\nS$293.90');
  assert.equal(pagePriceAnswer(result([voucher]),'price only'),'S$293.90 after voucher');
});
