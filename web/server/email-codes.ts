import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from './config.ts';
import { db } from './db.ts';
import { normalizeEmail } from './auth.ts';

export type EmailCodePurpose = 'register' | 'reset';

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

type CodeRow = {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
};

function hashCode(email: string, purpose: EmailCodePurpose, code: string): string {
  return createHash('sha256')
    .update(`${purpose}:${email}:${code}:${config.mail.secret}`)
    .digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Creates a six-digit code for one email + purpose, replacing older codes. */
export async function issueEmailCode(
  email: string,
  purpose: EmailCodePurpose,
): Promise<string> {
  const normalized = normalizeEmail(email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  await db.run('DELETE FROM email_codes WHERE expires_at <= ?', [now.toISOString()]);
  await db.run('DELETE FROM email_codes WHERE email = ? AND purpose = ?', [normalized, purpose]);
  await db.run(
    `INSERT INTO email_codes (id, email, purpose, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [
      randomBytes(16).toString('hex'),
      normalized,
      purpose,
      hashCode(normalized, purpose, code),
      new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      now.toISOString(),
    ],
  );
  return code;
}

export async function verifyEmailCode(
  email: string,
  purpose: EmailCodePurpose,
  code: string,
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const row = await db.get<CodeRow>(
    `SELECT id, code_hash, attempts, expires_at FROM email_codes
     WHERE email = ? AND purpose = ?
     ORDER BY created_at DESC LIMIT 1`,
    [normalized, purpose],
  );
  if (!row) return false;
  if (Date.parse(row.expires_at) <= Date.now() || row.attempts >= MAX_ATTEMPTS) {
    await db.run('DELETE FROM email_codes WHERE id = ?', [row.id]);
    return false;
  }
  if (!sameHash(row.code_hash, hashCode(normalized, purpose, code))) {
    await db.run('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    return false;
  }
  await db.run('DELETE FROM email_codes WHERE email = ? AND purpose = ?', [normalized, purpose]);
  return true;
}
