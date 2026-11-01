import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { clearSessionCookie, findUserByEmail, verifyPassword } from '../auth.ts';
import { getShoppingProfile, resetProfile } from '../profile.ts';
import { deleteOwnerData, listAlerts, listWatchlist } from '../watchlist.ts';
import { deleteCapyRoom, getCapyRoom } from '../capy-room.ts';
import { deleteCapyJournal, exportCapyJournal } from '../capy-journal.ts';

export const accountRouter = Router();

const MAX_AVATAR_BYTES = 512 * 1024;
const avatarSchema = z.object({
  avatar: z.string().max(700_000, '头像图片过大。').refine((value) => {
    if (value === '') return true;
    const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    try {
      return Buffer.from(match[1], 'base64').byteLength <= MAX_AVATAR_BYTES;
    } catch {
      return false;
    }
  }, '头像仅支持 JPEG、PNG 或 WebP，且不得超过 512KB。'),
});

accountRouter.patch('/avatar', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '请先登录。' });
  const parsed = avatarSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || '头像图片无效。',
    });
  }
  await db.run('UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?', [
    parsed.data.avatar,
    new Date().toISOString(),
    req.user.id,
  ]);
  req.user.avatar = parsed.data.avatar;
  return res.json({ avatar: parsed.data.avatar });
});

accountRouter.get('/export', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '请先登录。' });
  const user = req.user;
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `attachment; filename="picolah-${user.id}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    account: user,
    profile: await getShoppingProfile(user.id),
    watchlist: await listWatchlist(`user:${user.id}`),
    alerts: await listAlerts(`user:${user.id}`, 100),
    journal: await exportCapyJournal(user.id),
    room: await getCapyRoom(user.id),
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
  await db.run('DELETE FROM conversations WHERE owner_id = ?', [userId]);
  await deleteOwnerData(`user:${userId}`);
  await resetProfile(userId);
  await deleteCapyJournal(userId);
  await deleteCapyRoom(userId);
  await db.run('DELETE FROM app_users WHERE id = ?', [userId]);
  await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM users WHERE id = ?', [userId]);

  clearSessionCookie(res);
  return res.json({ ok: true });
});
