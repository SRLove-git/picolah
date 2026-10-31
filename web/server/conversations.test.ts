import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.PICOLAH_DB_PATH = ':memory:';
process.env.LLM_API_KEY = '';
process.env.CRAWLER_TOOL_URL = '';
process.env.CRAWLER_TOOL_TOKEN = '';

const { app } = await import('./index.ts');
const { db } = await import('./db.ts');
const repo = await import('./repo.ts');
const { createSession, createUser, hashPassword } = await import('./auth.ts');
const { getShoppingProfile, recordOfferClick } = await import('./profile.ts');
const { mergeCapybara } = await import('./capybara.ts');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server did not bind');
const base = `http://127.0.0.1:${address.port}`;
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

const guest = (id: string) => ({ 'x-picolah-user': id, 'content-type': 'application/json' });
const body = JSON.stringify({ message: '只看 Lazada', market: 'SG' });

test('conversation list, read, rename, delete and continuation are isolated by owner', async () => {
  const alice = 'anon-conversation-alice';
  const bob = 'anon-conversation-bob';
  const conversation = await repo.createConversation('Private Alice chat', 'SG', alice);
  await repo.addMessage({ conversationId: conversation.id, role: 'user', content: 'Private image and shopping data' });
  const path = `/api/conversations/${conversation.id}`;

  for (const headers of [guest(bob), {}]) {
    const list = await fetch(`${base}/api/conversations`, { headers });
    assert.deepEqual((await list.json() as { conversations: unknown[] }).conversations, []);
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const response = await fetch(`${base}${path}`, {
        method, headers: { ...headers, 'content-type': 'application/json' },
        ...(method === 'PATCH' ? { body: JSON.stringify({ title: 'Stolen chat' }) } : {}),
      });
      assert.equal(response.status, 404, `${method} requires the owner`);
    }
  }
  const hijack = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: guest(bob), body: JSON.stringify({ ...JSON.parse(body), conversationId: conversation.id }),
  });
  assert.equal(hijack.status, 404);
  assert.equal((await repo.getConversation(conversation.id, alice))?.messages.length, 1);

  const ownList = await fetch(`${base}/api/conversations`, { headers: guest(alice) });
  assert.equal((await ownList.json() as { conversations: unknown[] }).conversations.length, 1);
  assert.equal((await fetch(`${base}${path}`, { headers: guest(alice) })).status, 200);
  assert.equal((await fetch(`${base}${path}`, { method: 'PATCH', headers: guest(alice), body: JSON.stringify({ title: 'My updated chat' }) })).status, 200);
  assert.equal((await repo.getConversation(conversation.id, alice))?.title, 'My updated chat');
  assert.equal((await fetch(`${base}${path}`, { method: 'DELETE', headers: guest(alice) })).status, 200);
  assert.equal(await repo.getConversation(conversation.id, alice), null);
});

test('new chats require an identity and are saved only to that browser', async () => {
  assert.equal((await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status, 400);
  const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: guest('anon-created-chat'), body });
  assert.equal(response.status, 200);
  await response.text();
  const conversations = await repo.listConversations('anon-created-chat');
  assert.equal(conversations.length, 1);
  assert.equal((await repo.getConversation(conversations[0].id, 'anon-created-chat'))?.messages.length, 2);
});

test('account IDs cannot be used as anonymous IDs to read, erase or merge another account', async () => {
  const password = 'correct horse 9';
  const passwordHash = await hashPassword(password);
  const victim = await createUser({ email: 'victim@example.com', passwordHash, displayName: 'Victim' });
  const attacker = await createUser({ email: 'attacker@example.com', passwordHash, displayName: 'Attacker' });
  await recordOfferClick(victim.id, { type: 'offer_click', market: 'SG', platformId: 'shopee', price: 30, isLowest: true, position: 1 });
  const conversation = await repo.createConversation('Account-owned chat', 'SG', victim.id);
  const headers = guest(victim.id);

  const profile = await fetch(`${base}/api/profile`, { headers });
  assert.equal((await profile.json() as { profile: { hasData: boolean } }).profile.hasData, false);
  await fetch(`${base}/api/profile`, { method: 'DELETE', headers });
  assert.equal((await getShoppingProfile(victim.id)).totals.clicks, 1);
  assert.equal((await fetch(`${base}/api/conversations/${conversation.id}`, { headers })).status, 404);

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers, body: JSON.stringify({ email: attacker.email, password }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json() as { mergedEvents: number }).mergedEvents, 0);
  assert.equal((await getShoppingProfile(victim.id)).totals.clicks, 1);
  assert.equal((await getShoppingProfile(attacker.id)).totals.clicks, 0);
  assert.equal(await mergeCapybara(victim.id, attacker.id), 0);
  assert.ok(await repo.getConversation(conversation.id, victim.id));

  const cookie = `picolah_session=${await createSession(victim.id)}`;
  const own = await fetch(`${base}/api/conversations/${conversation.id}`, { headers: { ...guest(attacker.id), cookie } });
  assert.equal(own.status, 200, 'the authenticated session takes precedence over the header');
});

test('sign-in adopts anonymous chats even without shopping events; deletion removes them', async () => {
  const anonymous = 'anon-with-only-chat';
  const conversation = await repo.createConversation('Before sign-in', 'SG', anonymous);
  const password = 'correct horse 9';
  const user = await createUser({ email: 'merge-chats@example.com', passwordHash: await hashPassword(password), displayName: 'Merge chats' });
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: guest(anonymous), body: JSON.stringify({ email: user.email, password }),
  });
  assert.equal(response.status, 200);
  assert.ok(await repo.getConversation(conversation.id, user.id));
  assert.equal(await repo.getConversation(conversation.id, anonymous), null);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const deleted = await fetch(`${base}/api/account`, {
    method: 'DELETE', headers: { ...guest(anonymous), cookie }, body: JSON.stringify({ password }),
  });
  assert.equal(deleted.status, 200);
  assert.equal(await db.get('SELECT id FROM conversations WHERE id = ?', [conversation.id]), undefined);
});

test('legacy shared chats are preserved but never assigned from incomplete browsing evidence', async () => {
  const now = new Date().toISOString();
  for (const id of ['legacy-owned', 'legacy-conflict', 'legacy-orphan']) {
    await repo.createConversationWithId(id, id, 'SG', now);
  }
  for (const [index, conversationId, userId] of [
    ['one', 'legacy-owned', 'anon-legacy-one'],
    ['two', 'legacy-conflict', 'anon-legacy-one'],
    ['three', 'legacy-conflict', 'anon-legacy-two'],
  ]) {
    await db.run('INSERT INTO app_users (id, created_at, last_seen_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING', [userId, now, now]);
    await db.run('INSERT INTO user_events (id, user_id, type, market, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [`legacy-${index}`, userId, 'comparison', 'SG', JSON.stringify({ conversationId }), now]);
  }
  for (const id of ['legacy-owned', 'legacy-conflict', 'legacy-orphan']) {
    assert.equal((await db.get<{ owner_id: string }>('SELECT owner_id FROM conversations WHERE id = ?', [id]))?.owner_id, '');
    assert.equal(await repo.getConversation(id, ''), null);
    assert.equal(await repo.getConversation(id, 'anon-legacy-one'), null);
    assert.equal(await repo.getConversation(id, 'anon-legacy-two'), null);
    await repo.deleteConversation(id, '');
    assert.ok(await db.get('SELECT id FROM conversations WHERE id = ?', [id]));
  }
});
