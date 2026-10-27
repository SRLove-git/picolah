import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { CapyPayload } from '../shared/capybara.ts';

process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'false';
process.env.PICOLAH_DB_PATH = ':memory:';

const { app } = await import('./index.ts');
const { capySnapshot } = await import('../shared/capybara.ts');

const server = await new Promise<import('node:http').Server>((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server did not bind a TCP port');
const baseUrl = `http://127.0.0.1:${address.port}`;

after(
  () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
);

const headers = { 'content-type': 'application/json', 'x-picolah-user': 'anon_test_capybara_01' };

interface CapyBody {
  capybara: null | CapyPayload;
}

async function readCapy(): Promise<NonNullable<CapyBody['capybara']>> {  const response = await fetch(`${baseUrl}/api/capybara`, { headers });
  assert.equal(response.status, 200);
  const body = (await response.json()) as CapyBody;
  assert.ok(body.capybara, 'expected a capybara payload');
  return body.capybara;
}

async function buy(productId: string): Promise<NonNullable<CapyBody['capybara']>> {
  const response = await fetch(`${baseUrl}/api/capybara/purchases`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ productId, market: 'SG' }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as CapyBody;
  assert.ok(body.capybara, 'expected a capybara payload');
  return body.capybara;
}

async function dress(equipped: string[]): Promise<NonNullable<CapyBody['capybara']>> {
  const response = await fetch(`${baseUrl}/api/capybara/outfit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ equipped }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as CapyBody;
  assert.ok(body.capybara, 'expected a capybara payload');
  return body.capybara;
}

test('a guest without an identity gets no capybara state', async () => {
  const response = await fetch(`${baseUrl}/api/capybara`, { headers: { 'content-type': 'application/json' } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()) as CapyBody, { capybara: null });
});

test('buying a product unlocks and auto-equips its accessory', async () => {
  const fresh = await readCapy();
  const freshView = capySnapshot(fresh);
  assert.equal(fresh.xp, 0);
  assert.equal(freshView.level, 1);
  assert.deepEqual(fresh.equipped, []);
  assert.deepEqual(fresh.purchases, []);

  const afterBuy = await buy('sony-wh1000xm5');
  const view = capySnapshot(afterBuy);
  assert.equal(afterBuy.purchases.length, 1);
  assert.equal(afterBuy.purchases[0]?.product.id, 'sony-wh1000xm5');
  assert.deepEqual(afterBuy.equipped, ['headphones']);
  assert.ok(afterBuy.xp >= 40);
  assert.equal(view.level, 2);

  const headphones = view.accessories.find((item) => item.id === 'headphones');
  assert.equal(headphones?.unlocked, true);
  const sunglasses = view.accessories.find((item) => item.id === 'sunglasses');
  assert.equal(sunglasses?.unlocked, false);

  // Buying the same product twice records it once and keeps the accessory.
  const again = await buy('sony-wh1000xm5');
  assert.equal(again.purchases.length, 1);
  assert.equal(again.counts.purchases, 1);
  assert.deepEqual(again.equipped, ['headphones']);
});

test('outfits are validated against level, ownership and slot caps', async () => {
  await buy('iphone-15-128');
  await buy('the-ordinary-niacinamide');
  await buy('nespresso-vertuo-pop');
  await buy('airpods-pro-2');

  // A locked accessory is silently dropped; owned ones survive.
  const locked = await dress(['sunglasses', 'headphones']);
  assert.deepEqual(locked.equipped, ['headphones']);

  // Head slot only takes one item.
  const single = await dress(['headphones', 'earbuds']);
  assert.deepEqual(single.equipped, ['headphones']);

  // Bag charms are capped at three, in request order.
  const bag = await dress(['phone', 'serum', 'coffee', 'airfryer']);
  assert.deepEqual(bag.equipped, ['phone', 'serum', 'coffee']);

  const unknown = await fetch(`${baseUrl}/api/capybara/outfit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ equipped: ['not-an-accessory', 'headphones'] }),
  });
  assert.equal(unknown.status, 200);
  const body = (await unknown.json()) as CapyBody;
  assert.deepEqual(body.capybara?.equipped, ['headphones']);

  const invalid = await fetch(`${baseUrl}/api/capybara/outfit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ equipped: 'headphones' }),
  });
  assert.equal(invalid.status, 422);
});

test('purchases reject unknown products and can be removed', async () => {
  const missing = await fetch(`${baseUrl}/api/capybara/purchases`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ productId: 'does-not-exist', market: 'SG' }),
  });
  assert.equal(missing.status, 404);

  const current = await readCapy();
  const purchase = current.purchases.find((item) => item.product.id === 'the-ordinary-niacinamide');
  assert.ok(purchase);

  const removed = await fetch(`${baseUrl}/api/capybara/purchases/${purchase.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(removed.status, 200);
  const body = (await removed.json()) as CapyBody;
  assert.equal(body.capybara?.purchases.some((item) => item.product.id === 'the-ordinary-niacinamide'), false);
  assert.equal(body.capybara?.equipped.includes('serum'), false);
});
