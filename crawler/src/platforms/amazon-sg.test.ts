import assert from 'node:assert/strict';
import test from 'node:test';
import { amazonSearchUrl, decodeAmazonHtml, parseAmazonSearch, searchAmazonSg } from './amazon-sg.ts';
import { BrightDataError, type FetchHtmlOptions } from '../brightdata/web-unlocker.ts';

const pricedCard = `<div role="listitem" data-asin="B09XSDMT4F"><h2 aria-label="Sony WH-1000XM5 Headphones"></h2><div data-cy="price-recipe"><span class="a-offscreen">S$328.78</span></div></div>`;

test('builds an Amazon Singapore search URL', () => {
  assert.equal(amazonSearchUrl('Sony WH-1000XM5'), 'https://www.amazon.sg/s?k=Sony%20WH-1000XM5');
});

test('parses priced Amazon cards and leaves accessories for central matching', () => {
  const html = `
    <div role="listitem" data-asin="B09XSDMT4F">
      <h2 aria-label="Sony WH-1000XM5 Wireless Noise-Cancelling Headphones &amp; Case"></h2>
      <div data-cy="price-recipe"><span class="a-offscreen">S$328.78</span></div>
      <i aria-label="4.3 out of 5 stars, rating details"></i><a aria-label="16,858 ratings"></a>
    </div>
    <div role="listitem" data-asin="B000000000"><h2 aria-label="Unpriced result"></h2></div>`;
  assert.deepEqual(parseAmazonSearch(html), [{
    platform: 'amazon-sg', market: 'SG', itemId: 'B09XSDMT4F',
    title: 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones & Case',
    url: 'https://www.amazon.sg/dp/B09XSDMT4F', price: 328.78, currency: 'SGD',
    rating: 4.3, reviews: 16858, seller: 'Amazon SG', inStock: true,
  }]);
});

test('marks unavailable products out of stock', () => {
  const html = `<div role="listitem" data-asin="B123456789"><h2 aria-label="Sony WH-1000XM5 Headphones"></h2><div data-cy="price-recipe"><span class="a-offscreen">S$12.00</span></div><span>Currently unavailable</span></div>`;
  assert.equal(parseAmazonSearch(html)[0].inStock, false);
});

test('missing or invalid ratings and review counts remain unknown rather than zero', () => {
  const [missing] = parseAmazonSearch(pricedCard);
  assert.equal('rating' in missing, false); assert.equal('reviews' in missing, false);
  const [invalid] = parseAmazonSearch(pricedCard.replace('</h2>', '</h2><i aria-label="9 out of 5 stars"></i><a aria-label="999999999999999999 ratings"></a>'));
  assert.equal('rating' in invalid, false); assert.equal('reviews' in invalid, false);
  const [explicitZero] = parseAmazonSearch(pricedCard.replace('</h2>', '</h2><i aria-label="0 out of 5 stars"></i><a aria-label="0 ratings"></a>'));
  assert.equal(explicitZero.rating, 0); assert.equal(explicitZero.reviews, 0);
});

test('Amazon search makes one bounded request without transport retries', async () => {
  const calls: Array<{ url: string; options?: FetchHtmlOptions }> = [];
  const listings = await searchAmazonSg('SG', 'Sony WH-1000XM5', { fetchHtml: async (url, options) => {
    calls.push({ url, options });
    return pricedCard;
  } });
  assert.equal(listings.length, 1);
  assert.deepEqual(calls, [{ url: amazonSearchUrl('Sony WH-1000XM5'), options: { country: 'SG', timeoutMs: 90_000, retries: 0 } }]);
});

test('Amazon challenges are source failures even when stale product markup or no-results text is present', async () => {
  for (const html of [
    '<html><title>Robot Check</title><p>Enter the characters you see below</p></html>',
    '<form action="/errors/validateCaptcha"><input id="captchacharacters"></form>',
    '<h1>Access denied</h1>', '<p>Sorry, we just need to make sure you’re not a robot.</p>',
    '<p>Verify that you are a human</p>', '<p>Automated access to Amazon data</p>',
    '<p>No results for Sony</p><input name="captchacharacters">',
    `${pricedCard}<h1>Robot Check</h1>`,
  ]) {
    let calls = 0;
    await assert.rejects(searchAmazonSg('SG', 'Sony', { fetchHtml: async () => { calls++; return html; } }), { code: 'SOURCE_PAGE_BLOCKED' });
    assert.equal(calls, 1);
  }
});

test('only explicit visible zero-results pages return an empty result', async () => {
  for (const html of [
    '<html><h1>No results for <strong>Sony</strong></h1></html>',
    '<p>0 results for Sony WF-1000XM6</p>', '<p>We couldn’t find any results for this query.</p>',
  ]) assert.deepEqual(await searchAmazonSg('SG', 'Sony', { fetchHtml: async () => html }), []);
  for (const html of [
    '', '<html><body>Please wait…</body></html>', '<html><h1>Amazon Singapore</h1></html>',
    '<div data-component-type="changed-search-layout">Sony WH-1000XM5 S$328.78</div>',
    '<div role="listitem" data-asin="B09XSDMT4F"><h2 aria-label="Unpriced product"></h2></div>',
    '<script>window.copy = "No results for Sony"</script>',
    '<style>/* No results for Sony */</style>', '<!-- No results for Sony -->',
    '<template><p>No results for Sony</p></template>', '<div hidden="hidden">No results for Sony</div>', '<div hidden>No results for Sony</div>',
    '<div aria-hidden="true">No results for Sony</div>', '<div style="display:none">No results for Sony</div>',
    `<script>window.cards = ${JSON.stringify(pricedCard)}</script>`,
  ]) await assert.rejects(searchAmazonSg('SG', 'Sony', { fetchHtml: async () => html }), { code: 'SOURCE_PAGE_UNREADABLE' });
});

test('scripts and comments mentioning captcha do not turn a real search page into a challenge', async () => {
  const html = `${pricedCard}<script>window.captchaHandler = true;</script><!-- captcha -->`;
  assert.equal((await searchAmazonSg('SG', 'Sony', { fetchHtml: async () => html })).length, 1);
});

test('network/provider failures and unsupported markets do not cause repeated requests', async () => {
  for (const failure of [new DOMException('timeout', 'TimeoutError'), new BrightDataError('Provider denied access', { code: 'IP_BLOCKED' })]) {
    let calls = 0;
    await assert.rejects(searchAmazonSg('SG', 'Sony', { fetchHtml: async () => { calls++; throw failure; } }), (error) => error === failure);
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(searchAmazonSg('MY', 'Sony', { fetchHtml: async () => { calls++; return pricedCard; } }), /不支持/);
  assert.equal(calls, 0);
});

test('invalid numeric HTML entities cannot crash source parsing', () => {
  assert.equal(decodeAmazonHtml('Sony &#999999999; &#xFFFFFF; &#65;'), 'Sony &#999999999; &#xFFFFFF; A');
});
