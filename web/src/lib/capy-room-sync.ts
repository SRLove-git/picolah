import { roomPreferences, type CapyRoomStore, type CapyRoomSnapshot, type CapyRoomChanges } from '../../shared/capy-room';
export type CapyRoomSyncStatus = 'loading' | 'saved' | 'saving' | 'error' | 'demo';
export interface CapyRoomTransport {
  load(): Promise<CapyRoomSnapshot>;
  save(revision: number, changes: CapyRoomChanges): Promise<{ room: CapyRoomSnapshot; conflict: boolean }>;
}
/** Serial, field-level writes. Conflicts rebase pending intent, never replay toggles. */
export function connectCapyRoom(store: CapyRoomStore, transport: CapyRoomTransport, status: (status: CapyRoomSyncStatus) => void) {
  let remote: CapyRoomSnapshot | null = null, pending: CapyRoomChanges = {}, busy = false, disposed = false, internal = false;
  let previous = roomPreferences(store.getSnapshot());
  const unsubscribe = store.subscribe(() => {
    const next = roomPreferences(store.getSnapshot());
    if (!internal) for (const key of ['sleeping', 'evening'] as const) if (previous[key] !== next[key]) pending[key] = next[key];
    previous = next;
    if (!internal && remote) void flush();
  });
  async function flush() {
    if (disposed || busy || !remote || !Object.keys(pending).length) return;
    busy = true; status('saving'); let conflicts = 0;
    try {
      while (!disposed && Object.keys(pending).length) {
        const batch = pending; pending = {};
        try {
          const result = await transport.save(remote.revision, batch);
          if (disposed) return;
          remote = result.room;
          if (result.conflict) {
            pending = { ...batch, ...pending };
            if (++conflicts > 3) throw new Error('Room changed in another tab');
          } else {
            internal = true; store.reconcile(remote, pending); internal = false;
          }
        } catch (error) { pending = { ...batch, ...pending }; throw error; }
      }
      if (!disposed) status('saved');
    } catch { if (!disposed) status('error'); }
    finally { busy = false; }
  }
  async function load() {
    if (disposed || busy) return;
    busy = true; status('loading');
    try {
      remote = await transport.load();
      if (disposed) return;
      internal = true; store.hydrate(remote); internal = false;
      const current = roomPreferences(store.getSnapshot());
      for (const key of ['sleeping', 'evening'] as const) if (current[key] !== remote[key]) pending[key] = current[key];
      status(Object.keys(pending).length ? 'saving' : 'saved');
    } catch { if (!disposed) status('error'); }
    finally { busy = false; }
    if (remote && !disposed) void flush();
  }
  void load();
  return { retry: () => remote ? void flush() : void load(), dispose() { disposed = true; unsubscribe(); } };
}
