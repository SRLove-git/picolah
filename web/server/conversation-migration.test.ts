import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';

const directory = mkdtempSync(join(tmpdir(), 'picolah-owner-migration-'));
const path = join(directory, 'legacy.db');
process.env.DATABASE_URL = '';
process.env.PICOLAH_DB_PATH = path;
const legacy = new DatabaseSync(path);
legacy.exec(`
  CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, market TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL);
  INSERT INTO conversations VALUES ('legacy-chat', 'Historical chat', 'SG', '2026-10-01', '2026-10-01');
  INSERT INTO messages VALUES ('legacy-message', 'legacy-chat', 'user', 'Historical content', NULL, '2026-10-01');
`);
legacy.close();
const { db } = await import('./db.ts');
const repo = await import('./repo.ts');
after(async () => {
  await db.close();
  rmSync(directory, { recursive: true, force: true });
});

test('SQLite adds conversation ownership without deleting or publicly assigning historical messages', async () => {
  const row = await db.get<{ owner_id: string }>('SELECT owner_id FROM conversations WHERE id = ?', ['legacy-chat']);
  assert.equal(row?.owner_id, '');
  assert.equal((await db.get<{ content: string }>('SELECT content FROM messages WHERE id = ?', ['legacy-message']))?.content, 'Historical content');
  assert.deepEqual(await repo.listConversations('anon-new-browser'), []);
  assert.equal(await repo.getConversation('legacy-chat', ''), null);
  const created = await repo.createConversation('New private chat', 'SG', 'anon-new-browser');
  assert.equal((await repo.listConversations('anon-new-browser'))[0].id, created.id);
});
