import test from 'node:test';
import assert from 'node:assert/strict';
import { readProductPage, type PageReaderEvent } from './product-page-reader.ts';
import type { MarkdownPage } from './deepseek/fetch.ts';
import { discoverProduct } from './discovery.ts';
const url='https://shop.example.com/products/sony-whch720n';
const page:MarkdownPage={format:'markdown',title:'Sony WH-CH720N',content:'# Sony WH-CH720N\nPrice: USD 89.99\nIn Stock'};
const base={provider:'deepseek' as const,geography:'global' as const,fallback:true};
const html=(price=89.99,currency='USD',availability='InStock',title='Sony WH-CH720N')=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:title,url,offers:{'@type':'Offer',price,priceCurrency:currency,availability,url}})}</script>`;
test('complete Fetch evidence is corroborated by one HTML read before returning a quote',async()=>{
 const events:PageReaderEvent[]=[];let htmlCalls=0;
 const read=()=>readProductPage(url,'SG',{...base,onEvent:e=>events.push(e),fetchMarkdown:async()=>page,fetchHtml:async()=>{htmlCalls++;return html()}});
 assert.equal(await read(),html());assert.equal(htmlCalls,1);
 assert.deepEqual(events.map(e=>e.provider+':'+e.outcome),['deepseek:request','deepseek:parsed','brightdata:request','brightdata:fetched','deepseek:verified']);
 const result=await discoverProduct({scope:'web',geography:'global',market:'SG',platforms:[],query:'Sony WH-CH720N',model:'WH-CH720N'},{web:{search:async()=>[{url,title:page.title}],fetchPage:read}});
 assert.equal(result.listings[0].price,89.99);assert.equal(result.listings[0].verification?.source,'product-page');assert.equal(htmlCalls,2);
});
test('missing evidence or provider failure falls back exactly once with the original URL and geography',async()=>{
 for(const fetchMarkdown of [async()=>({...page,content:page.content.replace('In Stock','Add to cart')}),async()=>{throw Object.assign(Error('busy'),{code:'WEB_PAGE_SOURCE_FAILED'})}]){
  const events:PageReaderEvent[]=[];let calls=0;
  const result=await readProductPage(url,'SG',{...base,fetchMarkdown,onEvent:e=>events.push(e),fetchHtml:async(u,m,o)=>{calls++;assert.equal(u,url);assert.equal(m,'SG');assert.equal(o?.geography,'global');assert.equal(o?.timeoutMs,18000);return '<html>live HTML</html>';}});
  assert.equal(result,'<html>live HTML</html>');assert.equal(calls,1);assert.equal(events.filter(e=>e.outcome==='request').length,2);
 }
});
test('wrong-model Fetch content triggers fresh HTML verification instead of suppressing the right product',async()=>{
 assert.equal(await readProductPage(url,'SG',{...base,query:'Sony WH-CH730N',model:'WH-CH730N',fetchMarkdown:async()=>page,fetchHtml:async()=>'<html>new</html>'}),'<html>new</html>');
});
test('security rejections never trigger fallback and fallback can be explicitly disabled',async()=>{
 let calls=0;
 const fetchHtml=async()=>{calls++;return ''};
 for(const code of ['UNSAFE_WEB_URL','WEB_DNS_FAILED','WEB_PAGE_REDIRECT_REJECTED'])
  await assert.rejects(readProductPage(url,'SG',{...base,fetchHtml,fetchMarkdown:async()=>{throw Object.assign(Error('private'),{code})}}));
 const partial={...page,content:'# Sony WH-CH720N'};
 assert.deepEqual(await readProductPage(url,'SG',{...base,fallback:false,fetchHtml,fetchMarkdown:async()=>partial}),partial);
 await assert.rejects(readProductPage(url,'SG',{...base,fallback:false,fetchHtml,fetchMarkdown:async()=>{throw Error('offline')}}));
 assert.equal(calls,0);
});
test('failed HTML fallback preserves Markdown discovery links without turning them into prices',async()=>{
 const partial={...page,content:'[Sony WH-CH720N](/products/sony-whch720n)'};
 const result=await readProductPage(url,'SG',{...base,fetchMarkdown:async()=>partial,fetchHtml:async()=>{throw Error('offline')}});
 assert.deepEqual(result,partial);
});

test('provider errors retain safe status/code in events and still use independent HTML verification',async()=>{
 for(const [status,code] of [[402,'WEB_PAGE_PAYMENT_REQUIRED'],[429,'WEB_PAGE_RATE_LIMITED'],[504,'WEB_PAGE_TIMEOUT']] as const) {
  const events:PageReaderEvent[]=[];
  assert.equal(await readProductPage(url,'SG',{...base,onEvent:e=>events.push(e),
   fetchMarkdown:async()=>{throw Object.assign(Error('secret upstream body'),{code,status});},fetchHtml:async()=>html()}),html());
  assert.deepEqual(events.find(e=>e.outcome==='error'),{provider:'deepseek',outcome:'error',code,status});
  assert.ok(!JSON.stringify(events).includes('secret'));
 }
});

test('price and currency disagreements reject both amounts, regardless of which is lower',async()=>{
 for(const other of [html(79.99),html(99.99),html(89.99,'SGD')]) {
  const events:PageReaderEvent[]=[];let calls=0;
  await assert.rejects(readProductPage(url,'SG',{...base,fetchMarkdown:async()=>page,onEvent:e=>events.push(e),fetchHtml:async()=>{calls++;return other;}}),{code:'PRODUCT_PAGE_PRICE_CONFLICT'});
  assert.equal(calls,1);assert.equal(events.at(-1)?.outcome,'conflict');
 }
});

test('wrong models and conflicting storage or color never corroborate a Markdown quote',async()=>{
 await assert.rejects(readProductPage(url,'SG',{...base,query:'Sony WH-CH720N',model:'WH-CH720N',fetchMarkdown:async()=>page,fetchHtml:async()=>html(89.99,'USD','InStock','Sony WH-CH730N')}),{code:'PRODUCT_PAGE_IDENTITY_CONFLICT'});
 for(const title of ['Xiaomi 17 256GB Black','Xiaomi 17 512GB White']) {
  const phone={...page,title:'Xiaomi 17 512GB Black',content:'# Xiaomi 17 512GB Black\nEUR 899.00\nIn Stock'};
  await assert.rejects(readProductPage(url,'SG',{...base,query:'Xiaomi 17',fetchMarkdown:async()=>phone,fetchHtml:async()=>html(899,'EUR','InStock',title)}),{code:'PRODUCT_PAGE_IDENTITY_CONFLICT'});
 }
});

test('HTML stock failures and security/source errors cannot resurrect a Markdown price',async()=>{
 assert.equal(await readProductPage(url,'SG',{...base,fetchMarkdown:async()=>page,fetchHtml:async()=>html(89.99,'USD','OutOfStock')}),html(89.99,'USD','OutOfStock'));
 for(const code of ['UNSAFE_WEB_URL','WEB_PAGE_REDIRECT_REJECTED','WEB_PAGE_SOURCE_FAILED']) {
  await assert.rejects(readProductPage(url,'SG',{...base,fetchMarkdown:async()=>page,fetchHtml:async()=>{throw Object.assign(Error('private'),{code})}}),{code});
 }
 // Missing corroboration is not confirmation; do not revive a potentially stale price.
 await assert.rejects(readProductPage(url,'SG',{...base,fetchMarkdown:async()=>page,fetchHtml:async()=>{throw Object.assign(Error('timeout'),{code:'WEB_PAGE_TIMEOUT'})}}),{code:'WEB_PAGE_TIMEOUT'});
 assert.deepEqual(await readProductPage(url,'SG',{...base,fallback:false,fetchMarkdown:async()=>page,fetchHtml:async()=>{throw Error('unexpected')}}),page);
});

test('transient HTML failures get one short retry from a shared budget and still corroborate the price',async()=>{
 let remaining=2, calls=0;
 const consumeRetry=()=>remaining>0 && --remaining>=0;
 for(let index=0;index<3;index++) {
  let attempt=0;
  const request=readProductPage(url,'SG',{...base,consumeRetry,fetchMarkdown:async()=>page,
   fetchHtml:async(u,m,o)=>{calls++;assert.equal(u,url);assert.equal(m,'SG');assert.equal(o?.geography,'global');
    if(!attempt++){assert.equal(o?.timeoutMs,18000);throw Object.assign(Error('timeout'),{code:'WEB_PAGE_TIMEOUT'});}
    assert.equal(o?.timeoutMs,8000);return html();
   }});
  if(index<2) assert.equal(await request,html());
  else await assert.rejects(request,{code:'WEB_PAGE_TIMEOUT'});
 }
 assert.equal(calls,5);assert.equal(remaining,0);
});

test('conflicts, source refusals and failed short retries never loop or restore a Markdown quote',async()=>{
 let retries=0,calls=0;
 for(const code of ['WEB_PAGE_SOURCE_FAILED','UNSAFE_WEB_URL']) {
  await assert.rejects(readProductPage(url,'SG',{...base,consumeRetry:()=>{retries++;return true;},fetchMarkdown:async()=>page,fetchHtml:async()=>{throw Object.assign(Error('fail'),{code});}}),{code});
 }
 await assert.rejects(readProductPage(url,'SG',{...base,consumeRetry:()=>{retries++;return true;},fetchMarkdown:async()=>page,fetchHtml:async()=>html(80)}),{code:'PRODUCT_PAGE_PRICE_CONFLICT'});
 assert.equal(retries,0);
 await assert.rejects(readProductPage(url,'SG',{...base,consumeRetry:()=>{retries++;return true;},fetchMarkdown:async()=>page,fetchHtml:async()=>{calls++;throw Object.assign(Error('timeout'),{code:'WEB_PAGE_TIMEOUT'});}}),{code:'WEB_PAGE_TIMEOUT'});
 assert.equal(calls,2);assert.equal(retries,1);
});
