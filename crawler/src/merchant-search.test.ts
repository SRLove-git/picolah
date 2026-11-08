import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectedDirectMerchantPage } from './merchant-search.ts';

test('direct merchant fetch accepts one COURTS PDP and rejects broader pages', () => {
  const product = 'https://www.courts.com.sg/toshiba-rice-cooker-1.0l-rc10nmfeis-IP144969.html';
  assert.equal(selectedDirectMerchantPage(product, 'SG')?.href, product);
  assert.equal(selectedDirectMerchantPage('https://www.courts.com.sg/toshiba', 'SG'), undefined);
  assert.equal(selectedDirectMerchantPage('https://courts.com.sg/toshiba-IP144969.html', 'SG'), undefined);
  assert.equal(selectedDirectMerchantPage(product, 'MY'), undefined);
});

test('direct merchant fetch keeps requiring a selected Owala variant', () => {
  const selected = 'https://owalalife.sg/products/freesip?variant=123456';
  assert.equal(selectedDirectMerchantPage(selected, 'SG')?.href, selected);
  assert.equal(selectedDirectMerchantPage('https://owalalife.sg/products/freesip', 'SG'), undefined);
  assert.equal(selectedDirectMerchantPage('https://owalalife.sg/collections/bottles?variant=123456', 'SG'), undefined);
});
