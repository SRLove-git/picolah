import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { discoverProduct } from './discovery.ts';
import { exactDiscoveryListing, normalizeDiscoveryModel, normalizeSearchQuery, queryMatchesListing } from './discovery-match.ts';
import type { RawListing } from './types.ts';

const options = { market: 'SG' as const, platforms: ['lazada' as const], query: 'Sony WF-1000XM6', model: 'WF-1000XM6' };
function listing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    platform: 'lazada', market: 'SG', itemId: '123', title: 'Sony WF-1000XM6 Wireless Earbuds',
    url: 'https://www.lazada.sg/products/sony-i123.html', price: 399, currency: 'SGD',
    inStock: true, ...overrides,
  };
}

test('live search accepts bounded plain query and optional single complete model code', () => {
  assert.equal(normalizeDiscoveryModel('wf-1000xm6'), 'WF-1000XM6');
  for (const model of ['whch720n', 'WH CH720N', 'WH-CH720N', 'WH CH 720 N', 'WH-CH720 N']) assert.equal(normalizeDiscoveryModel(model), 'WH-CH720N');
  assert.equal(normalizeDiscoveryModel('WF 1000 XM 6'), 'WF-1000XM6');
  assert.equal(normalizeSearchQuery('  iPhone 17 Pro 256GB  '), 'iPhone 17 Pro 256GB');
  for (const value of ['Sony WF-1000XM6', 'WF-1000XM6 WH-1000XM6', 'XM6', 'iphone 15', 'https://example.com', 'A1000', 'WF1000XM6'.repeat(10)]) assert.throws(() => normalizeDiscoveryModel(value));
  for (const value of ['', 'a', 'a'.repeat(121), 'https://example.com', 'iPhone\n17', '🔎🔎']) assert.throws(() => normalizeSearchQuery(value));
});

test('CH headphone models match across separators without dropping their terminal variant', () => {
  const spellings = ['whch720n', 'WH-CH720N', 'WH CH720N', 'WH CH 720 N', 'WH-CH720 N'];
  for (const query of spellings) {
    for (const spelling of spellings) {
      const candidate = listing({ title: `Sony ${spelling} Wireless Headphones` });
      assert.equal(queryMatchesListing(query, candidate, 'SG', 'lazada'), true, `${query} / ${spelling}`);
      assert.equal(queryMatchesListing(`Sony ${query}`, candidate, 'SG', 'lazada', 'WH-CH720N'), true, `${query} / ${spelling} with hint`);
    }
  }
  for (const title of [
    'Sony WH-CH710N Headphones', 'Sony WH-CH720 Headphones', 'Sony WH-CH720NB Headphones',
    'Sony WH-CH720N / WH-CH710N Headphones', 'Sony WH-CH720N / WH-CH520 Headphones',
    'Sony WH-CH720N / CH710N Headphones', 'Sony WH-CH720N / 710N Headphones',
    'Sony WH-CH720N / WF-CH720N Headphones', 'Sony WH-CH720N / WFCH720N Headphones',
    'Sony WH-CH720N / 720 Headphones', 'Sony WH-CH720N / WH-1000XM6 Headphones',
    'Sony WH CH 710 N Headphones', 'Sony WH CH 720 NB Headphones',
    'Sony WH CH 720 N2 Headphones', 'Sony WH-CH720 N / WH-CH710 N Headphones',
    'Sony WH CH 720 N / CH 710 N Headphones', 'Sony WH CH 720 N / WH-CH520 Headphones',
  ]) assert.equal(queryMatchesListing('whch720n', listing({ title }), 'SG', 'lazada'), false, title);
  assert.equal(queryMatchesListing('Sony WH-CH720N Black', listing({ title: 'Sony WHCH720N Silver' }), 'SG', 'lazada'), false);
  assert.equal(queryMatchesListing('WHCH720N', listing({ title: 'Sony WH-CH720N | WHCH720N | CH720N Headphones' }), 'SG', 'lazada'), true);
  assert.equal(queryMatchesListing('WHCH520', listing({ title: 'Sony WH-CH520 Noise Cancelling Headphones' }), 'SG', 'lazada'), true);
});

