import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { config } from './config.ts';
import { db, dbPath } from './db.ts';
import { activeProvider, generateTryOn, imagegenConfigured, mediaExtension, type TryOnInput } from './imagegen.ts';

/**
 * Generated try-on images are cached by product identity + provider, so a
 * product only costs one image call no matter how many visitors see it.
 */
export interface TryOnRequest extends TryOnInput {
  productId?: string;
  /** Real marketplace photo used as the product reference. */
  imageUrl?: string;
}

export interface TryOnRecord {
  id: string;
  productKey: string;
  name: string;
  imageUrl?: string;
  provider: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  file: string | null;
  mime: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  url?: string;
}

const mediaDir = resolve(process.env.PICOLAH_MEDIA_DIR || join(dirname(dbPath), 'media'));
const tryonDir = join(mediaDir, 'tryon');
mkdirSync(tryonDir, { recursive: true });

const MAX_ACTIVE = 2;
const active = new Map<string, Promise<void>>();
let queued = 0;

function now(): string {
  return new Date().toISOString();
}

function keyFor(input: TryOnRequest): string {
  const identity = [
    input.productId || '',
    input.name.trim().toLowerCase(),
    (input.brand || '').trim().toLowerCase(),
    (input.imageUrl || '').trim(),
    activeProvider(),
    'v1',
  ].join('|');
  return createHash('sha256').update(identity).digest('hex').slice(0, 32);
}

function rowToRecord(row: Record<string, unknown>): TryOnRecord {
  const record: TryOnRecord = {
    id: String(row.id),
    productKey: String(row.product_key),
    name: String(row.product_name),
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    provider: String(row.provider),
    status: String(row.status) as TryOnRecord['status'],
    file: row.file ? String(row.file) : null,
    mime: row.mime ? String(row.mime) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  if (record.status === 'done' && record.file) record.url = `/media/tryon/${record.file}`;
  return record;
}

async function findByKey(key: string): Promise<TryOnRecord | undefined> {
  const row = await db.get<Record<string, unknown>>(
    'SELECT * FROM capy_tryon WHERE product_key = ? ORDER BY created_at DESC LIMIT 1',
    [key],
  );
  return row ? rowToRecord(row) : undefined;
}

/** A picture that is already generated (or in flight) for this exact input. */
export async function findCachedTryOn(input: TryOnRequest): Promise<TryOnRecord | undefined> {
  const existing = await findByKey(keyFor(input));
  if (!existing) return undefined;
  return existing.status === 'done' || existing.status === 'pending' || existing.status === 'running'
    ? existing
    : undefined;
}

export async function getTryOn(id: string): Promise<TryOnRecord | undefined> {
  const row = await db.get<Record<string, unknown>>('SELECT * FROM capy_tryon WHERE id = ?', [id]);
  if (!row) return undefined;
  const record = rowToRecord(row);
  // A process restart abandons in-flight jobs; let the client retry instead
  // of polling a stale pending row forever.
  if ((record.status === 'pending' || record.status === 'running') && !active.has(record.id)) {
    const age = Date.now() - Date.parse(record.updatedAt);
    if (age > 3 * 60_000) {
      await db.run("UPDATE capy_tryon SET status = 'failed', error = 'INTERRUPTED', updated_at = ? WHERE id = ?", [now(), id]);
      record.status = 'failed';
      record.error = 'INTERRUPTED';
    }
  }
  return record;
}

export async function recentTryOns(limit = 12): Promise<TryOnRecord[]> {
  const rows = await db.all<Record<string, unknown>>(
    "SELECT * FROM capy_tryon WHERE status = 'done' ORDER BY updated_at DESC LIMIT ?",
    [Math.min(24, Math.max(1, limit))],
  );
  return rows.map(rowToRecord);
}

async function runJob(id: string, input: TryOnRequest): Promise<void> {
  const started = now();
  await db.run("UPDATE capy_tryon SET status = 'running', updated_at = ? WHERE id = ?", [started, id]);
  try {
    const image = await generateTryOn({ ...input, productImageUrl: input.imageUrl });
    const file = `${id}.${mediaExtension(image.mime)}`;
    await writeFile(join(tryonDir, file), image.bytes);
    await db.run(
      "UPDATE capy_tryon SET status = 'done', file = ?, mime = ?, provider = ?, error = NULL, updated_at = ? WHERE id = ?",
      [file, image.mime, image.provider, now(), id],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.run("UPDATE capy_tryon SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", [message.slice(0, 500), now(), id]);
  } finally {
    active.delete(id);
    void drain();
  }
}

async function drain(): Promise<void> {
  if (active.size >= MAX_ACTIVE) return;
  // Jobs are started directly from startTryOn; drain only resumes after a
  // restart, where queued rows were lost. Nothing to resume eagerly here.
  queued = Math.max(0, queued - 1);
}

export interface StartTryOnResult {
  record: TryOnRecord;
  cached: boolean;
}

/** Returns an existing/new record; generation runs in the background. */
export async function startTryOn(input: TryOnRequest): Promise<StartTryOnResult> {
  const key = keyFor(input);
  const existing = await findByKey(key);
  if (existing && (existing.status === 'done' || existing.status === 'pending' || existing.status === 'running')) {
    return { record: existing, cached: existing.status === 'done' };
  }

  const id = randomUUID();
  const at = now();
  await db.run(
    `INSERT INTO capy_tryon (id, product_key, product_name, image_url, provider, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, key, input.name, input.imageUrl || '', activeProvider(), at, at],
  );

  if (active.size >= MAX_ACTIVE) {
    // Keep the row pending; a periodic sweeper starts it when a slot frees.
    schedulePump(id, input);
  } else {
    start(id, input);
  }

  const record: TryOnRecord = {
    id,
    productKey: key,
    name: input.name,
    imageUrl: input.imageUrl,
    provider: activeProvider(),
    status: 'pending',
    file: null,
    mime: null,
    error: null,
    createdAt: at,
    updatedAt: at,
  };
  return { record, cached: false };
}

const waiting: Array<{ id: string; input: TryOnRequest }> = [];

function start(id: string, input: TryOnRequest): void {
  const job = runJob(id, input);
  active.set(id, job);
  void job;
}

function schedulePump(id: string, input: TryOnRequest): void {
  waiting.push({ id, input });
  queued = waiting.length;
  setTimeout(() => {
    while (active.size < MAX_ACTIVE && waiting.length) {
      const next = waiting.shift();
      if (!next) break;
      if (active.has(next.id)) continue;
      start(next.id, next.input);
    }
    queued = waiting.length;
  }, 250).unref?.();
}

/** Serves a generated file name without allowing path traversal. */
export function tryOnFilePath(file: string): string | null {
  if (!/^[a-f0-9-]{20,64}\.(png|jpe?g|webp)$/i.test(file)) return null;
  const path = join(tryonDir, file);
  return existsSync(path) ? path : null;
}

export function tryOnDir(): string {
  return tryonDir;
}

export { imagegenConfigured };
