import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'false';
process.env.PICOLAH_DB_PATH = ':memory:';

const { app } = await import('./index.ts');
const { evaluateWatchlist } = await import('./watchlist.ts');

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

const headers = { 'content-type': 'application/json', 'x-picolah-user': 'anon_test_watchlist_01' };

test('adds, lists and removes a watched product', async () => {
  const empty = await fetch(`${baseUrl}/api/watchlist`, { headers });
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()) as { items: unknown[] }, { items: [], unread: 0 });

  const created = await fetch(`${baseUrl}/api/watchlist`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ productId: 'sony-wh1000xm5', market: 'SG' }),
  });
  assert.equal(created.status, 201);
  const body = (await created.json()) as {
    item: { id: string; product: { id: string }; currentPrice: number | null };
  };
  assert.equal(body.item.product.id, 'sony-wh1000xm5');
  assert.ok((body.item.currentPrice ?? 0) > 0);

  const listed = await fetch(`${baseUrl}/api/watchlist?market=SG`, { headers });
  const listBody = (await listed.json()) as { items: { id: string }[] };
  assert.equal(listBody.items.length, 1);

  const removed = await fetch(`${baseUrl}/api/watchlist/${body.item.id}`, { method: 'DELETE', headers });
  assert.equal(removed.status, 200);
  const afterDelete = await fetch(`${baseUrl}/api/watchlist`, { headers });
  assert.equal(((await afterDelete.json()) as { items: unknown[] }).items.length, 0);
});

test('evaluates a target and exposes an unread alert', async () => {
  const created = await fetch(`${baseUrl}/api/watchlist`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ productId: 'sony-wh1000xm5', market: 'SG', targetPrice: 9_999_999 }),
  });
  assert.equal(created.status, 201);
  const createdBody = (await created.json()) as { item: { currentPrice: number } };
  assert.ok(createdBody.item.currentPrice > 0);

  const alertsCreated = await evaluateWatchlist('SG');
  assert.ok(alertsCreated >= 1);

  const alerts = await fetch(`${baseUrl}/api/alerts`, { headers });
  assert.equal(alerts.status, 200);
  const alertBody = (await alerts.json()) as {
    alerts: { id: string; productName: string; read: boolean }[];
    unread: number;
  };
  assert.ok(alertBody.alerts.length >= 1);
  assert.equal(alertBody.alerts[0].read, false);
  assert.ok(alertBody.unread >= 1);

  const read = await fetch(`${baseUrl}/api/alerts/${alertBody.alerts[0].id}/read`, {
    method: 'POST',
    headers,
  });
  assert.equal(read.status, 200);
  const afterRead = (await (await fetch(`${baseUrl}/api/alerts`, { headers })).json()) as {
    unread: number;
  };
  assert.equal(afterRead.unread, 0);
});
