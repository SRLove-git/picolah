import assert from 'node:assert/strict';
import test from 'node:test';
import { findPrice, parsePrice } from './money.ts';

test('parses two-decimal market prices', () => {
  assert.equal(parsePrice('S$1,399.00', 2), 1399);
  assert.equal(parsePrice('$17.59', 2), 17.59);
  assert.equal(parsePrice('RM 1,299', 2), 1299);
  assert.equal(parsePrice('฿1,290.00', 2), 1290);
  assert.equal(parsePrice('₱1,299.50', 2), 1299.5);
});

test('parses IDR / VND prices without minor units', () => {
  assert.equal(parsePrice('Rp 1.299.000', 0), 1_299_000);
  assert.equal(parsePrice('1.299.000₫', 0), 1_299_000);
  assert.equal(parsePrice('Rp12.500.000', 0), 12_500_000);
});

test('parses the first price in a range or blob', () => {
  assert.equal(parsePrice('S$1,299.00 - S$1,399.00', 2), 1299);
  assert.equal(findPrice('S$459.00 S$599.00', 2), 459);
  assert.equal(findPrice('no price here', 2), null);
});

test('rejects nonsense', () => {
  assert.equal(parsePrice('', 2), null);
  assert.equal(parsePrice('abc', 2), null);
  assert.equal(parsePrice('0', 2), null);
});
