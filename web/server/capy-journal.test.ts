import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { JournalEntry, JournalPage } from '../shared/capy-journal.ts';

const directory = mkdtempSync(join(tmpdir(), 'picolah-journal-test-'));
process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'false';
process.env.DATABASE_URL = '';
process.env.PICOLAH_DB_PATH = join(directory, 'journal.db');
process.env.LLM_API_KEY = '';
process.env.CRAWLER_TOOL_URL = '';
process.env.CRAWLER_TOOL_TOKEN = '';
const { app } = await import('./index.ts');
const { db } = await import('./db.ts');
const { config } = await import('./config.ts');
const auth = await import('./auth.ts');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No test port');
const base = `http://127.0.0.1:${address.port}/api`;
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  rmSync(directory, { recursive: true, force: true });
});

function headers(owner: string, cookie?: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Picolah-User': owner, ...(cookie ? { cookie } : {}) };
}
function input(content = '和卡皮度过开心的一天。') { return { id: randomUUID(), date: '2026-11-01', title: '小日子', content }; }
function call(owner: string, method = 'GET', suffix = '', body?: unknown, cookie?: string) {
  return fetch(`${base}/capybara/journal${suffix}`, { method, headers: headers(owner, cookie), ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function create(owner: string, value = input(), cookie?: string) {
  const response = await call(owner, 'POST', '', value, cookie);
  assert.equal(response.status, 201);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  return ((await response.json()) as { entry: JournalEntry }).entry;
}

test('journal CRUD is owner-scoped, rejects account impersonation and retries a lost create response safely', async () => {
  assert.equal((await call('')).status, 401);
  assert.equal((await call('a'.repeat(32))).status, 401);
  const owner = 'journal-owner-a', other = 'journal-owner-b';
  const value = input('一段正文\n<img src=x onerror=alert(1)>');
  const entry = await create(owner, value);
  assert.equal((await call(owner, 'POST', '', value)).status, 200);
  assert.equal((await call(other, 'POST', '', value)).status, 404);
  const listing = await (await call(owner)).json() as JournalPage;
  assert.equal(listing.entries.length, 1);
  assert.equal(listing.entries[0].content, value.content);
  assert.equal(listing.total, 1);
  assert.deepEqual(await (await call(other)).json(), { entries: [], total: 0 });
  const update = { date: value.date, title: '改过的标题', content: '保存后的文字', revision: entry.revision };
  assert.equal((await call(other, 'PATCH', `/${entry.id}`, update)).status, 404);
  assert.equal((await call(other, 'DELETE', `/${entry.id}`, { revision: 1 })).status, 404);
  assert.equal((await call(owner, 'PATCH', `/${entry.id}`, update)).status, 200);
  const changed = (await (await call(owner)).json() as JournalPage).entries[0];
  assert.equal(changed.title, update.title);
  assert.equal(changed.content, update.content);
  assert.equal(changed.revision, 2);

  // Re-open the real file in another Node process, including startup schema application.
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `const {db}=await import('./server/db.ts');console.log(JSON.stringify(await db.get('SELECT title,content,revision FROM capybara_journal WHERE id = ?', [${JSON.stringify(entry.id)}])));await db.close();`],
  { cwd: new URL('..', import.meta.url), env: process.env, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.trim()), { title: update.title, content: update.content, revision: 2 });
});

test('journal fields validate real calendar days, text limits, empty content and ownership fields', async () => {
  const owner = 'journal-validation';
  for (const patch of [
    { date: '2026-02-29' }, { date: '2024-02-30' }, { date: 'invalid' }, { date: '0000-01-01' },
    { content: '  \n ' }, { content: 'x'.repeat(4001) }, { title: 'x'.repeat(81) },
    { owner_id: 'journal-another-user' }, { id: 'bad-id' },
  ]) assert.equal((await call(owner, 'POST', '', { ...input(), ...patch })).status, 422);
  const valid = await create(owner, { ...input('  保存正文  '), date: '2024-02-29', title: '  标题  ' });
  assert.equal(valid.date, '2024-02-29');
  assert.equal(valid.title, '标题');
  assert.equal(valid.content, '保存正文');
  for (const query of ['?offset=-1', '?offset=bad', '?offset=1.5']) assert.equal((await call(owner, 'GET', query)).status, 422);
});

test('concurrent edits and stale deletes cannot overwrite a newer revision or grant shopping XP', async () => {
  const owner = 'journal-conflict';
  const before = await (await fetch(`${base}/capybara`, { headers: headers(owner) })).json();
  const entry = await create(owner);
  const updates = await Promise.all(['first', 'second'].map((content) => call(owner, 'PATCH', `/${entry.id}`, {
    date: entry.date, title: entry.title, content, revision: 1,
  })));
  assert.deepEqual(updates.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await call(owner, 'DELETE', `/${entry.id}`, { revision: 1 })).status, 409);
  assert.equal((await call(owner, 'DELETE', `/${entry.id}`)).status, 422);
  assert.equal((await call(owner, 'DELETE', `/${entry.id}`, { revision: 2 })).status, 200);
  assert.equal((await call(owner, 'DELETE', `/${entry.id}`, { revision: 2 })).status, 404);
  assert.deepEqual(await (await call(owner)).json(), { entries: [], total: 0 });
  const after = await (await fetch(`${base}/capybara`, { headers: headers(owner) })).json();
  assert.deepEqual(after, before);
});