test('use-case and bundled charging-case phrases do not turn primary headphones into accessories', () => {
  for (const title of [
    'Sony WF-1000XM6 Wireless Earbuds for Travel',
    'Sony WF-1000XM6 Wireless Earbuds with Charging Case',
    'Sony WF1000XM6 Wireless Earbuds including a Wireless Charging Case',
    'Sony WF-1000XM6 Wireless Headphones with Carrying Case for Travel',
  ]) {
    assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), true, title);
    assert.equal(queryMatchesListing('Sony WF1000XM6', listing({ title }), 'SG', 'lazada'), true, title);
  }
  assert.equal(queryMatchesListing('Sony headphones', listing({ title: 'Sony WH-CH720N Wireless Headphones for Travel' }), 'SG', 'lazada'), true);
  for (const title of [
    'Case for Sony WF-1000XM6 Wireless Earbuds',
    'Charging Case for Sony WF-1000XM6 Earbuds',
    'Sony WF-1000XM6 Headphones Carrying Case',
    'Sony WF-1000XM6 Wireless Earbuds with Charging Case Replacement',
    'Sony WF-1000XM6 Wireless Earbuds with Charging Case Silicone Cover',
    'Replacement Ear Pads for Sony WH-CH720N Headphones',
    'Sony WF-1000XM6 Ear Tips', 'Sony WF-1000XM6 Charger',
    'Sony WF-1000XM6 Wireless Earbuds with Charging Case / WF-1000XM5',
  ]) assert.equal(queryMatchesListing('Sony WF1000XM6', listing({ title }), 'SG', 'lazada'), false, title);
  assert.equal(queryMatchesListing('Sony headphones', listing({ title: 'Replacement Ear Pads for Sony Headphones' }), 'SG', 'lazada'), false);
  assert.equal(queryMatchesListing('Sony headphones', listing({ title: 'Sony Earbuds with Charging Case' }), 'SG', 'lazada'), false);
});

test('full model guard rejects adjacent models, ambiguous variants and non-products', () => {
  for (const title of ['Sony WF-1000XM6', 'Sony WF1000XM6 Wireless Earbuds', 'Sony WF 1000 XM 6 Headphones', 'Sony WF-1000XM6 Bluetooth 5.3 ANC 24h']) {
    assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), true, title);
  }
  for (const title of [
    'Sony WH-1000XM6', 'Sony WF-1000XM5', 'Sony XM6', 'Sony WF-1000XM6B',
    'Sony WF-1000XM6 and WH-1000XM6', 'Sony WF-1000XM6 / XM5', 'Sony WF-1000XM6 / 5',
    'Sony WF-1000XM6 and XM5', 'Replacement ear tips for Sony WF-1000XM6',
    'Sony WF-1000XM6 case', 'Sony WF-1000XM6 refurbished', 'Used Sony WF1000XM6',
    'Replica Sony WF-1000XM6', 'WF-1000XM6 保护壳', 'WF-1000XM6 二手',
  ]) assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), false, title);
});

test('repeated full and shortened aliases are accepted only after an exact complete model', () => {
  const sameModelTitles = [
    'Sony WF1000XM6 | WF-1000XM6 | 1000XM6 | Wireless Noise Cancelling Headphones | 1 Year + 3 Months Warranty',
    'Sony WF-1000XM6 / WF1000XM6 / 1000XM6 / XM6 Wireless Earbuds',
    'Sony WF 1000 XM 6 + WF-1000XM6 + 1000 XM 6 + XM 6',
    'Sony WF1000XM6 WF-1000XM6 1000XM6 XM6',
  ];
  for (const title of sameModelTitles) {
    assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), true, title);
    assert.equal(queryMatchesListing('Sony WF-1000XM6', listing({ title }), 'SG', 'lazada', options.model), true, title);
  }
  for (const title of ['Sony 1000XM6 | XM6 Earbuds', 'Sony XM6 Wireless Earbuds']) {
    assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), false, title);
  }
});

