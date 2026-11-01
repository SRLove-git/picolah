import type { CapyAction } from './capy-motion';

export type CapyGame = 'ball' | 'bubbles' | 'swing' | 'dance';
export interface Point3 { x: number; y: number; z: number }
export interface PlayBubble extends Point3 { id: number; radius: number; life: number; popped: number }
export interface CapyPlayState {
  mode: CapyGame | null; action: CapyAction; time: number; actionTime: number; bounds: number;
  actor: Point3 & { yaw: number; vy: number; speed: number; gait: number; kick: number };
  ball: Point3 & { vx: number; vy: number; vz: number; radius: number; spin: number; cooldown: number };
  bubbles: PlayBubble[]; nextBubble: number; swing: { angle: number; velocity: number; length: number };
  contacts: number; lastContact: number; target: Point3 | null;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function createCapyPlayState(): CapyPlayState {
  return {
    mode: null, action: 'idle', time: 0, actionTime: 0, bounds: 2.25,
    actor: { x: 0, y: 0, z: 0, yaw: -0.2, vy: 0, speed: 0, gait: 0, kick: -1 },
    ball: { x: 1.5, y: 0.22, z: 0.65, vx: 0, vy: 0, vz: 0, radius: 0.22, spin: 0, cooldown: 0 },
    bubbles: [], nextBubble: 0, swing: { angle: 0, velocity: 0, length: 3.05 },
    contacts: 0, lastContact: -10, target: null,
  };
}

export function setCapyGame(state: CapyPlayState, mode: CapyGame | null) {
  state.mode = mode; state.action = mode ? 'play' : 'idle'; state.actionTime = 0;
  state.contacts = 0; state.bubbles = []; state.target = null; state.actor.kick = -1;
  state.ball.vx = state.ball.vz = state.ball.vy = 0;
  if (mode === 'ball') throwCapyBall(state);
  if (mode === 'bubbles') blowCapyBubbles(state);
  if (mode === 'swing') { state.swing.angle = 0; state.swing.velocity = 0.65; }
}

export function setCapyPlayAction(state: CapyPlayState, action: CapyAction) {
  setCapyGame(state, null); state.action = action; state.actionTime = 0;
}

export function throwCapyBall(state: CapyPlayState, x = state.bounds * 0.7, z = 0.7) {
  const b = state.ball, a = state.actor;
  b.x = clamp(x, -state.bounds, state.bounds); b.z = clamp(z, -0.8, 1.1); b.y = 0.65;
  const length = Math.hypot(a.x - b.x, a.z - b.z) || 1;
  b.vx = (a.x - b.x) / length * 1.5; b.vz = (a.z - b.z) / length * 1.5;
  b.vy = 2.2; b.cooldown = 0.25; a.kick = -1;
}

export function blowCapyBubbles(state: CapyPlayState, x = 0) {
  // A small bounded pool; expired bubbles disappear without awarding a catch.
  state.bubbles = state.bubbles.filter((b) => b.popped < 0).slice(-2);
  for (let i = 0; i < 4; i++) state.bubbles.push({
    id: state.nextBubble++, x: clamp(x + (i - 1.5) * 0.62, -state.bounds, state.bounds),
    y: 2.0 + (i % 3) * 0.26, z: 0.45 + (i % 2) * 0.22,
    radius: 0.18 + (i % 2) * 0.045, life: 0, popped: -1,
  });
}

export function pushCapySwing(state: CapyPlayState) {
  state.swing.velocity = clamp(state.swing.velocity + (state.swing.velocity < 0 ? -0.65 : 0.65), -1.35, 1.35);
}

/** Fixed-step world physics, independent of the rendering rate. */
export function stepCapyPlay(state: CapyPlayState, dt: number) {
  dt = clamp(dt, 0, 1 / 30); state.time += dt; state.actionTime += dt;
  const a = state.actor, b = state.ball;
  if (state.action !== 'rest' && !state.mode && state.actionTime > 4.2) state.action = 'idle';
  b.cooldown = Math.max(0, b.cooldown - dt);
  if (a.kick >= 0) { a.kick += dt; if (a.kick > 0.65) a.kick = -1; }
  if (a.y > 0 || a.vy > 0) { a.vy -= 7.5 * dt; a.y = Math.max(0, a.y + a.vy * dt); if (!a.y) a.vy = 0; }
  if (state.mode === 'ball') {
    b.vy -= 7.5 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y < b.radius) { b.y = b.radius; b.vy = Math.abs(b.vy) > 0.35 ? Math.abs(b.vy) * 0.55 : 0; }
    const friction = Math.exp(-(b.y <= b.radius + 0.01 ? 0.8 : 0.12) * dt);
    b.vx *= friction; b.vz *= friction; b.spin += Math.hypot(b.vx, b.vz) * dt / b.radius;
    if (Math.abs(b.x) > state.bounds) { b.x = clamp(b.x, -state.bounds, state.bounds); b.vx *= -0.72; }
    if (b.z < -0.85 || b.z > 1.15) { b.z = clamp(b.z, -0.85, 1.15); b.vz *= -0.72; }
    state.target = b;
  } else if (state.mode === 'bubbles') {
    for (const bubble of state.bubbles) {
      bubble.life += dt;
      if (bubble.popped >= 0) bubble.popped += dt;
      else { bubble.y += dt * 0.025; bubble.x += Math.sin(bubble.life * 1.7 + bubble.id) * dt * 0.045; }
    }
    state.bubbles = state.bubbles.filter((bubble) => bubble.life < 12 && bubble.popped < 0.4);
    state.target = state.bubbles.filter((bubble) => bubble.popped < 0).sort((l, r) => Math.hypot(l.x - a.x, l.z - a.z) - Math.hypot(r.x - a.x, r.z - a.z))[0] ?? null;
  } else if (state.mode === 'swing') {
    const s = state.swing;
    s.velocity += (-9.81 / s.length * Math.sin(s.angle) - s.velocity * 0.13) * dt;
    s.angle = clamp(s.angle + s.velocity * dt, -0.65, 0.65);
    state.target = null;
  } else state.target = null;

