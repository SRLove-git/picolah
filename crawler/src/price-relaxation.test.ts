import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWebProduct } from './platforms/web-product.ts';
import { inspectMarkdownProduct } from './platforms/markdown-product.ts';
import { queryMatchesListing } from './discovery-match.ts';
import { readProductPage } from './product-page-reader.ts';
import { BrightDataError } from './brightdata/web-unlocker.ts';
import { verifyProductPage } from './verify-product-page.ts';
const url='https://merchant.com/product/xiaomi-14';
const product=(offers:any,extra:any={})=>({'@type':'Product',name:'Xiaomi 14',url,offers,...extra});
const offer=(extra:any={})=>({'@type':'Offer',price:599,priceCurrency:'USD',...extra});
const html=(data:any)=>'<h1>Xiaomi 14</h1><button>Add to cart</button><script type="application/ld+json">'+JSON.stringify(data)+'</script>';
const parse=(data:any)=>parseWebProduct(html(data),url,'SG','global');

test('unknown and unavailable stock keep a page price without claiming stock',()=>{
 for(const [availability,expected] of [[undefined,'unknown'],['https://schema.org/OutOfStock','out-of-stock'],['PreOrder','preorder']] as const){
  const rows=parse(product(offer({availability})));assert.equal(rows.length,1);assert.equal(rows[0].inStock,false);assert.equal(rows[0].priceQuote?.availability,expected);
  assert.equal(queryMatchesListing('Xiaomi 14',rows[0],'SG','web',undefined,'global'),true);
 }
});
test('aggregate ranges and priceSpecification expose their actual meanings',()=>{
 const range=parse(product({'@type':'AggregateOffer',lowPrice:599,highPrice:799,priceCurrency:'USD'}))[0];
 assert.equal(range.price,599);assert.equal(range.priceQuote?.kind,'range');assert.equal(range.priceQuote?.maxPrice,799);
 const from=parse(product({'@type':'AggregateOffer',lowPrice:599,priceCurrency:'USD'}))[0];assert.equal(from.priceQuote?.kind,'from');
 const spec=parse(product({'@type':'Offer',priceSpecification:{'@type':'UnitPriceSpecification',price:'599.00',priceCurrency:'USD'}}))[0];assert.equal(spec.price,599);
 assert.equal(parse(product({'@type':'Offer',priceSpecification:{price:25,priceCurrency:'USD',name:'Monthly installment'}})).length,0);
 assert.equal(parse(product({'@type':'AggregateOffer',lowPrice:799,highPrice:599,priceCurrency:'USD'})).length,0);
 assert.equal(parse(product({'@type':'AggregateOffer',lowPrice:160,highPrice:989,priceCurrency:'USD'})).length,0,
  'an accessory/deposit minimum must not become the camera price');
});
test('multiple declared variants remain separate and still honor requested capacity',()=>{
 const rows=parse({'@type':'ProductGroup',name:'Xiaomi 14',url,hasVariant:[256,512].map((size,i)=>product(offer({price:599+i*100}),{name:'Xiaomi 14 '+size+'GB',sku:String(size),url:url+'?variant='+size}))});
 assert.equal(rows.length,2);assert.notEqual(rows[0].itemId,rows[1].itemId);
 assert.equal(rows.filter(r=>queryMatchesListing('Xiaomi 14 256GB',r,'SG','web',undefined,'global')).length,1);
});
test('article prices, unrelated product URLs, missing currency and invalid amounts stay excluded',()=>{
 assert.equal(parseWebProduct(html(product(offer({availability:'InStock'}))),'https://www.dealmoon.com/en/sale.html','SG','global').length,0);
 assert.equal(parse({'@type':'Article',mainEntity:product(offer())}).length,0);
 assert.equal(parse(product(offer(),{url:'https://merchant.com/product/other-phone'})).length,0);
 for(const change of [{priceCurrency:undefined},{price:0},{price:-1}])assert.equal(parse(product(offer(change))).length,0);
});
test('Markdown does not require a repeated H1 or explicit stock; ranges remain ranges',()=>{
 const p={format:'markdown' as const,title:'Xiaomi 14 | Merchant',content:'Xiaomi 14\nPrice: USD 599.00\nAdd to cart'};
 const row=inspectMarkdownProduct(p,url,'SG','global').listings[0];assert.equal(row.price,599);assert.equal(row.inStock,false);assert.equal(row.priceQuote?.availability,'unknown');
 const range=inspectMarkdownProduct({...p,content:'# Xiaomi 14\nPrice range: USD 599 - USD 799\nChoose variant\nAdd to cart'},url,'SG','global').listings[0];
 assert.equal(range.priceQuote?.kind,'range');assert.equal(range.priceQuote?.maxPrice,799);
 const out=inspectMarkdownProduct({...p,content:'# Xiaomi 14\nUSD 599\nOut of stock'},url,'SG','global').listings[0];assert.equal(out.priceQuote?.availability,'out-of-stock');
});
test('Fetch price survives HTML timeout, while available HTML is authoritative and transport security remains',async()=>{
 const md={format:'markdown' as const,title:'Xiaomi 14',content:'# Xiaomi 14\nUSD 599\nAdd to cart'};
 const options={geography:'global' as const,provider:'deepseek' as const,fallback:true,fetchMarkdown:async()=>md};
 assert.deepEqual(await readProductPage(url,'SG',{...options,fetchHtml:async()=>{throw new BrightDataError('timeout',{code:'WEB_PAGE_TIMEOUT'});}}),{...md,stockUnconfirmed:true});
 const current=html(product(offer({price:649,availability:'OutOfStock'})));
 assert.equal(await readProductPage(url,'SG',{...options,fetchHtml:async()=>current}),current);
 await assert.rejects(readProductPage(url,'SG',{...options,fetchHtml:async()=>{throw new BrightDataError('unsafe',{code:'UNSAFE_WEB_URL'});}}));
});

