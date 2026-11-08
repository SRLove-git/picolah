import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceCountry } from './source-country.ts';

test('six markets reject foreign domains and localized storefronts even with a local-looking query', () => {
  for (const market of ['SG', 'MY', 'TH', 'ID', 'PH', 'VN']) {
    const code = market.toLowerCase();
    for (const url of [`https://shop.${code}/product`, `https://${code}.retailer.com/product`, `https://retailer.com/en-${code}/product`, `https://retailer.com/shop/${code}/product`]) {
      assert.equal(sourceCountry(new URL(url), market), 'local', url);
    }
    for (const other of ['SG', 'MY', 'TH', 'ID', 'PH', 'VN'].filter(value => value !== market)) {
      for (const url of [`https://shop.${other.toLowerCase()}/product`, `https://retailer.com/en-${other.toLowerCase()}/product`]) assert.equal(sourceCountry(new URL(url), market), 'foreign', url);
    }
  }
  for (const url of ['https://shop.co.uk/product', 'https://shop.de/product', 'https://retailer.com/en-us/product', 'https://retailer.com/us-en/product', 'https://retailer.com/product?country=US', 'https://retailer.com.sg/en-my/product']) assert.equal(sourceCountry(new URL(url), 'SG'), 'foreign', url);
  for (const url of ['https://merchant.com/products/pixel-9', 'https://merchant.co/products/phone', 'https://merchant.com/products/id/123']) assert.equal(sourceCountry(new URL(url), 'SG'), 'unspecified', url);
  assert.equal(sourceCountry(new URL('https://merchant.com/sg/products/phone'), 'SG'), 'local');
});

test('country-specific brand stores stay local only to their own market', () => {
  for (const host of ['sg.canon','shop.sg.canon','store.sg.example.com']) {
    assert.equal(sourceCountry(new URL('https://'+host+'/products/item'),'SG'),'local');
    assert.equal(sourceCountry(new URL('https://'+host+'/products/item'),'MY'),'foreign');
  }
  assert.equal(sourceCountry(new URL('https://shop.sg.com/products/item'),'SG'),'unspecified');
  assert.equal(sourceCountry(new URL('https://shop.my.canon/sg/product'),'SG'),'foreign');
});

test('established Singapore retailers on generic domains remain country scoped', () => {
  for (const host of ['gaincity.com','www.ishopchangi.com','tangs.com','7daysdeals.com']) {
    assert.equal(sourceCountry(new URL(`https://${host}/products/item`),'SG'),'local',host);
    assert.equal(sourceCountry(new URL(`https://${host}/products/item`),'MY'),'foreign',host);
  }
  assert.equal(sourceCountry(new URL('https://ishopchangi.com/en-my/products/item'),'SG'),'foreign');
});
