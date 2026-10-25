import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { lazadaSearchUrl, parseLazadaSearch, searchLazada } from './lazada.ts';
import { discoverProduct } from '../discovery.ts';
import { BrightDataError } from '../brightdata/web-unlocker.ts';

const CAPTURED_HTML = readFileSync(new URL('./fixtures/lazada-sg-search.html', import.meta.url), 'utf8');

const HTML = `
<!doctype html><html><head>
<script type="application/ld+json">
{"@type":"ItemList","itemListElement":[
  {"@type":"ListItem","item":{"@type":"Product","name":"SONY WH-1000XM5 / WH1000XM5 Headphones","url":"//www.lazada.sg/products/pdp-i111.html","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","ratingCount":681}}},
  {"@type":"ListItem","item":{"@type":"Product","name":"Sony | Active Noise Cancellation Headset","url":"//www.lazada.sg/products/pdp-i222.html"}}
]}
</script>
</head><body>
<div class="Bm3ON" data-qa-locator="product-item" data-item-id="111">
  <div class="RfADt"><a href="//www.lazada.sg/products/pdp-i111.html" title="SONY WH-1000XM5 / WH1000XM5 Headphones">SONY WH-1000XM5</a></div>
  <div class="aBrP0"><span class="ooOxS">S$499.00</span></div>
  <span class="oa6ri" title="Singapore">Singapore</span>
</div>
<div class="Bm3ON" data-qa-locator="product-item" data-item-id="222">
  <div class="RfADt"><a href="//www.lazada.sg/products/pdp-i222.html" title="Sony | Active Noise Cancellation Headset">Sony</a></div>
  <div class="aBrP0"><span class="ooOxS">S$549.00</span></div>
</div>
</body></html>`;

test('builds localized search urls', () => {
  assert.equal(lazadaSearchUrl('MY', 'sony wh-1000xm5'), 'https://www.lazada.com.my/catalog/?q=sony%20wh-1000xm5');
  assert.equal(lazadaSearchUrl('ID', 'x'), 'https://www.lazada.co.id/catalog/?q=x');
});

test('parses cards and joins JSON-LD rating data', () => {
  const listings = parseLazadaSearch(HTML, 'SG');
  assert.equal(listings.length, 2);
  const [first, second] = listings;
  assert.equal(first.itemId, '111');
  assert.equal(first.price, 499);
  assert.equal(first.rating, 4.9);
  assert.equal(first.reviews, 681);
  assert.equal(first.url, 'https://www.lazada.sg/products/pdp-i111.html');
  assert.equal(first.currency, 'SGD');
  assert.equal(second.price, 549);
  assert.equal(second.rating, undefined);
  assert.equal(second.url, 'https://www.lazada.sg/products/pdp-i222.html');
});

test('ignores cards without a price', () => {
  const html = '<div data-qa-locator="product-item" data-item-id="9"><div class="RfADt"><a href="/products/pdp-i9.html" title="No price">No price</a></div></div>';
  assert.deepEqual(parseLazadaSearch(html, 'SG'), []);
});

test('network search accepts parsed listings and explicit visible empty search results', async () => {
  const parsed = await searchLazada('SG', 'WF-1000XM6', { fetchHtml: async () => HTML });
  assert.equal(parsed.length, 2);
  const empty = await searchLazada('SG', 'WF-1000XM6', {
    fetchHtml: async () => '<html><body><main>No products found for WF-1000XM6</main></body></html>',
  });
  assert.deepEqual(empty, []);
});

test('HTTP-success challenge and unparseable pages are source failures, not empty searches', async () => {
  for (const html of [
    '<html><body>Please verify you are human</body></html>',
    '<html><body><div id="nc-container"></div><p>No products found</p></body></html>',
    '<html><body><div id="root"></div><script>window.app = "No products found";</script></body></html>',
    '<html><body><div class="new-product-layout">Sony WF-1000XM6 S$399</div></body></html>',
    '<div data-qa-locator="product-item" data-item-id="9"><div class="RfADt"><a href="/products/pdp-i9.html" title="No price">No price</a></div></div>',
  ]) {
    await assert.rejects(searchLazada('SG', 'WF-1000XM6', { fetchHtml: async () => html }),
      (error: Error & { code?: string }) => ['SOURCE_PAGE_BLOCKED', 'SOURCE_PARSE_FAILED'].includes(error.code || ''));
  }
});

