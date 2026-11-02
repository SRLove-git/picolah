/** Durable preferences live in SQLite; transient clips and toy physics stay local. */
export interface CapyRoomSnapshot {
  sleeping: boolean;
  evening: boolean;
  revision: number;
  updatedAt: string | null;
}
export type CapyRoomChanges = Partial<Pick<CapyRoomSnapshot, 'sleeping' | 'evening'>>;
export type CapyToy = 'ball' | 'bubbles' | 'swing' | 'dance';
export type CapyActivity =
  | { type: 'idle' | 'petting' | 'eating' | 'sleeping' | 'waking' | 'dressing' | 'celebrating' }
  | { type: 'playing'; toy: CapyToy };
export interface CapyRoomState { activity: CapyActivity; evening: boolean; sequence: number }
export type CapyRoomEvent =
  | { type: 'PET' | 'FEED' | 'SLEEP' | 'WAKE' | 'DRESS' | 'CELEBRATE' | 'PUT_AWAY' | 'TOGGLE_LIGHT' | 'AUTO_SLEEP' | 'AUTO_WAKE' }
  | { type: 'PLAY'; toy: CapyToy }
  | { type: 'INTERACT'; x?: number; y?: number }
  | { type: 'CLIP_FINISHED'; sequence: number };
export const EMPTY_CAPY_ROOM: CapyRoomSnapshot = { sleeping: false, evening: false, revision: 0, updatedAt: null };
export function createCapyRoomState(snapshot = EMPTY_CAPY_ROOM): CapyRoomState {
  return { activity: { type: snapshot.sleeping ? 'sleeping' : 'idle' }, evening: snapshot.evening, sequence: 0 };
}
export function roomPreferences(state: CapyRoomState) {
  return { sleeping: state.activity.type === 'sleeping', evening: state.evening };
}
/** Explicit, interruptible transitions. A late completion cannot cancel a newer action. */
export function transitionCapyRoom(state: CapyRoomState, event: CapyRoomEvent): CapyRoomState {
  const enter = (activity: CapyActivity, evening = state.evening): CapyRoomState => ({ activity, evening, sequence: state.sequence + 1 });
  switch (event.type) {
    case 'PET': return enter({ type: state.activity.type === 'sleeping' ? 'waking' : 'petting' });
    case 'FEED': return enter({ type: 'eating' });
    case 'SLEEP': return enter({ type: 'sleeping' });
    case 'WAKE': return enter({ type: 'waking' });
    case 'AUTO_SLEEP': return enter({ type: 'sleeping' }, true);
    case 'AUTO_WAKE': return enter({ type: 'waking' }, false);
    case 'PLAY': return enter({ type: 'playing', toy: event.toy });
    case 'PUT_AWAY': return enter({ type: 'idle' });
    case 'DRESS': return state.activity.type === 'sleeping' || state.activity.type === 'playing' ? state : enter({ type: 'dressing' });
    case 'CELEBRATE': return enter({ type: 'celebrating' });
    case 'TOGGLE_LIGHT': return state.activity.type === 'sleeping' ? enter({ type: 'waking' }, false) : { ...state, evening: !state.evening };
    case 'INTERACT': return state.activity.type === 'playing' ? state : transitionCapyRoom(state, { type: 'PET' });
    case 'CLIP_FINISHED': return event.sequence === state.sequence && ['petting', 'eating', 'waking', 'dressing', 'celebrating'].includes(state.activity.type) ? enter({ type: 'idle' }) : state;
  }
}
export function capyRoomAction(state: CapyRoomState): 'idle' | 'pet' | 'feed' | 'rest' | 'wake' | 'outfit' | 'play' {
  switch (state.activity.type) {
    case 'petting': return 'pet'; case 'eating': return 'feed'; case 'sleeping': return 'rest';
    case 'waking': return 'wake'; case 'dressing': return 'outfit'; case 'playing': case 'celebrating': return 'play'; default: return 'idle';
  }
}

/** One source of truth shared by React, the animation player and persistence. */
export function createCapyRoomStore() {
  let state = createCapyRoomState(), hydrated = false;
  const earlyEvents: CapyRoomEvent[] = [];
  const listeners = new Set<() => void>();
  const events = new Set<(event: CapyRoomEvent, state: CapyRoomState) => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    onEvent(listener: (event: CapyRoomEvent, state: CapyRoomState) => void) { events.add(listener); return () => { events.delete(listener); }; },
    send(event: CapyRoomEvent) {
      if (!hydrated) earlyEvents.push(event);
      const next = transitionCapyRoom(state, event);
      if (next !== state) { state = next; listeners.forEach(listener => listener()); }
      events.forEach(listener => listener(event, state));
    },
    reconcile(snapshot: CapyRoomSnapshot, pending: CapyRoomChanges = {}) {
      const sleeping = pending.sleeping ?? snapshot.sleeping;
      const evening = pending.evening ?? snapshot.evening;
      const isSleeping = state.activity.type === 'sleeping';
      state = { ...state, evening, ...(sleeping !== isSleeping ? {
        activity: { type: sleeping ? 'sleeping' : 'idle' }, sequence: state.sequence + 1,
      } : {}) };
      listeners.forEach(listener => listener());
    },
    hydrate(snapshot: CapyRoomSnapshot) {
      if (hydrated) return;
      hydrated = true;
      state = earlyEvents.reduce(transitionCapyRoom, createCapyRoomState(snapshot));
      earlyEvents.length = 0; listeners.forEach(listener => listener());
    },
  };
}
export type CapyRoomStore = ReturnType<typeof createCapyRoomStore>;
