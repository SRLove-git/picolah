import test from 'node:test';
import assert from 'node:assert/strict';
import { readProductPage, type PageReaderEvent } from './product-page-reader.ts';
import type { MarkdownPage } from './deepseek/fetch.ts';
import { discoverProduct } from './discovery.ts';
import { parseMarkdownProduct } from './platforms/markdown-product.ts';
const url='https://shop.example.com/products/sony-whch720n';
const page:MarkdownPage={format:'markdown',title:'Sony WH-CH720N',content:'# Sony WH-CH720N\nPrice: USD 89.99\nIn Stock'};
const base={provider:'deepseek' as const,geography:'global' as const,fallback:true};
const html=(price=89.99,currency='USD',availability='InStock',title='Sony WH-CH720N')=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:title,url,offers:{'@type':'Offer',price,priceCurrency:currency,availability,url}})}</script>`;
const fail=(code:string)=>Object.assign(Error('secret upstream body'),{code});
test('both providers start independently; structured HTML is authoritative',async()=>{
 const events:PageReaderEvent[]=[];let markdownStarted=false,htmlStarted=false;
 const read=()=>readProductPage(url,'SG',{...base,onEvent:e=>events.push(e),
  fetchMarkdown:async()=>{markdownStarted=true;await Promise.resolve();assert.ok(htmlStarted);return page;},
  fetchHtml:async(u,m,o)=>{htmlStarted=true;assert.ok(markdownStarted);assert.equal(u,url);assert.equal(m,'SG');assert.equal(o?.geography,'global');assert.equal(o?.timeoutMs,40000);return html();}});
 assert.equal(await read(),html());assert.equal(events.filter(e=>e.outcome==='request').length,2);
 const result=await discoverProduct({scope:'web',geography:'global',market:'SG',platforms:[],query:'Sony WH-CH720N',model:'WH-CH720N'},{web:{search:async()=>[{url,title:page.title}],fetchPage:read}});
 assert.equal(result.listings[0].price,89.99);assert.equal(result.listings[0].verification?.source,'product-page');
});
test('Fetch provider errors retain sanitized diagnostics and use HTML',async()=>{
 for(const [status,code] of [[402,'WEB_PAGE_PAYMENT_REQUIRED'],[429,'WEB_PAGE_RATE_LIMITED'],[504,'WEB_PAGE_TIMEOUT']] as const){
  const events:PageReaderEvent[]=[];
  assert.equal(await readProductPage(url,'SG',{...base,onEvent:e=>events.push(e),fetchMarkdown:async()=>{throw Object.assign(fail(code),{status});},fetchHtml:async()=>html()}),html());
  assert.deepEqual(events.find(e=>e.outcome==='error'),{provider:'deepseek',outcome:'error',code,status});assert.ok(!JSON.stringify(events).includes('secret'));
 }
});
test('disabling HTML fallback does not call HTML',async()=>{
 let calls=0;const fetchHtml=async()=>{calls++;return '';};
 assert.deepEqual(await readProductPage(url,'SG',{...base,fallback:false,fetchHtml,fetchMarkdown:async()=>page}),page);
 await assert.rejects(readProductPage(url,'SG',{...base,fallback:false,fetchHtml,fetchMarkdown:async()=>{throw fail('WEB_PAGE_TIMEOUT');}}));assert.equal(calls,0);
});
test('security and redirect failures in either provider remain fatal',async()=>{
 for(const code of ['UNSAFE_WEB_URL','WEB_DNS_FAILED','WEB_DNS_TIMEOUT','WEB_PAGE_REDIRECT_REJECTED']){
  await assert.rejects(readProductPage(url,'SG',{...base,fetchMarkdown:async()=>{throw fail(code);},fetchHtml:async()=>html()}),{code});
  await assert.rejects(readProductPage(url,'SG',{...base,fetchMarkdown:async()=>page,fetchHtml:async()=>{throw fail(code);}}),{code});
 }
});
test('HTML price changes, currencies and unavailable stock override fetched text',async()=>{
 for(const current of [html(79.99),html(99.99),html(89.99,'SGD'),html(89.99,'USD','OutOfStock')])
  assert.equal(await readProductPage(url,'SG',{...base,fetchMarkdown:async()=>page,fetchHtml:async()=>current}),current);
});
test('HTML identity remains subject to requested model after provider selection',async()=>{
 const result=await discoverProduct({scope:'web',geography:'global',market:'SG',platforms:[],query:'Sony WH-CH720N',model:'WH-CH720N'},{web:{search:async()=>[{url,title:page.title}],fetchPage:()=>readProductPage(url,'SG',{...base,fetchMarkdown:async()=>page,fetchHtml:async()=>html(89.99,'USD','InStock','Sony WH-CH730N')})}});
 assert.equal(result.listings.length,0);
});
test('HTML parse or network failures preserve Fetch prices with unconfirmed stock',async()=>{
 for(const fetchHtml of [async()=>'<html>unstructured</html>',async()=>{throw fail('WEB_PAGE_TIMEOUT');},async()=>{throw fail('WEB_PAGE_SOURCE_FAILED');}]){
  const result=await readProductPage(url,'SG',{...base,fetchMarkdown:async()=>page,fetchHtml});
  assert.deepEqual(result,{...page,stockUnconfirmed:true});
  const row=parseMarkdownProduct(result as MarkdownPage,url,'SG','global')[0];assert.equal(row.price,89.99);assert.equal(row.inStock,false);assert.equal(row.priceQuote?.availability,'unknown');
 }
});
test('preserved directory links never become fabricated prices',async()=>{
 const partial={...page,content:'[Sony WH-CH720N](/products/sony-whch720n)'};
 const result=await readProductPage(url,'SG',{...base,fetchMarkdown:async()=>partial,fetchHtml:async()=>{throw fail('WEB_PAGE_TIMEOUT');}});
 assert.deepEqual(result,{...partial,stockUnconfirmed:true});assert.deepEqual(parseMarkdownProduct(result as MarkdownPage,url,'SG','global'),[]);
});
test('transient HTML retries consume one shared allowance per page with a shorter timeout',async()=>{
 let remaining=2,calls=0;
 for(let index=0;index<3;index++){
  let attempt=0;
  const result=await readProductPage(url,'SG',{...base,consumeRetry:()=>remaining>0&&--remaining>=0,fetchMarkdown:async()=>page,
   fetchHtml:async(u,m,o)=>{calls++;if(!attempt++){assert.equal(o?.timeoutMs,40000);throw fail('WEB_PAGE_TIMEOUT');}assert.equal(o?.timeoutMs,15000);return html();}});
  assert.deepEqual(result,index<2?html():{...page,stockUnconfirmed:true});
 }
 assert.equal(calls,5);assert.equal(remaining,0);
});
test('source refusals do not retry; failed retries terminate and two failed providers reject',async()=>{
 let retries=0,calls=0;
 await readProductPage(url,'SG',{...base,consumeRetry:()=>{retries++;return true;},fetchMarkdown:async()=>page,fetchHtml:async()=>{throw fail('WEB_PAGE_SOURCE_FAILED');}});assert.equal(retries,0);
 const result=await readProductPage(url,'SG',{...base,consumeRetry:()=>{retries++;return true;},fetchMarkdown:async()=>page,fetchHtml:async()=>{calls++;throw fail('WEB_PAGE_TIMEOUT');}});
 assert.deepEqual(result,{...page,stockUnconfirmed:true});assert.equal(retries,1);assert.equal(calls,2);
 await assert.rejects(readProductPage(url,'SG',{...base,fetchMarkdown:async()=>{throw fail('WEB_PAGE_TIMEOUT');},fetchHtml:async()=>{throw fail('WEB_PAGE_SOURCE_FAILED');}}),{code:'WEB_PAGE_SOURCE_FAILED'});
});
