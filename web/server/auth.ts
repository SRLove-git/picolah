import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.ts';
import { db } from './db.ts';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
}

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltValue, hashValue] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  const derived = await scryptAsync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db
    .prepare('SELECT id, email, password_hash, display_name FROM users WHERE email = ?')
    .get(normalizeEmail(email)) as UserRow | undefined;
}

export function publicUser(row: { id: string; email: string; display_name: string }): AccountUser {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export function createUser(input: { email: string; passwordHash: string; displayName: string }): AccountUser {
  const id = randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, normalizeEmail(input.email), input.passwordHash, input.displayName, now, now);
  return { id, email: normalizeEmail(input.email), displayName: input.displayName };
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieToken(request: Request): string | null {
  const raw = request.header('cookie') || '';
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === config.sessionCookie) {
      return decodeURIComponent(rest.join('=')) || null;
    }
  }
  return null;
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionDays * 86_400_000);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(tokenHash(token), userId, now.toISOString(), expires.toISOString(), now.toISOString());
  return token;
}

export function sessionUser(request: Request): AccountUser | null {
  const token = cookieToken(request);
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.display_name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash(token)) as
    | { id: string; email: string; display_name: string; expires_at: string }
    | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?')
    .run(new Date().toISOString(), tokenHash(token));
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export function destroySession(request: Request): void {
  const token = cookieToken(request);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

function secureRequest(request: Request): boolean {
  const forwarded = request.header('x-forwarded-proto');
  return request.secure || (forwarded ? forwarded.split(',')[0].trim() === 'https' : false);
}

export function setSessionCookie(response: Response, token: string, request: Request): void {
  response.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureRequest(request),
    path: '/',
    maxAge: config.sessionDays * 86_400_000,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(config.sessionCookie, { path: '/' });
}

export function attachUser(request: Request, _response: Response, next: NextFunction): void {
  request.user = sessionUser(request) ?? undefined;
  next();
}

export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  if (!config.authRequired || request.user) {
    next();
    return;
  }
  response.status(401).json({ error: 'UNAUTHORIZED', message: '请先登录。' });
}
