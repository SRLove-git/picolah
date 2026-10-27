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
  revokeSessions,
  setSessionCookie,
  updatePassword,
  verifyPassword,
} from '../auth.ts';
import { issueEmailCode, verifyEmailCode } from '../email-codes.ts';
import { sendMail } from '../mailer.ts';
import { mergeAnonymousProfile } from '../profile.ts';
import { mergeCapybara } from '../capybara.ts';

export const authRouter = Router();

const emailSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确').max(200),
});

const credentialsSchema = emailSchema.extend({
  password: z.string().min(8, '密码至少 8 位').max(128),
  displayName: z.string().trim().min(1).max(60).optional(),
});

const codeSchema = z.string().trim().regex(/^\d{6}$/, '请输入 6 位邮箱验证码');

const registerSchema = credentialsSchema.extend({ code: codeSchema });

const resetSchema = emailSchema.extend({
  password: z.string().min(8, '密码至少 8 位').max(128),
  code: codeSchema,
});

const codeRequestSchema = emailSchema.extend({
  purpose: z.enum(['register', 'reset']),
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
  const parsed = registerSchema.safeParse(req.body);
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
  if (await findUserByEmail(parsed.data.email)) {
    return res.status(409).json({ error: 'EMAIL_TAKEN', message: '这个邮箱已经注册。' });
  }
  if (!(await verifyEmailCode(parsed.data.email, 'register', parsed.data.code))) {
    return res.status(400).json({ error: 'INVALID_CODE', message: '验证码不正确或已过期。' });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await createUser({
    email: parsed.data.email,
    passwordHash,
    displayName: parsed.data.displayName || parsed.data.email.split('@')[0],
  });
  const token = await createSession(user.id);
  setSessionCookie(res, token, req);
  clearAttempts(key);
  const mergedEvents = await mergeAnonymousProfile(anonymousId(req), user.id);
  await mergeCapybara(anonymousId(req), user.id);
  return res.status(201).json({ user, required: config.authRequired, mergedEvents });
});

authRouter.post('/email-code', async (req, res) => {
  const parsed = codeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || '邮箱信息有误',
    });
  }
  const { email, purpose } = parsed.data;
  const key = attemptKey(req.ip || '', email);
  if (!allowAttempt(`code:${key}`, 5, 15 * 60_000)) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: '验证码发送过于频繁，请稍后再试。' });
  }

  const existing = await findUserByEmail(email);
  if (purpose === 'register' && existing) {
    return res.status(409).json({ error: 'EMAIL_TAKEN', message: '这个邮箱已经注册。' });
  }
  if (purpose === 'reset' && !existing) {
    // Do not reveal whether the address is registered.
    return res.json({ ok: true, sent: true });
  }

  const code = await issueEmailCode(email, purpose);
  const subject = purpose === 'register' ? 'Picolah 注册验证码' : 'Picolah 重置密码验证码';
  const text = `你的 Picolah 验证码是 ${code}，10 分钟内有效。如非本人操作，请忽略此邮件。`;
  try {
    await sendMail({ to: email, subject, text });
  } catch (mailError) {
    console.error('[auth] failed to send verification mail', mailError);
    return res.status(502).json({ error: 'MAIL_FAILED', message: '验证码邮件发送失败，请稍后重试。' });
  }

  return res.json({
    ok: true,
    sent: true,
    expiresIn: 600,
    ...(config.mail.exposeCodes ? { devCode: code } : {}),
  });
});

authRouter.post('/password/forgot', async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || '邮箱格式不正确',
    });
  }
  const email = parsed.data.email;
  const key = attemptKey(req.ip || '', email);
  if (!allowAttempt(`forgot:${key}`, 5, 15 * 60_000)) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: '操作过于频繁，请稍后再试。' });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    // Always answer the same way so the endpoint cannot be used to probe accounts.
    return res.json({ ok: true, sent: true });
  }

  const code = await issueEmailCode(email, 'reset');
  try {
    await sendMail({
      to: email,
      subject: 'Picolah 重置密码验证码',
      text: `你的 Picolah 重置密码验证码是 ${code}，10 分钟内有效。如非本人操作，请忽略此邮件。`,
    });
  } catch (mailError) {
    console.error('[auth] failed to send reset mail', mailError);
    return res.status(502).json({ error: 'MAIL_FAILED', message: '验证码邮件发送失败，请稍后重试。' });
  }

  return res.json({
    ok: true,
    sent: true,
    expiresIn: 600,
    ...(config.mail.exposeCodes ? { devCode: code } : {}),
  });
});

authRouter.post('/password/reset', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || '重置信息有误',
    });
  }
  const { email, code, password } = parsed.data;
  const key = attemptKey(req.ip || '', email);
  if (!allowAttempt(`reset:${key}`, 10, 60 * 60_000)) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: '尝试次数过多，请稍后再试。' });
  }

  const user = await findUserByEmail(email);
  if (!user || !(await verifyEmailCode(email, 'reset', code))) {
    return res.status(400).json({ error: 'INVALID_CODE', message: '验证码不正确或已过期。' });
  }

  await updatePassword(user.id, await hashPassword(password));
  await revokeSessions(user.id);
  clearAttempts(key);
  return res.json({ ok: true });
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

  const row = await findUserByEmail(parsed.data.email);
  const valid = row ? await verifyPassword(parsed.data.password, row.password_hash) : false;
  if (!row || !valid) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '邮箱或密码不正确。' });
  }

  const token = await createSession(row.id);
  setSessionCookie(res, token, req);
  clearAttempts(key);
  const mergedEvents = await mergeAnonymousProfile(anonymousId(req), row.id);
  await mergeCapybara(anonymousId(req), row.id);
  return res.json({ user: publicUser(row), required: config.authRequired, mergedEvents });
});

authRouter.post('/logout', async (req, res) => {
  await destroySession(req);
  clearSessionCookie(res);
  return res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  return res.json({ user: req.user ?? null, required: config.authRequired });
});
