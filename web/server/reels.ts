import { createHash } from 'node:crypto';
import { z } from 'zod';
import { REELS, REEL_EVENT_TYPES, type ReelEventInput, type ReelEventType, type ReelFeed, type VideoProfile } from '../shared/reels.ts';
import { COUNTRY_CODES, type CountryCode } from '../shared/types.ts';
import { db, type DbExecutor } from './db.ts';
import { buildVideoProfile, rankReels, type ShoppingSignal } from './reels-ranking.ts';

const REEL_BY_ID = new Map(REELS.map((reel) => [reel.id, reel]));
const safeId = z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/);
const userIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);
export const reelIdSchema = z.string().max(100).refine((id) => REEL_BY_ID.has(id), 'Unknown reel');

export const reelEventSchema = z.object({
  eventId: safeId,
  sessionId: safeId,
  reelId: reelIdSchema,
  type: z.enum(REEL_EVENT_TYPES),
  market: z.enum(COUNTRY_CODES),
  watchMs: z.number().finite().int().min(0).max(3_600_000).optional(),
  ended: z.boolean().optional(),
}).strict().superRefine((input, ctx) => {
  if (input.type === 'watch') {
    if (input.watchMs === undefined) ctx.addIssue({ code: 'custom', message: 'watchMs is required for watch', path: ['watchMs'] });
    if ((input.watchMs ?? 0) > (REEL_BY_ID.get(input.reelId)?.durationMs ?? 0)) {
      ctx.addIssue({ code: 'custom', message: 'watchMs exceeds the reel duration', path: ['watchMs'] });
    }
  } else if (input.watchMs !== undefined || input.ended !== undefined) {
    ctx.addIssue({ code: 'custom', message: 'Only watch events accept watchMs or ended' });
  }
});

export class ReelEventError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

export interface ReelEventRow {
  user_id: string;
  state_key: string;
  event_id: string;
  session_id: string;
  reel_id: string;
  type: ReelEventType;
  market: CountryCode;
  watch_ms: number;
  ended: number;
  created_at: string;
  updated_at: string;
}

function stateKey(input: Pick<ReelEventInput, 'type' | 'reelId' | 'sessionId'>): string {
  switch (input.type) {
    case 'like': case 'unlike': return `like:${input.reelId}`;
    case 'save': case 'unsave': return `save:${input.reelId}`;
    case 'follow': case 'unfollow': return `follow:${REEL_BY_ID.get(input.reelId)!.handle}`;
    case 'not_interested': return `hide:${input.reelId}`;
    default: return `${input.type}:${input.sessionId}`;
  }
}

