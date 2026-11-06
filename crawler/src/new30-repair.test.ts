import test from 'node:test';
import assert from 'node:assert/strict';
import {queryMatchesTitle} from './discovery-match.ts';
import {parseWebProduct} from './platforms/web-product.ts';
import {inspectMarkdownProduct} from './platforms/markdown-product.ts';
import {readProductPage} from './product-page-reader.ts';
const url='https://merchant.example.com/product/item';
const html=(name:string,price=9999,extra='')=>'<h1>'+name+'</h1><script type="application/ld+json">'+JSON.stringify({'@type':'Product',name,offers:{'@type':'Offer',price,priceCurrency:'HKD',availability:'InStock'}})+'</script>'+extra;
const md=(name:string,content:string)=>({format:'markdown' as const,title:name,content:'# '+name+'\n'+content});
test('product names, brands and capacities are not forced into synthetic codes',()=>{
 assert.equal(queryMatchesTitle('LEGO 10328','LEGO Botanicals Bouquet of Roses 10328'),true);
 assert.equal(queryMatchesTitle('LEGO 10328','LEGO Botanicals Bouquet of Roses 10313'),false);
 assert.equal(queryMatchesTitle('Braun Series 9 Pro 9465cc','Braun Series 9 Pro Electric Shaver 9465cc'),true);
 assert.equal(queryMatchesTitle('CeraVe Moisturising Cream 454g','CeraVe Moisturising Cream 454g'),true);
 assert.equal(queryMatchesTitle('CeraVe Moisturising Cream 454g','Cetaphil Moisturising Cream 454g'),false);
});
test('translated brands and accents retain model and capacity constraints',()=>{
 assert.equal(queryMatchesTitle('荣耀 Magic6 Pro 512GB','Honor Magic6 Pro 512GB Smartphone'),true);
 assert.equal(queryMatchesTitle('荣耀 Magic6 Pro 512GB','Honor Magic6 Pro 256GB Smartphone'),false);
 assert.equal(queryMatchesTitle('Philips AC1715/30','飛利浦 AC1715/30 空氣清新機'),true);
 assert.equal(queryMatchesTitle('Estee Lauder Advanced Night Repair 50ml','Estée Lauder Advanced Night Repair 50ml'),true);
 assert.equal(queryMatchesTitle('Estee Lauder Advanced Night Repair 50ml','Estée Lauder Advanced Night Repair 100ml'),false);
});
test('skincare benefits do not admit device repair kits',()=>{
 assert.equal(queryMatchesTitle('CeraVe Skin Repair Cream 454g','CeraVe Skin Repair Cream 454g'),true);
 assert.equal(queryMatchesTitle('Xiaomi 14','Xiaomi 14 Screen Repair Kit'),false);
 assert.equal(queryMatchesTitle('iPhone 16','iPhone 16 Skin Repair Cream Kit'),false);
});
test('air purifier categories and currency tags are not model conflicts',()=>{
 assert.equal(queryMatchesTitle('Philips AC1715/30','Philips 1000i Series Air Purifier (AC1715/30) - USD 179.00'),true);
 assert.equal(queryMatchesTitle('Philips AC1715/30','Philips 1000i Series Air Purifier (AC1715/10)'),false);
 assert.equal(queryMatchesTitle('iPad 11','iPad Air 11'),false);
});
test('named editions remain distinct in both directions',()=>{
 for(const [base,other] of [['Instant Pot Duo 6L','Instant Pot Duo Crisp Air Fryer 6L'],['Instant Pot Duo 6L','Instant Pot Duo Easy 8-in-1 6L'],['Owala FreeSip 24oz','Owala FreeSip Twist 24oz'],['Razer DeathAdder V3','Razer DeathAdder V3 HyperSpeed']]){
  assert.equal(queryMatchesTitle(base,other),false);
  assert.equal(queryMatchesTitle(other,base),false);
  assert.equal(queryMatchesTitle(other,other),true);
 }
});
test('a documented CPU contradiction cannot become an XPS 9340 quote',()=>{
 assert.equal(queryMatchesTitle('Dell XPS 13 9340','Dell XPS 13 9340 i7-1355U 16GB 256GB'),false);
 assert.equal(queryMatchesTitle('Dell XPS 13 9340','Dell XPS 13 9340 Core Ultra 7 155H 16GB 512GB SSD'),true);
 assert.equal(queryMatchesTitle('Dell XPS 13 9315','Dell XPS 13 9315 i7-1250U 16GB 512GB SSD'),true);
});
const cashback='This store is a CASHBACK Store, and all product and service information inside the store is for reference only. Complete your order on the other merchant website.';
test('cashback redirect storefronts cannot override visible prices with placeholder structured data',async()=>{
 const content=md('Beats Studio Pro','Reference Price HKD 2799\n'+cashback);
 assert.deepEqual(parseWebProduct(html('Beats Studio Pro',9999,cashback),url,'SG','global'),[]);
 assert.deepEqual(inspectMarkdownProduct(content,url,'SG','global').listings,[]);
 const result=await readProductPage(url,'SG',{provider:'deepseek',fallback:true,geography:'global',fetchHtml:async()=>html('Beats Studio Pro'),fetchMarkdown:async()=>content});
 assert.deepEqual(result,content);
 // An ordinary store offering cashback rewards, or a genuinely expensive item,
 // still has a valid product price.
 assert.equal(parseWebProduct(html('Camera',9999,'Earn cashback rewards on this purchase'),url,'SG','global')[0].price,9999);
});
test('custom bulk quote totals are not single-unit retail prices',()=>{
 const text='Availability changes daily - Add to Quote to check inventory. Quantity 24 72 144. Screen Print or Laser 39.99 37.99 35.99. Setup charges and shipping not included. Add to Quote for complete pricing.';
 assert.deepEqual(parseWebProduct(html('Owala FreeSip 24oz',959.76,text),url,'SG','global'),[]);
 assert.deepEqual(inspectMarkdownProduct(md('Owala FreeSip 24oz','USD 959.76 - 5182.56\n'+text),url,'SG','global').listings,[]);
 assert.equal(parseWebProduct(html('Owala FreeSip 24oz',29.99,'Add to cart'),url,'SG','global')[0].price,29.99);
});
test('fresh visible used-product ranges override stale Fetch and carry condition',async()=>{
 const name='Insta360 X4';
 const current='<h1>'+name+'</h1><p>19 available used from £234 - £279.</p><h2>You might also like</h2><p>Insta360 X3 from £133</p><script type="application/ld+json">'+JSON.stringify({'@type':'Product',name,offers:{'@type':'AggregateOffer',url:'https://merchant.example.com/model',lowPrice:234,highPrice:279,priceCurrency:'GBP'}})+'</script>';
 const page=md(name,'22 available used from £229 - £279.');
 const row=parseWebProduct(current,url,'SG','global')[0];
 assert.equal(row.price,234);assert.equal(row.priceQuote?.maxPrice,279);assert.equal(row.priceQuote?.condition,'used');assert.equal(row.priceQuote?.source,'html');
 assert.equal(await readProductPage(url,'SG',{provider:'deepseek',fallback:true,geography:'global',fetchHtml:async()=>current,fetchMarkdown:async()=>page}),current);
 assert.deepEqual(parseWebProduct(current.replace('<h1>Insta360 X4</h1>','<h1>Insta360 X3</h1>'),url,'SG','global'),[]);
 const fallback=inspectMarkdownProduct(page,url,'SG','global').listings[0];assert.equal(fallback.priceQuote?.condition,'used');assert.equal(fallback.priceQuote?.maxPrice,279);
});

