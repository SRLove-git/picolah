import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendCapyPose, capyPose, type CapyAction } from './capy-motion';

test('every clip remains finite and within the art gutter through repeated cycles', () => {
  for (const action of ['idle', 'pet', 'feed', 'play', 'rest', 'wake', 'outfit'] as CapyAction[]) {
    for (let frame = 0; frame < 1200; frame++) {
      const pose = capyPose(action, frame / 60, frame / 60);
      assert.ok(Object.values(pose).every(Number.isFinite), action);
      assert.ok(pose.lift >= -51 && pose.lift <= 0, action);
      assert.ok(Math.abs(pose.stretch) < 0.05, action);
      assert.ok(Math.abs(pose.head) < 0.12, action);
      assert.ok(pose.blink >= 0 && pose.blink <= 1, action);
    }
  }
});

test('finite reactions settle to the idle rig while a nap retains its sleeping pose', () => {
  for (const action of ['pet', 'feed', 'play', 'wake', 'outfit'] as CapyAction[]) {
    const settled = capyPose(action, 4.1, 9), idle = capyPose('idle', 4.1, 9);
    for (const key of Object.keys(idle) as (keyof typeof idle)[]) assert.ok(Math.abs(settled[key] - idle[key]) < 1e-12, `${action}: ${key}`);
  }
  assert.notDeepEqual(capyPose('rest', 20, 20), capyPose('idle', 20, 20));
});

test('interrupting a hop starts exactly at the rendered pose and reaches the new pose', () => {
  const airborne = capyPose('play', 0.6, 3);
  const sleeping = capyPose('rest', 0.2, 3.2);
  assert.ok(airborne.lift < -30);
  assert.deepEqual(blendCapyPose(airborne, sleeping, 0), airborne);
  const middle = blendCapyPose(airborne, sleeping, 0.5);
  assert.ok(middle.lift > airborne.lift && middle.lift < sleeping.lift);
  for (const key of Object.keys(sleeping) as (keyof typeof sleeping)[]) {
    assert.ok(Math.abs(blendCapyPose(airborne, sleeping, 1)[key] - sleeping[key]) < 1e-12);
  }
});
