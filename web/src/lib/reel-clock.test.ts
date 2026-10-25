import assert from 'node:assert/strict';
import test from 'node:test';
import { ReelClock } from './reel-clock.ts';

test('counts playing intervals, excluding pauses, hidden tabs and unmount time', () => {
  const clock = new ReelClock(16_250);
  assert.equal(clock.read(500), 0);
  clock.setRunning(true, 500);
  clock.setRunning(false, 1_500);
  assert.equal(clock.read(9_000), 1_000);
  clock.setRunning(true, 9_000);
  clock.setRunning(false, 10_250);
  assert.equal(clock.read(100_000), 2_250);
});

test('repeated playing signals preserve cumulative time and duration is bounded', () => {
  const clock = new ReelClock(16_250);
  clock.setRunning(true, 0);
  clock.setRunning(true, 4_000);
  assert.equal(clock.read(5_000), 5_000);
  assert.equal(clock.read(60_000), 16_250);
  clock.setRunning(false, 60_000);
  clock.setRunning(true, 61_000);
  assert.equal(clock.read(90_000), 16_250);
});

test('each viewing session has an independent clock', () => {
  const first = new ReelClock(16_250);
  first.setRunning(true, 0);
  first.setRunning(false, 3_000);
  const second = new ReelClock(16_250);
  second.setRunning(true, 3_000);
  assert.equal(first.read(5_000), 3_000);
  assert.equal(second.read(5_000), 2_000);
});
