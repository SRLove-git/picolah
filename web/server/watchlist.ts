import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { CountryCode, PriceAlert, WatchlistItem } from '../shared/types.ts';
import { MARKETS } from '../shared/types.ts';
import { config } from './config.ts';
import { db } from './db.ts';
import { getOffers, getProduct } from './repo.ts';
import { requestUserId } from './profile.ts';

export function ownerKey(req: Request): string {
  return req.user ? `user:${req.user.id}` : `anon:${requestUserId(req)}`;
}

type WatchRow = {
  id: string;
  owner_id: string;
  product_id: string;
  market: string;
  target_price: number | null;
  currency: string;
  last_price: number | null;
  last_alert_at: string | null;
  created_at: string;
};

type AlertRow = {
  id: string;
  type: 'target' | 'drop';
  product_id: string;
  product_name: string;
  market: string;
  price: number;
  currency: string;
  url: string;
  read_at: string | null;
  created_at: string;
};

function currentOffer(productId: string, market: CountryCode) {
  return getOffers(productId, market)[0] ?? null;
}

function mapWatch(row: WatchRow): WatchlistItem | null {
  const product = getProduct(row.product_id);
  if (!product) return null;
  const offer = currentOffer(product.id, row.market as CountryCode);
  return {
    id: row.id,
    product,
    market: row.market as CountryCode,
    targetPrice: row.target_price,
    currency: row.currency,
    currentPrice: offer?.finalPrice ?? null,
    currentOffer: offer,
    met: Boolean(row.target_price != null && offer && offer.finalPrice <= row.target_price),
    createdAt: row.created_at,
  };
}

export function countWatchlist(owner: string): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM watchlist WHERE owner_id = ?').get(owner) as {
    count: number;
  };
  return row.count;
}

export function listWatchlist(owner: string, market?: CountryCode): WatchlistItem[] {
  const rows = (
    market
      ? db
          .prepare('SELECT * FROM watchlist WHERE owner_id = ? AND market = ? ORDER BY created_at DESC')
          .all(owner, market)
      : db.prepare('SELECT * FROM watchlist WHERE owner_id = ? ORDER BY created_at DESC').all(owner)
  ) as WatchRow[];
  return rows.map(mapWatch).filter((item): item is WatchlistItem => Boolean(item));
}

export function addWatchlist(
  owner: string,
  productId: string,
  market: CountryCode,
  targetPrice: number | null,
): WatchlistItem | null {
  const product = getProduct(productId);
  if (!product) return null;
  const currency = MARKETS[market].currency;
  const offer = currentOffer(productId, market);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO watchlist (id, owner_id, product_id, market, target_price, currency, last_price, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, product_id, market) DO UPDATE SET
       target_price = excluded.target_price,
       updated_at = excluded.updated_at`,
  ).run(
    randomUUID(),
    owner,
    productId,
    market,
    targetPrice,
    currency,
    offer?.finalPrice ?? null,
    now,
    now,
  );
  const row = db
    .prepare('SELECT * FROM watchlist WHERE owner_id = ? AND product_id = ? AND market = ?')
    .get(owner, productId, market) as WatchRow;
  return mapWatch(row);
}

export function removeWatchlist(owner: string, id: string): boolean {
  const result = db.prepare('DELETE FROM watchlist WHERE id = ? AND owner_id = ?').run(id, owner);
  return result.changes > 0;
}

export function listAlerts(owner: string, limit = 30): PriceAlert[] {
  const rows = db
    .prepare('SELECT * FROM price_alerts WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(owner, Math.min(Math.max(limit, 1), 100)) as AlertRow[];
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    productId: row.product_id,
    productName: row.product_name,
    market: row.market as CountryCode,
    price: row.price,
    currency: row.currency,
    url: row.url,
    read: Boolean(row.read_at),
    createdAt: row.created_at,
  }));
}

export function unreadAlertCount(owner: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM price_alerts WHERE owner_id = ? AND read_at IS NULL')
    .get(owner) as { count: number };
  return Number(row?.count || 0);
}

export function markAlertRead(owner: string, id: string): boolean {
  const result = db
    .prepare('UPDATE price_alerts SET read_at = ? WHERE id = ? AND owner_id = ? AND read_at IS NULL')
    .run(new Date().toISOString(), id, owner);
  return result.changes > 0;
}

export function markAllAlertsRead(owner: string): void {
  db.prepare('UPDATE price_alerts SET read_at = ? WHERE owner_id = ? AND read_at IS NULL').run(
    new Date().toISOString(),
    owner,
  );
}

function notifyWebhook(alert: PriceAlert): void {
  if (!config.alertWebhookUrl) return;
  void fetch(config.alertWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'price_alert', alert }),
    signal: AbortSignal.timeout(8_000),
  }).catch((error: unknown) => {
    console.warn('[alerts] webhook failed:', error instanceof Error ? error.message : error);
  });
}

/**
 * Runs after a crawler ingest batch. A watch item alerts when the target price
 * is reached, or when the best landed price drops at least 2% versus the last
 * evaluated price. Cooldown avoids a new alert on every ingest cycle.
 */
export function evaluateWatchlist(market: CountryCode): number {
  const rows = db
    .prepare('SELECT * FROM watchlist WHERE market = ?')
    .all(market) as WatchRow[];
  let created = 0;
  const now = new Date();
  for (const row of rows) {
    const offer = currentOffer(row.product_id, market);
    if (!offer) continue;
    const product = getProduct(row.product_id);
    if (!product) continue;
    const targetMet = row.target_price != null && offer.finalPrice <= row.target_price;
    const dropped = row.last_price != null && offer.finalPrice < row.last_price * 0.98;
    const cooldownPassed =
      !row.last_alert_at || now.getTime() - Date.parse(row.last_alert_at) > 6 * 60 * 60_000;
    if ((targetMet || dropped) && cooldownPassed) {
      const alert: PriceAlert = {
        id: randomUUID(),
        type: targetMet ? 'target' : 'drop',
        productId: product.id,
        productName: product.name,
        market,
        price: offer.finalPrice,
        currency: offer.currency,
        url: offer.url,
        read: false,
        createdAt: now.toISOString(),
      };
      db.prepare(
        `INSERT INTO price_alerts
          (id, owner_id, watchlist_id, type, product_id, product_name, market, price, currency, url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        alert.id,
        row.owner_id,
        row.id,
        alert.type,
        alert.productId,
        alert.productName,
        alert.market,
        alert.price,
        alert.currency,
        alert.url,
        alert.createdAt,
      );
      db.prepare('UPDATE watchlist SET last_alert_at = ?, last_price = ?, updated_at = ? WHERE id = ?').run(
        alert.createdAt,
        offer.finalPrice,
        alert.createdAt,
        row.id,
      );
      notifyWebhook(alert);
      created += 1;
    } else if (row.last_price !== offer.finalPrice) {
      db.prepare('UPDATE watchlist SET last_price = ?, updated_at = ? WHERE id = ?').run(
        offer.finalPrice,
        now.toISOString(),
        row.id,
      );
    }
  }
  return created;
}

export function deleteOwnerData(owner: string): void {
  const watchIds = db.prepare('SELECT id FROM watchlist WHERE owner_id = ?').all(owner) as { id: string }[];
  for (const row of watchIds) {
    db.prepare('DELETE FROM price_alerts WHERE watchlist_id = ?').run(row.id);
  }
  db.prepare('DELETE FROM price_alerts WHERE owner_id = ?').run(owner);
  db.prepare('DELETE FROM watchlist WHERE owner_id = ?').run(owner);
}
