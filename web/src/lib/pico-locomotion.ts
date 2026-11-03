import type { CapyFeet } from './capy-renderer';

export type PicoPace = 'walk' | 'run';
export const PICO_GAIT = {
  walk: { stride: 104, speed: 124, acceleration: 500, stance: .62, lift: 45 },
  run: { stride: 164, speed: 288, acceleration: 960, stance: .44, lift: 92 },
} as const;
const TAU = Math.PI * 2;
export const approach = (from: number, to: number, amount: number) => from + Math.sign(to - from) * Math.min(Math.abs(to - from), amount);

/** World travel and the paw cycle use the same distance, including braking. */
export function travelStep(x: number, speed: number, target: number, dt: number, scale: number, pace: PicoPace) {
  const spec = PICO_GAIT[pace], remaining = target - x;
  const acceleration = spec.acceleration * scale;
  const desired = Math.sign(remaining) * Math.min(spec.speed * scale, Math.sqrt(2 * acceleration * Math.abs(remaining)));
  const nextSpeed = approach(speed, desired, acceleration * dt);
  const delta = (speed + nextSpeed) * .5 * dt;
  const arrived = Math.abs(remaining) <= Math.abs(delta) && Math.sign(delta) === Math.sign(remaining) || Math.abs(remaining) < .02;
  const distance = arrived ? remaining : delta;
  return { x: x + distance, speed: arrived ? 0 : nextSpeed, phase: Math.abs(distance) / (spec.stride * scale) * TAU, arrived };
}

/** Left-facing artwork: a supporting paw travels backwards, then clears the
 * ground and swings forwards. Opposite paws are exactly half a cycle apart. */
export function pawCycle(phase: number, pace: PicoPace) {
  const { stride, stance, lift } = PICO_GAIT[pace];
  const p = ((phase / TAU % 1) + 1) % 1;
  if (p <= stance) return { x: stride * (p - stance / 2), y: 0, contact: true };
  const swing = (p - stance) / (1 - stance);
  // Hermite swing joins the stance with matching backward velocity at both ends.
  const ease = swing * swing * (3 - 2 * swing);
  const tangent = swing * (1 - swing) * (1 - 2 * swing);
  return { x: stride * (stance * (.5 - ease) + (1 - stance) * tangent),
    y: -lift * Math.sin(swing * Math.PI) ** 2, contact: false };
}

export function walkingPose(phase: number, amount: number, pace: PicoPace) {
  const left = pawCycle(phase, pace), right = pawCycle(phase + Math.PI, pace);
  const run = pace === 'run';
  const flight = run ? Math.min(-left.y, -right.y) : 0;
  const feet: CapyFeet = { leftX: left.x * amount, leftY: left.y * amount,
    rightX: right.x * amount, rightY: right.y * amount, grounded: amount };
  return { feet, lift: (-Math.abs(Math.sin(phase)) * (run ? 20 : 9) - flight * .45) * amount,
    lean: (-.014 - (run ? .027 : 0) + Math.sin(phase) * .012) * amount,
    head: Math.sin(phase - .65) * .024 * amount,
    bag: Math.sin(phase - .85) * (run ? 15 : 8) * amount,
    ears: Math.sin(phase - 1.1) * (run ? .09 : .045) * amount,
    flight: flight * amount };
}
