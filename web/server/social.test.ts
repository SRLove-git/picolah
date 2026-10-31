import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'true';
process.env.PICOLAH_DB_PATH = ':memory:';

const { app } = await import('./index.ts');
const { recordOfferClick } = await import('./profile.ts');
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

async function register(email: string): Promise<{ cookie: string; id: string }> {
  const codeResponse = await fetch(`${baseUrl}/api/auth/email-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, purpose: 'register' }),
  });
  assert.equal(codeResponse.status, 200);
  const { devCode } = (await codeResponse.json()) as { devCode?: string };
  const created = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse 9', code: devCode, displayName: email.split('@')[0] }),
  });
  assert.equal(created.status, 201);
  const cookie = created.headers.get('set-cookie')?.split(';')[0];
  const body = (await created.json()) as { user: { id: string } };
  assert.ok(cookie);
  return { cookie, id: body.user.id };
}

async function click(userId: string, category: string, brand: string, platform: string, price: number) {
  await recordOfferClick(userId, {
    type: 'offer_click',
    market: 'SG',
    platformId: platform,
    price,
    isLowest: true,
    position: 1,
    category,
    brand,
  });
}

async function radar(cookie: string) {
  const response = await fetch(`${baseUrl}/api/social/radar`, { headers: { cookie } });
  assert.equal(response.status, 200);
  return (await response.json()) as {
    self: { hasData: boolean; comparisons: number };
    candidates: Array<{ id: string; similarity: number; shared: Array<{ zh: string }>; relationship: string }>;
    incoming: Array<{ id: string; userId: string }>;
    friends: Array<{ id: string; unread: number }>;
  };
}

test('radar matches people by shopping preferences and friends can chat', async () => {
  const alice = await register(`radar-a-${Date.now()}@example.com`);
  const bob = await register(`radar-b-${Date.now()}@example.com`);
  const carol = await register(`radar-c-${Date.now()}@example.com`);
  const dave = await register(`radar-d-${Date.now()}@example.com`);

  await click(alice.id, 'phone', 'apple', 'shopee', 1200);
  await click(alice.id, 'phone', 'apple', 'lazada', 1180);
  await click(bob.id, 'phone', 'apple', 'shopee', 1150);
  await click(bob.id, 'phone', 'apple', 'lazada', 1120);
  await click(carol.id, 'beauty', 'sk-ii', 'shopee', 90);

  const aliceRadar = await radar(alice.cookie);
  assert.equal(aliceRadar.self.hasData, true);

  const bobCandidate = aliceRadar.candidates.find((item) => item.id === bob.id);
  const carolCandidate = aliceRadar.candidates.find((item) => item.id === carol.id);
  const daveCandidate = aliceRadar.candidates.find((item) => item.id === dave.id);
  assert.ok(bobCandidate, 'Bob should appear on the radar');
  assert.equal(carolCandidate, undefined, 'market and platform overlap alone is not a meaningful match');
  assert.equal(daveCandidate, undefined, 'users without events are not matched');
  assert.ok(bobCandidate.similarity >= 45, 'meaningful matches clear the similarity threshold');
  assert.ok(bobCandidate.shared.length > 0, 'shared preferences are reported');

  const request = await fetch(`${baseUrl}/api/social/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: alice.cookie },
    body: JSON.stringify({ toUserId: bob.id }),
  });
  assert.equal(request.status, 200);
  assert.equal(((await request.json()) as { status: string }).status, 'pending');

  const bobRadar = await radar(bob.cookie);
  assert.equal(bobRadar.incoming.length, 1);
  assert.equal(bobRadar.incoming[0].userId, alice.id);

  const accept = await fetch(`${baseUrl}/api/social/requests/${bobRadar.incoming[0].id}/accept`, {
    method: 'POST',
    headers: { cookie: bob.cookie },
  });
  assert.equal(accept.status, 200);

  const aliceAfter = await radar(alice.cookie);
  assert.equal(aliceAfter.friends.length, 1);
  assert.equal(aliceAfter.friends[0].id, bob.id);
  assert.equal(aliceAfter.candidates.find((item) => item.id === bob.id)?.relationship, 'friend');

  const sent = await fetch(`${baseUrl}/api/social/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: alice.cookie },
    body: JSON.stringify({ toUserId: bob.id, body: '我们的购物偏好很像' }),
  });
  assert.equal(sent.status, 201);

  const read = await fetch(`${baseUrl}/api/social/messages/${alice.id}`, {
    headers: { cookie: bob.cookie },
  });
  assert.equal(read.status, 200);
  const messages = ((await read.json()) as { messages: Array<{ body: string }> }).messages;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body, '我们的购物偏好很像');

  const blocked = await fetch(`${baseUrl}/api/social/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: carol.cookie },
    body: JSON.stringify({ toUserId: bob.id, body: '陌生人消息' }),
  });
  assert.equal(blocked.status, 403);
});

test('radar needs shopping data and an account', async () => {
  assert.equal((await fetch(`${baseUrl}/api/social/radar`)).status, 401);

  const erin = await register(`radar-e-${Date.now()}@example.com`);
  const empty = await radar(erin.cookie);
  assert.equal(empty.self.hasData, false);
  assert.equal(empty.candidates.length, 0);
});
