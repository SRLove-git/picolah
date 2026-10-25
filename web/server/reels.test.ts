import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { REELS, type ReelEventInput, type ReelEventType } from '../shared/reels.ts';
import { db } from './db.ts';
import { getReelFeed, getVideoProfile, mergeVideoProfile, recordReelEvent, resetVideoProfile, type ReelEventRow } from './reels.ts';
import { buildVideoProfile, rankReels } from './reels-ranking.ts';

const owner = () => `reels-test-${randomUUID()}`;
const session = () => randomUUID();
const input = (reelId: string, type: ReelEventType, extra: Partial<ReelEventInput> = {}): ReelEventInput => ({
  eventId: randomUUID(), sessionId: session(), reelId, type, market: 'SG', ...extra,
});
const cleanup = async (...users: string[]) => {
  for (const user of users) await db.run('DELETE FROM app_users WHERE id = ?', [user]);
};

test('cold start is deterministic, diverse and does not turn seeded vanity counts into feedback', () => {
  const now = Date.parse('2026-10-25T00:00:00Z');
  const feed = rankReels('', 'SG', [], [], [], [], 5, now);
  assert.deepEqual(feed, rankReels('', 'SG', [], [], [], [], 5, now));
  assert.equal(feed.personalized, false);
  assert.equal(new Set(feed.items.map((reel) => reel.id)).size, 5);
  assert.ok(new Set(feed.items.slice(0, 3).map((reel) => reel.category)).size >= 2);
  assert.ok(feed.items.every((reel) => reel.likes === 0 && reel.shares === 0));
  assert.ok(feed.items.every((reel) => reel.reason.labelZh && reel.reason.labelEn));
  assert.deepEqual(buildVideoProfile([]).categories, []);
  assert.equal(buildVideoProfile([]).hasData, false);
});

test('cumulative watches are owner/session deduplicated, bounded and safe under concurrent updates', async () => {
  const user = owner();
  const reel = REELS[0];
  const sid = session();
  try {
    const first = input(reel.id, 'watch', { sessionId: sid, watchMs: 3_000 });
    await recordReelEvent(user, first); // Reordered transport: watch before view.
    await recordReelEvent(user, first);
    await Promise.all([8_000, 4_000, 12_000].map((watchMs) => recordReelEvent(user, input(reel.id, 'watch', { sessionId: sid, watchMs }))));
    await recordReelEvent(user, input(reel.id, 'view', { sessionId: sid }));
    await recordReelEvent(user, input(reel.id, 'view', { sessionId: sid }));
    await recordReelEvent(user, input(reel.id, 'watch', { sessionId: sid, watchMs: reel.durationMs, ended: true }));
    await recordReelEvent(user, input(reel.id, 'watch', { sessionId: sid, watchMs: 5_000, ended: false }));
    const profile = await getVideoProfile(user);
    assert.equal(profile.views, 1);
    assert.equal(profile.watchedMs, reel.durationMs);
    assert.equal(profile.completions, 1);
    assert.equal(profile.completionRate, 1);
    const rows = await db.all<ReelEventRow>('SELECT * FROM reel_events WHERE user_id = ?', [user]);
    assert.equal(rows.filter((row) => row.type === 'watch').length, 1);
    assert.equal(rows.find((row) => row.type === 'watch')?.ended, 1);
    await assert.rejects(() => recordReelEvent(user, input(reel.id, 'watch', { watchMs: reel.durationMs + 1 })), /exceeds/);
    await assert.rejects(() => recordReelEvent(user, { ...first, watchMs: 4_000 }), /event ID/);
    await assert.rejects(() => recordReelEvent(user, input(REELS[1].id, 'view', { sessionId: sid })), /original reel/);
  } finally { await cleanup(user); }
});

test('zero playing time does not create engagement, while short ended viewing is a skip', async () => {
  const user = owner();
  try {
    await recordReelEvent(user, input(REELS[0].id, 'watch', { watchMs: 0 }));
    assert.equal((await getVideoProfile(user)).hasData, false);
    await recordReelEvent(user, input(REELS[0].id, 'watch', { watchMs: 500, ended: true }));
    const profile = await getVideoProfile(user);
    assert.equal(profile.skips, 1);
    assert.equal(profile.completions, 0);
    assert.equal(profile.categories.length, 0);
    assert.notEqual((await getReelFeed(user, 'SG')).items[0].id, REELS[0].id);
  } finally { await cleanup(user); }
});

test('likes/saves/follows store one latest state, including follow state shared by creator', async () => {
  const user = owner();
  try {
    for (const type of ['like', 'like', 'save', 'save', 'follow', 'follow'] as const) await recordReelEvent(user, input(REELS[0].id, type));
    const profile = await getVideoProfile(user);
    assert.deepEqual([profile.likes, profile.saves, profile.follows], [1, 1, 1]);
    let feed = await getReelFeed(user, 'SG');
    assert.equal(feed.items.find((reel) => reel.id === REELS[3].id)?.following, true);
    await recordReelEvent(user, input(REELS[3].id, 'unfollow'));
    await recordReelEvent(user, input(REELS[0].id, 'unlike'));
    await recordReelEvent(user, input(REELS[0].id, 'unsave'));
    const undone = await getVideoProfile(user);
    assert.deepEqual([undone.likes, undone.saves, undone.follows], [0, 0, 0]);
    assert.deepEqual(undone.categories, []);
    feed = await getReelFeed(user, 'SG');
    assert.ok(feed.items.every((reel) => !reel.following && !reel.liked && !reel.saved));
  } finally { await cleanup(user); }
});

