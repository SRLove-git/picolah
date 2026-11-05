import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverProduct } from './discovery.ts';
import type { WebSearchCandidate } from './brightdata/serp.ts';
import { queryMatchesListing, queryMatchesTitle } from './discovery-match.ts';

test('global product matching recognizes soymilk spellings without relaxing model or accessory constraints', () => {
  for (const title of ['Joyoung DJ06M Soymilk Maker', 'Joyoung Soybean Milk Machine', '九阳豆浆机 DJ06M']) {
    assert.equal(queryMatchesTitle('Joyoung soy milk maker', title), true, title);
  }
  assert.equal(queryMatchesTitle('Joyoung DJ06M soy milk maker', 'Joyoung DJ10U Soymilk Maker'), false);
  assert.equal(queryMatchesTitle('Joyoung soy milk maker', 'Joyoung Soymilk Maker replacement blade'), false);
});

const input = { scope: 'web' as const, market: 'SG' as const, platforms: [], query: 'Sony WF-1000XM6', model: 'WF-1000XM6' };
const candidate = (url: string): WebSearchCandidate => ({ url, title: 'Sony WF-1000XM6' });

test('global search accepts foreign merchants and currencies while retaining explicit exclusions', async () => {
  const urls = ['https://www.amazon.com/product/sony', 'https://www.shop.cn/sony', 'https://www.lazada.com.my/products/sony'];
  const visited: string[] = [];
  const result = await discoverProduct({ ...input, geography: 'global', excludedPlatforms: ['lazada'], maxPrice: 100 }, { web: {
    search: async () => urls.map(candidate),
    fetchPage: async (url) => {
      visited.push(url);
      return page(url, { offers: { '@type': 'Offer', price: 399, priceCurrency: url.includes('amazon') ? 'USD' : 'CNY', availability: 'InStock', url } });
    },
  } });
  assert.equal(result.geography, 'global');
  assert.deepEqual(visited, urls.slice(0, 2));
  assert.deepEqual(result.listings.map((item) => item.currency), ['USD', 'CNY']);
  assert.equal(result.listings.length, 2, 'foreign amounts cannot be compared numerically to a SGD budget');
});

test('global detail verification still rejects unknown currencies and invalid precision', async () => {
  const result = await discoverProduct({ ...input, geography: 'global' }, { web: {
    search: async () => ['https://a.example.com/product', 'https://b.example.com/product'].map(candidate),
    fetchPage: async (url) => page(url, { offers: { '@type': 'Offer', price: '399.12', priceCurrency: url.includes('a.example') ? 'XYZ' : 'JPY', availability: 'InStock', url } }),
  } });
  assert.equal(result.listings.length, 0);
});

test('global pages accept current ISO expiry timestamps and reject expired ones', async () => {
  for (const expiry of ['2099-11-05T10:58:05.08', '2099-11-05T10:58:05Z', '2099-11-05T10:58:05+08:00', '2020-01-01T00:00:00Z', 'unknown']) {
    const result = await discoverProduct({ ...input, geography: 'global' }, { web: {
      search: async () => [candidate('https://shop.example.com/sony')],
      fetchPage: async (url) => page(url, { offers: { '@type': 'Offer', price: 199, priceCurrency: 'USD', availability: 'InStock', priceValidUntil: expiry, url } }),
    } });
    assert.equal(result.listings.length, expiry.startsWith('2099') ? 1 : 0, expiry);
  }
});
function page(url: string, override: Record<string, unknown> = {}): string {
  return `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Sony WF-1000XM6', url,
    offers: { '@type': 'Offer', price: '399', priceCurrency: 'SGD', availability: 'https://schema.org/InStock', url }, ...override })}</script>`;
}

test('web discovery verifies independent shops rather than only predefined platforms', async () => {
  const urls = ['https://store.sony.com.sg/products/wf-1000xm6', 'https://www.bestdenki.com.sg/sony-wf1000xm6'];
  const result = await discoverProduct(input, { web: { search: async () => urls.map(candidate), fetchPage: async (url) => page(url) } });
  assert.equal(result.scope, 'web');
  assert.deepEqual(result.platforms, []);
  assert.deepEqual(result.listings.map((item) => item.platform === 'web' && item.sourceHost), ['store.sony.com.sg', 'bestdenki.com.sg']);
  assert.deepEqual(result.summary, { requests: 3, matched: 2, skipped: 0, failed: 0,
    discovered: 2, pagesChecked: 2, pagesVerified: 2 });
});

