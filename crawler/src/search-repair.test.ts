import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDiscoveryModel,queryMatchesTitle} from './discovery-match.ts';
import {parseWebProduct} from './platforms/web-product.ts';
import {inspectMarkdownProduct} from './platforms/markdown-product.ts';
import {discoverWebProducts} from './web-discovery.ts';
const url='https://merchant.example.com/product/roborock-s8';
const md=(content:string)=>({format:'markdown' as const,title:'Roborock S8',content});
const html=(name='Roborock S8')=>'<h1>'+name+'</h1><script type="application/ld+json">'+JSON.stringify({'@type':'Product',name,url,offers:{'@type':'Offer',price:749,priceCurrency:'USD',availability:'OutOfStock'}})+'</script>';
test('five-character complete models enter search while malformed hints stay invalid',()=>{
 for(const model of ['EC685','EC-685'])assert.equal(normalizeDiscoveryModel(model),model);
 for(const model of ['E685','EC68','Sony EC685','EC685 EC785'])assert.throws(()=>normalizeDiscoveryModel(model));
 assert.equal(queryMatchesTitle('EC-685','DeLonghi EC685 Coffee Machine','EC-685'),true);
});
test('model prefixes can match a longer regional SKU without accepting another prefix or accessories',()=>{
 const matches:Array<[string,string,string?]>=[
  ['LG Washer Dryer FV1413','LG Front Load Washer Dryer 13kg/8kg FV1413H2BA','FV1413'],
  ['Bosch Washer WGG254','Bosch 10kg Front Load Washing Machine WGG254A0SG','WGG254'],
  ['Panasonic Fridge NR BX471','Panasonic Refrigerator NR-BX471XSSG','NR-BX471'],
  ['Samsung TV QA55QN85','Samsung Neo QLED TV QA55QN85DBKXXS','QA55QN85'],
  ['Philips Air Purifier AC3033','Philips Air Purifier AC3033/30','AC3033'],
 ];
 for(const [query,title,model] of matches) assert.equal(queryMatchesTitle(query,title,model),true,title);
 assert.equal(normalizeDiscoveryModel('FV141'),'FV141');
 assert.equal(queryMatchesTitle('LG FV141','LG Washer Dryer FV1413H2BA','FV141'),true);
 assert.equal(queryMatchesTitle('LG FV142','LG Washer Dryer FV1413H2BA','FV142'),false);
 assert.equal(queryMatchesTitle('LG FV1413','Replacement Filter for LG FV1413H2BA','FV1413'),false);
 assert.equal(queryMatchesTitle('LG FV1413','LG FV1413H2BA / FV1413H3BA Washer Dryer','FV1413'),false);
 assert.equal(queryMatchesTitle('Bosch WGG254A0SG','Bosch WGG254A1SG Washer','WGG254A0SG'),false);
});
test('regional appliance SKUs match abbreviated merchant titles without accepting accessories',()=>{
 const cases:Array<[string,string,string]>=[
  ['KitchenAid Artisan 5KSM175PS Stand Mixer','KitchenAid 5KSM175PS Mixer','5KSM175PS'],
  ['Nespresso Vertuo Pop ENV90','Nespresso ENV90 Vertuo Pop Coffee Machine','ENV-90'],
  ['Panasonic Lamdash Pro 6 ES-LS9A-K','Panasonic ES-LS9A-K Electric Shaver','ES-LS9A-K'],
  ['Philips Shaver Series 9000 S9987/54','Philips S9987/54 Wet and Dry Shaver','S-9987/54'],
  ['Panasonic Hair Dryer EH-NA9N','Panasonic EH-NA9N nanoe Hair Dryer','EH-NA9N'],
  ['Philips Sonicare DiamondClean 9000 HX9914/62','Philips DiamondClean 9000 HX9914/62','HX-9914/62'],
 ];
 for(const [query,title,model] of cases){assert.equal(normalizeDiscoveryModel(model),model);assert.equal(queryMatchesTitle(query,title,model),true,title);}
 assert.equal(queryMatchesTitle('HP Spectre x360 14-eu0000','Battery for HP Spectre X360 14-EU0000'),false);
 assert.equal(queryMatchesTitle('Philips Air Purifier AC3033/30','Replacement Filter for Philips AC3033/30','AC-3033/30'),false);
});
test('device generation is distinct from a lens generation in a bundle',()=>{
 for(const title of ['Sony ZV-E10 II','Sony ZV-E10II','Sony ZV-E10 Mark II'])assert.equal(queryMatchesTitle('Sony ZV-E10',title),false,title);
 for(const title of ['Sony ZV-E10','Sony ZV-E10 with 16-50mm II Lens'])assert.equal(queryMatchesTitle('Sony ZV-E10',title),true,title);
 assert.equal(queryMatchesTitle('Sony ZV-E10 II','Sony ZV-E10'),false);
 assert.equal(queryMatchesTitle('Sony ZV-E10 II','Sony ZV-E10 II'),true);
});
test('accessory prices cannot masquerade as the main device',()=>{
 assert.equal(queryMatchesTitle('DJI Osmo Pocket 3','DJI Osmo Pocket 3 Battery Handle'),false);
 assert.equal(queryMatchesTitle('DJI Osmo Pocket 3','DJI Osmo Pocket 3 with Battery Handle'),true);
 assert.equal(queryMatchesTitle('DJI Osmo Pocket 3 Battery Handle','DJI Osmo Pocket 3 Battery Handle'),true);
});
test('RAM and generation typography do not discard the requested laptop storage',()=>{
 assert.equal(queryMatchesTitle('MacBook Air M3 13 256GB','Apple MacBook Air M3 13 inch 8GB RAM 256GB SSD'),true);
 assert.equal(queryMatchesTitle('MacBook Air M3 13 256GB','Apple MacBook Air M3 13 inch 8GB RAM 512GB SSD'),false);
 assert.equal(queryMatchesTitle('Lenovo ThinkPad X1 Carbon Gen 12','Lenovo ThinkPad X1 Carbon 12th Generation'),true);
 assert.equal(queryMatchesTitle('Lenovo ThinkPad X1 Carbon Gen 12','Lenovo ThinkPad X1 Carbon 13th Generation'),false);
});
test('known aggregators and affiliate review pages cannot become HTML or Fetch quotes',()=>{
 for(const source of ['https://phoneaqua.com/xiaomi-14-price-in-malaysia','https://mobilekishop.net/my/product/xiaomi-14','https://biggo.com.tw/gp/tw_Roborock_S8','https://bigshopper.ie/product/s8','https://www.photoprice.ca/product/s8','https://cosmetify.com/s8','https://smartpicksguides.com/p/s8','https://www.stockinthechannel.co.uk/Product/s8','https://us.stockinthechannel.com/Product/s8']){
  assert.deepEqual(parseWebProduct(html(),source,'SG','global'),[]);
  assert.deepEqual(inspectMarkdownProduct(md('# Roborock S8\nUSD 149\nIn stock\nAdd to cart'),source,'SG','global').listings,[]);
 }
 const guide='Our verdict: Best overall. We earn a commission. Typical price USD 749.';
 assert.deepEqual(parseWebProduct(html()+guide,url,'SG','global'),[]);
 assert.deepEqual(inspectMarkdownProduct(md('# Roborock S8\nUSD 749\nIn stock\n'+guide),url,'SG','global').listings,[]);
});
test('cashback, instalment and related-item numbers are not a product range',()=>{
 const page=md('# Roborock S8\nUSD 749\nEarn USD 7.49 cashback\nPay in 12 instalments of USD 62.42\nAdd to cart\n## How this compares on paper\nOther vacuum USD 149–199');
 const rows=inspectMarkdownProduct(page,url,'SG','global').listings;
 assert.equal(rows.length,1);assert.equal(rows[0].price,749);assert.equal(rows[0].priceQuote?.kind,'exact');
 const range=inspectMarkdownProduct(md('# Roborock S8\nPrice range USD 749–999\nAdd to cart'),url,'SG','global').listings[0];
 assert.equal(range.price,749);assert.equal(range.priceQuote?.maxPrice,999);
});
test('an aggregate search hit does not stop discovery before a merchant page',async()=>{
 let visits=0;
 const result=await discoverWebProducts({scope:'web',geography:'global',market:'SG',platforms:[],query:'Roborock S8'},{
  search:async()=>[{title:'Roborock S8',url:'https://biggo.com.tw/product/roborock-s8'},{title:'Roborock S8',url}],
  fetchPage:async u=>{visits++;assert.equal(u,url);return html();},
 });
 assert.equal(visits,1);assert.equal(result.listings.length,1);assert.equal(result.listings[0].price,749);
 assert.equal(result.listings[0].priceQuote?.availability,'out-of-stock');
});
test('watch case housings and abbreviated Series labels retain the main watch',()=>{
 assert.equal(queryMatchesTitle('Apple Watch Series 10','Apple Watch Series 10 GPS 46mm Jet Black Aluminum Case with Sport Band'),true);
 assert.equal(queryMatchesTitle('Apple Watch Series 10','APPLE MWWM3QAA Watch 10 46mm Silver'),true);
 assert.equal(queryMatchesTitle('Apple Watch Series 10','Apple Watch Series 10 Protective Case'),false);
 assert.equal(queryMatchesTitle('Apple Watch Series 10','Apple Watch Series 11 Titanium Case'),false);
});
test('compound appliance codes stay whole and reject mixed adjacent models',()=>{
 assert.equal(normalizeDiscoveryModel('DJ13E-Q7'),'DJ13E-Q7');
 assert.equal(queryMatchesTitle('Joyoung DJ13E-Q7','Joyoung DJ13E-Q7 soy milk maker'),true);
 assert.equal(queryMatchesTitle('Joyoung DJ13E-Q7','Joyoung DJ13E-Q5 and DJ13E-Q7 comparison'),false);
});
test('a starting monthly payment does not become the page price',()=>{
 const page={format:'markdown' as const,title:'Apple iPhone 16 256GB',content:'# Apple iPhone 16 256GB\nEasy Payment Plans Starting from BHD 35.999/monthThe final amount depends on your bank\nBHD 431.992\nInclusive of VAT\nAdd to cart'};
 const row=inspectMarkdownProduct(page,'https://merchant.example.com/iphone-16','SG','global').listings[0];
 assert.equal(row.price,431.992);assert.equal(row.priceQuote?.kind,'exact');
});
test('processor and OS editions are not extra laptop model variants',()=>{
 assert.equal(queryMatchesTitle('Lenovo ThinkPad X1 Carbon Gen 12','Lenovo ThinkPad X1 Carbon Gen 12 Intel Core Ultra 7 155U 16GB Memory 512GB SSD Windows 11 Pro'),true);
 assert.equal(queryMatchesTitle('Lenovo ThinkPad X1 Carbon Gen 12','ThinkPad X1 Carbon Gen 12'),true);
 assert.equal(queryMatchesTitle('MacBook Air M3 13 256GB','Apple MacBook Air 13 M3 8GB, 256GB SSD'),true);
 assert.equal(queryMatchesTitle('Samsung Galaxy S24','Samsung Galaxy S24 Ultra'),false);
 assert.equal(queryMatchesTitle('ASUS Zenbook S 14 UX5406SA','ASUS Zenbook S 14 OLED UX5406SA-PZ267W 32GB 1TB'),true);
 assert.equal(queryMatchesTitle('ASUS Zenbook S 14 UX5406SA-PZ267W','ASUS Zenbook S 14 OLED UX5406SA-PV030W 32GB 1TB'),false);
 assert.equal(queryMatchesTitle('Anker Prime 20000mAh 200W','Anker Power Bank Powercore GanPrime 20000mAh 200W Portable Charger'),true);
});
test('an unspecified Philips regional suffix is retained without changing an explicit one',()=>{
 assert.equal(queryMatchesTitle('Philips Sonicare HX9911','Philips Sonicare HX9911/23'),true);
 assert.equal(queryMatchesTitle('Philips HX9911/23','Philips HX9911/24'),false);
 assert.equal(queryMatchesTitle('Sony WF1000XM6','Sony WF1000XM6 / 5'),false);
});
test('marketing series numbers are not a conflicting appliance model',()=>{
 assert.equal(queryMatchesTitle('Philips Sonicare HX9911','Philips Sonicare 9000 Special Edition Rechargeable Toothbrush HX9911/90'),true);
 assert.equal(queryMatchesTitle('Philips Sonicare HX9911','Philips Sonicare HX9924/90'),false);
});
test('appliance base SKUs and segmented region suffixes remain the requested product',()=>{
 assert.equal(queryMatchesTitle('KitchenAid Artisan 5KSM175PS Stand Mixer','KitchenAid 5KSM175PSBCA Artisan Stand Mixer','5KSM175PS'),true);
 assert.equal(queryMatchesTitle('KitchenAid Artisan 5KSM175PS Stand Mixer','KitchenAid 5KSM185PSBCA Artisan Stand Mixer','5KSM175PS'),false);
 assert.equal(queryMatchesTitle('KitchenAid Artisan 5KSM175PS Stand Mixer','Mixer Stand compatible with KitchenAid 5KSM175PS','5KSM175PS'),false);
 assert.equal(queryMatchesTitle('Panasonic Lamdash Pro 6 ES-LS9A-K','Panasonic ARC6 Electric Razor ES-LS9A-K (Black)','ES-LS9A-K'),true);
 assert.equal(queryMatchesTitle('Panasonic Lamdash Pro 6 ES-LS9A-K','Panasonic ARC6 Electric Razor ES-LS8A-K (Black)','ES-LS9A-K'),false);
});
test('unheaded delivery options cannot replace the primary item price',()=>{
 const page={format:'markdown' as const,title:'Philips HX9911/84 - Internet Explorer 11 is no longer supported',content:'# Philips HX9911/84\nGBP 360.99\nFREE standard delivery\nClick & Collect delivery options\nStandard delivery\nGBP 3.99\nExpected delivery 3-5 days\nFrom GBP 5.99 per week'};
 const row=inspectMarkdownProduct(page,'https://merchant.example.com/hx9911','SG','global').listings[0];
 assert.equal(row.price,360.99);assert.equal(row.priceQuote?.kind,'exact');
});
test('a known domestic yuan storefront is distinct from an ambiguous yen symbol',()=>{
 const page={format:'markdown' as const,title:'Joyoung DJ13E-Q7',content:'# Joyoung DJ13E-Q7\n价格：\n¥2397.00'};
 const row=inspectMarkdownProduct(page,'https://www.colipu.com/item-123.html','SG','global').listings[0];
 assert.equal(row.price,2397);assert.equal(row.currency,'CNY');
 assert.deepEqual(inspectMarkdownProduct(page,'https://merchant.example.com/item-123','SG','global').listings,[]);
});
test('additional warranty fees are not a product price range',()=>{
 const page={format:'markdown' as const,title:'Apple iPhone 16 256GB',content:'# Apple iPhone 16 256GB\nEasy Payment Plans Starting from BHD 35.999/month\n### Warranty\n+ BHD 43.199\n+ BHD 64.799\nStores Availability\nBHD 431.992\nInclusive of VAT\nAdd to cart'};
 const row=inspectMarkdownProduct(page,'https://merchant.example.com/iphone-16','SG','global').listings[0];assert.equal(row.price,431.992);assert.equal(row.priceQuote?.kind,'exact');
});

