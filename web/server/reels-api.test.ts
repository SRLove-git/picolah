import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { REELS, type ReelEventInput, type ReelFeed } from '../shared/reels.ts';
import type { ShoppingProfile } from '../shared/types.ts';

process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'false';
process.env.DATABASE_URL = '';
process.env.PICOLAH_DB_PATH = ':memory:';
process.env.LLM_API_KEY = '';
process.env.CRAWLER_TOOL_URL = '';
process.env.CRAWLER_TOOL_TOKEN = '';

const { app } = await import('./index.ts');
const { db } = await import('./db.ts');
const server = await new Promise<import('node:http').Server>((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server did not bind a TCP port');
const baseUrl = `http://127.0.0.1:${address.port}`;

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await db.close();
});

function event(overrides: Partial<ReelEventInput> = {}): ReelEventInput {
  return {
    eventId: randomUUID(),
    sessionId: randomUUID(),
    reelId: REELS[0].id,
    type: 'view',
    market: 'SG',
    ...overrides,
  };
}

function headers(userId: string, cookie?: string): Record<string, string> {
  return { 'x-picolah-user': userId, ...(cookie ? { cookie } : {}) };
}

async function postEvent(userId: string, input: unknown, cookie?: string): Promise<Response> {
  return fetch(`${baseUrl}/api/reels/events`, {
    method: 'POST',
    headers: { ...headers(userId, cookie), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

async function record(userId: string, input: ReelEventInput, cookie?: string): Promise<void> {
  const response = await postEvent(userId, input, cookie);
  assert.equal(response.status, 204, await response.text());
}

async function feed(userId: string, query = 'market=SG&limit=5', cookie?: string): Promise<ReelFeed> {
  const response = await fetch(`${baseUrl}/api/reels?${query}`, { headers: headers(userId, cookie) });
  assert.equal(response.status, 200);
  return await response.json() as ReelFeed;
}

async function profile(userId: string, cookie?: string): Promise<ShoppingProfile> {
  const response = await fetch(`${baseUrl}/api/profile`, { headers: headers(userId, cookie) });
  assert.equal(response.status, 200);
  return (await response.json() as { profile: ShoppingProfile }).profile;
}

test('Reels HTTP feed exposes known content, explanations, exclusion and a bounded page', async () => {
  const userId = randomUUID();
  const initial = await feed(userId);
  assert.equal(initial.personalized, false);
  assert.equal(typeof initial.algorithmVersion, 'string');
  assert.ok(initial.algorithmVersion.length > 0);
  assert.equal(initial.items.length, REELS.length);
  assert.equal(new Set(initial.items.map((item) => item.id)).size, initial.items.length);
  for (const item of initial.items) {
    assert.ok(REELS.some((reel) => reel.id === item.id));
    assert.ok(item.reason.labelZh.length > 0);
    assert.ok(item.reason.labelEn.length > 0);
    assert.equal(item.liked, false);
    assert.equal(item.saved, false);
    assert.equal(item.following, false);
  }

  const excluded = initial.items.slice(0, 2).map((item) => item.id);
  const page = await feed(userId, `market=MY&exclude=${excluded.join(',')}&limit=2`);
  assert.equal(page.items.length, 2);
  assert.ok(page.items.every((item) => !excluded.includes(item.id)));
  const exhausted = await feed(userId, `market=SG&exclude=${REELS.map((reel) => reel.id).join(',')}`);
  assert.deepEqual(exhausted.items, []);
});

test('Reels HTTP rejects malformed queries, unknown content and client-supplied interest labels', async () => {
  const userId = randomUUID();
  for (const query of ['market=XX', 'limit=0', 'limit=21', 'limit=1.5', 'exclude=unknown-reel']) {
    const response = await fetch(`${baseUrl}/api/reels?${query}`, { headers: headers(userId) });
    assert.equal(response.status, 400, query);
  }

  const base = event();
  const invalid: unknown[] = [
    { ...base, reelId: 'unknown-reel' },
    { ...base, eventId: 'bad id with spaces' },
    { ...base, sessionId: 'short' },
    { ...base, type: 'invented-action' },
    { ...base, market: 'XX' },
    { ...base, type: 'watch' },
    { ...base, type: 'watch', watchMs: -1 },
    { ...base, type: 'watch', watchMs: 1.5 },
    { ...base, type: 'watch', watchMs: '1000' },
    { ...base, type: 'watch', watchMs: REELS[0].durationMs + 1 },
    { ...base, type: 'watch', watchMs: 1000, ended: 'true' },
    { ...base, type: 'like', watchMs: 1000 },
    { ...base, type: 'like', ended: true },
    { ...base, category: 'injected-category', brand: 'injected-brand', score: 999 },
  ];
  for (const input of invalid) {
    const response = await postEvent(userId, input);
    assert.equal(response.status, 400, JSON.stringify(input));
    assert.equal((await response.json() as { error: string }).error, 'INVALID_EVENT');
  }
  for (const invalidIdentity of ['', 'short', 'invalid identity']) {
    assert.equal((await postEvent(invalidIdentity, base)).status, 400);
  }
  assert.equal((await profile(userId)).video.hasData, false);
});

test('Reels HTTP deduplicates retries and counts cumulative watch snapshots only once', async () => {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const viewed = event({ sessionId });
  await record(userId, viewed);
  await record(userId, viewed);
  for (const watchMs of [4000, 8000, 6000]) {
    const snapshot = event({ sessionId, type: 'watch', watchMs });
    await record(userId, snapshot);
    await record(userId, snapshot);
  }
  let video = (await profile(userId)).video;
  assert.equal(video.views, 1);
  assert.equal(video.watchedMs, 8000);
  assert.equal(video.completions, 0);

  await record(userId, event({ sessionId, type: 'watch', watchMs: REELS[0].durationMs, ended: true }));
  await record(userId, event({ sessionId, type: 'watch', watchMs: 5000, ended: false }));
  video = (await profile(userId)).video;
  assert.equal(video.views, 1);
  assert.equal(video.watchedMs, REELS[0].durationMs);
  assert.equal(video.completions, 1);

  // A heartbeat can arrive before its view event and still counts one session.
  const nextSession = randomUUID();
  await record(userId, event({ sessionId: nextSession, type: 'watch', watchMs: 3000 }));
  await record(userId, event({ sessionId: nextSession }));
  video = (await profile(userId)).video;
  assert.equal(video.views, 2);
  assert.equal(video.watchedMs, REELS[0].durationMs + 3000);
  assert.equal(video.completions, 1);

  const conflictingEvent = await postEvent(userId, { ...viewed, type: 'like' });
  assert.equal(conflictingEvent.status, 409);
  const conflictingSession = await postEvent(userId, event({ sessionId, reelId: REELS[1].id }));
  assert.equal(conflictingSession.status, 409);
  assert.equal((await profile(userId)).video.views, 2);
});

test('Reels HTTP persists likes, saves and creator follows, then applies undo and not-interested', async () => {
  const userId = randomUUID();
  for (const type of ['like', 'save', 'follow'] as const) await record(userId, event({ type }));
  const first = await feed(userId);
  const selected = first.items.find((item) => item.id === REELS[0].id)!;
  assert.equal(selected.liked, true);
  assert.equal(selected.saved, true);
  assert.equal(selected.following, true);
  assert.ok(first.items.filter((item) => item.handle === selected.handle).every((item) => item.following));
  const video = (await profile(userId)).video;
  assert.equal(video.likes, 1);
  assert.equal(video.saves, 1);
  assert.equal(video.follows, 1);

  for (const type of ['unlike', 'unsave', 'unfollow'] as const) await record(userId, event({ type }));
  const undone = (await feed(userId)).items.find((item) => item.id === REELS[0].id)!;
  assert.equal(undone.liked, false);
  assert.equal(undone.saved, false);
  assert.equal(undone.following, false);
  const undoneProfile = (await profile(userId)).video;
  assert.equal(undoneProfile.likes, 0);
  assert.equal(undoneProfile.saves, 0);
  assert.equal(undoneProfile.follows, 0);

  await record(userId, event({ type: 'not_interested', reelId: REELS[1].id }));
  assert.ok((await feed(userId)).items.every((item) => item.id !== REELS[1].id));
  for (const reel of REELS.filter((item) => item.id !== REELS[1].id)) {
    await record(userId, event({ type: 'not_interested', reelId: reel.id }));
  }
  assert.deepEqual((await feed(userId)).items, []);
});

test('Reels HTTP isolates viewers and DELETE profile clears shopping and video state', async () => {
  const userId = randomUUID();
  const otherUserId = randomUUID();
  await record(userId, event({ type: 'like' }));
  await record(userId, event({ type: 'watch', watchMs: 9000 }));
  await record(userId, event({ type: 'not_interested', reelId: REELS[1].id }));
  const click = await fetch(`${baseUrl}/api/profile/events`, {
    method: 'POST',
    headers: { ...headers(userId), 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'offer_click', market: 'SG', platformId: 'shopee', price: 42 }),
  });
  assert.equal(click.status, 204);
  assert.equal((await profile(userId)).totals.clicks, 1);
  assert.equal((await profile(otherUserId)).video.hasData, false);
  const otherFeed = await feed(otherUserId);
  assert.ok(otherFeed.items.every((item) => !item.liked));
  assert.ok(otherFeed.items.some((item) => item.id === REELS[1].id));

  const reset = await fetch(`${baseUrl}/api/profile`, { method: 'DELETE', headers: headers(userId) });
  assert.equal(reset.status, 204);
  const cleared = await profile(userId);
  assert.equal(cleared.totals.clicks, 0);
  assert.equal(cleared.video.hasData, false);
  assert.equal(cleared.video.views, 0);
  assert.equal(cleared.video.watchedMs, 0);
  assert.deepEqual(cleared.video.recent, []);
  const freshFeed = await feed(userId);
  assert.ok(freshFeed.items.every((item) => !item.liked));
  assert.ok(freshFeed.items.some((item) => item.id === REELS[1].id));
});

test('Reels HTTP merges an anonymous profile at registration and uses the signed-in identity', async () => {
  const anonymousId = randomUUID();
  const unrelatedId = randomUUID();
  const sessionId = randomUUID();
  const watched = event({ sessionId, type: 'watch', watchMs: 8000 });
  await record(anonymousId, watched);
  await record(anonymousId, event({ sessionId, type: 'like' }));
  const email = `reels-${randomUUID()}@example.com`;
  const credentials = { email, password: 'correct horse 9', displayName: 'Reels viewer' };
  const codeResponse = await fetch(`${baseUrl}/api/auth/email-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, purpose: 'register' }),
  });
  const { devCode } = (await codeResponse.json()) as { devCode?: string };
  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { ...headers(anonymousId), 'content-type': 'application/json' },
    body: JSON.stringify({ ...credentials, code: devCode }),
  });
  assert.equal(registered.status, 201);
  const account = await registered.json() as { user: { id: string }; mergedEvents: number };
  assert.ok(account.mergedEvents > 0);
  const cookie = registered.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const merged = await profile(unrelatedId, cookie);
  assert.equal(merged.user.anonymousId, account.user.id);
  assert.equal(merged.video.views, 1);
  assert.equal(merged.video.watchedMs, 8000);
  assert.equal(merged.video.likes, 1);
  assert.equal((await feed(unrelatedId, 'market=SG', cookie)).items.find((item) => item.id === REELS[0].id)?.liked, true);
  assert.equal((await profile(anonymousId)).video.hasData, false);

  await record(unrelatedId, event({ type: 'save', reelId: REELS[1].id }), cookie);
  assert.equal((await profile(unrelatedId, cookie)).video.saves, 1);
  assert.equal((await profile(unrelatedId)).video.hasData, false);

  // Signing in again cannot replay the already-transferred anonymous history.
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { ...headers(anonymousId), 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json() as { mergedEvents: number }).mergedEvents, 0);
  assert.equal((await profile(unrelatedId, cookie)).video.watchedMs, 8000);

  // A second device can independently reuse a session/event ID for other content.
  // Login must transfer both sessions without losing or combining their watch time.
  const secondAnonymousId = randomUUID();
  await record(secondAnonymousId, { ...watched, reelId: REELS[1].id, watchMs: 3000 });
  const secondLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { ...headers(secondAnonymousId), 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert.equal(secondLogin.status, 200);
  assert.equal((await secondLogin.json() as { mergedEvents: number }).mergedEvents, 1);
  const combined = (await profile(unrelatedId, cookie)).video;
  assert.equal(combined.views, 2);
  assert.equal(combined.watchedMs, 11000);
  assert.equal(combined.likes, 1);
  assert.equal((await profile(secondAnonymousId)).video.hasData, false);
});
