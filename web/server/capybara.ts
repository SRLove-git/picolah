import { randomUUID } from 'node:crypto';
import {
  capyAccessoryForVisual,
  capyAutoEquip,
  capyLevelForXp,
  capyXpTotal,
  emptyCapyPayload,
  emptyCapyCounts,
  normalizeCapyOutfit,
  type CapyCounts,
  type CapyPayload,
  type CapyPurchase,
} from '../shared/capybara.ts';
import { MARKETS, type CountryCode, type Product, type ProductVisual } from '../shared/types.ts';
import { db } from './db.ts';
import { getOffers, getProduct } from './repo.ts';
import { isValidUserId } from './user-id.ts';

interface StateRow {
  owner_id: string;
  xp: number;
  equipped: string;
  created_at: string;
  updated_at: string;
}

interface PurchaseRow {
  id: string;
  owner_id: string;
  product_id: string;
  market: string;
  price: number | null;
  currency: string;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function daysTogether(createdAt: string | null): number {
  if (!createdAt) return 1;
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return 1;
  const elapsed = Date.now() - started;
  return Math.max(1, Math.floor(elapsed / 86_400_000) + 1);
}

function parseEquipped(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function ensureState(owner: string): Promise<StateRow> {
  const stamp = nowIso();
  await db.run(
    `INSERT INTO capybara_state (owner_id, xp, equipped, created_at, updated_at)
     VALUES (?, 0, '[]', ?, ?)
     ON CONFLICT(owner_id) DO NOTHING`,
    [owner, stamp, stamp],
  );
  const row = await db.get<StateRow>('SELECT * FROM capybara_state WHERE owner_id = ?', [owner]);
  if (!row) throw new Error('CAPYBARA_STATE_UNAVAILABLE');
  return row;
}

async function findState(owner: string): Promise<StateRow | null> {
  return (await db.get<StateRow>('SELECT * FROM capybara_state WHERE owner_id = ?', [owner])) || null;
}

async function listPurchases(owner: string): Promise<CapyPurchase[]> {
  const rows = await db.all<PurchaseRow>(
    'SELECT * FROM capybara_purchases WHERE owner_id = ? ORDER BY created_at DESC, id DESC',
    [owner],
  );
  const purchases: CapyPurchase[] = [];
  for (const row of rows) {
    const product = await getProduct(row.product_id);
    if (!product) continue;
    purchases.push({
      id: row.id,
      product,
      market: row.market as CountryCode,
      price: row.price === null ? null : Number(row.price),
      currency: row.currency,
      createdAt: row.created_at,
    });
  }
  return purchases;
}

interface ReelReceipt {
  session_id: string;
  payload: string;
}

function parseReelPayload(raw: string): {
  type?: string;
  watchMs?: number;
  ended?: boolean;
} {
  try {
    const value = JSON.parse(raw) as { type?: unknown; watchMs?: unknown; ended?: unknown };
    return {
      type: typeof value.type === 'string' ? value.type : undefined,
      watchMs: typeof value.watchMs === 'number' ? value.watchMs : 0,
      ended: value.ended === true,
    };
  } catch {
    return {};
  }
}

/**
 * Reel XP is read from the append-only receipt log rather than the folded
 * state table, so toggling a like off and on again cannot farm XP and a reset
 * of the video profile never lowers the stored peak.
 */
async function reelCounts(owner: string): Promise<Partial<CapyCounts>> {
  const receipts = await db.all<ReelReceipt>(
    'SELECT session_id, payload FROM reel_event_receipts WHERE user_id = ?',
    [owner],
  );
  const counts = {
    reelViews: 0,
    reelWatches: 0,
    reelLikes: 0,
    reelSaves: 0,
    reelFollows: 0,
    reelShares: 0,
    reelCompares: 0,
  };
  const watchedSessions = new Map<string, { watchMs: number; ended: boolean }>();
  for (const receipt of receipts) {
    const payload = parseReelPayload(receipt.payload);
    switch (payload.type) {
      case 'view':
        counts.reelViews += 1;
        break;
      case 'watch': {
        const previous = watchedSessions.get(receipt.session_id) || { watchMs: 0, ended: false };
        watchedSessions.set(receipt.session_id, {
          watchMs: Math.max(previous.watchMs, payload.watchMs || 0),
          ended: previous.ended || Boolean(payload.ended),
        });
        break;
      }
      case 'like':
        counts.reelLikes += 1;
        break;
      case 'unlike':
        counts.reelLikes = Math.max(0, counts.reelLikes - 1);
        break;
      case 'save':
        counts.reelSaves += 1;
        break;
      case 'unsave':
        counts.reelSaves = Math.max(0, counts.reelSaves - 1);
        break;
      case 'follow':
        counts.reelFollows += 1;
        break;
      case 'unfollow':
        counts.reelFollows = Math.max(0, counts.reelFollows - 1);
        break;
      case 'share':
        counts.reelShares += 1;
        break;
      case 'compare':
        counts.reelCompares += 1;
        break;
      default:
        break;
    }
  }
  for (const session of watchedSessions.values()) {
    if (session.ended || session.watchMs >= 3_000) counts.reelWatches += 1;
  }
  return counts;
}

async function liveCounts(owner: string, watchOwner: string): Promise<CapyCounts> {
  const counts = emptyCapyCounts();
  const events = await db.all<{ type: string; total: number | string }>(
    'SELECT type, COUNT(*) AS total FROM user_events WHERE user_id = ? GROUP BY type',
    [owner],
  );
  for (const row of events) {
    const total = Number(row.total) || 0;
    if (row.type === 'comparison') counts.comparisons = total;
    if (row.type === 'offer_click') counts.offerClicks = total;
  }

  const watch = await db.get<{ total: number | string }>(
    'SELECT COUNT(*) AS total FROM watchlist WHERE owner_id = ?',
    [watchOwner],
  );
  counts.watchlist = Number(watch?.total) || 0;

  const purchases = await db.get<{ total: number | string }>(
    'SELECT COUNT(*) AS total FROM capybara_purchases WHERE owner_id = ?',
    [owner],
  );
  counts.purchases = Number(purchases?.total) || 0;

  Object.assign(counts, await reelCounts(owner));
  return counts;
}

async function saveXp(owner: string, xp: number): Promise<void> {
  await db.run('UPDATE capybara_state SET xp = ?, updated_at = ? WHERE owner_id = ?', [xp, nowIso(), owner]);
}

async function saveOutfit(owner: string, equipped: string[]): Promise<void> {
  await db.run('UPDATE capybara_state SET equipped = ?, updated_at = ? WHERE owner_id = ?', [
    JSON.stringify(equipped),
    nowIso(),
    owner,
  ]);
}

export async function getCapybara(owner: string, watchOwner = owner): Promise<CapyPayload> {
  if (!isValidUserId(owner)) return emptyCapyPayload();
  const state = await ensureState(owner);
  const counts = await liveCounts(owner, watchOwner);
  const liveXp = capyXpTotal(counts);
  const storedXp = Math.max(0, Number(state.xp) || 0);
  const xp = Math.max(liveXp, storedXp);
  if (xp > storedXp) await saveXp(owner, xp);

  const purchases = await listPurchases(owner);
  const visuals = purchases.map((purchase) => purchase.product.visual);
  const level = capyLevelForXp(xp);
  const storedOutfit = parseEquipped(state.equipped);
  const equipped = normalizeCapyOutfit(storedOutfit, level, visuals);
  if (equipped.join('|') !== storedOutfit.join('|')) await saveOutfit(owner, equipped);

  return {
    xp,
    equipped,
    purchases,
    counts,
    createdAt: state.created_at,
    daysTogether: daysTogether(state.created_at),
  };
}

function visualList(purchases: CapyPurchase[]): ProductVisual[] {
  return purchases.map((purchase) => purchase.product.visual);
}

/** Marks a product as bought. The best known price is snapshotted so history
 * keeps the price the shopper actually saw. */
export async function addCapybaraPurchase(
  owner: string,
  productId: string,
  market: CountryCode,
  priceOverride?: number | null,
  watchOwner = owner,
): Promise<CapyPayload | null> {
  if (!isValidUserId(owner)) return null;
  const product: Product | null = await getProduct(productId);
  if (!product) return null;
  const currency = MARKETS[market]?.currency || 'SGD';

  let price: number | null = null;
  if (typeof priceOverride === 'number' && Number.isFinite(priceOverride) && priceOverride > 0) {
    price = Math.round(priceOverride * 100) / 100;
  } else {
    const offers = await getOffers(productId, market);
    price = offers[0] ? Math.round(offers[0].finalPrice * 100) / 100 : null;
  }

  await ensureState(owner);
  const existing = await db.get<PurchaseRow>(
    'SELECT * FROM capybara_purchases WHERE owner_id = ? AND product_id = ?',
    [owner, productId],
  );
  const stamp = nowIso();
  if (existing) {
    await db.run(
      'UPDATE capybara_purchases SET market = ?, price = ?, currency = ? WHERE id = ? AND owner_id = ?',
      [market, price, currency, existing.id, owner],
    );
  } else {
    await db.run(
      `INSERT INTO capybara_purchases (id, owner_id, product_id, market, price, currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), owner, productId, market, price, currency, stamp],
    );
  }

  const payload = await getCapybara(owner, watchOwner);
  const accessory = capyAccessoryForVisual(product.visual);
  if (accessory && !existing) {
    const next = capyAutoEquip(
      payload.equipped,
      accessory.id,
      capyLevelForXp(payload.xp),
      visualList(payload.purchases),
    );
    if (next.length > payload.equipped.length) {
      await saveOutfit(owner, next);
      payload.equipped = next;
    }
  }
  return payload;
}

export async function removeCapybaraPurchase(
  owner: string,
  purchaseId: string,
  watchOwner = owner,
): Promise<CapyPayload | null> {
  if (!isValidUserId(owner)) return null;
  const result = await db.run('DELETE FROM capybara_purchases WHERE owner_id = ? AND id = ?', [owner, purchaseId]);
  if (!result.changes) return null;
  return getCapybara(owner, watchOwner);
}

export async function setCapybaraOutfit(
  owner: string,
  requested: string[],
  watchOwner = owner,
): Promise<CapyPayload | null> {
  if (!isValidUserId(owner)) return null;
  const state = await ensureState(owner);
  const counts = await liveCounts(owner, watchOwner);
  const liveXp = capyXpTotal(counts);
  const xp = Math.max(liveXp, Number(state.xp) || 0);
  const purchases = await listPurchases(owner);
  const equipped = normalizeCapyOutfit(requested, capyLevelForXp(xp), visualList(purchases));
  await saveOutfit(owner, equipped);
  return getCapybara(owner, watchOwner);
}

/** Moves the capybara an anonymous browser collected onto a fresh account. */
export async function mergeCapybara(anonymousId: string, accountId: string): Promise<number> {
  const anonymous = String(anonymousId || '').trim();
  const account = String(accountId || '').trim();
  if (anonymous === account || !isValidUserId(anonymous) || !isValidUserId(account)) return 0;

  const purchases = await db.all<PurchaseRow>(
    'SELECT * FROM capybara_purchases WHERE owner_id = ?',
    [anonymous],
  );
  let moved = 0;
  for (const purchase of purchases) {
    const collision = await db.get<{ id: string }>(
      'SELECT id FROM capybara_purchases WHERE owner_id = ? AND product_id = ?',
      [account, purchase.product_id],
    );
    if (collision) {
      await db.run('DELETE FROM capybara_purchases WHERE id = ?', [purchase.id]);
      continue;
    }
    await db.run('UPDATE capybara_purchases SET owner_id = ? WHERE id = ?', [account, purchase.id]);
    moved += 1;
  }

  const [anonState, accountState] = await Promise.all([findState(anonymous), findState(account)]);
  if (anonState) {
    if (!accountState) {
      await db.run('UPDATE capybara_state SET owner_id = ? WHERE owner_id = ?', [account, anonymous]);
    } else {
      const createdAt = accountState.created_at < anonState.created_at ? accountState.created_at : anonState.created_at;
      const xp = Math.max(Number(accountState.xp) || 0, Number(anonState.xp) || 0);
      const visuals = visualList(await listPurchases(account));
      const equipped = normalizeCapyOutfit(
        [...parseEquipped(accountState.equipped), ...parseEquipped(anonState.equipped)],
        capyLevelForXp(xp),
        visuals,
      );
      await db.run(
        `UPDATE capybara_state SET xp = ?, equipped = ?, created_at = ?, updated_at = ? WHERE owner_id = ?`,
        [xp, JSON.stringify(equipped), createdAt, nowIso(), account],
      );
      await db.run('DELETE FROM capybara_state WHERE owner_id = ?', [anonymous]);
    }
  }
  return moved;
}

export async function deleteCapybara(owner: string): Promise<void> {
  if (!owner) return;
  await db.run('DELETE FROM capybara_purchases WHERE owner_id = ?', [owner]);
  await db.run('DELETE FROM capybara_state WHERE owner_id = ?', [owner]);
}