test('camera filters and add-on lenses cannot masquerade as the camera',()=>{
 for(const accessory of ['Magnetic ND Filters Set','Wide-Angle Lens','CPL Filter','滤镜']){
  assert.equal(queryMatchesTitle('DJI Osmo Pocket 3','DJI Osmo Pocket 3 '+accessory),false,accessory);
 }
 for(const accessory of ['Magnetic ND Filters Set','Wide-Angle Lens']){
  assert.equal(queryMatchesTitle('DJI Osmo Pocket 3 '+accessory,'DJI Osmo Pocket 3 '+accessory),true);
  assert.equal(queryMatchesTitle('DJI Osmo Pocket 3','DJI Osmo Pocket 3 with '+accessory),true);
 }
 assert.equal(queryMatchesTitle('DJI Osmo Pocket 3','DJI Osmo Pocket 3 Camera'),true);
});

test('a plus model suffix is a distinct device, while RAM plus storage is not',()=>{
 assert.equal(queryMatchesTitle('Roborock S8','Roborock S8+ Robot Vacuum'),false);
 assert.equal(queryMatchesTitle('Roborock S8','Roborock S8 + Robot Vacuum'),false);
 assert.equal(queryMatchesTitle('Roborock S8+','Roborock S8 Robot Vacuum'),false);
 assert.equal(queryMatchesTitle('Roborock S8+','Roborock S8 Plus Robot Vacuum'),true);
 assert.equal(queryMatchesTitle('Roborock S8','Roborock S8 Robot Vacuum'),true);
 assert.equal(queryMatchesTitle('小米14','Xiaomi 14 12+512GB White smartphone'),true);
});

test('a missing product price cannot become a related-item variant count',()=>{
 const page={format:'markdown' as const,title:'EC685.BK COFFEE MAKER',content:'# EC685.BK COFFEE MAKER\nSave 36%\nRecommended price\n## Product Specification\n### Recommendation\n- EC890.GR Silver1~~USD$466.44~~USD$0.0 /'};
 assert.deepEqual(inspectMarkdownProduct(page,'https://merchant.example.com/ec685','SG','global').listings,[]);
 const unheaded={...page,content:'# EC685.BK COFFEE MAKER\nAvailable colors Silver1USD$0.0 /'};
 assert.deepEqual(inspectMarkdownProduct(unheaded,'https://merchant.example.com/ec685','SG','global').listings,[]);
});