  const target = state.target;
  const tx = target?.x ?? 0, tz = target ? target.z - (state.mode === 'bubbles' ? 0.2 : 0) : 0;
  const dx = tx - a.x, dz = tz - a.z, gap = Math.hypot(dx, dz);
  const stop = state.mode === 'ball' ? 0.58 : state.mode === 'bubbles' ? 0.2 : 0.01;
  const moving = gap > stop && a.kick < 0 && state.mode !== 'swing' && state.mode !== 'dance';
  a.speed = moving ? Math.min(1.25, (gap - stop) * 3.4) : 0;
  if (a.speed) { a.x += dx / gap * a.speed * dt; a.z += dz / gap * a.speed * dt; a.gait += a.speed * dt * 7; }
  a.x = clamp(a.x, -state.bounds + 0.38, state.bounds - 0.38); a.z = clamp(a.z, -0.6, 1);
  const yaw = target ? Math.atan2(target.x - a.x, target.z - a.z) : -0.2;
  const difference = Math.atan2(Math.sin(yaw - a.yaw), Math.cos(yaw - a.yaw));
  a.yaw += difference * Math.min(1, dt * 8);
  if (state.mode === 'ball' && gap < 0.65 && b.y < 0.5 && b.cooldown === 0 && a.kick < 0) a.kick = 0;
  if (state.mode === 'bubbles' && target && gap < 0.45 && a.y === 0 && state.time - state.lastContact > 0.5) a.vy = 3.1;
}

/** Contacts are resolved against the rendered rig's world-space paws/feet.
 * A timer, click or expired object cannot award a successful interaction. */
export function resolveCapyContacts(state: CapyPlayState, feet: Point3[], hands: Point3[]) {
  if (state.mode === 'ball' && state.actor.kick > 0.08 && state.ball.cooldown === 0 &&
    feet.some((foot) => distance(foot, state.ball) < state.ball.radius + 0.25)) {
    const a = state.actor, b = state.ball, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
    b.vx = dx / length * 2.5; b.vz = dz / length * 2.5; b.vy = 1.9; b.cooldown = 1;
    state.contacts++; state.lastContact = state.time;
  }
  if (state.mode === 'bubbles') for (const bubble of state.bubbles) {
    if (bubble.popped < 0 && hands.some((hand) => distance(hand, bubble) < bubble.radius + 0.17)) {
      bubble.popped = 0; state.contacts++; state.lastContact = state.time;
    }
  }
}
