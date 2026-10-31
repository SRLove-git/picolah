import { randomBytes } from 'node:crypto';
import type { ShoppingProfile } from '../shared/types.ts';
import { db } from './db.ts';
import { getShoppingProfile } from './profile.ts';

export interface SharedPreference {
  zh: string;
  en: string;
}

export type Relationship = 'none' | 'requested' | 'incoming' | 'friend';

export interface RadarCandidate {
  id: string;
  displayName: string;
  avatar: string;
  similarity: number;
  shared: SharedPreference[];
  relationship: Relationship;
}

export interface RadarSelf {
  hasData: boolean;
  personaZh: string;
  personaEn: string;
  taglineZh: string;
  taglineEn: string;
  categories: SharedPreference[];
  brands: SharedPreference[];
  platforms: SharedPreference[];
  budget: ShoppingProfile['budget'];
  comparisons: number;
  clicks: number;
}

export interface FriendRequestView {
  id: string;
  userId: string;
  displayName: string;
  avatar: string;
  createdAt: string;
}

export interface FriendView {
  id: string;
  displayName: string;
  avatar: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface DirectMessage {
  id: string;
  fromUser: string;
  toUser: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

type UserRow = { id: string; display_name: string; avatar: string };
type RequestRow = { id: string; from_user: string; to_user: string; created_at: string; display_name: string; avatar: string };
type MessageRow = {
  id: string;
  from_user: string;
  to_user: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

const MAX_CANDIDATES = 80;
const RADAR_LIMIT = 24;
const MIN_RADAR_SIMILARITY = 45;

function now(): string {
  return new Date().toISOString();
}

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Weighted sparse preference vector derived from the shopping profile. */
export function preferenceVector(profile: ShoppingProfile): Map<string, number> {
  const vector = new Map<string, number>();
  const add = (key: string, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    vector.set(key, (vector.get(key) ?? 0) + value);
  };

  for (const item of profile.categories) add(`category:${item.id}`, item.share);
  for (const item of profile.brands) add(`brand:${item.id}`, item.share * 1.2);
  for (const item of profile.platforms) add(`platform:${item.id}`, item.share * 0.4);
  for (const item of profile.markets) add(`market:${item.id}`, item.share * 0.3);
  for (const trait of profile.traits) add(`trait:${trait.key}`, (trait.score / 100) * 0.8);
  return vector;
}

function cosine(left: Map<string, number>, right: Map<string, number>): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const value of left.values()) leftNorm += value * value;
  for (const value of right.values()) rightNorm += value * value;
  for (const [key, value] of left) {
    const other = right.get(key);
    if (other) dot += value * other;
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function sharedPreferences(
  left: ShoppingProfile,
  right: ShoppingProfile,
  limit = 3,
): SharedPreference[] {
  const pairs: Array<{ zh: string; en: string; weight: number }> = [];

  const compare = (
    mine: ShoppingProfile['categories'],
    theirs: ShoppingProfile['categories'],
    weight: number,
  ) => {
    const index = new Map(mine.map((item) => [item.id, item]));
    for (const item of theirs) {
      const match = index.get(item.id);
      if (match) {
        pairs.push({
          zh: match.labelZh,
          en: match.labelEn,
          weight: weight * Math.min(match.share, item.share),
        });
      }
    }
  };

  compare(left.categories, right.categories, 1);
  compare(left.brands, right.brands, 1.2);
  compare(left.platforms, right.platforms, 0.4);
  compare(left.markets, right.markets, 0.3);

  return pairs
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((item) => ({ zh: item.zh, en: item.en }));
}

function topLabels(items: ShoppingProfile['categories']): SharedPreference[] {
  return items.slice(0, 4).map((item) => ({ zh: item.labelZh, en: item.labelEn }));
}

function hasCorePreferenceOverlap(left: ShoppingProfile, right: ShoppingProfile): boolean {
  const rightCategories = new Set(right.categories.map((item) => item.id));
  const rightBrands = new Set(right.brands.map((item) => item.id));
  return (
    left.categories.some((item) => rightCategories.has(item.id)) ||
    left.brands.some((item) => rightBrands.has(item.id))
  );
}

export async function radarSelf(userId: string): Promise<RadarSelf> {
  const profile = await getShoppingProfile(userId);
  return {
    hasData: profile.hasData,
    personaZh: profile.persona?.nameZh ?? '',
    personaEn: profile.persona?.nameEn ?? '',
    taglineZh: profile.persona?.taglineZh ?? '',
    taglineEn: profile.persona?.taglineEn ?? '',
    categories: topLabels(profile.categories),
    brands: topLabels(profile.brands),
    platforms: topLabels(profile.platforms),
    budget: profile.budget,
    comparisons: profile.totals.comparisons,
    clicks: profile.totals.clicks,
  };
}

export async function listRadar(userId: string): Promise<RadarCandidate[]> {
  const mine = await getShoppingProfile(userId);
  if (!mine.hasData) return [];
  const mineVector = preferenceVector(mine);

  const rows = await db.all<{ user_id: string }>(
    `SELECT DISTINCT e.user_id
       FROM user_events e
       JOIN users u ON u.id = e.user_id
      WHERE e.user_id <> ?
      LIMIT ?`,
    [userId, MAX_CANDIDATES],
  );

  const candidates: RadarCandidate[] = [];
  for (const row of rows) {
    const person = await db.get<UserRow>('SELECT id, display_name, avatar FROM users WHERE id = ?', [row.user_id]);
    if (!person) continue;
    const profile = await getShoppingProfile(row.user_id);
    if (!profile.hasData) continue;
    if (!hasCorePreferenceOverlap(mine, profile)) continue;
    const similarity = Math.min(99, Math.round(cosine(mineVector, preferenceVector(profile)) * 100));
    if (similarity < MIN_RADAR_SIMILARITY) continue;
    candidates.push({
      id: person.id,
      displayName: person.display_name,
      avatar: person.avatar,
      similarity,
      shared: sharedPreferences(mine, profile),
      relationship: await relationship(userId, person.id),
    });
  }

  return candidates
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, RADAR_LIMIT);
}

async function areFriends(left: string, right: string): Promise<boolean> {
  const [a, b] = pair(left, right);
  const row = await db.get<{ id: string }>(
    'SELECT id FROM friendships WHERE user_a = ? AND user_b = ?',
    [a, b],
  );
  return Boolean(row);
}

async function pendingBetween(left: string, right: string): Promise<{ from: string; to: string } | null> {
  const row = await db.get<{ from_user: string; to_user: string }>(
    `SELECT from_user, to_user FROM friend_requests
     WHERE status = 'pending'
       AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))`,
    [left, right, right, left],
  );
  return row ? { from: row.from_user, to: row.to_user } : null;
}

async function relationship(viewer: string, other: string): Promise<Relationship> {
  if (await areFriends(viewer, other)) return 'friend';
  const pending = await pendingBetween(viewer, other);
  if (!pending) return 'none';
  return pending.from === viewer ? 'requested' : 'incoming';
}

export async function listIncomingRequests(userId: string): Promise<FriendRequestView[]> {
  const rows = await db.all<RequestRow>(
    `SELECT fr.id, fr.from_user, fr.to_user, fr.created_at, u.display_name, u.avatar
     FROM friend_requests fr
     JOIN users u ON u.id = fr.from_user
     WHERE fr.to_user = ? AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.from_user,
    displayName: row.display_name,
    avatar: row.avatar,
    createdAt: row.created_at,
  }));
}

export async function listOutgoingRequests(userId: string): Promise<FriendRequestView[]> {
  const rows = await db.all<RequestRow>(
    `SELECT fr.id, fr.from_user, fr.to_user, fr.created_at, u.display_name, u.avatar
     FROM friend_requests fr
     JOIN users u ON u.id = fr.to_user
     WHERE fr.from_user = ? AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.to_user,
    displayName: row.display_name,
    avatar: row.avatar,
    createdAt: row.created_at,
  }));
}

