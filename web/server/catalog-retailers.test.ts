import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogPlatforms, catalogRetailer, isRetailProductUrl } from './catalog-retailers.ts';

test('Singapore direct retail offers are scoped to their catalog market and product pages', () => {
  const id = 'web:limitededt.com';
  assert.ok(catalogPlatforms('SG').includes(id));
  assert.ok(!catalogPlatforms('MY').includes(id));
  assert.equal(catalogRetailer(id)?.name, 'Limited Edt');
  assert.ok(isRetailProductUrl(id, 'https://limitededt.com/products/example?variant=123'));
  for (const url of [
    'https://limitededt.com.evil.example/products/example', 'https://user@limitededt.com/products/example',
    'https://limitededt.com:123/products/example', 'http://limitededt.com/products/example',
    'https://limitededt.com/collections/sale', 'https://limitededt.com/products/', 'invalid',
  ]) assert.equal(isRetailProductUrl(id, url), false, url);
  assert.equal(catalogRetailer('__proto__'), undefined);
});
