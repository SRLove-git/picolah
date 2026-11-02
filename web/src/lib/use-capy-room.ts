import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createCapyRoomStore, EMPTY_CAPY_ROOM, type CapyRoomChanges, type CapyRoomSnapshot } from '../../shared/capy-room';
import { connectCapyRoom, type CapyRoomSyncStatus } from './capy-room-sync';
import { useSession } from './session';
import { getUserId, userHeaders } from './user';
import { isMockMode } from './api';
import { scheduledCapySleep } from './capy-sleep';
export function useCapyRoom() {
  const { user, loading } = useSession();
  const owner = user?.id ?? getUserId();
  const store = useMemo(() => createCapyRoomStore(), [owner]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [sync, setSync] = useState<CapyRoomSyncStatus>('loading');
  const retry = useRef<() => void>(() => {});
  const lastIntent = useRef(0);
  // Track input even while authentication or the initial room read is pending.
  useEffect(() => {
    lastIntent.current = 0;
    return store.onEvent(event => {
      if (!['CLIP_FINISHED', 'DRESS', 'AUTO_SLEEP', 'AUTO_WAKE'].includes(event.type)) lastIntent.current = Date.now();
    });
  }, [store]);
  useEffect(() => {
    if (loading) return;
    let saved: CapyRoomSnapshot | undefined;
    function checkClock() {
      if (!saved || document.visibilityState === 'hidden') return;
      const event = scheduledCapySleep(new Date(), saved, store.getSnapshot(), lastIntent.current);
      if (event) store.send(event);
    }
    const clock = window.setInterval(checkClock, 60_000);
    document.addEventListener('visibilitychange', checkClock);
    window.addEventListener('focus', checkClock);
    function stopClock() {
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', checkClock);
      window.removeEventListener('focus', checkClock);
    }
    if (isMockMode()) {
      saved = { ...EMPTY_CAPY_ROOM };
      store.hydrate(saved); setSync('demo'); checkClock();
      return stopClock;
    }
    const abort = new AbortController();
    async function request(changes?: CapyRoomChanges, revision?: number) {
      const response = await fetch('/api/capybara/room', {
        method: changes ? 'PATCH' : 'GET', credentials: 'same-origin',
        headers: { ...userHeaders(), 'Content-Type': 'application/json' },
        ...(changes ? { body: JSON.stringify({ revision, changes }), keepalive: true } : {}),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
      });
      if (!response.ok && response.status !== 409) throw new Error(`Room: ${response.status}`);
      const result = await response.json();
      saved = result.room;
      return { ...result, conflict: response.status === 409 };
    }
    const connection = connectCapyRoom(store, {
      load: async () => (await request()).room,
      save: (revision, changes) => request(changes, revision),
    }, status => { setSync(status); if (status === 'saved') queueMicrotask(() => { if (!abort.signal.aborted) checkClock(); }); });
    retry.current = connection.retry;
    window.addEventListener('online', connection.retry);
    return () => { stopClock(); connection.dispose(); abort.abort(); window.removeEventListener('online', connection.retry); retry.current = () => {}; };
  }, [store, loading]);
  return { store, state, sync, retry: () => retry.current() };
}