export async function listFriends(userId: string): Promise<FriendView[]> {
  const rows = await db.all<{ id: string; display_name: string; avatar: string }>(
    `SELECT u.id, u.display_name, u.avatar
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
     WHERE f.user_a = ? OR f.user_b = ?
     ORDER BY lower(u.display_name) ASC`,
    [userId, userId, userId],
  );
  const friends: FriendView[] = [];
  for (const row of rows) {
    const last = await db.get<{ body: string; created_at: string }>(
      `SELECT body, created_at FROM direct_messages
       WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
       ORDER BY created_at DESC LIMIT 1`,
      [userId, row.id, row.id, userId],
    );
    const unread = await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM direct_messages
       WHERE to_user = ? AND from_user = ? AND read_at IS NULL`,
      [userId, row.id],
    );
    friends.push({
      id: row.id,
      displayName: row.display_name,
      avatar: row.avatar,
      lastMessage: last?.body ?? null,
      lastMessageAt: last?.created_at ?? null,
      unread: Number(unread?.count ?? 0),
    });
  }
  return friends;
}

export class SocialError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function sendFriendRequest(fromUser: string, toUser: string): Promise<'pending' | 'accepted'> {
  if (fromUser === toUser) throw new SocialError(422, '不能添加自己为好友。');
  if (await areFriends(fromUser, toUser)) throw new SocialError(409, '你们已经是好友了。');

  const pending = await pendingBetween(fromUser, toUser);
  if (pending) {
    if (pending.from === fromUser) return 'pending';
    const [a, b] = pair(fromUser, toUser);
    await db.run('UPDATE friend_requests SET status = ?, updated_at = ? WHERE from_user = ? AND to_user = ?', [
      'accepted',
      now(),
      toUser,
      fromUser,
    ]);
    await db.run(
      `INSERT INTO friendships (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_a, user_b) DO NOTHING`,
      [randomBytes(16).toString('hex'), a, b, now()],
    );
    return 'accepted';
  }

  const existing = await db.get<{ id: string }>(
    'SELECT id FROM friend_requests WHERE from_user = ? AND to_user = ?',
    [fromUser, toUser],
  );
  if (existing) {
    await db.run('UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ?', [
      'pending',
      now(),
      existing.id,
    ]);
  } else {
    await db.run(
      `INSERT INTO friend_requests (id, from_user, to_user, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [randomBytes(16).toString('hex'), fromUser, toUser, now(), now()],
    );
  }
  return 'pending';
}