test('duplicate aliases cannot hide other model families generations or variant suffixes', () => {
  for (const title of [
    'Sony WF1000XM6 | WF-1000XM6 | WH-1000XM6',
    'Sony WF1000XM6 | WF-1000XM6 | WF-1000XM5',
    'Sony WF1000XM6 | 1000XM6 | 1000XM5',
    'Sony WF1000XM6 | 1000XM6 | 2000XM6',
    'Sony WF1000XM6 | 1000XM6 | XM5',
    'Sony WF1000XM6 | WF-1000XM6 | 5',
    'Sony WF1000XM6 | XM6 / 5',
    'Sony WF1000XM6 | WF-1000XM6B',
    'Sony WF1000XM6 | 1000XM6B',
    'Sony WH1000XM6 | WH-1000XM6 | 1000XM6 | XM6',
  ]) assert.equal(exactDiscoveryListing(options.model, listing({ title }), 'SG', 'lazada'), false, title);

  assert.equal(queryMatchesListing('Sony WF-1000XM6 Black', listing({
    title: 'Sony WF1000XM6 | WF-1000XM6 | 1000XM6 Silver',
  }), 'SG', 'lazada', options.model), false);
  assert.equal(queryMatchesListing('iPhone 17 Pro 256GB', listing({
    title: 'Apple iPhone 17 Pro 256GB / 512GB',
  }), 'SG', 'lazada'), false);
  assert.equal(queryMatchesListing('Sony WF-1000XM6', listing({
    title: 'Sony WF1000XM6 | 1000XM6 | 128 / 256GB',
  }), 'SG', 'lazada', options.model), false);
});

test('source validation requires stock, correct market/currency, finite amounts and trusted source host', () => {
  for (const overrides of [
    { inStock: false }, { market: 'MY' as const }, { platform: 'shopee' as const },
    { price: NaN }, { price: Infinity }, { price: 0 }, { price: -1 }, { currency: 'USD' },
    { shippingFee: -1 }, { discount: 1000 }, { rating: 8 }, { reviews: Infinity },
    { itemId: '' }, { url: 'https://www.lazada.sg.evil.test/product' },
    { url: 'http://www.lazada.sg/product' }, { url: 'https://evil.test@www.lazada.sg/product' },
    { url: 'https://www.lazada.com.my/product' }, { url: 'https://www.lazada.sg:8443/product' },
  ]) assert.equal(exactDiscoveryListing(options.model, listing(overrides), 'SG', 'lazada'), false, JSON.stringify(overrides));
});

test('plain search preserves brand, numeric generation, capacity and product variants', () => {
  const query = 'iPhone 17 Pro 256GB';
  assert.equal(queryMatchesListing(query, listing({ title: 'Apple iPhone17 Pro 256 GB' }), 'SG', 'lazada'), true);
  for (const title of ['Apple iPhone 16 Pro 256GB', 'Apple iPhone 17 Pro Max 256GB', 'Apple iPhone 17 Pro 512GB', 'Apple iPhone 17 Pro 256GB / 512GB', 'Apple iPhone 17 Pro 256GB case']) {
    assert.equal(queryMatchesListing(query, listing({ title }), 'SG', 'lazada'), false, title);
  }
  assert.equal(queryMatchesListing('Sony headphones', listing({ title: 'Sony WH-1000XM5 headphones' }), 'SG', 'lazada'), true);
  assert.equal(queryMatchesListing('Sony headphones', listing({ title: 'Bose headphones' }), 'SG', 'lazada'), false);
  assert.equal(queryMatchesListing('WF1000XM6', listing({ title: 'WH1000XM6 and WF1000XM5' }), 'SG', 'lazada'), false);
  assert.equal(queryMatchesListing('iPhone 17 Pro', listing({ title: 'iPhone 17/16 Pro' }), 'SG', 'lazada'), false);
});