test('fashion aggregator prices require verification on the actual retailer page',()=>{
 const page='https://www.goxip.com/sg/en/designers/estee-lauder/serum-50ml';
 assert.deepEqual(parseWebProduct(html('Estee Lauder Advanced Night Repair 50ml',89),page,'SG','global'),[]);
 assert.deepEqual(inspectMarkdownProduct(md('Estee Lauder Advanced Night Repair 50ml','USD 89'),page,'SG','global').listings,[]);
});

test('Amazon UK binds subtitle model and price to the selected new buy box',()=>{
 const page='https://www.amazon.co.uk/gp/aw/d/B09JGD91TS/';
 const price=(amount:number)=>'<div id="corePriceDisplay_desktop_feature_div" data-csa-c-asin="B09JGD91TS"><span class="priceToPay"><span class="a-price-symbol">£</span><span class="a-price-whole">'+amount+'.</span><span class="a-price-fraction">44</span></span></div>';
 const primary='<div id="title_feature_div"><h1><span id="productTitle">Philips Air Purifier 1000i Series</span></h1><div class="dp-title-differentiators">Air purifier with sleep mode (AC1715/30)</div></div>';
 const content='<link rel="canonical" href="https://www.amazon.co.uk/dp/B09JGD91TS">'+primary+'<div id="newAccordionRow_0" class="a-accordion-active"><input id="ASIN" value="B09JGD91TS"><div id="availability">In stock</div><input id="add-to-cart-button">'+price(198)+'</div><div id="usedAccordionRow">'+price(114)+'</div>';
 const parse=(s=content)=>parseWebProduct(s,page,'SG','global');const row=parse()[0];
 assert.equal(row.currency,'GBP');assert.equal(row.price,198.44);assert.match(row.title,/AC1715\/30/);
 assert.equal(queryMatchesTitle('Philips AC1715/30',row.title),true);
 assert.deepEqual(parse(content.replaceAll('a-price-symbol">£','a-price-symbol">$')),[]);
 assert.deepEqual(parse(content+'<input name="currencyOfPreference" value="USD">'),[]);
 assert.deepEqual(parse(content.replace('data-csa-c-asin="B09JGD91TS"','data-csa-c-asin="B0OTHER123"')),[]);
 assert.deepEqual(parse(content.replace(price(198),'')),[]);
 assert.doesNotMatch(parse(content.replace('class="dp-title-differentiators"','class="unrelated"')+'<div class="dp-title-differentiators">AC1715/10</div>')[0].title,/AC1715/);
 const apex=content.replace(price(198),'<span class="apex-pricetopay-value"><span class="a-price-symbol">£</span><span class="a-price-whole">198.</span><span class="a-price-fraction">44</span></span>')+price(114)+price(114);
 assert.equal(parse(apex)[0].price,198.44);
 assert.deepEqual(parse(apex.replace('id="ASIN" value="B09JGD91TS"','id="ASIN" value="B0OTHER123"')),[]);
 assert.deepEqual(parseWebProduct(content,page,'SG'),[]);
});