test('web discovery has a hard page budget, three workers and host diversity', async () => {
  const urls = Array.from({ length: 12 }, (_, n) => `https://shop${Math.floor(n / 3)}.example.com/products/${n}`);
  const visited: string[] = [];
  let active = 0; let peak = 0;
  const result = await discoverProduct(input, { web: { search: async () => urls.map(candidate), fetchPage: async (url) => {
    visited.push(url); peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--; return page(url);
  } } });
  assert.equal(peak, 3); assert.equal(visited.length, 8); assert.equal(result.summary.requests, 9);
  assert.equal(new Set(visited.slice(0, 4).map((url) => new URL(url).hostname)).size, 4);
  assert.equal(result.listings.length, 8);
});

test('an idle worker verifies discovered links without waiting for unrelated slow pages', async () => {
  const urls = Array.from({length:8},(_,i)=>`https://shop${i}.example.com/item`);
  const child = 'https://shop1.example.com/products/wf-1000xm6';
  let release!:()=>void;
  const slow = new Promise<void>(resolve=>{release=resolve;});
  let slowFinished=false, pipelined=false, active=0, peak=0;
  const visited:string[]=[];
  // Release even on a regression so the test fails rather than deadlocking.
  const guard=setTimeout(release,300);
  try {
    const result=await discoverProduct(input,{web:{search:async()=>urls.map(candidate),fetchPage:async url=>{
      visited.push(url);peak=Math.max(peak,++active);
      await Promise.resolve();
      try {
        if(url===urls[0]) {await slow;slowFinished=true;}
        if(url===child) {pipelined=!slowFinished;release();}
        if(url===urls[1]) return `<a href="${child}">Sony WF-1000XM6</a>`;
        return page(url);
      } finally {active--;}
    }}});
    assert.ok(pipelined,'linked product must start while the unrelated initial page is still waiting');
    assert.equal(peak,3);assert.equal(visited.length,8);assert.equal(new Set(visited).size,8);
    assert.equal(visited.filter(url=>new URL(url).hostname==='shop1.example.com').length,2);
    assert.ok(result.listings.some(offer=>offer.url===child));
  } finally {clearTimeout(guard);release();}
});

