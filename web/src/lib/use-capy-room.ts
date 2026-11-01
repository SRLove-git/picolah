import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createCapyRoomStore, EMPTY_CAPY_ROOM, type CapyRoomChanges } from '../../shared/capy-room';
import { connectCapyRoom, type CapyRoomSyncStatus } from './capy-room-sync';
import { useSession } from './session';
import { getUserId, userHeaders } from './user';
import { isMockMode } from './api';
export function useCapyRoom() {
  const { user, loading } = useSession();
  const owner = user?.id ?? getUserId();
  const store = useMemo(() => createCapyRoomStore(), [owner]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [sync, setSync] = useState<CapyRoomSyncStatus>('loading');
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    if (loading) return;
    if (isMockMode()) { store.hydrate(EMPTY_CAPY_ROOM); setSync('demo'); return; }
    const abort = new AbortController();
    async function request(changes?: CapyRoomChanges, revision?: number) {
      const response = await fetch('/api/capybara/room', {
        method: changes ? 'PATCH' : 'GET', credentials: 'same-origin',
        headers: { ...userHeaders(), 'Content-Type': 'application/json' },
        ...(changes ? { body: JSON.stringify({ revision, changes }), keepalive: true } : {}),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
      });
      if (!response.ok && response.status !== 409) throw new Error(`Room: ${response.status}`);
      return { ...(await response.json()), conflict: response.status === 409 };
    }
    const connection = connectCapyRoom(store, {
      load: async () => (await request()).room,
      save: (revision, changes) => request(changes, revision),
    }, setSync);
    retry.current = connection.retry;
    window.addEventListener('online', connection.retry);
    return () => { connection.dispose(); abort.abort(); window.removeEventListener('online', connection.retry); retry.current = () => {}; };
  }, [store, loading]);
  return { store, state, sync, retry: () => retry.current() };
}