test('live discovery reports a blocked Lazada page as failed rather than not found', async () => {
  const result = await discoverProduct({ market: 'SG', platforms: ['lazada'], query: 'WF-1000XM6', model: 'WF-1000XM6' }, {
    search: async (_platform, market, query) => searchLazada(market, query, {
      fetchHtml: async () => '<html><body>Security verification required</body></html>',
    }),
  });
  assert.deepEqual(result.listings, []);
  assert.deepEqual(result.summary, { requests: 1, matched: 0, skipped: 0, failed: 1 });
});

test('captured current Lazada cards retain source-bound model, price and URL', () => {
  const listings = parseLazadaSearch(CAPTURED_HTML, 'SG');
  assert.equal(listings.length, 4);
  const item = listings.find((listing) => listing.itemId === '13730291013')!;
  assert.equal(item.price, 315.99);
  assert.match(item.title, /WF-1000XM6/);
  assert.equal(item.url, 'https://www.lazada.sg/products/pdp-i13730291013.html');
  assert.equal(listings.find((listing) => listing.itemId === '3651023911')!.price, 339);
  assert.equal(listings.find((listing) => listing.itemId === '3651023911')!.discount, undefined);
});

test('partial HTML recovers with one rendered request and never compounds transport retries', async () => {
  const calls: unknown[] = [];
  const listings = await searchLazada('SG', 'WF-1000XM6', { transport: 'api', fetchHtml: async (_url, options) => {
    calls.push(options);
    return calls.length === 1 ? '<html><body><div id="root"></div></body></html>' : CAPTURED_HTML;
  } });
  assert.equal(listings.length, 4);
  assert.deepEqual(calls, [
    { transport: 'api', retries: 0, timeoutMs: 90_000 },
    { transport: 'api', retries: 0, timeoutMs: 90_000, render: true },
  ]);
});

test('timeouts recover once, persistent parsing failure is bounded, auth and empty results do not retry', async () => {
  let calls = 0;
  assert.equal((await searchLazada('SG', 'WF-1000XM6', { transport: 'api', fetchHtml: async () => {
    if (++calls === 1) throw new DOMException('timed out', 'TimeoutError');
    return CAPTURED_HTML;
  } })).length, 4);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(searchLazada('SG', 'WF-1000XM6', { transport: 'api', fetchHtml: async () => {
    calls++; return '<html><body>Loading</body></html>';
  } }), (error: BrightDataError) => error.code === 'SOURCE_PARSE_FAILED');
  assert.equal(calls, 2);
  for (const code of ['IP_BLOCKED', 'PROXY_AUTH_FAILED', 'SOURCE_PAGE_BLOCKED']) {
    calls = 0;
    await assert.rejects(searchLazada('SG', 'WF-1000XM6', { transport: 'api', fetchHtml: async () => {
      calls++; throw new BrightDataError('blocked', { code, status: 502 });
    } }));
    assert.equal(calls, 1);
  }
  calls = 0;
  assert.deepEqual(await searchLazada('SG', 'WF-1000XM6', { transport: 'api', fetchHtml: async () => {
    calls++; return '<html><body>No products found</body></html>';
  } }), []);
  assert.equal(calls, 1);
});

test('DOM tolerates attribute order and quotes, without treating promotions or ranges as a sale price', () => {
  const card = (price: string) => `<div data-item-id='123' data-qa-locator='product-item'>
    <a title='Sony WF-1000XM6' href='/products/sony-i123-s456.html'>Sony</a>
    <del>S$499.00</del><span>Coin save S$20</span>${price}</div>`;
  assert.equal(parseLazadaSearch(card('<span aria-hidden="false" class=\'ooOxS\'>S$339.00</span>'), 'SG')[0].price, 339);
  for (const price of ['', '<span class="ooOxS">S$339 - S$499</span>', '<span class="ooOxS">from S$339</span>',
    '<span class="ooOxS">S$339 / S$499</span>', '<span class="ooOxS">USD 339</span>',
    '<span class="ooOxS">RM 339</span>', '<span class="ooOxS">S$339 <span>- S$499</span></span>']) {
    assert.deepEqual(parseLazadaSearch(card(price), 'SG'), []);
  }
  assert.deepEqual(parseLazadaSearch(card('<span class="ooOxS">S$339</span>').replace('/products/', 'https://evil.test/products/'), 'SG'), []);
  assert.equal(parseLazadaSearch(card('<span class="ooOxS">S$339</span><p>Sold out</p>'), 'SG')[0].inStock, false);
});
