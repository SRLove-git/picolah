import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWebProduct } from './web-product.ts';
const url = 'https://www.amazon.com/dp/B0BS1QCFHX';
const html = `<link rel="canonical" href="${url}"><span id="productTitle">Sony WH-CH720N Headphones Black</span>
<input name="currencyOfPreference" value="USD">
<div id="corePriceDisplay_desktop_feature_div" data-csa-c-asin="B0BS1QCFHX"><span class="a-price priceToPay"><span class="a-price-symbol">$</span><span class="a-price-whole">66<span>.</span></span><span class="a-price-fraction">21</span></span><span class="list-price">179.99</span></div>
<div id="newAccordionRow_0" class="a-box a-accordion-active"><input id="ASIN" value="B0BS1QCFHX"><div id="availability"><span>In Stock</span></div><a id="add-to-cart-button">Add to cart</a></div>
<div id="usedAccordionRow"><input id="ASIN" value="B0BS1QCFHX"><div id="availability">In Stock</div><span class="priceToPay">$1.00</span></div>`;
const parse = (s = html, u = url) => parseWebProduct(s, u, 'SG', 'global');
test('Amazon current primary new offer uses explicit currency, identity and stock, ignoring used and list prices', () => {
  assert.equal(parse().length, 1); assert.equal(parse()[0].price, 66.21); assert.equal(parse()[0].currency, 'USD');
  assert.equal(parseWebProduct(html, url, 'SG').length, 0);
  assert.equal(parse(html + '<div id="corePriceDisplay_desktop_feature_div"></div>')[0].price, 66.21);
  assert.deepEqual(parse(html + html.match(/<div id="corePriceDisplay_desktop_feature_div"[\s\S]*?<\/div>/)![0]), []);
});
test('Amazon never fills missing primary offer evidence from related or used offers', () => {
  for (const s of [
    html.replace('a-accordion-active', 'a-accordion-inactive'),
    html.replace('In Stock', 'Currently unavailable'), html.replace('In Stock', 'Only available used'),
    html.replace('value="USD"', 'value="SGD"'), html.replace('name="currencyOfPreference"', 'name="unrelated"'),
    html.replace('data-csa-c-asin="B0BS1QCFHX"', 'data-csa-c-asin="B0OTHER123"'),
    html.replace('id="ASIN" value="B0BS1QCFHX"', 'id="ASIN" value="B0OTHER123"'),
    html.replace('id="add-to-cart-button"', 'id="unavailable"'),
    html.replace('class="a-price priceToPay"', 'class="list-price"'),
    html.replace('Headphones Black', 'Headphones Black Renewed'),
    html.replace('<span class="a-price-fraction">21</span>', '<span class="a-price-fraction">21</span><span class="a-price-fraction">50</span>'),
    html.replace('rel="canonical" href="'+url+'"', 'rel="canonical" href="https://www.amazon.com/dp/B0OTHER123"'),
  ]) assert.deepEqual(parse(s), []);
  assert.deepEqual(parse(html, url+'?condition=used'), []);
});