async function ensureOwner(tx: DbExecutor, userId: string, stamp: string): Promise<void> {
  // The PostgreSQL upsert locks the owner row until commit, serializing that
  // owner's event/reset/merge writes. SQLite serializes connection transactions.
  await tx.run(
    `INSERT INTO app_users (id, created_at, last_seen_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    [userId, stamp, stamp],
  );
}

async function upsertState(tx: DbExecutor, row: ReelEventRow, preserveEqualTimestamp = false): Promise<void> {
  const previous = await tx.get<ReelEventRow>(
    'SELECT * FROM reel_events WHERE user_id = ? AND state_key = ?', [row.user_id, row.state_key],
  );
  if (previous) {
    if (row.type === 'watch') {
      // Inputs are cumulative; retries, pauses and out-of-order heartbeats can
      // never add the same seconds twice or retract a completed session.
      row.watch_ms = Math.max(previous.watch_ms, row.watch_ms);
      row.ended = Math.max(previous.ended, row.ended);
    } else if (row.type === 'view') {
      return;
    } else if (row.updated_at < previous.updated_at || (preserveEqualTimestamp && row.updated_at === previous.updated_at)) {
      return;
    }
    row.created_at = previous.created_at < row.created_at ? previous.created_at : row.created_at;
    row.updated_at = previous.updated_at > row.updated_at ? previous.updated_at : row.updated_at;
  }
  await tx.run(
    `INSERT INTO reel_events (user_id, state_key, event_id, session_id, reel_id, type, market,
      watch_ms, ended, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, state_key) DO UPDATE SET
       event_id = excluded.event_id, session_id = excluded.session_id, reel_id = excluded.reel_id,
       type = excluded.type, market = excluded.market, watch_ms = excluded.watch_ms,
       ended = excluded.ended, created_at = excluded.created_at, updated_at = excluded.updated_at`,
    [row.user_id, row.state_key, row.event_id, row.session_id, row.reel_id, row.type, row.market,
      row.watch_ms, row.ended, row.created_at, row.updated_at],
  );
}

export async function recordReelEvent(userId: string, input: ReelEventInput): Promise<void> {
  if (!userIdSchema.safeParse(userId).success) throw new ReelEventError('INVALID_USER', 'A valid viewer identity is required');
  const parsed = reelEventSchema.safeParse(input);
  if (!parsed.success) throw new ReelEventError('INVALID_EVENT', parsed.error.issues[0]?.message ?? 'Invalid event');
  const event = parsed.data;
  const stamp = new Date().toISOString();
  const payload = JSON.stringify({ ...event, watchMs: event.watchMs ?? 0, ended: event.ended ?? false });
  await db.transaction(async (tx) => {
    await ensureOwner(tx, userId, stamp);
    const previous = await tx.get<{ payload: string }>(
      'SELECT payload FROM reel_event_receipts WHERE user_id = ? AND event_id = ?', [userId, event.eventId],
    );
    if (previous) {
      if (previous.payload !== payload) throw new ReelEventError('EVENT_CONFLICT', 'An event ID cannot be reused for different data', 409);
      return;
    }
    const session = await tx.get<{ reel_id: string }>(
      'SELECT reel_id FROM reel_sessions WHERE user_id = ? AND session_id = ?', [userId, event.sessionId],
    );
    if (session && session.reel_id !== event.reelId) throw new ReelEventError('SESSION_CONFLICT', 'A viewing session belongs to its original reel', 409);
    await tx.run(
      `INSERT INTO reel_sessions (user_id, session_id, reel_id, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, session_id) DO NOTHING`, [userId, event.sessionId, event.reelId, stamp],
    );
    await tx.run(
      'INSERT INTO reel_event_receipts (user_id, event_id, session_id, reel_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, event.eventId, event.sessionId, event.reelId, payload, stamp],
    );
    // A zero-time heartbeat is harmless transport state, not a preference or a
    // view. Keep its receipt/session but do not inflate the visible profile.
    if (event.type === 'watch' && event.watchMs === 0 && !event.ended) return;
    await upsertState(tx, {
      user_id: userId, state_key: stateKey(event), event_id: event.eventId,
      session_id: event.sessionId, reel_id: event.reelId, type: event.type,
      market: event.market, watch_ms: event.watchMs ?? 0, ended: event.ended ? 1 : 0,
      created_at: stamp, updated_at: stamp,
    });
  });
}

export async function getVideoProfile(userId: string): Promise<VideoProfile> {
  const rows = userId ? await db.all<ReelEventRow>('SELECT * FROM reel_events WHERE user_id = ?', [userId]) : [];
  return buildVideoProfile(rows);
}

export async function getReelFeed(userId: string, market: CountryCode, exclude: string[] = [], limit = 5): Promise<ReelFeed> {
  if (!COUNTRY_CODES.includes(market) || !Number.isInteger(limit) || limit < 1 || limit > 20 ||
      exclude.length > 100 || exclude.some((id) => !REEL_BY_ID.has(id))) {
    throw new ReelEventError('INVALID_FEED_QUERY', 'Invalid market, limit or excluded reel');
  }
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [rows, globalRows, shopping] = await Promise.all([
    userId ? db.all<ReelEventRow>('SELECT * FROM reel_events WHERE user_id = ?', [userId]) : Promise.resolve([]),
    db.all<ReelEventRow>('SELECT * FROM reel_events WHERE updated_at >= ?', [since]),
    userId ? db.all<ShoppingSignal>(
      `SELECT type, product_id, category, brand, created_at FROM user_events
       WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 500`, [userId, since],
    ) : Promise.resolve([]),
  ]);
  return rankReels(userId, market, rows, globalRows, shopping, exclude, limit);
}

export async function resetVideoProfile(userId: string): Promise<void> {
  if (!userId) return;
  await db.transaction(async (tx) => {
    // Lock existing owners without creating a profile merely because it reset.
    await tx.run('UPDATE app_users SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), userId]);
    await tx.run('DELETE FROM reel_sessions WHERE user_id = ?', [userId]);
  });
}

function mergedId(owner: string, value: string): string {
  return `merged-${createHash('sha256').update(`${owner}:${value}`).digest('hex')}`;
}

/** Transfer before deleting the anonymous app_users row. Existing account
 * toggles keep the newest timestamp; colliding sessions stay on their reel. */
export async function mergeVideoProfile(anonymousId: string, accountId: string): Promise<number> {
  if (anonymousId === accountId || !userIdSchema.safeParse(anonymousId).success || !userIdSchema.safeParse(accountId).success) return 0;
  return db.transaction(async (tx) => {
    const stamp = new Date().toISOString();
    if (!await tx.get('SELECT id FROM app_users WHERE id = ?', [anonymousId])) return 0;
    // Consistent lock order also avoids opposite-direction PostgreSQL deadlocks.
    for (const id of [anonymousId, accountId].sort()) await ensureOwner(tx, id, stamp);
    const sessions = await tx.all<{ session_id: string; reel_id: string; created_at: string }>(
      'SELECT session_id, reel_id, created_at FROM reel_sessions WHERE user_id = ?', [anonymousId],
    );
    const mapping = new Map<string, string>();
    for (const session of sessions) {
      const collision = await tx.get<{ reel_id: string }>(
        'SELECT reel_id FROM reel_sessions WHERE user_id = ? AND session_id = ?', [accountId, session.session_id],
      );
      const sessionId = collision && collision.reel_id !== session.reel_id ? mergedId(anonymousId, session.session_id) : session.session_id;
      mapping.set(session.session_id, sessionId);
      await tx.run(
        `INSERT INTO reel_sessions (user_id, session_id, reel_id, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, session_id) DO NOTHING`, [accountId, sessionId, session.reel_id, session.created_at],
      );
    }
    const receipts = await tx.all<{ event_id: string; session_id: string; reel_id: string; payload: string; created_at: string }>(
      'SELECT * FROM reel_event_receipts WHERE user_id = ?', [anonymousId],
    );
    const eventIds = new Map<string, string>();
    for (const receipt of receipts) {
      const collision = await tx.get<{ payload: string }>(
        'SELECT payload FROM reel_event_receipts WHERE user_id = ? AND event_id = ?', [accountId, receipt.event_id],
      );
      const eventId = collision && collision.payload !== receipt.payload ? mergedId(anonymousId, receipt.event_id) : receipt.event_id;
      eventIds.set(receipt.event_id, eventId);
      const sessionId = mapping.get(receipt.session_id)!;
      const payload = JSON.stringify({ ...JSON.parse(receipt.payload), eventId, sessionId });
      await tx.run(
        `INSERT INTO reel_event_receipts (user_id, event_id, session_id, reel_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, event_id) DO NOTHING`, [accountId, eventId, sessionId, receipt.reel_id, payload, receipt.created_at],
      );
    }
    const rows = await tx.all<ReelEventRow>('SELECT * FROM reel_events WHERE user_id = ? ORDER BY updated_at', [anonymousId]);
    for (const row of rows) {
      const sessionId = mapping.get(row.session_id)!;
      await upsertState(tx, {
        ...row, user_id: accountId, session_id: sessionId,
        event_id: eventIds.get(row.event_id) ?? row.event_id,
        state_key: stateKey({ type: row.type, reelId: row.reel_id, sessionId }),
      }, true);
    }
    await tx.run('DELETE FROM reel_sessions WHERE user_id = ?', [anonymousId]);
    return rows.length;
  });
}
