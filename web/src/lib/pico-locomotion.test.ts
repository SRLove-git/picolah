import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pawCycle, PICO_GAIT, travelStep, walkingPose, type PicoPace } from './pico-locomotion';

const TAU = Math.PI * 2;
test('planted paws cancel world travel in both directions and at mobile scale', () => {
  for (const pace of ['walk', 'run'] as PicoPace[]) for (const scale of [144 / 768, 176 / 768]) for (const direction of [-1, 1]) {
    const phase = .08 * TAU, dx = .5;
    const before = pawCycle(phase, pace), after = pawCycle(phase + dx / (PICO_GAIT[pace].stride * scale) * TAU, pace);
    assert.ok(before.contact && after.contact);
    assert.equal(before.y, 0); assert.equal(after.y, 0);
    assert.ok(Math.abs(direction * dx - direction * (after.x - before.x) * scale) < 1e-9);
  }
});
test('walk always has support; running includes flight and higher foot clearance', () => {
  let airborneWalk = 0, airborneRun = 0, walkLift = 0, runLift = 0;
  for (let i = 0; i < 360; i++) {
    const phase = i / 360 * TAU;
    if (!pawCycle(phase, 'walk').contact && !pawCycle(phase + Math.PI, 'walk').contact) airborneWalk++;
    if (!pawCycle(phase, 'run').contact && !pawCycle(phase + Math.PI, 'run').contact) airborneRun++;
    walkLift = Math.max(walkLift, -pawCycle(phase, 'walk').y);
    runLift = Math.max(runLift, -pawCycle(phase, 'run').y);
  }
  assert.equal(airborneWalk, 0); assert.ok(airborneRun > 0); assert.ok(runLift > walkLift * 1.8);
});
test('accelerates and brakes at different frame rates without crossing its destination', () => {
  for (const hz of [30, 60, 120]) for (const pace of ['walk', 'run'] as PicoPace[]) for (const target of [-105, 105]) {
    let x = 0, speed = 0, phase = 0, maxSpeed = 0, arrived = false;
    const scale = 176 / 768;
    for (let i = 0; i < hz * 12; i++) {
      const next = travelStep(x, speed, target, 1 / hz, scale, pace);
      assert.ok(Math.abs(next.x) <= Math.abs(target) + 1e-9);
      phase += next.phase; x = next.x; speed = next.speed; maxSpeed = Math.max(maxSpeed, Math.abs(speed));
      if (next.arrived) { arrived = true; break; }
    }
    assert.ok(arrived); assert.equal(x, target); assert.equal(speed, 0);
    assert.ok(maxSpeed > PICO_GAIT[pace].speed * scale * .9);
    assert.ok(Math.abs(phase - Math.abs(target) / (PICO_GAIT[pace].stride * scale) * TAU) < 1e-8);
  }
});
test('foot trajectories join continuously at contact, lift-off and loop boundaries', () => {
  for (const pace of ['walk', 'run'] as PicoPace[]) for (const p of [0, PICO_GAIT[pace].stance, 1]) {
    const a = pawCycle((p - 1e-7) * TAU, pace), b = pawCycle((p + 1e-7) * TAU, pace);
    assert.ok(Math.abs(a.x - b.x) < .001); assert.ok(Math.abs(a.y - b.y) < .001);
  }
});
test('settling removes gait from the body and both feet without non-finite poses', () => {
  for (const pace of ['walk', 'run'] as PicoPace[]) for (let p = 0; p < 20; p += .03) {
    const moving = walkingPose(p, 1, pace), stopped = walkingPose(p, 0, pace);
    assert.ok(Object.values(moving.feet).every(Number.isFinite));
    assert.ok(Object.values(stopped.feet).every(n => n === 0));
    assert.equal(Math.abs(stopped.lift), 0); assert.equal(Math.abs(stopped.lean), 0);
  }
});