export async function respondToRequest(
  userId: string,
  requestId: string,
  accept: boolean,
): Promise<void> {
  const row = await db.get<{ from_user: string; to_user: string; status: string }>(
    'SELECT from_user, to_user, status FROM friend_requests WHERE id = ?',
    [requestId],
  );
  if (!row || row.to_user !== userId) throw new SocialError(404, '好友请求不存在。');
  if (row.status !== 'pending') throw new SocialError(409, '该请求已处理。');

  await db.run('UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ?', [
    accept ? 'accepted' : 'declined',
    now(),
    requestId,
  ]);
  if (accept) {
    const [a, b] = pair(row.from_user, row.to_user);
    await db.run(
      `INSERT INTO friendships (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_a, user_b) DO NOTHING`,
      [randomBytes(16).toString('hex'), a, b, now()],
    );
  }
}

export async function listMessages(
  userId: string,
  otherId: string,
  after = '',
): Promise<DirectMessage[]> {
  if (!(await areFriends(userId, otherId))) throw new SocialError(403, '需要先成为好友。');
  const rows = await db.all<MessageRow>(
    `SELECT id, from_user, to_user, body, created_at, read_at
     FROM direct_messages
     WHERE ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))
       AND created_at > ?
     ORDER BY created_at ASC
     LIMIT 200`,
    [userId, otherId, otherId, userId, after],
  );
  await db.run(
    'UPDATE direct_messages SET read_at = ? WHERE to_user = ? AND from_user = ? AND read_at IS NULL',
    [now(), userId, otherId],
  );
  return rows.map((row) => ({
    id: row.id,
    fromUser: row.from_user,
    toUser: row.to_user,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

export async function sendMessage(fromUser: string, toUser: string, body: string): Promise<DirectMessage> {
  if (!(await areFriends(fromUser, toUser))) throw new SocialError(403, '需要先成为好友。');
  const id = randomBytes(16).toString('hex');
  const createdAt = now();
  await db.run(
    'INSERT INTO direct_messages (id, from_user, to_user, body, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, fromUser, toUser, body, createdAt],
  );
  return { id, fromUser, toUser, body, createdAt, readAt: null };
}
