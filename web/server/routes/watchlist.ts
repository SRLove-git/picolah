import { Router } from 'express';
import { z } from 'zod';
import { COUNTRY_CODES, type CountryCode } from '../../shared/types.ts';
import {
  addWatchlist,
  countWatchlist,
  listAlerts,
  listWatchlist,
  markAlertRead,
  markAllAlertsRead,
  ownerKey,
  removeWatchlist,
  unreadAlertCount,
} from '../watchlist.ts';

export const watchlistRouter = Router();

const createSchema = z.object({
  productId: z.string().trim().min(1).max(80),
  market: z.enum(COUNTRY_CODES),
  targetPrice: z.number().finite().positive().max(1_000_000_000).nullable().optional(),
});

watchlistRouter.get('/', async (req, res) => {
  const owner = ownerKey(req);
  const market = typeof req.query.market === 'string' ? (req.query.market as CountryCode) : undefined;
  const items = await listWatchlist(owner, market && COUNTRY_CODES.includes(market) ? market : undefined);
  res.json({ items, unread: await unreadAlertCount(owner) });
});

watchlistRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: 'VALIDATION_ERROR', message: '关注参数有误。' });
  }
  const owner = ownerKey(req);
  if (await countWatchlist(owner) >= 100) {
    return res.status(429).json({ error: 'LIMIT_REACHED', message: '关注清单最多 100 件商品。' });
  }
  const item = await addWatchlist(
    owner,
    parsed.data.productId,
    parsed.data.market,
    parsed.data.targetPrice ?? null,
  );
  if (!item) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND', message: '商品不存在。' });
  return res.status(201).json({ item });
});

watchlistRouter.delete('/:id', async (req, res) => {
  if (!(await removeWatchlist(ownerKey(req), req.params.id))) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '关注项不存在。' });
  }
  return res.json({ ok: true });
});

export const alertsRouter = Router();

alertsRouter.get('/', async (req, res) => {
  const owner = ownerKey(req);
  res.json({ alerts: await listAlerts(owner), unread: await unreadAlertCount(owner) });
});

alertsRouter.post('/read-all', async (req, res) => {
  await markAllAlertsRead(ownerKey(req));
  res.json({ ok: true });
});

alertsRouter.post('/:id/read', async (req, res) => {
  if (!(await markAlertRead(ownerKey(req), req.params.id))) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '提醒不存在。' });
  }
  return res.json({ ok: true });
});