test('older journal entries remain reachable through owner-scoped pagination', async () => {
  const owner = 'journal-pagination';
  for (let i = 0; i < 23; i++) await create(owner, { ...input(), date: `2026-10-${String(i + 1).padStart(2, '0')}` });
  const first = await (await call(owner)).json() as JournalPage;
  const second = await (await call(owner, 'GET', '?offset=20')).json() as JournalPage;
  assert.equal(first.total, 23); assert.equal(second.total, 23);
  assert.equal(first.entries.length, 20); assert.equal(second.entries.length, 3);
  assert.equal(first.entries[0].date, '2026-10-23');
  assert.equal(second.entries[2].date, '2026-10-01');
  assert.equal(new Set([...first.entries, ...second.entries].map((entry) => entry.id)).size, 23);
});

test('login carries guest diaries to the account; exports include them and account deletion removes them', async () => {
  const guest = 'journal-before-login';
  const guestEntry = await create(guest);
  const password = 'journal test password 9';
  const account = await auth.createUser({ email: 'journal-owner@example.com', passwordHash: await auth.hashPassword(password), displayName: 'Journal test' });
  const session = `${config.sessionCookie}=${await auth.createSession(account.id)}`;
  const ownEntry = await create('journal-irrelevant-header', input('Account entry'), session);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: headers(guest), body: JSON.stringify({ email: account.email, password }) });
  assert.equal(login.status, 200);
  assert.deepEqual(await (await call(guest)).json(), { entries: [], total: 0 });
  assert.equal((await call(account.id)).status, 401);
  const owned = await (await call(guest, 'GET', '', undefined, session)).json() as JournalPage;
  assert.deepEqual(new Set(owned.entries.map((entry) => entry.id)), new Set([guestEntry.id, ownEntry.id]));
  const reset = await fetch(`${base}/profile`, { method: 'DELETE', headers: headers(guest, session) });
  assert.equal(reset.status, 204);
  assert.equal((await (await call(guest, 'GET', '', undefined, session)).json() as JournalPage).total, 2);
  const exported = await fetch(`${base}/account/export`, { headers: headers(guest, session) });
  assert.equal(exported.status, 200);
  assert.equal(((await exported.json()) as { journal: JournalEntry[] }).journal.length, 2);
  const deleted = await fetch(`${base}/account`, { method: 'DELETE', headers: headers(guest, session), body: JSON.stringify({ password }) });
  assert.equal(deleted.status, 200);
  assert.equal((await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM capybara_journal WHERE owner_id = ?', [account.id]))?.total, 0);
});
