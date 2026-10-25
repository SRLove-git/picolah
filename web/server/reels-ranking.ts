import { REELS, type Reel, type ReelFeed, type ReelFeedItem, type VideoInterest, type VideoProfile } from '../shared/reels.ts';
import type { CountryCode } from '../shared/types.ts';
import type { ReelEventRow } from './reels.ts';

const CATALOG = new Map(REELS.map((reel) => [reel.id, reel]));
const DAY = 86_400_000;
const LABEL_EN: Record<string, string> = {
  耳机: 'Audio', 音频: 'Audio', 手机: 'Phones', 护肤: 'Skincare', 家电: 'Home appliances',
  降噪: 'Noise cancellation', 跨市场比价: 'Cross-market prices', 测评: 'Reviews',
  换机: 'Phone upgrades', 价格趋势: 'Price trends', 数码: 'Tech', 成分: 'Ingredients',
  官方店: 'Official stores', 厨房: 'Kitchen', 开箱: 'Unboxing',
};

type Affinities = { categories: Map<string, number>; brands: Map<string, number>; topics: Map<string, number>; creators: Map<string, number>; products: Map<string, number> };
export interface ShoppingSignal { type: string; product_id: string | null; category: string | null; brand: string | null; created_at: string }

/** A blend of 7-day and 30-day half lives preserves lasting interests while
 * allowing this week's viewing choices to change the feed. */
function decay(stamp: string, now: number): number {
  const age = Math.max(0, (now - Date.parse(stamp)) / DAY);
  return 0.65 * 2 ** (-age / 7) + 0.35 * 2 ** (-age / 30);
}

function interestWeight(row: ReelEventRow, reel: Reel): number {
  if (row.type === 'watch') {
    const ratio = Math.min(1, row.watch_ms / reel.durationMs);
    if (row.ended && ratio < 0.15) return -2;
    return ratio * 1.2 + (ratio >= 0.9 ? 1.8 : 0);
  }
  return ({ like: 3.5, save: 4.5, follow: 4, share: 2, compare: 5, not_interested: -7 } as Partial<Record<ReelEventRow['type'], number>>)[row.type] ?? 0;
}

function add(bucket: Map<string, number>, id: string, weight: number): void {
  if (id) bucket.set(id, (bucket.get(id) ?? 0) + weight);
}

function learn(rows: ReelEventRow[], shopping: ShoppingSignal[], now: number): Affinities {
  const result: Affinities = { categories: new Map(), brands: new Map(), topics: new Map(), creators: new Map(), products: new Map() };
  for (const row of rows) {
    const reel = CATALOG.get(row.reel_id);
    if (!reel) continue;
    const weight = interestWeight(row, reel) * decay(row.updated_at, now);
    add(result.categories, reel.category, weight);
    add(result.brands, reel.brand, weight * 0.7);
    add(result.products, reel.productId, weight * 0.8);
    add(result.creators, reel.handle, weight * (row.type === 'follow' ? 2 : 0.35));
    for (const topic of reel.topics) add(result.topics, topic, weight / Math.max(1, reel.topics.length));
  }
  for (const row of shopping) {
    const weight = (row.type === 'offer_click' ? 2.3 : 1.6) * decay(row.created_at, now);
    add(result.categories, row.category === '音频' ? '耳机' : row.category ?? '', weight);
    add(result.brands, row.brand ?? '', weight * 0.8);
    add(result.products, row.product_id ?? '', weight * 1.4);
  }
  return result;
}

function dimensions(bucket: Map<string, number>, creators = false): VideoInterest[] {
  const entries = [...bucket].filter(([, score]) => score > 0.001).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = entries.reduce((sum, [, score]) => sum + score, 0);
  return entries.map(([id, score]) => ({
    id,
    labelZh: creators ? REELS.find((reel) => reel.handle === id)?.author ?? id : id,
    labelEn: LABEL_EN[id] ?? id,
    score: Number(score.toFixed(3)),
    share: Number((score / total).toFixed(3)),
  }));
}

