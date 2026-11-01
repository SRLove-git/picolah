import { db } from './db.ts';
import { isAnonymousUserId, isValidUserId } from './user-id.ts';
import { EMPTY_CAPY_ROOM, type CapyRoomChanges, type CapyRoomSnapshot } from '../shared/capy-room.ts';
interface RoomRow { sleeping: number; evening: number; revision: number; updated_at: string }
const snapshot = (row?: RoomRow): CapyRoomSnapshot => row ? {
  sleeping: Boolean(row.sleeping), evening: Boolean(row.evening), revision: Number(row.revision), updatedAt: row.updated_at,
} : { ...EMPTY_CAPY_ROOM };
export async function getCapyRoom(owner: string): Promise<CapyRoomSnapshot> {
  return snapshot(await db.get<RoomRow>('SELECT sleeping, evening, revision, updated_at FROM capybara_room WHERE owner_id = ?', [owner]));
}
export async function updateCapyRoom(owner: string, revision: number, changes: CapyRoomChanges) {
  return db.transaction(async tx => {
    // Insert and conditional update form a single transaction, including the first write.
    await tx.run(`INSERT INTO capybara_room (owner_id, sleeping, evening, revision, updated_at)
      VALUES (?, 0, 0, 0, ?) ON CONFLICT (owner_id) DO NOTHING`, [owner, new Date().toISOString()]);
    const fields: string[] = [], values: unknown[] = [];
    for (const key of ['sleeping', 'evening'] as const) if (changes[key] !== undefined) { fields.push(`${key} = ?`); values.push(Number(changes[key])); }
    const result = await tx.run(`UPDATE capybara_room SET ${fields.join(', ')}, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?`, [...values, new Date().toISOString(), owner, revision]);
    const room = snapshot(await tx.get<RoomRow>('SELECT sleeping, evening, revision, updated_at FROM capybara_room WHERE owner_id = ?', [owner]));
    return { conflict: !result.changes, room };
  });
}
export async function mergeCapyRoom(anonymous: string, account: string) {
  if (!isAnonymousUserId(anonymous) || !isValidUserId(account) || anonymous === account) return;
  await db.transaction(async tx => {
    // Existing account preferences win; a new account inherits its guest room.
    await tx.run(`INSERT INTO capybara_room (owner_id, sleeping, evening, revision, updated_at)
      SELECT ?, sleeping, evening, revision, updated_at FROM capybara_room WHERE owner_id = ?
      ON CONFLICT (owner_id) DO NOTHING`, [account, anonymous]);
    await tx.run('DELETE FROM capybara_room WHERE owner_id = ?', [anonymous]);
  });
}
export async function deleteCapyRoom(owner: string) { await db.run('DELETE FROM capybara_room WHERE owner_id = ?', [owner]); }