test('classified provider failures survive the public summary without upstream messages', async () => {
  for(const code of ['WEB_PAGE_PAYMENT_REQUIRED','WEB_PAGE_POLICY_REJECTED','WEB_PAGE_RATE_LIMITED','WEB_PAGE_PROVIDER_ERROR']) {
    const result=await discoverProduct(input,{web:{search:async()=>[candidate('https://shop.example.com/product')],
      fetchPage:async()=>{throw Object.assign(Error('secret upstream response'),{code});}}});
    assert.deepEqual(result.summary.failureCodes,[code]);assert.equal(result.summary.failed,1);
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
});

test('slow directories retain their reserved link slots ahead of ordinary trailing candidates', async () => {
  const urls=Array.from({length:8},(_,i)=>`https://shop${i}.example.com/item`);
  const child='https://shop0.example.com/products/wf-1000xm6';
  let release!:()=>void;
  const ready=new Promise<void>(resolve=>{release=resolve;});
  const visited:string[]=[];
  await discoverProduct(input,{web:{search:async()=>urls.map(candidate),fetchPage:async url=>{
    visited.push(url);
    if(url===urls[0]) {await ready;await new Promise(resolve=>setTimeout(resolve,10));return `<a href="${child}">Sony WF-1000XM6</a>`;}
    if(url===urls[5]) release();
    return page(url);
  }}});
  assert.ok(visited.includes(child),'slow directory must not lose its product link to trailing search results');
  assert.ok(visited.indexOf(child)<visited.indexOf(urls[6]));
  assert.equal(visited.length,8);assert.ok(!visited.includes(urls[7]));
});

test('unsafe, excluded, foreign-market and duplicate links are skipped before page fetch', async () => {
  const good = 'https://store.sony.com.sg/products/wf-1000xm6';
  const urls = ['https://127.0.0.1/product', 'https://localhost/product', 'https://shop.lan/product',
    'https://www.lazada.sg/products/one', 'https://www.lazada.com.my/products/one',
    'https://www.amazon.com/product', 'https://shopee.com.my/product', `${good}?token=secret`, good, `${good}#same`];
  const visited: string[] = [];
  const result = await discoverProduct({ ...input, excludedPlatforms: ['lazada'] }, { web: {
    search: async () => urls.map(candidate), fetchPage: async (url) => { visited.push(url); return page(url); },
  } });
  assert.deepEqual(visited, [good]); assert.equal(result.listings.length, 1);
  assert.deepEqual(result.excludedPlatforms, ['lazada']);
});

test('wrong models, accessories, wrong currency, stock and budget never become offers', async () => {
  const variants = [
    { name: 'Sony WH-1000XM6' }, { name: 'Sony WF-1000XM6 case' },
    { offers: { '@type': 'Offer', price: 100, priceCurrency: 'USD', availability: 'InStock' } },
    { offers: { '@type': 'Offer', price: 100, priceCurrency: 'SGD', availability: 'OutOfStock' } },
    {},
  ];
  let n = 0;
  const result = await discoverProduct({ ...input, maxPrice: 300 }, { web: {
    search: async () => variants.map((_, i) => candidate(`https://store${i}.example.com/product`)),
    fetchPage: async (url) => page(url, variants[n++]),
  } });
  assert.equal(result.listings.length, 0); assert.equal(result.summary.skipped, 3); assert.equal(result.summary.failed, 2);
  assert.deepEqual(result.summary.failureCodes, ['PRODUCT_PAGE_UNVERIFIED']);
});

test('missing SERP configuration fails explicitly without a fallback to Lazada', async () => {
  let fetched = false;
  const result = await discoverProduct(input, { search: async () => { throw new Error('must not use adapters'); }, web: {
    search: async () => { throw Object.assign(new Error('private provider message'), { code: 'SERP_NOT_CONFIGURED' }); },
    fetchPage: async () => { fetched = true; return ''; },
  } });
  assert.equal(fetched, false); assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.summary.failureCodes, ['SERP_NOT_CONFIGURED']);
  assert.equal(JSON.stringify(result).includes('private provider'), false);
});

test('one page failure keeps other verified sources and sanitizes failure codes', async () => {
  const result = await discoverProduct(input, { web: {
    search: async () => ['https://a.example.com/product', 'https://b.example.com/product'].map(candidate),
    fetchPage: async (url) => {
      if (url.includes('a.example')) throw Object.assign(new Error('secret'), { code: 'TOKEN_VALUE_SHOULD_NOT_LEAK' });
      return page(url);
    },
  } });
  assert.equal(result.listings.length, 1); assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.summary.failureCodes, ['SOURCE_REQUEST_FAILED']);
});

test('an empty completed search is distinct from a failed search', async () => {
  const result = await discoverProduct(input, { web: { search: async () => [] } });
  assert.deepEqual(result.summary, { requests: 1, matched: 0, skipped: 0, failed: 0,
    discovered: 0, pagesChecked: 0, pagesVerified: 0 });
});

test('brand directory links lead to verified product prices, never directory prices', async () => {
  const directory = 'https://shop.example.sg/joyoung';
  const product = 'https://shop.example.sg/products/joyoung-dj03e';
  const visited: string[] = [];
  const title = 'Joyoung DJ03E-A1soloE 300ml Soy Milk Maker';
  const result = await discoverProduct({ scope: 'web', market: 'SG', platforms: [], query: 'Joyoung soy milk maker' }, { web: {
    search: async () => [{ url: directory, title: 'Joyoung appliances' }],
    fetchPage: async (url) => {
      visited.push(url);
      if (url === directory) return `<a href="/products/joyoung-dj03e?utm_source=category"><b>${title}</b></a><span>$1.00</span>`;
      return page(url, { name: title, offers: { '@type': 'Offer', price: '106.89', priceCurrency: 'SGD', availability: 'InStock', url } });
    },
  } });
  assert.deepEqual(visited, [directory, product]);
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].price, 106.89);
  assert.equal(result.listings[0].verification?.source, 'product-page');
  assert.equal(result.summary.pagesChecked, 2);
  assert.equal(result.summary.pagesVerified, 1);
});

