import assert from 'node:assert/strict';
import test from 'node:test';
import { lazadaSearchUrl, parseLazadaSearch } from './lazada.ts';

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
