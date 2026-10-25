import { REELS, type ReelEventInput, type ReelFeed, type ReelFeedItem } from '../../shared/reels';
import type { CountryCode } from '../../shared/types';
import { isMockMode } from './api';
import { userHeaders } from './user';

// Demo state is intentionally memory-only and never sent to the API.
const demoFlags = new Map<string, Partial<ReelFeedItem>>();
const demoHidden = new Set<string>();
const demoFollowing = new Set<string>();

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  throw new Error(`Reels request failed (${response.status})`);
}

export async function getReelFeed(
  market: CountryCode,
  exclude: string[] = [],
  signal?: AbortSignal,
): Promise<ReelFeed> {
  if (isMockMode()) {
    return {
      items: REELS.filter((item) => !exclude.includes(item.id) && !demoHidden.has(item.id)).map((item) => ({
        ...item,
        liked: false,
        saved: false,
        ...demoFlags.get(item.id),
        following: demoFollowing.has(item.handle),
        reason: { code: 'explore', labelZh: '演示内容 · 探索新兴趣', labelEn: 'Demo · explore something new' },
      })),
      personalized: false,
      algorithmVersion: 'offline-demo',
    };
  }
  const query = new URLSearchParams({ market, limit: '5' });
  if (exclude.length) query.set('exclude', exclude.join(','));
  const response = await fetch(`/api/reels?${query}`, {
    signal,
    headers: { Accept: 'application/json', ...userHeaders() },
  });
  await assertOk(response);
  return await response.json() as ReelFeed;
}

export async function recordReelEvent(event: ReelEventInput, keepalive = false): Promise<void> {
  if (isMockMode()) {
    const flags = demoFlags.get(event.reelId) ?? {};
    if (event.type === 'like' || event.type === 'unlike') {
      const liked = event.type === 'like';
      const count = flags.likes ?? REELS.find((item) => item.id === event.reelId)?.likes ?? 0;
      if (liked !== Boolean(flags.liked)) flags.likes = Math.max(0, count + (liked ? 1 : -1));
      flags.liked = liked;
    }
    if (event.type === 'save' || event.type === 'unsave') flags.saved = event.type === 'save';
    if (event.type === 'not_interested') demoHidden.add(event.reelId);
    const handle = REELS.find((item) => item.id === event.reelId)?.handle;
    if (handle && event.type === 'follow') demoFollowing.add(handle);
    if (handle && event.type === 'unfollow') demoFollowing.delete(handle);
    demoFlags.set(event.reelId, flags);
    return;
  }
  const response = await fetch('/api/reels/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify(event),
    keepalive,
  });
  // This endpoint deliberately returns 204, with no JSON body.
  await assertOk(response);
}

export function reelEventId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `reel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