test('linked pages obey identity, same-origin, one-hop and two-pages-per-host limits', async () => {
  const directory = 'https://shop.example.sg/sony';
  const product = 'https://shop.example.sg/products/wf-1000xm6';
  const visited: string[] = [];
  const link = (url: string, title = 'Sony WF-1000XM6') => `<a href="${url}">${title}</a>`;
  const result = await discoverProduct(input, { web: {
    search: async () => [candidate(directory)],
    fetchPage: async (url) => {
      visited.push(url);
      if (url === product) return link('/products/third-hop') + '<span>$1</span>';
      return [link('https://127.0.0.1/product'), link('https://other.example.sg/product'),
        link(directory), link('/products/case', 'Sony WF-1000XM6 case'), link('/products/wrong', 'Sony WH-1000XM6'),
        link('/blog/sony'), link('/products/token?token=private'), link(product), link(product + '#duplicate'),
        link('/products/another')].join('');
    },
  } });
  assert.deepEqual(visited, [directory, product]);
  assert.equal(result.listings.length, 0);
});

test('local directories and their product links take priority without exceeding eight requests', async () => {
  const directory = 'https://shop.example.sg/sony';
  const product = 'https://shop.example.sg/products/wf-1000xm6';
  const visited: string[] = [];
  const urls = [...Array.from({ length: 10 }, (_, i) => `https://shop${i}.example.com/item`), directory];
  const result = await discoverProduct(input, { web: {
    search: async () => urls.map(candidate),
    fetchPage: async (url) => {
      visited.push(url);
      if (url === directory) return `<a href="${product}">Sony WF-1000XM6</a>`;
      return page(url);
    },
  } });
  assert.equal(visited[0], directory);
  assert.ok(visited.includes(product));
  assert.equal(visited.length, 8);
  assert.equal(result.summary.requests, 9);
});

test('failed exact global searches retry other hosts once, preserving identity and a twelve-page cap', async () => {
  const queries: string[] = [], visited: string[] = [];
  const result = await discoverProduct({ ...input, geography: 'global' }, { web: {
    search: async (query) => { queries.push(query); return Array.from({ length: 12 }, (_, i) => candidate(`https://shop${i + (queries.length === 1 ? 0 : 20)}.example.com/product`)); },
    fetchPage: async (url) => { visited.push(url); return url.includes('shop20.') ? page(url, { offers: { '@type': 'Offer', price: 100, priceCurrency: 'USD', availability: 'InStock', url } }) : '<html>No verifiable price</html>'; },
  } });
  assert.equal(queries.length, 2); assert.match(queries[1], /-site:shop0\.example\.com/);
  assert.equal(visited.length, 12); assert.equal(new Set(visited).size, 12);
  assert.equal(result.query, input.query); assert.equal(result.model, input.model);
  assert.equal(result.listings.length, 1); assert.equal(result.listings[0].currency, 'USD');
});

test('manufacturer details and structured variant links outrank generic related products', async () => {
  const visited: string[] = [];
  const maker = 'https://electronics.sony.com/product/whch720n-w';
  const result = await discoverProduct({ scope: 'web', geography: 'global', market: 'SG', platforms: [], query: 'Sony WH-CH720N', model: 'WH-CH720N' }, { web: {
    search: async () => [...Array.from({ length: 12 }, (_, i) => ({url:`https://shop${i}.example.com/whch720n`,title:'Sony WH-CH720N'})), {url:maker,title:'Sony WH-CH720N White'}],
    fetchPage: async (url) => { visited.push(url); return page(url, { name:'Sony WH-CH720N',offers:{'@type':'Offer',price:89.99,priceCurrency:'USD',availability:'InStock',url} }); },
  } });
  assert.equal(visited[0], maker); assert.ok(result.listings.length);
});

