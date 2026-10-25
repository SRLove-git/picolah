import assert from 'node:assert/strict';
import test from 'node:test';
import { REELS, type VideoProfile } from '../../shared/reels.ts';
import type { ShoppingProfile } from '../../shared/types.ts';
import { accountActivity, type ActivityTab } from './account-activity.ts';

const stamp = (second: number) => `2026-10-25T08:00:${String(second).padStart(2, '0')}.000Z`;
const clip = REELS[0]!;
const nextClip = REELS[1]!;

function profileWith(
  recent: VideoProfile['recent'] = [],
  shopping: ShoppingProfile['recent'] = [],
): ShoppingProfile {
  return {
    hasData: recent.length > 0 || shopping.length > 0,
    user: { anonymousId: 'account-test-user', firstSeen: stamp(0), lastSeen: stamp(59), activeDays: 1 },
    totals: { comparisons: 0, clicks: 0, offersSeen: 0, conversations: 0 },
    persona: null,
    traits: [], markets: [], platforms: [], categories: [], brands: [], budget: null,
    recent: shopping,
    video: {
      hasData: recent.length > 0,
      views: 0, watchedMs: 0, completions: 0, skips: 0,
      likes: 0, saves: 0, follows: 0, completionRate: 0,
      categories: [], brands: [], topics: [], creators: [], recent,
    },
  };
}

const event = (reelId: string, type: VideoProfile['recent'][number]['type'], second: number) => ({
  reelId, title: `Recent title: ${reelId}`, type, createdAt: stamp(second),
});

test('empty and unavailable profiles expose no activity on any tab', () => {
  for (const tab of ['watched', 'likes', 'saved', 'browsing'] satisfies ActivityTab[]) {
    assert.deepEqual(accountActivity(null, tab, false), []);
    assert.deepEqual(accountActivity(profileWith(), tab, false), []);
  }
});

test('watched clips deduplicate view and watch sessions using the newest timestamp', () => {
  const profile = profileWith([
    event(clip.id, 'view', 3),
    event(nextClip.id, 'watch', 8),
    event(clip.id, 'watch', 10),
    event(clip.id, 'like', 20),
    event(nextClip.id, 'share', 30),
  ]);
  const result = accountActivity(profile, 'watched', false);
  assert.deepEqual(result.map(({ id, createdAt, kind }) => ({ id, createdAt, kind })), [
    { id: clip.id, createdAt: stamp(10), kind: 'video' },
    { id: nextClip.id, createdAt: stamp(8), kind: 'video' },
  ]);
  assert.equal(result[0]?.reel, clip);
  assert.equal(result[0]?.title, `Recent title: ${clip.id}`);
  assert.equal(profile.video.recent[0]?.createdAt, stamp(3), 'sorting must not mutate the profile snapshot');
});

test('aggregate counts and the content registry never fabricate liked or saved records', () => {
  const profile = profileWith([event(clip.id, 'view', 1)]);
  profile.video.likes = 200;
  profile.video.saves = 100;
  assert.deepEqual(accountActivity(profile, 'likes', false), []);
  assert.deepEqual(accountActivity(profile, 'saved', false), []);

  profile.video.recent.push(event(clip.id, 'like', 2), event(nextClip.id, 'save', 3));
  assert.deepEqual(accountActivity(profile, 'likes', false).map(({ id }) => id), [clip.id]);
  assert.deepEqual(accountActivity(profile, 'saved', false).map(({ id }) => id), [nextClip.id]);
});

test('the newest undo excludes an earlier like or save while a newer positive toggle restores it', () => {
  const profile = profileWith([
    event(clip.id, 'like', 1), event(clip.id, 'unlike', 3),
    event(nextClip.id, 'unlike', 2), event(nextClip.id, 'like', 4),
    event(clip.id, 'save', 5), event(clip.id, 'unsave', 7),
    event(nextClip.id, 'unsave', 6), event(nextClip.id, 'save', 8),
  ]);
  assert.deepEqual(accountActivity(profile, 'likes', false).map(({ id }) => id), [nextClip.id]);
  assert.deepEqual(accountActivity(profile, 'saved', false).map(({ id }) => id), [nextClip.id]);
});

test('browsing uses the requested language and preserves event type and timestamp', () => {
  const profile = profileWith([], [
    { id: 'comparison-one', type: 'comparison', titleZh: '耳机比价', titleEn: 'Compare headphones', market: 'SG', createdAt: stamp(2) },
    { id: 'click-one', type: 'offer_click', titleZh: '查看商家', titleEn: 'View merchant', market: 'MY', createdAt: stamp(1) },
  ]);
  assert.deepEqual(accountActivity(profile, 'browsing', false), [
    { id: 'comparison-one', title: '耳机比价', kind: 'comparison', createdAt: stamp(2) },
    { id: 'click-one', title: '查看商家', kind: 'offer_click', createdAt: stamp(1) },
  ]);
  assert.deepEqual(accountActivity(profile, 'browsing', true).map(({ title }) => title), ['Compare headphones', 'View merchant']);
});

test('unknown reel metadata stays absent while the recorded title remains readable', () => {
  const profile = profileWith([event('retired-clip', 'watch', 1), event(clip.id, 'watch', 2)]);
  const result = accountActivity(profile, 'watched', true);
  assert.equal(result[0]?.title, clip.productName);
  assert.equal(result[1]?.id, 'retired-clip');
  assert.equal(result[1]?.title, 'Recent title: retired-clip');
  assert.equal(result[1]?.reel, undefined);
  assert.equal(result[1]?.kind, 'video');
});