test('Xiaomi merchant Mi spelling preserves generation and base-edition constraints',()=>{
  for(const title of ['Xiaomi 14','Xiaomi Mi 14 12GB RAM 512GB','Xiaomi Mi14 5G'])
    assert.ok(queryMatchesListing('Xiaomi 14',listing({title}),'SG','lazada'),title);
  for(const title of ['Xiaomi Mi 14T','Xiaomi Mi 14 Pro','Xiaomi Mi 14 Ultra','Xiaomi Redmi 14','Xiaomi Mi 13','Xiaomi Mi 14 / Xiaomi Mi 13'])
    assert.equal(queryMatchesListing('Xiaomi 14',listing({title}),'SG','lazada'),false,title);
});

function detailPage(url: string, price = 399, name = options.query): string {
  // Amazon requires an active, ASIN-bound new buy box; generic JSON-LD is
  // deliberately insufficient. Keep discovery fixtures aligned with that rule.
  if (new URL(url).hostname === 'www.amazon.sg') {
    const asin = new URL(url).pathname.split('/').at(-1);
    const [whole, fraction] = price.toFixed(2).split('.');
    return `<span id="productTitle">${name}</span><input name="currencyOfPreference" value="SGD">
      <div id="corePriceDisplay_desktop_feature_div" data-csa-c-asin="${asin}">
        <span class="priceToPay"><span class="a-price-symbol">S$</span><span class="a-price-whole">${whole}.</span><span class="a-price-fraction">${fraction}</span></span>
      </div><div id="newAccordionRow_0" class="a-accordion-active"><input id="ASIN" value="${asin}">
        <div id="availability">In Stock</div><button id="add-to-cart-button">Add to cart</button></div>`;
  }
  return `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, url,
    offers: { '@type': 'Offer', price, priceCurrency: 'SGD', availability: 'InStock', url } })}</script>`;
}

test('live search returns detail-page prices without any catalog or ingest dependency', async () => {
  const source = await readFile(new URL('./discovery.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"].*(?:catalog|ingest|pipeline)/);
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error('catalog/ingest network forbidden'); };
  try {
    const candidates = [listing({ price: 10, seller: 'Search seller', shippingFee: 0, rating: 5 }),
      listing({ itemId: '124', price: 999, url: 'https://www.lazada.sg/products/sony-i124.html' })];
    const result = await discoverProduct(options, { search: async (platform, market, query) => {
      assert.equal(platform, 'lazada'); assert.equal(market, 'SG'); assert.equal(query, options.query);
      return candidates;
    }, fetchPage: async (url) => detailPage(url, url.includes('124') ? 389 : 410),
    maxCandidatesPerPlatform: 3 });
    assert.equal(networkCalls, 0);
    assert.equal('productId' in result, false);
    assert.deepEqual(result.listings.map((item) => item.price), [389, 410]);
    for (const row of result.listings) {
      assert.equal(row.verification?.source, 'product-page');
      assert.equal(row.shippingFee, undefined); assert.equal(row.rating, undefined);
      assert.notEqual(row.seller, 'Search seller');
    }
    assert.deepEqual(result.summary, { requests: 3, matched: 2, skipped: 0, failed: 0,
      discovered: 2, pagesChecked: 2, pagesVerified: 2 });
  } finally { globalThis.fetch = originalFetch; }
});

test('live search bounds raw results to three unique listings per requested platform', async () => {
  let active = 0; let peak = 0;
  const result = await discoverProduct({ ...options, platforms: ['lazada', 'amazon-sg'] }, { search: async (platform) =>
    Array.from({ length: 10 }, (_, index) => listing({ platform, itemId: String(Math.floor(index / 2)), price: 399 + index,
      url: platform === 'amazon-sg' ? `https://www.amazon.sg/dp/B01234567${Math.floor(index / 2)}`
        : `https://www.lazada.sg/products/sony-i12${Math.floor(index / 2)}.html` })),
    fetchPage: async (url) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5)); active--;
      return detailPage(url);
    }, maxCandidatesPerPlatform: 3 });
  assert.equal(result.listings.length, 6);
  assert.equal(result.summary.requests, 8);
  assert.equal(result.summary.matched, 6);
  assert.equal(peak, 3);
});