test('Amazon ASIN links remove old locale referrals and deduplicate before the request budget', async () => {
  const visited: string[] = [];
  await discoverProduct({ ...input, geography: 'global' }, { web: {
    search: async () => [candidate('https://www.amazon.com/-/zh_TW/sony/dp/B0BS1QCFHX/ref=old?language=zh_TW'), candidate('https://www.amazon.com/dp/B0BS1QCFHX?ref=other')],
    fetchPage: async (url) => { visited.push(url); return ''; },
  } });
  assert.deepEqual(visited,['https://www.amazon.com/dp/B0BS1QCFHX']);
});

test('short named phones match the requested generation and honor separately supplied brands', () => {
  for (const query of ['小米17', 'Xiaomi 17']) {
    for (const title of ['小米17 256GB', 'Xiaomi 17 12GB RAM 512GB', 'Xiaomi17 5G']) {
      assert.equal(queryMatchesTitle(query, title), true, title);
    }
    for (const title of ['Xiaomi 17T', 'Xiaomi Redmi Note 17', 'Xiaomi 17 Pro', 'Xiaomi 17 Ultra',
      'Xiaomi 17 / Xiaomi 16', 'Xiaomi 17 128/256GB', 'Xiaomi 17 case', 'Xiaomi 17 refurbished']) {
      assert.equal(queryMatchesTitle(query, title), false, title);
    }
  }
  const listing = { platform: 'web' as const, sourceHost: 'shop.example.com', market: 'SG' as const,
    itemId: '17', title: '17', productDetails: { brand: 'Xiaomi' },
    url: 'https://shop.example.com/product/17', price: 899, currency: 'EUR', inStock: true };
  assert.equal(queryMatchesListing('Xiaomi 17', listing, 'SG', 'web', undefined, 'global'), true);
  assert.equal(queryMatchesListing('Xiaomi 17', { ...listing, title: '17T' }, 'SG', 'web', undefined, 'global'), false);
  assert.equal(queryMatchesListing('Xiaomi 17', { ...listing, productDetails: { brand: 'Xiaomi', model: 'Xiaomi 17 - Pre-Order Bundle' } }, 'SG', 'web', undefined, 'global'), false);
  assert.equal(queryMatchesListing('Xiaomi 17', { ...listing, productDetails: { brand: 'Samsung' } }, 'SG', 'web', undefined, 'global'), false);
});

test('short global names prioritize product pages over launch articles without a model-code hint', async () => {
  const merchant = 'https://shop.example.com/product/xiaomi-17';
  const visited: string[] = [], queries: string[] = [];
  const result = await discoverProduct({ scope: 'web', geography: 'global', market: 'SG', platforms: [], query: 'Xiaomi 17' }, { web: {
    search: async (query) => { queries.push(query); return [
      ...Array.from({ length: 10 }, (_, i) => ({ url: `https://news${i}.example.com/2026/02/28/xiaomi-17`, title: 'Xiaomi 17 launch price and review' })),
      { url: 'https://mixed.example.com/product/phones', title: 'Xiaomi 17 / Xiaomi 17 Pro' },
      { url: merchant, title: 'Xiaomi 17 512GB - customer reviews' },
    ]; },
    fetchPage: async (url) => { visited.push(url); return page(url, { name: url === merchant ? '17' : 'Xiaomi 17 / Xiaomi 17 Pro', brand: 'Xiaomi' }); },
  } });
  assert.equal(visited[0], merchant);
  assert.equal(visited.some(url => url.includes('news')), false);
  assert.equal(queries.length, 1); assert.match(queries[0], /in stock online store/);
  assert.equal(result.query, 'Xiaomi 17'); assert.equal(result.model, undefined);
  assert.equal(result.listings.length, 1); assert.equal(result.listings[0].verification?.source, 'product-page');
});

