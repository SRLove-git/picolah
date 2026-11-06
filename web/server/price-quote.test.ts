import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModelSearchTool } from './agent/tools/model-search.ts';
import { liveComparison } from './agent/live-comparison.ts';
import { buildLiveMessages } from './llm.ts';
const input={scope:'web' as const,geography:'global' as const,market:'SG' as const,platforms:[],query:'Xiaomi 14'};
const fixture=(priceQuote:any)=>({ok:true,...input,summary:{requests:48,matched:1,failed:23,skipped:0,pagesChecked:24,pagesVerified:1,discovered:40},listings:[{platform:'web',market:'SG',sourceHost:'merchant.com',itemId:'one',title:'Xiaomi 14',url:'https://merchant.com/product/xiaomi-14',price:599,currency:'USD',inStock:false,verification:{source:'product-page',checkedAt:new Date().toISOString()},priceQuote}]});
test('24-page results retain uncertain stock, range labels and metadata through the tool, cards and LLM',async()=>{
 const priceQuote={kind:'range',maxPrice:799,availability:'unknown',source:'html'};
 const tool=createModelSearchTool({url:'http://crawler.internal',token:'test',fetchImpl:async()=>Response.json(fixture(priceQuote)),cacheTtlMs:300000});
 const first=await tool.invoke(input);const result=await tool.invoke(input);assert.equal(result.cache?.hit,true);assert.equal(result.listings[0].inStock,false);
 const comparison=liveComparison('小米14',input,result);assert.match(comparison.alternatives[0].product.name,/价格区间.*599.*799.*库存未明确/);
 assert.equal(comparison.alternatives[0].offer?.inStock,false);assert.equal(comparison.search?.pageVerification?.checked,24);
 const payload=JSON.parse(buildLiveMessages(comparison,'小米14')[1].content as string);assert.deepEqual(payload.liveResults[0].priceQuote,priceQuote);assert.equal(payload.liveResults[0].inStock,false);
});
test('inconsistent stock flags and reversed ranges are rejected',async()=>{
 for(const q of [{kind:'range',maxPrice:500,availability:'unknown',source:'html'},{kind:'exact',availability:'in-stock',source:'html'},undefined]){
  const tool=createModelSearchTool({url:'http://crawler.internal',token:'test',fetchImpl:async()=>Response.json(fixture(q))});await assert.rejects(tool.invoke(input),/库存状态不一致/);
 }
});