export function buildVideoProfile(rows: ReelEventRow[], now = Date.now()): VideoProfile {
  const valid = rows.filter((row) => CATALOG.has(row.reel_id));
  const watches = valid.filter((row) => row.type === 'watch');
  const views = new Set(valid.filter((row) => row.type === 'view' || row.type === 'watch').map((row) => row.session_id)).size;
  const completions = watches.filter((row) => row.watch_ms / CATALOG.get(row.reel_id)!.durationMs >= 0.9).length;
  const interests = learn(valid, [], now);
  return {
    hasData: valid.length > 0,
    views,
    watchedMs: watches.reduce((sum, row) => sum + row.watch_ms, 0),
    completions,
    skips: watches.filter((row) => row.ended && row.watch_ms / CATALOG.get(row.reel_id)!.durationMs < 0.15).length,
    likes: valid.filter((row) => row.type === 'like').length,
    saves: valid.filter((row) => row.type === 'save').length,
    follows: valid.filter((row) => row.type === 'follow').length,
    completionRate: views ? Number((completions / views).toFixed(3)) : 0,
    categories: dimensions(interests.categories), brands: dimensions(interests.brands),
    topics: dimensions(interests.topics), creators: dimensions(interests.creators, true),
    recent: [...valid].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.state_key.localeCompare(b.state_key)).slice(0, 12).map((row) => ({
      reelId: row.reel_id, title: CATALOG.get(row.reel_id)!.title, type: row.type, createdAt: row.updated_at,
    })),
  };
}

interface Quality { score: number; viewers: number; likes: number; shares: number }
function qualityByReel(rows: ReelEventRow[]): Map<string, Quality> {
  const viewers = new Map<string, Map<string, { ratio: number; positive: boolean; negative: boolean; viewed: boolean }>>();
  const likes = new Map<string, Set<string>>();
  const shares = new Map<string, Set<string>>();
  for (const row of rows) {
    const reel = CATALOG.get(row.reel_id);
    if (!reel) continue;
    const owners = viewers.get(row.reel_id) ?? new Map();
    const state = owners.get(row.user_id) ?? { ratio: 0, positive: false, negative: false, viewed: false };
    state.ratio = Math.max(state.ratio, row.watch_ms / reel.durationMs);
    state.viewed ||= row.type === 'watch' || row.type === 'view';
    state.positive ||= ['like', 'save', 'compare', 'share'].includes(row.type);
    state.negative ||= row.type === 'not_interested' || (row.type === 'watch' && !!row.ended && row.watch_ms / reel.durationMs < 0.15);
    owners.set(row.user_id, state);
    viewers.set(row.reel_id, owners);
    if (row.type === 'like') {
      const owners = likes.get(row.reel_id) ?? new Set(); owners.add(row.user_id); likes.set(row.reel_id, owners);
    }
    if (row.type === 'share') {
      const owners = shares.get(row.reel_id) ?? new Set(); owners.add(row.user_id); shares.set(row.reel_id, owners);
    }
  }
  return new Map(REELS.map((reel) => {
    const states = [...(viewers.get(reel.id)?.values() ?? [])].filter((state) => state.viewed || state.positive || state.negative);
    // Beta-style smoothing with ten neutral prior viewers. Each real viewer
    // contributes at most one sample, irrespective of loops or heartbeat count.
    const successes = states.reduce((sum, state) => sum + (state.negative ? 0 : state.positive ? 1 : state.ratio), 0);
    return [reel.id, { score: (successes + 5) / (states.length + 10) - 0.5, viewers: states.length, likes: likes.get(reel.id)?.size ?? 0, shares: shares.get(reel.id)?.size ?? 0 }];
  }));
}

const squash = (value = 0) => Math.sign(value) * Math.log1p(Math.abs(value));
function similarity(reel: Reel, interests: Affinities): number {
  return squash(interests.categories.get(reel.category)) * 1.6 + squash(interests.brands.get(reel.brand)) * 0.8 +
    squash(interests.products.get(reel.productId)) * 0.9 + squash(interests.creators.get(reel.handle)) * 0.5 +
    reel.topics.reduce((sum, topic) => sum + squash(interests.topics.get(topic)), 0) * 0.35;
}

function reason(code: ReelFeedItem['reason']['code'], labelZh: string, labelEn: string): ReelFeedItem['reason'] {
  return { code, labelZh, labelEn };
}