test('short global products retry once even when only one initial merchant is usable', async () => {
  const visited: string[] = [], queries: string[] = [];
  const result = await discoverProduct({ scope: 'web', geography: 'global', market: 'SG', platforms: [], query: 'Xiaomi 17' }, { web: {
    search: async (query) => { queries.push(query); return [{ url: `https://shop${queries.length}.example.com/product/xiaomi-17`, title: 'Xiaomi 17' }]; },
    fetchPage: async (url) => { visited.push(url); return page(url, { name: 'Xiaomi 17', offers: {
      '@type': 'Offer', price: 899, priceCurrency: 'EUR', availability: url.includes('shop1.') ? 'BackOrder' : 'InStock', url,
    } }); },
  } });
  assert.equal(queries.length, 2); assert.match(queries[1], /-site:shop1.example.com/);
  assert.equal(visited.length, 2); assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].currency, 'EUR'); assert.match(result.listings[0].url, /shop2/);
});

test('a conflicting page stays excluded while other verified sources survive with an explicit failure code', async () => {
  const result = await discoverProduct({ ...input, geography: 'global' }, { web: {
    search: async () => [candidate('https://conflict.example.com/product'), candidate('https://good.example.com/product')],
    fetchPage: async url => {
      if (url.includes('conflict.')) throw Object.assign(new Error('private evidence'), { code: 'PRODUCT_PAGE_PRICE_CONFLICT' });
      return page(url);
    },
  } });
  assert.equal(result.listings.length, 1); assert.match(result.listings[0].url, /good/);
  assert.deepEqual(result.summary.failureCodes, ['PRODUCT_PAGE_PRICE_CONFLICT']);
  assert.equal(JSON.stringify(result).includes('private evidence'), false);
});

test('product-shaped editorial, refurbished and unresolved URLs do not crowd out direct merchants', async () => {
  const visited:string[]=[];
  const merchant='https://merchant.example.com/mobile-phones/xiaomi-14-black.html';
  const candidates=[
    ...Array.from({length:5},(_,i)=>({url:`https://compare${i}.example.com/product/xiaomi-14`,title:'Xiaomi 14 - Price History, Comparison & Alerts'})),
    {url:'https://review.example.com/product/xiaomi-14',title:'Xiaomi 14 review, price & specs'},
    {url:'https://used.example.com/p/xiaomi-14',title:'Xiaomi 14 512GB – refurbed'},
    {url:'https://bad.example.com/product/undefined/',title:'Xiaomi 14'},
    {url:'https://bad.example.com/product/%6eull/',title:'Xiaomi 14'},
    {url:'https://wrong.example.com/product/xiaomi-14-pro',title:'Xiaomi 14 Pro'},
    ...Array.from({length:8},(_,i)=>({url:`https://market${i}.example.com/dp/B012345678`,title:'Xiaomi 14'})),
    {url:merchant,title:'Xiaomi 14 12GB 512GB Black - customer reviews'},
  ];
  const result=await discoverProduct({scope:'web',geography:'global',market:'SG',platforms:[],query:'Xiaomi 14'},{web:{
    search:async()=>candidates,fetchPage:async url=>{visited.push(url);return page(url,{name:'Xiaomi 14'});},
  }});
  assert.equal(visited[0],merchant);assert.equal(visited.length,8);assert.equal(result.listings.length,8);
  assert.ok(!visited.some(url=>/compare|review\.|used\.|bad\.|wrong\./.test(url)));
});

test('same-model links never spend the reserved budget on directories or unresolved template URLs', async () => {
  const source='https://shop.example.com/xiaomi-14';
  const target='https://shop.example.com/collections/phones/products/xiaomi-14-black';
  const visited:string[]=[];
  await discoverProduct({scope:'web',market:'SG',platforms:[],query:'Xiaomi 14'},{web:{
    search:async()=>[{url:source,title:'Xiaomi 14'}],fetchPage:async url=>{
      visited.push(url);if(url!==source)return page(url,{name:'Xiaomi 14'});
      return ['/product/undefined/','/product/null/','/collections/xiaomi-14','/category/xiaomi-14','/',target]
        .map(href=>`<a href="${href}">Xiaomi 14</a>`).join('');
    },
  }});
  assert.deepEqual(visited,[source,target]);
});
