import type { CapyRoomEvent, CapyRoomSnapshot, CapyRoomState } from '../../shared/capy-room';

/** Device-local boundaries also handle the night spanning midnight and DST. */
export function capySleepPeriod(now: Date) {
  const night = now.getHours() >= 22 || now.getHours() < 7;
  const start = new Date(now);
  start.setHours(night ? 22 : 7, 0, 0, 0);
  if (night && now.getHours() < 7) start.setDate(start.getDate() - 1);
  return { night, start: start.getTime() };
}

/** A manual choice in this period wins, including after a saved-room reload. */
export function scheduledCapySleep(now: Date, saved: CapyRoomSnapshot, state: CapyRoomState, lastIntent = 0): CapyRoomEvent | null {
  const { night, start } = capySleepPeriod(now);
  const touched = Math.max(Date.parse(saved.updatedAt ?? '') || 0, lastIntent);
  if (touched >= start) return null;
  if (night && (state.activity.type !== 'sleeping' || !state.evening)) return { type: 'AUTO_SLEEP' };
  if (!night && (state.activity.type === 'sleeping' || state.evening)) return { type: 'AUTO_WAKE' };
  return null;
}