test('explicit zero inventory is not converted into in-stock by a contradictory status word',()=>{
 const data=product(offer(),{sku:'xiaomi-14'});
 const value={code:'xiaomi-14',url:new URL(url).pathname,price:{value:599,currencyIso:'USD'},stock:{stockLevelStatus:'inStock',stockLevel:0},purchasable:true};
 const details={loading:false,error:false,success:true,value};
 const state={'cx-state':{product:{details:{entities:{'xiaomi-14':{details}}}}}};
 const markup=html(data)+'<script id="ng-state" type="application/json">'+JSON.stringify(state)+'</script>';
 const row=parseWebProduct(markup,url,'SG','global')[0];assert.ok(row);assert.equal(row.inStock,false);assert.equal(row.priceQuote?.availability,'out-of-stock');
});

test('tax-inclusive and tax-exclusive amounts are not a variant range',()=>{
 const page={format:'markdown' as const,title:'Xiaomi 14',content:'# Xiaomi 14\nEUR 859.99 Tax included\nEUR 722.68 Tax excluded\nAdd to cart\nDimensions: 7.8 - 8.2 mm'};
 const row=inspectMarkdownProduct(page,url,'SG','global').listings[0];assert.equal(row.price,859.99);assert.equal(row.priceQuote?.kind,'exact');assert.match(row.priceQuote?.note??'',/含税/);
});
test('comparison pages cannot turn review titles or price tiers into merchant offers',()=>{
 const page={format:'markdown' as const,title:'Sony WH-CH720N - Where to buy',content:'## Pricing and availability\nWe compare 20 stores\nAverage Price: $160\n### Price History\n## Video reviews\nThe best headphones under GBP 100\nIn Stock'};
 assert.deepEqual(inspectMarkdownProduct(page,'https://comparison.example.com/item/whch720n','SG','global').listings,[]);
});

test('aggregation metadata and external aggregate sellers do not describe a merchant purchase price',()=>{
 const aggregate=product({'@type':'AggregateOffer',lowPrice:95,highPrice:5000,priceCurrency:'USD',offers:[offer({url:'https://other.example.com/product'})]});
 assert.equal(parse(aggregate).length,0);
 assert.equal(parseWebProduct('<title>Xiaomi 14 - Price History, Comparison &amp; Alerts</title>'+html(product(offer({availability:'InStock'}))),url,'SG','global').length,0);
});
test('lease billing and generic not-original-brand items cannot become purchase quotes',()=>{
 assert.equal(parse(product(offer({businessFunction:'http://purl.org/goodrelations/v1#LeaseOut',priceSpecification:{price:14,priceCurrency:'USD',billingDuration:{value:24,unitCode:'MON'}}}))).length,0);
 const row={...parse(product(offer()))[0],title:'TWS For AirPods Pro 2nd Generation headphones - not Apple brand headphones'};
 assert.equal(queryMatchesListing('AirPods Pro 2',row,'SG','web',undefined,'global'),false);
});
test('current full price is separated from old price and credit spending thresholds',()=>{
 const page={format:'markdown' as const,title:'Xiaomi 14',content:'# Xiaomi 14\nWas GBP 1149\nNow GBP 1019\nSave GBP 130\nAdd to cart\n## Payment options\nSpend GBP 50 or more\nSelect colour\nChoose our lowest weekly price'};
 const row=inspectMarkdownProduct(page,url,'SG','global').listings[0];assert.equal(row.price,1019);assert.equal(row.priceQuote?.kind,'exact');
});

