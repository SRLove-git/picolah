import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MerchantLinks } from './merchant-links.ts';
import { discoverWebProducts } from './web-discovery.ts';
import { owalaSelectedOffer } from './embedded-product.ts';
import type { DiscoveryOptions } from './discovery.ts';

const input:DiscoveryOptions={scope:'web',platforms:[],market:'SG',query:'Samsung 990 PRO 1TB'};
const url='https://online.challenger.sg/products/samsung-990-pro-1tb';
const hit={url,title:'Samsung 990 PRO 1TB'};
const page=(price:number,title=hit.title)=>`<script type="application/ld+json">${JSON.stringify({
  '@type':'Product',name:title,url,offers:{'@type':'Offer',price,priceCurrency:'SGD',url,availability:'https://schema.org/InStock'}
})}</script>`;

test('merchant search finds a PDP after an empty general search; only the freshly read price is saved as a listing',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'merchant-links-'));
  const db=join(dir,'links.db');let links=new MerchantLinks(db);
  try {
    const first=await discoverWebProducts(input,{links,search:async()=>[],merchantSearch:async()=>[hit],fetchPage:async()=>page(415)});
    assert.equal(first.listings[0]?.price,415);
    links.close();links=new MerchantLinks(db);
    assert.deepEqual(links.find(input).map(row=>({...row})),[hit]);
    assert.deepEqual(links.find({...input,market:'MY'}),[]);
    assert.deepEqual(links.find({...input,geography:'global'}),[]);
    assert.deepEqual(links.find({...input,query:'Samsung 990 PRO 2TB'}),[]);
    const later=await discoverWebProducts(input,{links,search:async()=>{throw Error('provider unavailable')},fetchPage:async()=>page(425)});
    assert.equal(later.listings[0]?.price,425);
    const budget=await discoverWebProducts({...input,maxPrice:410},{links,search:async()=>[],fetchPage:async()=>page(425)});
    assert.deepEqual(budget.listings,[]);
    const changed=await discoverWebProducts(input,{links,search:async()=>[],fetchPage:async()=>page(120,'Samsung 990 PRO 2TB')});
    assert.deepEqual(changed.listings,[]);
    assert.deepEqual(links.find(input,Date.now()+31*86400_000),[]);
  }finally{links.close();rmSync(dir,{recursive:true,force:true})}
});

test('history is still subject to platform exclusions and does not retain unsafe URLs',async()=>{
  const links=new MerchantLinks(':memory:');
  try{
    const checkedAt=new Date().toISOString();
    links.remember(input,[{title:hit.title,url:'https://www.carousell.sg/p/example-123/',checkedAt},
      {title:hit.title,url:'https://outside.co.uk/product/example',checkedAt},{title:hit.title,url:url+'?token=private',checkedAt}]);
    assert.equal(links.find(input).length,1);
    // A saved page whose URL has since become unverified cannot produce a quote.
    const result=await discoverWebProducts(input,{links,search:async()=>[],fetchPage:async()=>''});
    assert.deepEqual(result.listings,[]);
    const excluded={url:'https://shopee.sg/product/1/2',title:hit.title,checkedAt};
    links.remember(input,[excluded]);
    const urls:string[]=[];
    await discoverWebProducts({...input,excludedPlatforms:['shopee']},{links,search:async()=>[],fetchPage:async url=>{urls.push(url);return ''}});
    assert.ok(!urls.includes(excluded.url));
  }finally{links.close()}
});

test('a Shopify SKU needs the matching cart control, displayed price, currency and unique active variant',()=>{
  const u=new URL('https://owalalife.sg/products/freesip?variant=42');
  const variant={id:42,sku:'test-24',title:'24oz / Grey',price:4799,available:true};
  const body=`<meta property="og:price:currency" content="SGD"><h1>FreeSip</h1><div class="main-product-price"><p class="price"><span>$47.99</span></p></div>
    <form action="/cart/add"><input name="id" value="42"></form><script type="application/json">${JSON.stringify([variant])}</script>`;
  assert.deepEqual(owalaSelectedOffer(body,u),{title:'Owala FreeSip - 24oz / Grey',sku:'test-24',price:47.99,available:true});
  for(const bad of [body.replace('$47.99','$39.99'),body.replace('value="42"','value="43"'),body.replace('"SGD"','"USD"'),body.replace('<h1>','<h1>Other</h1><h1>'),
    body.replace('4799','3999'),body.replace('FreeSip','FreeSip</h1><h1>Twist')])assert.equal(owalaSelectedOffer(bad,u),undefined);
});