export function rankReels(
  _userId: string, market: CountryCode, rows: ReelEventRow[], globalRows: ReelEventRow[],
  shopping: ShoppingSignal[], exclude: string[], limit: number, now = Date.now(),
): ReelFeed {
  const interests = learn(rows, shopping, now);
  const quality = qualityByReel(globalRows);
  const hidden = new Set(rows.filter((row) => row.type === 'not_interested').map((row) => row.reel_id));
  const liked = new Set(rows.filter((row) => row.type === 'like').map((row) => row.reel_id));
  const saved = new Set(rows.filter((row) => row.type === 'save').map((row) => row.reel_id));
  const follows = new Set(rows.filter((row) => row.type === 'follow').map((row) => CATALOG.get(row.reel_id)?.handle));
  const seen = new Map<string, number>();
  for (const row of rows.filter((item) => item.type === 'view' || item.type === 'watch')) {
    seen.set(row.reel_id, Math.max(seen.get(row.reel_id) ?? 0, Date.parse(row.updated_at)));
  }
  const personalized = shopping.length > 0 || rows.some((row) => {
    const reel = CATALOG.get(row.reel_id); return reel && interestWeight(row, reel) !== 0;
  });
  let candidates = REELS.filter((reel) => !hidden.has(reel.id) && !exclude.includes(reel.id)).map((reel) => {
    const interest = similarity(reel, interests);
    const feedback = quality.get(reel.id)!;
    const age = Math.max(0, (now - Date.parse(reel.publishedAt)) / DAY);
    const freshness = 0.2 * 2 ** (-age / 14);
    const repeat = seen.has(reel.id) ? 1.8 * 2 ** (-Math.max(0, now - seen.get(reel.id)!) / DAY) : 0;
    return { reel, interest, feedback, freshness,
      score: interest + feedback.score * 1.5 + freshness + (follows.has(reel.handle) ? 1.2 : 0) + (reel.market === market ? 0.15 : 0) - repeat,
      explore: false,
    };
  });
  const selected: typeof candidates = [];
  const total = Math.min(limit, candidates.length);
  while (selected.length < total) {
    const adjusted = (candidate: typeof candidates[number]) => candidate.score - selected.reduce((penalty, previous) => penalty +
      (previous.reel.handle === candidate.reel.handle ? 0.65 : 0) + (previous.reel.category === candidate.reel.category ? 0.35 : 0) +
      (previous.reel.brand === candidate.reel.brand ? 0.15 : 0), 0);
    candidates.sort((a, b) => adjusted(b) - adjusted(a) || a.reel.id.localeCompare(b.reel.id));
    // A small pool cannot support endless new clips. Reserve one discovery slot
    // only when an unseen, non-negative-interest candidate actually exists.
    let chosen = candidates[0];
    if (selected.length === 3 && personalized) {
      const discovery = candidates.filter((candidate) => !seen.has(candidate.reel.id) && candidate.interest >= 0 &&
        !selected.some((previous) => previous.reel.category === candidate.reel.category))
        .sort((a, b) => b.freshness - a.freshness || a.feedback.viewers - b.feedback.viewers || a.reel.id.localeCompare(b.reel.id))[0];
      if (discovery) { chosen = discovery; chosen.explore = true; }
    }
    selected.push(chosen);
    candidates = candidates.filter((candidate) => candidate.reel.id !== chosen.reel.id);
  }
  return {
    algorithmVersion: 'picolah-hybrid-v1', personalized,
    items: selected.map(({ reel, interest, feedback, explore }) => ({
      ...reel,
      // Demo card metadata never masquerades as measured social feedback.
      likes: feedback.likes, comments: 0, shares: feedback.shares,
      liked: liked.has(reel.id), saved: saved.has(reel.id), following: follows.has(reel.handle),
      reason: explore ? reason('explore', '发现一个新兴趣', 'Discover a new interest') :
        follows.has(reel.handle) ? reason('following', '来自你关注的创作者', 'From a creator you follow') :
          interest > 0.1 ? reason('interest', '根据你的观看和购物兴趣', 'Based on your viewing and shopping interests') :
            feedback.viewers >= 5 && feedback.score > 0.05 ? reason('popular', '近期观众反馈较好', 'Positive recent viewer feedback') :
              reel.market === market ? reason('market', '与你的购物市场相关', 'Relevant to your shopping market') :
                reason('fresh', '试试不同品类', 'Try a different category'),
    })),
  };
}