test('Amazon Fetch primary title and subtitle survive informational H1 sections',()=>{
 const title='Philips Air Purifier 1000i Series for Allergens';const page='https://www.amazon.co.uk/gp/aw/d/B09JGD91TS/';
 const content={format:'markdown' as const,title,stockUnconfirmed:true,content:'# '+title+'\n\nRemoves germs with sleep mode (AC1715/30)\n\nAmazon Choice\n£198.44\n### Purchase options and add-ons\n# About this item\nRoom size 78m2\n# Related products\nPhilips AC1715/10 £99.00'};
 const row=inspectMarkdownProduct(content,page,'SG','global').listings[0];
 assert.equal(row.price,198.44);assert.match(row.title,/AC1715\/30/);assert.equal(row.inStock,false);
 assert.equal(queryMatchesTitle('Philips AC1715/30',row.title),true);
 const wrong=inspectMarkdownProduct({...content,content:content.content.replace('sleep mode (AC1715/30)','sleep mode (AC1715/10)')},page,'SG','global').listings[0];
 assert.equal(queryMatchesTitle('Philips AC1715/30',wrong.title),false);
 const absent=inspectMarkdownProduct({...content,content:content.content.replace('sleep mode (AC1715/30)','sleep mode')},page,'SG','global').listings[0];
 assert.equal(queryMatchesTitle('Philips AC1715/30',absent.title),false);
 assert.deepEqual(inspectMarkdownProduct({...content,content:content.content+'\n# '+title+'\n£1'},page,'SG','global').listings,[]);
 assert.deepEqual(inspectMarkdownProduct(content,'https://unrelated.example.com/dp/B09JGD91TS','SG','global').listings,[]);
});

test('missing Amazon HTML model may use corroborated Fetch subtitle, never a conflicting model',async()=>{
 const title='Philips Air Purifier 1000i Series for Allergens';const page='https://www.amazon.co.uk/dp/B09JGD91TS';
 const markdown=md(title,'Air purifier with sleep mode (AC1715/30)\n£198.44\n# About this item');
 const source=(name:string)=>'<h1>'+name+'</h1><script type="application/ld+json">'+JSON.stringify({'@type':'Product',name,offers:{'@type':'Offer',price:198.44,priceCurrency:'GBP',availability:'InStock'}})+'</script>';
 const options={provider:'deepseek' as const,fallback:true,geography:'global' as const,query:'Philips AC1715/30',model:'AC1715/30',fetchMarkdown:async()=>markdown};
 const current=source(title);assert.equal(typeof await readProductPage(page,'SG',{...options,fetchHtml:async()=>current}),'object');
 const conflict=source(title+' AC1715/10');assert.equal(await readProductPage(page,'SG',{...options,fetchHtml:async()=>conflict}),conflict);
});
