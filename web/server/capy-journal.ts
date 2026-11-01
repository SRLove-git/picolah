import { db, type DbExecutor } from './db.ts';
import { isAnonymousUserId, isValidUserId } from './user-id.ts';
import { JOURNAL_PAGE_SIZE, type JournalEntry, type JournalInput, type JournalPage } from '../shared/capy-journal.ts';

interface JournalRow {
  id: string;
  entry_date: string;
  title: string;
  content: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

function entry(row: JournalRow): JournalEntry {
  return { id: row.id, date: row.entry_date, title: row.title, content: row.content,
    revision: Number(row.revision), createdAt: row.created_at, updatedAt: row.updated_at };
}

export class JournalError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT') { super(code); }
}

async function owned(tx: DbExecutor, owner: string, id: string): Promise<JournalRow | undefined> {
  return tx.get<JournalRow>('SELECT * FROM capybara_journal WHERE owner_id = ? AND id = ?', [owner, id]);
}

export async function listCapyJournal(owner: string, offset = 0): Promise<JournalPage> {
  if (!isValidUserId(owner)) return { entries: [], total: 0 };
  const rows = await db.all<JournalRow>(
    'SELECT * FROM capybara_journal WHERE owner_id = ? ORDER BY entry_date DESC, created_at DESC, id DESC LIMIT ? OFFSET ?',
    [owner, JOURNAL_PAGE_SIZE, offset],
  );
  const count = await db.get<{ total: number | string }>('SELECT COUNT(*) AS total FROM capybara_journal WHERE owner_id = ?', [owner]);
  return { entries: rows.map(entry), total: Number(count?.total) || 0 };
}

export async function createCapyJournal(owner: string, id: string, input: JournalInput): Promise<{ entry: JournalEntry; created: boolean }> {
  if (!isValidUserId(owner)) throw new JournalError('NOT_FOUND');
  return db.transaction(async (tx) => {
    const stamp = new Date().toISOString();
    // A client-generated ID makes retrying a lost save response safe.
    const result = await tx.run(
      `INSERT INTO capybara_journal (id, owner_id, entry_date, title, content, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING`,
      [id, owner, input.date, input.title, input.content, stamp, stamp],
    );
    const row = await owned(tx, owner, id);
    if (!row) throw new JournalError('NOT_FOUND');
    if (!result.changes && (row.entry_date !== input.date || row.title !== input.title || row.content !== input.content)) {
      throw new JournalError('CONFLICT');
    }
    return { entry: entry(row), created: result.changes > 0 };
  });
}

export async function updateCapyJournal(owner: string, id: string, revision: number, input: JournalInput): Promise<JournalEntry> {
  return db.transaction(async (tx) => {
    const result = await tx.run(
      `UPDATE capybara_journal SET entry_date = ?, title = ?, content = ?, revision = revision + 1, updated_at = ?
       WHERE owner_id = ? AND id = ? AND revision = ?`,
      [input.date, input.title, input.content, new Date().toISOString(), owner, id, revision],
    );
    const row = await owned(tx, owner, id);
    if (!row) throw new JournalError('NOT_FOUND');
    if (!result.changes) throw new JournalError('CONFLICT');
    return entry(row);
  });
}

export async function removeCapyJournal(owner: string, id: string, revision: number): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx.run('DELETE FROM capybara_journal WHERE owner_id = ? AND id = ? AND revision = ?', [owner, id, revision]);
    if (!result.changes) throw new JournalError(await owned(tx, owner, id) ? 'CONFLICT' : 'NOT_FOUND');
  });
}

export async function mergeCapyJournal(anonymous: string, account: string): Promise<void> {
  if (anonymous === account || !isAnonymousUserId(anonymous) || !isValidUserId(account)) return;
  await db.run('UPDATE capybara_journal SET owner_id = ? WHERE owner_id = ?', [account, anonymous]);
}

export async function exportCapyJournal(owner: string): Promise<JournalEntry[]> {
  const rows = await db.all<JournalRow>('SELECT * FROM capybara_journal WHERE owner_id = ? ORDER BY entry_date DESC, created_at DESC, id DESC', [owner]);
  return rows.map(entry);
}

export async function deleteCapyJournal(owner: string): Promise<void> {
  await db.run('DELETE FROM capybara_journal WHERE owner_id = ?', [owner]);
}
