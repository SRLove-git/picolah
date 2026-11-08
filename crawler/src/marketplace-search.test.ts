import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMarketplace } from './marketplace-search.ts';
import { discoverWebProducts } from './web-discovery.ts';
import { verifyProductPage } from './verify-product-page.ts';
import { MARKETS } from './markets.ts';

const shopee = 'https://shopee.sg/Sony-WF-1000XM5-i.101.202';
const lazada = 'https://www.lazada.sg/products/pdp-i101-s202.html';
const title = 'Sony WF-1000XM5 Wireless Earbuds';
const productUrl = 'https://www.lazada.sg/products/sony-earbuds-i101-s202.html';
const product = {'@type':'Product', name:title, url:productUrl, offers:{'@type':'Offer',url:productUrl,availability:'https://schema.org/InStock'}};
const state = {pagetype:'pdp', core:{country:'SG',currencyCode:'SGD'}, pdt_name:title, pdt_sku:101, pdt_simplesku:202, pdt_price:'$174.00'};
const html = (data:unknown, ld:unknown = product) => '<script>var pdpTrackingData = '+JSON.stringify(JSON.stringify(data))+';</script><script type="application/ld+json">'+JSON.stringify(ld)+'</script>';
const markdown = (primary:string) => ({format:'markdown' as const, title, content:'# '+title+'\n'+primary+'\n## Shop Vouchers\n$20 OFF\n## Shipping\nShipping fee $3.99'});
const opts = {market:'SG' as const, platforms:[], query:'Sony WF-1000XM5'};

test('each market searches its local platform product pages and retains Lazada SKU paths', async () => {
  for (const m of Object.values(MARKETS)) {
    for (const p of ['shopee', 'lazada'] as const) {
      const domain = m.domains[p]!.replace(/^www\./, '');
      const path = p === 'lazada' ? '/products/pdp-i101-s202.html' : '/product/101/202';
      const url = 'https://' + domain + path;
      const hits = await searchMarketplace(p, m.code, title, async (q,market) => {
        assert.equal(q,'site:'+domain+' '+title); assert.equal(market,m.code);
        return [url+'?priceCompare=old', url, 'https://www.example.com'+path, 'https://'+domain+'/search'].map(url=>({url,title}));
      });
      assert.deepEqual(hits,[{url,title}]);
    }
  }
});

test('local default search verifies both platform details even when broad search fails, and honors exclusions', async () => {
  const markets:string[] = [];
  async function search(q:string) {
    if (q.startsWith('site:shopee.sg ')) { markets.push('shopee'); return [{url:shopee,title}]; }
    if (q.startsWith('site:lazada.sg ')) { markets.push('lazada'); return [{url:lazada,title}]; }
    throw Error('general index unavailable');
  }
  const deps = {search, marketplaceSearch:searchMarketplace, fetchPage:async (url:string)=>url===lazada?html(state):markdown('$293.90\nAfter Voucher')};
  const local = await discoverWebProducts(opts,deps);
  assert.deepEqual(markets.sort(),['lazada','shopee']);
  assert.deepEqual(local.listings.map(row=>row.price).sort((a,b)=>a-b),[174,293.9]);
  assert.ok(local.listings.every(row=>row.verification?.source==='product-page'));
  markets.length=0;
  const only = await discoverWebProducts({...opts,excludedPlatforms:['shopee']},deps);
  assert.deepEqual(markets,['lazada']); assert.equal(only.listings.length,1);
  markets.length=0;
  await discoverWebProducts({...opts,geography:'global'},deps);
  assert.deepEqual(markets,[]);
});

test('Lazada page price requires matching item, SKU, country, currency, title and offer', async () => {
  for (const change of [{pdt_sku:99},{pdt_simplesku:303},{pdt_name:'Other model'},{pdt_price:''},{pdt_price:'$1 OFF'},{core:{country:'MY',currencyCode:'MYR'}}]) {
    await assert.rejects(verifyProductPage(lazada+'?priceCompare=0.01', opts,async()=>html({...state,...change})));
  }
  await assert.rejects(verifyProductPage(lazada,opts,async()=>html(state,{...product,offers:{...product.offers,price:'120'}})));
});
test('Shopee reads only a primary price and preserves the voucher condition', async () => {
  for (const primary of ['', '$20 OFF', 'Price $7 shipping']) {
    await assert.rejects(verifyProductPage(shopee,opts,async()=>markdown(primary)));
  }
  const [first] = await verifyProductPage(shopee,opts,async()=>markdown('$39.99\n$19.99'));
  assert.equal(first.price,39.99); assert.match(first.priceQuote?.note??'',/首个主报价/);
  const [range] = await verifyProductPage(shopee,opts,async()=>markdown('$29.99\n$35–$55'));
  assert.equal(range.price,29.99); assert.equal(range.priceQuote?.kind,'range'); assert.equal(range.priceQuote?.maxPrice,55);
  const [row] = await verifyProductPage(shopee,opts,async()=>markdown('$293.90\nAfter Voucher'));
  assert.equal(row.priceQuote?.note,'券后价'); assert.equal(row.priceQuote?.availability,'unknown');
});

test('Shopee device searches reject unselected variant token prices without blocking inexpensive goods', async () => {
  const canon='https://shopee.sg/Canon-EOS-R50-Mirrorless-Camera-i.40894980.22252976607';
  const galaxy='https://shopee.sg/Samsung-Galaxy-S24-Ultra-i.88314577.27471298706';
  assert.deepEqual(await verifyProductPage(canon, { ...opts, query:'Canon EOS R50', model:'Canon EOS R50' },
    async()=>({ ...markdown('$2'), title:'Canon EOS R50', content:'# Canon EOS R50\n$2' })), []);
  assert.deepEqual(await verifyProductPage(galaxy, { ...opts, query:'Samsung Galaxy S24 Ultra', model:'Samsung Galaxy S24 Ultra' },
    async()=>({ ...markdown('$2'), title:'Samsung Galaxy S24 Ultra', content:'# Samsung Galaxy S24 Ultra\n$2' })), []);
  const [unrestricted] = await verifyProductPage(shopee, opts, async()=>markdown('$2'));
  assert.equal(unrestricted.price,2);
});
