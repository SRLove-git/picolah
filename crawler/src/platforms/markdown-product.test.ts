import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMarkdownProduct, parseMarkdownProduct, linkedMarkdownProducts } from './markdown-product.ts';
import type { MarkdownPage } from '../deepseek/fetch.ts';
import { verifyProductPage } from '../verify-product-page.ts';
const url='https://shop.example.com/products/sony-whch720n';
const page:MarkdownPage={format:'markdown',title:'Sony WH-CH720N Black | Store',content:'# Sony WH-CH720N Black\n\nSale Price: USD 89.99\nOriginal Price ~~USD 179.99~~\nAvailability: In Stock\n## Reviews\nPrice: USD 1.00'};
const parse=(content=page.content)=>parseMarkdownProduct({...page,content},url,'SG','global');
test('Fetch product quotes use only primary current price, explicit currency and stock',async()=>{
 const result=parse();assert.equal(result.length,1);assert.equal(result[0].price,89.99);assert.equal(result[0].currency,'USD');assert.equal(result[0].shippingFee,undefined);
 assert.deepEqual(parseMarkdownProduct(page,url,'SG'),[]);
 const verified=await verifyProductPage(url,{market:'SG',geography:'global',query:'Sony WH-CH720N',model:'WH-CH720N'},async()=>page);
 assert.equal(verified[0].verification?.source,'product-page');
 assert.deepEqual(await verifyProductPage(url,{market:'SG',geography:'global',query:'Sony WH-CH730N',model:'WH-CH730N'},async()=>page),[]);
});
test('invalid currency, unrelated headings and reference-only prices remain excluded',()=>{
 for(const content of [
  page.content.replace('USD 89.99','$89.99'),page.content.replace('USD 89.99','XYZ 89.99'),page.content.replace('USD 89.99','JPY 89.99'),
  page.content.replace('Sale Price: USD 89.99','List Price: USD 89.99'),page.content.replace('# Sony WH-CH720N Black','# Sony WH-CH730N Black'),
  page.content+'\n# Another Product\nPrice: USD 1.00\nIn stock',
 ]) assert.deepEqual(parse(content),[],content);
 assert.deepEqual(parseMarkdownProduct(page,'https://shop.example.com/collections/headphones','SG','global'),[]);
});
test('directory links retain model and origin constraints and never become quotes',()=>{
 const directory:MarkdownPage={format:'markdown',title:'Headphones',content:'[Sony WH-CH720N Black](/products/sony-whch720n) $1.00\n[Sony WH-CH730N](/products/730n)\n[Sony WH-CH720N](https://other.example.com/product)\n[Sony WH-CH720N](/product?token=secret)'};
 assert.deepEqual(parseMarkdownProduct(directory,'https://shop.example.com/headphones','SG','global'),[]);
 assert.deepEqual(linkedMarkdownProducts(directory,'https://shop.example.com/headphones','Sony WH-CH720N','WH-CH720N').map(p=>p.url),[url]);
});

test('unresolved and directory Markdown links are removed before the two-per-host cap',()=>{
 const product='https://shop.example.com/collections/headphones/products/sony-whch720n';
 const content=['/product/undefined/','/product/%6eull/','/collections/headphones','/category/headphones','/blogs/products/sony-whch720n','/',product]
  .map(href=>`[Sony WH-CH720N](${href})`).join('\n');
 assert.deepEqual(linkedMarkdownProducts({...page,content},'https://shop.example.com/headphones','Sony WH-CH720N').map(p=>p.url),[product]);
});

test('localized standalone amounts, split labels and stock do not need a fixed Price USD layout',()=>{
 for(const [money,stock,price,currency] of [
  ['€ 837,00','Sofort verfügbar',837,'EUR'],['1.013,48 EUR','Auf Lager',1013.48,'EUR'],
  ['GBP 899.00','In Stock',899,'GBP'],['£899.00','In Stock',899,'GBP'],
  ['Price:\nS$ 106.89','Availability:\nin Stock',106.89,'SGD'],
  ['EUR 1 013,48','En stock',1013.48,'EUR'],['USD 1,013.48','In Stock',1013.48,'USD'],
 ] as const) {
  const rows=parse(`# Sony WH-CH720N Black\n${money}\n${stock}\n## Details\nUSD 1.00`);
  assert.equal(rows[0]?.price,price,money);assert.equal(rows[0]?.currency,currency,money);
 }
 assert.equal(parse('# Sony WH-CH720N Black\n€ 1.099,90 -Spare€ 262,90\n€ 837,00\nSofort verfügbar\n## Produktbeschreibung')[0]?.price,837);
 assert.deepEqual(parse('# Sony WH-CH720N Black\n€ 1.099,90 -Spare€ 262,90\n€ 100,00\nSofort verfügbar'),[]);
});

test('identical repeated headings and a matching H2 are one product, not different items',()=>{
 assert.equal(parse(page.content.replace('Sale Price:','# Sony WH-CH720N Black\nSale Price:')).length,1);
 assert.equal(parse(page.content.replace('# Sony','## Sony')).length,1);
 assert.deepEqual(parse(page.content.replace('Sale Price:','# Sony WH-CH730N Black\nSale Price:')),[]);
 assert.equal(parse(page.content+'\n# Sony WH-CH720N Black\nUSD 50.00\nIn Stock')[0]?.price,89.99);
});

test('public regular prices can be separated from explicit member-only prices without choosing the cheapest',()=>{
 const content='# Sony WH-CH720N Black\nFriends price:\n79.99 € Regular price: 99.99 €\nIn Stock';
 assert.equal(parse(content)[0]?.price,99.99);
 assert.deepEqual(parse(content.replace('Regular price: 99.99 €','')),[]);
 assert.deepEqual(parse(content.replace('Friends price:','Starting at')),[]);
 const bound=`Sony WH-CH720N Black ${url} InStock 99.99 EUR\n`;
 assert.equal(parse(bound+content.replace('In Stock',''))[0]?.price,99.99);
 assert.deepEqual(parse(bound.replace('99.99','89.99')+content),[]);
 assert.deepEqual(parse(bound.replace(url,'https://other.example.com/product')+content.replace('In Stock','')),[]);
});

test('ambiguous currency and unsupported money lines retain specific rejection reasons',()=>{
 assert.equal(parse('# Sony WH-CH720N Black\nCurrency: SGD\n$106.89\nIn Stock')[0]?.currency,'SGD');
 for(const content of ['Price: $106.89\nIn Stock','Currency: EUR\n$106.89\nIn Stock','EUR 1.013\nIn Stock',
  'EUR 12,34,56\nIn Stock','EUR 80.00\nUSD 70.00\nIn Stock','EUR 80.00\nEUR 90.00\nIn Stock']) {
  const result=inspectMarkdownProduct({...page,content:'# Sony WH-CH720N Black\n'+content},url,'SG','global');
  assert.deepEqual(result.listings,[]);assert.ok(result.reason);
 }
});