test('no-match and provider failure are completed statuses with no invented result', async () => {
  const empty = await discoverProduct(options, { search: async () => [listing({ title: 'Sony WH-1000XM5' })] });
  assert.deepEqual(empty.listings, []);
  assert.deepEqual(empty.summary, { requests: 1, matched: 0, skipped: 1, failed: 0, discovered: 0, pagesChecked: 0, pagesVerified: 0 });
  const failed = await discoverProduct(options, { search: async () => { throw new Error('provider down'); } });
  assert.deepEqual(failed.listings, []);
  assert.deepEqual(failed.summary, { requests: 1, matched: 0, skipped: 0, failed: 1, failedPlatforms: ['lazada'],
    failureCodes: ['SOURCE_SEARCH_FAILED'], discovered: 0, pagesChecked: 0, pagesVerified: 0 });
});

test('all three marketplaces start in parallel and partial failure does not discard other quotes', async () => {
  const started: string[] = [];
  const finish: Array<() => void> = [];
  const pending = discoverProduct({ ...options, scope: 'platforms', platforms: ['shopee', 'lazada', 'amazon-sg'] }, {
    search: async (platform) => {
      started.push(platform);
      await new Promise<void>((resolve) => finish.push(resolve));
      if (platform === 'shopee') throw Object.assign(new Error('login required'), { code: 'SHOPEE_LOGIN_REQUIRED' });
      return [listing({ platform, url: platform === 'amazon-sg' ? 'https://www.amazon.sg/dp/B012345678' : listing().url })];
    },
    fetchPage: async (url) => detailPage(url),
  });
  assert.deepEqual(started, ['shopee', 'lazada', 'amazon-sg']);
  finish.reverse().forEach((resolve) => resolve());
  const result = await pending;
  assert.equal(result.scope, 'platforms');
  assert.deepEqual(result.listings.map((item) => item.platform), ['lazada', 'amazon-sg']);
  assert.deepEqual(result.summary, { requests: 5, matched: 2, skipped: 0, failed: 1, failedPlatforms: ['shopee'],
    failureCodes: ['SOURCE_SEARCH_FAILED'], discovered: 2, pagesChecked: 2, pagesVerified: 2 });
});

test('budget and stock are checked on the page, never on the discovery snippet', async () => {
  const search = async () => [listing({ price: 999, inStock: false })];
  const affordable = await discoverProduct({ ...options, maxPrice: 400 }, { search,
    fetchPage: async (url) => detailPage(url, 350) });
  assert.equal(affordable.listings[0].price, 350);
  const expensive = await discoverProduct({ ...options, maxPrice: 400 }, { search: async () => [listing({ price: 10 })],
    fetchPage: async (url) => detailPage(url, 450) });
  assert.equal(expensive.listings.length, 0); assert.equal(expensive.summary.skipped, 1);
});

test('failed, unreadable, wrong-model and unavailable pages never fall back to search prices', async () => {
  for (const fetchPage of [
    async () => { throw new Error('private-provider-secret'); },
    async () => '<html>Please sign in</html>',
    async (url: string) => detailPage(url, 299).replace('InStock', 'OutOfStock'),
    async (url: string) => detailPage(url, 299, 'Sony WH-1000XM6'),
    async (url: string) => detailPage(url).replace('"@type":"Product"', '"@type":"Product","model":"WH-1000XM6"'),
  ]) {
    const result = await discoverProduct(options, { search: async () => [listing()], fetchPage });
    assert.equal(result.listings.length, 0);
    assert.equal(result.summary.pagesChecked, 1);
    assert.equal(result.summary.pagesVerified, 0);
    assert.equal(JSON.stringify(result).includes('private-provider-secret'), false);
  }
});

test('a page failure retains another verified quote and reports partial coverage', async () => {
  const result = await discoverProduct(options, { search: async () => [listing(),
    listing({ itemId: '124', url: 'https://www.lazada.sg/products/sony-i124.html' })],
  fetchPage: async (url) => url.includes('124') ? detailPage(url) : '<html>captcha</html>',
  maxCandidatesPerPlatform: 3 });
  assert.equal(result.listings.length, 1); assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.summary.failureCodes, ['PRODUCT_PAGE_UNVERIFIED']);
});
