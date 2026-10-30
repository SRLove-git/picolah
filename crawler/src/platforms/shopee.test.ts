import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { config } from '../config.ts';
import { hasShopeeLoginState, parseShopeeSearchPayload, searchShopee } from './shopee.ts';

test('Shopee API prices preserve currency minor units instead of rounding SGD to dollars', () => {
  const item = { itemid: 12, shopid: 34, name: 'Sony WF-1000XM6', price: 315.99 * 100_000, image: 'sg-11134201-testimage' };
  assert.equal(parseShopeeSearchPayload({ items: [{ item_basic: item }] }, 'SG')[0]?.price, 315.99);
  assert.equal(parseShopeeSearchPayload({ items: [{ item_basic: item }] }, 'SG')[0]?.imageUrl,
    'https://down-sg.img.susercontent.com/file/sg-11134201-testimage');
  assert.equal(parseShopeeSearchPayload({ items: [{ item_basic: { ...item, price: 1_299_000.6 * 100_000 } }] }, 'ID')[0]?.price, 1_299_001);
  assert.deepEqual(parseShopeeSearchPayload({ items: [{ item_basic: { ...item, price: -1 } }] }, 'SG'), []);
});

test('Shopee login state must contain an unexpired authentication cookie for the requested market', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'picolah-shopee-test-'));
  const path = join(directory, 'state.json');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.equal(hasShopeeLoginState('SG', path), false);
  const cookie = { name: 'SPC_U', value: 'test-session', domain: '.shopee.sg', expires: Date.now() / 1000 + 3600 };
  for (const cookies of [[], [{ ...cookie, value: '0' }], [{ ...cookie, domain: '.shopee.com.my' }], [{ ...cookie, expires: 1 }], [{ ...cookie, name: 'tracking_cookie' }]]) {
    writeFileSync(path, JSON.stringify({ cookies }));
    assert.equal(hasShopeeLoginState('SG', path), false);
  }
  writeFileSync(path, JSON.stringify({ cookies: [cookie] }));
  assert.equal(hasShopeeLoginState('SG', path), true);
  assert.equal(hasShopeeLoginState('MY', path), false);
  writeFileSync(path, JSON.stringify({ cookies: [{ ...cookie, name: 'SPC_ST', expires: -1 }] }));
  assert.equal(hasShopeeLoginState('SG', path), true);
  writeFileSync(path, '{broken');
  assert.equal(hasShopeeLoginState('SG', path), false);
});

test('Shopee without a dataset or login fails before making browser or network requests', async (t) => {
  const previousDataset = config.brightData.shopeeDatasetId;
  const previousState = process.env.SHOPEE_STORAGE_STATE;
  config.brightData.shopeeDatasetId = '';
  const directory = mkdtempSync(join(tmpdir(), 'picolah-shopee-missing-'));
  process.env.SHOPEE_STORAGE_STATE = join(directory, 'missing-state.json');
  t.after(() => { config.brightData.shopeeDatasetId = previousDataset; if (previousState === undefined) delete process.env.SHOPEE_STORAGE_STATE; else process.env.SHOPEE_STORAGE_STATE = previousState; rmSync(directory, { recursive: true, force: true }); });
  let requests = 0;
  t.mock.method(chromium, 'connectOverCDP', async () => { requests++; throw new Error('must not connect'); });
  t.mock.method(chromium, 'launch', async () => { requests++; throw new Error('must not launch'); });
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('must not fetch'); });
  await assert.rejects(searchShopee('SG', 'Sony WF-1000XM6'), (error: Error & { code?: string }) => error.code === 'SHOPEE_LOGIN_REQUIRED');
  assert.equal(requests, 0);
});