test('aggregated prices require merchant purchase controls, not just Product schema',()=>{
 const data=product({'@type':'AggregateOffer',lowPrice:599,highPrice:799,priceCurrency:'USD'});
 const markup='<script type="application/ld+json">'+JSON.stringify(data)+'</script>';
 assert.deepEqual(parseWebProduct(markup,url,'SG','global'),[]);
 assert.equal(parseWebProduct(markup+'<button>Add to basket</button>',url,'SG','global')[0]?.priceQuote?.kind,'range');
});

test('known lease pages cannot re-enter from Markdown when HTML times out',async()=>{
 const md={format:'markdown' as const,title:'AirPods Pro 2',content:'# AirPods Pro 2\nPrice range: SGD 4.99 - SGD 125\nAdd to cart'};
 assert.deepEqual(inspectMarkdownProduct(md,'https://cinch.sg/product/apple-hdp-app-appro2-wht','SG','global').listings,[]);
 assert.deepEqual(inspectMarkdownProduct(md,'https://nowcircular.sg/product/iphone-16-pro?plan=12-months','SG','global').listings,[]);
});
test('EOS model suffixes stay distinct while base bodies and lens kits still match',()=>{
 const base=parse(product(offer()))[0];
 for(const title of ['Canon EOS R50 V','Canon EOS R50V','Canon EOS R50 Mark II'])assert.equal(queryMatchesListing('Canon EOS R50',{...base,title},'SG','web',undefined,'global'),false,title);
 for(const title of ['Canon EOS R50 Body','Canon EOS R50 with RF-S 18-45mm Lens'])assert.equal(queryMatchesListing('Canon EOS R50',{...base,title},'SG','web',undefined,'global'),true,title);
});

test('quote mode accepts a visible amount without stock, schema or standard headings',async()=>{
 const markdown={format:'markdown' as const,title:'Anker Powercore GanPrime Power Bank 20000mAh 200W | Anker Singapore',content:'Anker Powercore GanPrime Power Bank 20000mAh 200W\n$ 189.90\nChoose a colour\nCurrently unavailable'};
 const [row]=await verifyProductPage('https://www.anker.com.sg/products/anker-prime-20k-200w',{
  market:'SG',query:'Anker Prime 20000mAh 200W',geography:undefined,
 },async()=>markdown);
 assert.equal(row.price,189.9);assert.equal(row.currency,'SGD');assert.equal(row.inStock,false);
 assert.equal(row.priceQuote?.availability,'out-of-stock');assert.equal(row.priceQuote?.kind,'from');
 await assert.rejects(verifyProductPage('https://www.anker.com.sg/products/anker-prime-20k-200w',{
  market:'SG',query:'Anker Prime 27650mAh 250W',
 },async()=>markdown));
});

test('quote mode uses the first visible main amount when a page also prints an old price',async()=>{
 const page='https://www.ishopchangi.com/zh/product/oral-b-io-series-6-electric-toothbrush';
 const markdown={format:'markdown' as const,title:'ORAL B Oral-B iO Series 6 Electric Toothbrush',content:'ORAL B\nOral-B iO Series 6 Electric Toothbrush\nS$274.31\nS$457.80\nQuantity limited'};
 const [row]=await verifyProductPage(page,{market:'SG',query:'Oral-B iO Series 6'},async()=>markdown);
 assert.equal(row.price,274.31);assert.equal(row.currency,'SGD');assert.match(row.priceQuote?.note??'',/首个主报价/);
});

test('quote mode rejects a tiny payment amount when the renderer loses its instalment label',async()=>{
 const page='https://www.courts.com.sg/lg-front-load-washer-and-dryer-13kg%2F8kg-fv1413h2ba-IP174279.html';
 const markdown={format:'markdown' as const,title:'LG Front Load Washer And Dryer (13kg/8kg) FV1413H2BA',
  content:'# LG Front Load Washer And Dryer (13kg/8kg) FV1413H2BA\nS$11\nS$1,699\nAdd to cart'};
 await assert.rejects(verifyProductPage(page,{market:'SG',query:'LG Washer Dryer FV1413H2BA'},async()=>markdown),
  (error:Error&{code?:string})=>error.code==='PRODUCT_PAGE_UNVERIFIED');
});

