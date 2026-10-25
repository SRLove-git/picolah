import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.ts';
import {
  clearSessionCookie,
  createSession,
  createUser,
  destroySession,
  findUserByEmail,
  hashPassword,
  normalizeEmail,
  publicUser,
  setSessionCookie,
  verifyPassword,
} from '../auth.ts';
import { mergeAnonymousProfile } from '../profile.ts';

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确').max(200),
  password: z.string().min(8, '密码至少 8 位').max(128),
  displayName: z.string().trim().min(1).max(60).optional(),
});

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();

function allowAttempt(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function clearAttempts(key: string): void {
  attempts.delete(key);
}

function attemptKey(ip: string, email: string): string {
  return `${ip}:${normalizeEmail(email)}`;
}

function anonymousId(request: import('express').Request): string {
  return String(request.header('x-picolah-user') || '').trim();
}

authRouter.post('/register', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || '注册信息有误',
    });
  }
  const key = attemptKey(req.ip || '', parsed.data.email);
  if (!allowAttempt(`register:${key}`, 5, 60 * 60_000)) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: '注册过于频繁，请稍后再试。' });
  }
  if (findUserByEmail(parsed.data.email)) {
    return res.status(409).json({ error: 'EMAIL_TAKEN', message: '这个邮箱已经注册。' });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = createUser({
    email: parsed.data.email,
    passwordHash,
    displayName: parsed.data.displayName || parsed.data.email.split('@')[0],
  });
  const token = createSession(user.id);
  setSessionCookie(res, token, req);
  clearAttempts(key);
  const mergedEvents = mergeAnonymousProfile(anonymousId(req), user.id);
  return res.status(201).json({ user, required: config.authRequired, mergedEvents });
});

authRouter.post('/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || '登录信息有误',
    });
  }
  const key = attemptKey(req.ip || '', parsed.data.email);
  if (!allowAttempt(`login:${key}`, 10, 15 * 60_000)) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: '尝试次数过多，请 15 分钟后再试。' });
  }

  const row = findUserByEmail(parsed.data.email);
  const valid = row ? await verifyPassword(parsed.data.password, row.password_hash) : false;
  if (!row || !valid) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '邮箱或密码不正确。' });
  }

  const token = createSession(row.id);
  setSessionCookie(res, token, req);
  clearAttempts(key);
  const mergedEvents = mergeAnonymousProfile(anonymousId(req), row.id);
  return res.json({ user: publicUser(row), required: config.authRequired, mergedEvents });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req);
  clearSessionCookie(res);
  return res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  return res.json({ user: req.user ?? null, required: config.authRequired });
});
