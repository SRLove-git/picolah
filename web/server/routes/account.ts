import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { findUserByEmail, verifyPassword } from '../auth.ts';
import { getShoppingProfile, resetProfile } from '../profile.ts';
import { deleteOwnerData, listAlerts, listWatchlist } from '../watchlist.ts';

export const accountRouter = Router();

accountRouter.get('/export', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '请先登录。' });
  const user = req.user;
  res.setHeader('Content-Disposition', `attachment; filename="picolah-${user.id}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    account: user,
    profile: await getShoppingProfile(user.id),
    watchlist: await listWatchlist(`user:${user.id}`),
    alerts: await listAlerts(`user:${user.id}`, 100),
  });
});

const deleteSchema = z.object({ password: z.string().min(1).max(128) });

accountRouter.delete('/', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '请先登录。' });
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: 'VALIDATION_ERROR', message: '请输入账户密码确认删除。' });
  }
  const row = await findUserByEmail(req.user.email);
  if (!row || !(await verifyPassword(parsed.data.password, row.password_hash))) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '密码不正确。' });
  }

  const userId = req.user.id;
  await deleteOwnerData(`user:${userId}`);
  await resetProfile(userId);
  await db.run('DELETE FROM app_users WHERE id = ?', [userId]);
  await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM users WHERE id = ?', [userId]);

  res.clearCookie('picolah_session');
  return res.json({ ok: true });
});