test('quote mode retains a product summary price rendered before the semantic H1',async()=>{
 const title='Asus Zenbook S 14 OLED UX5406SA-PZ267W U7-258V 32GB 1TB';
 const page={format:'markdown' as const,title,content:'Price:\nSale price$ 2,779.00 SGD\nNo reviews\n## Description\n# '+title+'\nProduct details'};
 const [row]=await verifyProductPage('https://shop.winpro.com.sg/products/asus-zenbook-s-14-oled-ux5406sa-pz267w',{
  market:'SG',query:'ASUS Zenbook S 14 UX5406SA',
 },async()=>page);
 assert.equal(row.price,2779);assert.equal(row.currency,'SGD');
});

test('Amazon Singapore Fetch binds a leading buy-box price to the exact appliance H1',async()=>{
 const cases=[
  {
   url:'https://www.amazon.sg/dp/B0B722494K',
   query:'Philips Sonicare DiamondClean 9000 HX9914/62',model:'HX-9914/62',price:367.42,
   unitPrice:183.71,
   title:'Philips Sonicare DiamondClean 9000 – Twin Pack White & White (Model HX9914/62)',
  },
  {
   url:'https://www.amazon.sg/dp/B0B1RVNZ9V',
   query:'Panasonic Lamdash Pro 6 ES-LS9A-K',model:'ES-LS9A-K',price:759,
   title:'Panasonic ARC6 Electric Razor with Cleaning Station - ES-LS9A-K (Black)',
  },
 ];
 for(const item of cases){
  const page={format:'markdown' as const,title:item.title+' : Amazon.sg: Home - S$'+item.price.toFixed(2),
   content:'S$'+item.price.toFixed(2)+(item.unitPrice?' S$'+item.unitPrice.toFixed(2)+' per count':'')+'\nOnly 1 left in stock.\nShipping S$20.00\n# '+item.title+'\nSecure transaction\nAbout this product'};
  const [row]=await verifyProductPage(item.url,{market:'SG',query:item.query,model:item.model},async()=>page);
  assert.equal(row.price,item.price,item.query);assert.equal(row.currency,'SGD');assert.match(row.title,new RegExp(item.model.replace(/-/g,'[- ]?').replace('/','\\/')));
 }
});

test('quote mode reads visible HTML amounts but still rejects fees and unrelated identities',async()=>{
 const page='https://shop.example.sg/products/oral-b-io6';
 const markup=(amount:string,title='Oral-B iO Series 6 Electric Toothbrush')=>`<title>${title} | Merchant</title><h1>${title}</h1><div class="price">${amount}</div><button>Add to cart</button>`;
 const [row]=await verifyProductPage(page,{market:'SG',query:'Oral-B iO Series 6'},async()=>markup('S$ 250.57'));
 assert.equal(row.price,250.57);assert.equal(row.priceQuote?.source,'html');assert.equal(row.priceQuote?.availability,'unknown');
 await assert.rejects(verifyProductPage(page,{market:'SG',query:'Oral-B iO Series 6'},async()=>markup('Shipping S$ 4.90')));
 await assert.rejects(verifyProductPage(page,{market:'SG',query:'Oral-B iO Series 6'},async()=>markup('S$ 250.57','Oral-B iO Series 9')));
});

test('local marketplace symbols can be quoted after the strict Shopee layout fails',async()=>{
 const shopee='https://shopee.sg/product/101/202';
 const page={format:'markdown' as const,title:'Philips OneBlade QP2834/20 | Shopee Singapore',content:'# Philips OneBlade QP2834/20\n$49.90\nChoose variant\n## Shop Vouchers\n$10 OFF\n## Shipping\n$2.99'};
 const [row]=await verifyProductPage(shopee,{market:'SG',query:'Philips OneBlade QP2834/20'},async()=>page);
 assert.equal(row.price,49.9);assert.equal(row.currency,'SGD');assert.equal(row.priceQuote?.kind,'exact');
});

test('Carousell search collections never become a single product quote',async()=>{
 const page={format:'markdown' as const,title:"Singapore有41件 'Bp04' 贩售中",content:"# Singapore有41件 'Bp04' 贩售中\nS$1.50 - S$1,199.99\nIn stock"};
 assert.deepEqual(await verifyProductPage('https://www.carousell.sg/bp04/q/',{
  market:'SG',query:'Dyson Purifier Big+Quiet Formaldehyde BP04',
 },async()=>page),[]);
 assert.deepEqual(await verifyProductPage('https://www.carousell.sg/vacuum/dreame-x40-ultra/q-5827/',{
  market:'SG',query:'Dreame X40 Ultra',
 },async()=>page),[]);
});