test('two users get distinct category priorities; weaker market preference cannot override interest', async () => {
  const audioUser = owner();
  const skincareUser = owner();
  const applianceUser = owner();
  try {
    await recordReelEvent(audioUser, input(REELS[0].id, 'save'));
    await recordReelEvent(skincareUser, input(REELS[2].id, 'save'));
    await recordReelEvent(applianceUser, input(REELS[4].id, 'compare'));
    assert.equal((await getReelFeed(audioUser, 'SG')).items[0].category, '耳机');
    assert.equal((await getReelFeed(skincareUser, 'SG')).items[0].category, '护肤');
    assert.equal((await getReelFeed(applianceUser, 'SG')).items[0].market, 'VN');
    assert.equal((await getVideoProfile(audioUser)).categories[0].id, '耳机');
    assert.equal((await getVideoProfile(skincareUser)).categories[0].id, '护肤');
  } finally { await cleanup(audioUser, skincareUser, applianceUser); }
});

test('not interested and explicit exclusions are respected even when the small pool is exhausted', async () => {
  const user = owner();
  try {
    await recordReelEvent(user, input(REELS[0].id, 'not_interested'));
    const feed = await getReelFeed(user, 'SG', REELS.slice(1).map((reel) => reel.id));
    assert.deepEqual(feed.items, []);
    assert.ok(!(await getReelFeed(user, 'SG')).items.some((reel) => reel.id === REELS[0].id));
  } finally { await cleanup(user); }
});

test('event/session identities belong to each owner and profile reset removes receipts too', async () => {
  const left = owner();
  const right = owner();
  const event = input(REELS[1].id, 'like');
  try {
    await recordReelEvent(left, event);
    await recordReelEvent(right, { ...event, reelId: REELS[2].id });
    assert.equal((await getVideoProfile(left)).brands[0].id, 'Apple');
    assert.equal((await getVideoProfile(right)).brands[0].id, 'SK-II');
    await resetVideoProfile(left);
    assert.equal((await getVideoProfile(left)).hasData, false);
    assert.equal((await getVideoProfile(right)).likes, 1);
    await recordReelEvent(left, event); // Reused client retry after reset is fresh.
    assert.equal((await getVideoProfile(left)).likes, 1);
  } finally { await cleanup(left, right); }
});

test('anonymous merge preserves preferences, cumulative time and conflicting sessions without leaking ownership', async () => {
  const anon = owner();
  const account = owner();
  const sid = session();
  const eid = randomUUID();
  try {
    await recordReelEvent(anon, input(REELS[0].id, 'watch', { eventId: eid, sessionId: sid, watchMs: 7_000 }));
    await recordReelEvent(account, input(REELS[1].id, 'watch', { eventId: eid, sessionId: sid, watchMs: 5_000 }));
    await recordReelEvent(anon, input(REELS[2].id, 'save'));
    assert.equal(await mergeVideoProfile(anon, account), 2);
    assert.equal((await getVideoProfile(anon)).hasData, false);
    const profile = await getVideoProfile(account);
    assert.equal(profile.watchedMs, 12_000);
    assert.equal(profile.views, 2);
    assert.equal(profile.saves, 1);
    await db.run('DELETE FROM app_users WHERE id = ?', [anon]);
    assert.equal((await getVideoProfile(account)).saves, 1);
    assert.equal(await mergeVideoProfile(anon, account), 0);
    assert.equal((await getVideoProfile(account)).watchedMs, 12_000);
  } finally { await cleanup(anon, account); }
});

test('shopping behavior provides recommendation signal before any video viewing', async () => {
  const user = owner();
  try {
    const stamp = new Date().toISOString();
    await db.run('INSERT INTO app_users (id, created_at, last_seen_at) VALUES (?, ?, ?)', [user, stamp, stamp]);
    await db.run(
      'INSERT INTO user_events (id, user_id, type, market, product_id, category, brand, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), user, 'comparison', 'SG', REELS[4].productId, REELS[4].category, REELS[4].brand, stamp],
    );
    const feed = await getReelFeed(user, 'SG');
    assert.equal(feed.personalized, true);
    assert.equal(feed.items[0].id, REELS[4].id);
    assert.equal((await getVideoProfile(user)).hasData, false);
  } finally { await cleanup(user); }
});

test('recent interest outweighs old interest and repeated viewers cannot inflate quality', () => {
  const now = Date.parse('2026-10-25T00:00:00Z');
  const row = (reelIndex: number, stamp: number, sid: string, userId = 'same-viewer'): ReelEventRow => ({
    user_id: userId, state_key: `watch:${sid}`, event_id: sid, session_id: sid,
    reel_id: REELS[reelIndex].id, type: 'watch', market: 'SG', watch_ms: REELS[reelIndex].durationMs,
    ended: 1, created_at: new Date(stamp).toISOString(), updated_at: new Date(stamp).toISOString(),
  });
  const old = row(0, now - 80 * 86_400_000, 'old-watch');
  const recent = row(2, now, 'recent-watch');
  const feed = rankReels('same-viewer', 'SG', [old, recent], [], [], [], 5, now);
  assert.equal(feed.items[0].id, REELS[2].id);
  const repeated = Array.from({ length: 100 }, (_, i) => row(0, now, `loop-${i}`));
  const single = rankReels('', 'SG', [], [repeated[0]], [], [], 5, now);
  const many = rankReels('', 'SG', [], repeated, [], [], 5, now);
  assert.deepEqual(single, many);
});
