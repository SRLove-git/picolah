import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCapyRoomState, createCapyRoomStore, EMPTY_CAPY_ROOM, roomPreferences, transitionCapyRoom, type CapyRoomSnapshot } from '../../shared/capy-room';
import { connectCapyRoom, type CapyRoomSyncStatus } from './capy-room-sync';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

test('actions interrupt, late completions are ignored, sleep and toys persist until another event', () => {
  let state = transitionCapyRoom(createCapyRoomState(), { type: 'FEED' });
  const earlier = state.sequence;
  state = transitionCapyRoom(state, { type: 'SLEEP' });
  assert.equal(transitionCapyRoom(state, { type: 'CLIP_FINISHED', sequence: earlier }), state);
  assert.equal(transitionCapyRoom(state, { type: 'CLIP_FINISHED', sequence: state.sequence }), state);
  assert.equal(transitionCapyRoom(state, { type: 'DRESS' }), state, 'clothing does not wake a nap');
  state = transitionCapyRoom(state, { type: 'PLAY', toy: 'ball' });
  assert.equal(transitionCapyRoom(state, { type: 'CLIP_FINISHED', sequence: state.sequence }), state);
  assert.equal(transitionCapyRoom(state, { type: 'INTERACT' }), state);
  state = transitionCapyRoom(state, { type: 'FEED' });
  assert.deepEqual(transitionCapyRoom(state, { type: 'CLIP_FINISHED', sequence: state.sequence }).activity, { type: 'idle' });
});

test('late hydration replays local intent; clicks during a game still deliver interaction events', () => {
  const store = createCapyRoomStore(); const seen: string[] = [];
  store.onEvent(event => seen.push(event.type));
  store.send({ type: 'FEED' }); store.send({ type: 'PLAY', toy: 'bubbles' }); store.send({ type: 'INTERACT' });
  store.hydrate({ ...EMPTY_CAPY_ROOM, sleeping: true, evening: true, revision: 4 });
  assert.deepEqual(store.getSnapshot().activity, { type: 'playing', toy: 'bubbles' });
  assert.equal(store.getSnapshot().evening, true);
  assert.deepEqual(seen, ['FEED', 'PLAY', 'INTERACT']);
});

test('serialized writes preserve a quick sleep/wake and rebase only changed fields on conflict', async () => {
  const store = createCapyRoomStore(), first = deferred<{ room: CapyRoomSnapshot; conflict: boolean }>();
  const statuses: CapyRoomSyncStatus[] = [], writes: unknown[] = [];
  const connection = connectCapyRoom(store, {
    load: async () => EMPTY_CAPY_ROOM,
    save: async (revision, changes) => {
      writes.push({ revision, changes });
      if (writes.length === 1) return first.promise;
      if (writes.length === 2) return { conflict: true, room: { ...EMPTY_CAPY_ROOM, sleeping: true, evening: true, revision: 2 } };
      return { conflict: false, room: { ...EMPTY_CAPY_ROOM, sleeping: changes.sleeping!, evening: true, revision: 3 } };
    },
  }, s => statuses.push(s));
  await tick(); store.send({ type: 'SLEEP' }); store.send({ type: 'WAKE' });
  assert.equal(writes.length, 1);
  first.resolve({ conflict: false, room: { ...EMPTY_CAPY_ROOM, sleeping: true, revision: 1 } });
  await tick();
  assert.deepEqual(writes, [{ revision: 0, changes: { sleeping: true } }, { revision: 1, changes: { sleeping: false } }, { revision: 2, changes: { sleeping: false } }]);
  assert.deepEqual(roomPreferences(store.getSnapshot()), { sleeping: false, evening: true });
  assert.equal(statuses.at(-1), 'saved'); connection.dispose();
});

test('a lost response retries field values, so a toggle is not applied twice; dispose ignores a late load', async () => {
  const store = createCapyRoomStore(); let remote = { ...EMPTY_CAPY_ROOM }, fail = true;
  const statuses: CapyRoomSyncStatus[] = [];
  const connection = connectCapyRoom(store, {
    load: async () => remote,
    save: async (revision, changes) => {
      if (revision !== remote.revision) return { conflict: true, room: remote };
      remote = { ...remote, ...changes, revision: remote.revision + 1 };
      if (fail) { fail = false; throw new Error('Response lost'); }
      return { conflict: false, room: remote };
    },
  }, s => statuses.push(s));
  await tick(); store.send({ type: 'TOGGLE_LIGHT' }); await tick(); assert.equal(statuses.at(-1), 'error');
  connection.retry(); await tick(); assert.equal(statuses.at(-1), 'saved'); assert.equal(remote.evening, true); connection.dispose();
  const late = deferred<CapyRoomSnapshot>(), second = createCapyRoomStore();
  const stopped = connectCapyRoom(second, { load: () => late.promise, save: async () => { throw new Error('No write'); } }, () => {});
  stopped.dispose(); late.resolve({ ...EMPTY_CAPY_ROOM, sleeping: true }); await tick(); assert.equal(second.getSnapshot().activity.type, 'idle');
});
