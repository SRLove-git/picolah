import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameKey, clipFrame, manifest } from './capy-frame-data';
import { CAPY_CLOTHING_IDS } from '../../shared/capybara';
import { createCapyImagePuppet as createCapyModel, CAPY_ORIGINAL_ART, CAPY_PUPPET_CLOTHES } from './capy-image-puppet';
import { CAPY_ACTION_ART } from './capy-action-art';
import { blowCapyBubbles, createCapyPlayState, pushCapySwing, resolveCapyContacts, setCapyGame, setCapyPlayAction, stepCapyPlay, type CapyPlayState } from './capy-play';

function rigSimulation(state: CapyPlayState, seconds: number) {
  let highest = 0;
  for (let i = 0; i < seconds * 60; i++) {
    stepCapyPlay(state, 1 / 60);
    const { key } = frameKey(state, []), clip = manifest[key];
    assert.ok(clip, `Missing clip ${key}`);
    const meta = clip.frames[clipFrame(clip, state, key)];
    const world = (p: { x: number; y: number; z: number }) => ({ x: state.actor.x + p.x, y: state.actor.y + p.y, z: state.actor.z + p.z + .3 });
    resolveCapyContacts(state, meta.feet.map(world), meta.hands.map(world));
    highest = Math.max(highest, state.actor.y);
  }
  return { highest };
}

test('timers and expired toys never award a contact', () => {
  for (const mode of ['ball', 'bubbles'] as const) {
    const state = createCapyPlayState(); setCapyGame(state, mode);
    for (let i = 0; i < 1800; i++) { stepCapyPlay(state, 1 / 60); resolveCapyContacts(state, [], []); }
    assert.equal(state.contacts, 0);
    if (mode === 'bubbles') assert.equal(state.bubbles.length, 0);
  }
});

test('a kick needs a contacting foot and has a cooldown; a hand can pop each bubble only once', () => {
  const state = createCapyPlayState(); setCapyGame(state, 'ball');
  state.ball.cooldown = 0; state.actor.kick = 0.2;
  resolveCapyContacts(state, [{ x: 10, y: 10, z: 10 }], []); assert.equal(state.contacts, 0);
  resolveCapyContacts(state, [{ ...state.ball }], []); assert.equal(state.contacts, 1); assert.ok(state.ball.vy > 0);
  resolveCapyContacts(state, [{ ...state.ball }], []); assert.equal(state.contacts, 1);
  setCapyGame(state, 'bubbles');
  const point = { ...state.bubbles[0] };
  resolveCapyContacts(state, [], [point]); assert.equal(state.contacts, 1);
  resolveCapyContacts(state, [], [point]); assert.equal(state.contacts, 1);
});

for (const bounds of [1.1, 1.6, 2.3]) {
  test(`the rendered feet can reach a stationary ball and the hands can reach bubbles within ${bounds} world units`, () => {
    for (const sign of [-1, 1]) {
      const ball = createCapyPlayState(); ball.bounds = bounds; setCapyGame(ball, 'ball');
      Object.assign(ball.ball, { x: sign * (bounds - 0.25), y: 0.22, z: 0.65, vx: 0, vy: 0, vz: 0, cooldown: 0 });
      rigSimulation(ball, 12); assert.ok(ball.contacts > 0, `stationary ball at ${sign * (bounds - 0.25)}`);
      assert.ok(Math.abs(ball.actor.x) <= bounds - 0.38); assert.ok(Math.abs(ball.ball.x) <= bounds);
    }
    const bubbles = createCapyPlayState(); bubbles.bounds = bounds; setCapyGame(bubbles, 'bubbles');
    const { highest } = rigSimulation(bubbles, 11);
    assert.ok(bubbles.contacts >= 2, `only ${bubbles.contacts} bubbles reached`);
    assert.ok(highest > 0.4, 'pops should include a real jump');
  });
}

test('the pendulum stays finite under repeated pushes and loses energy when left alone', () => {
  const state = createCapyPlayState(); setCapyGame(state, 'swing');
  for (let i = 0; i < 1200; i++) {
    if (i % 10 === 0) pushCapySwing(state);
    stepCapyPlay(state, 1 / 60);
    assert.ok(Number.isFinite(state.swing.angle)); assert.ok(Math.abs(state.swing.angle) <= 0.65);
    assert.ok(Math.abs(state.swing.velocity) < 2);
  }
  const energy = () => 0.5 * state.swing.velocity ** 2 + 9.81 / state.swing.length * (1 - Math.cos(state.swing.angle));
  const before = energy();
  for (let i = 0; i < 3600; i++) stepCapyPlay(state, 1 / 60);
  assert.ok(energy() < before * 0.02);
});

test('switching toys discards stale contacts and a nap lasts until explicitly woken', () => {
  const state = createCapyPlayState(); setCapyGame(state, 'bubbles');
  for (let i = 0; i < 100; i++) blowCapyBubbles(state);
  assert.ok(state.bubbles.length <= 6);
  state.contacts = 4; Object.assign(state.actor, { x: 1.7, y: 0.5, vy: 2 }); setCapyGame(state, 'swing');
  assert.equal(state.contacts, 0); assert.equal(state.bubbles.length, 0); assert.equal(state.target, null);
  assert.equal(state.actor.x, 1.7); assert.equal(state.actor.y, 0.5); assert.equal(state.actor.vy, 2);
  for (let i = 0; i < 600; i++) stepCapyPlay(state, 1 / 60);
  assert.ok(Math.abs(state.actor.x) < 0.04); assert.equal(state.actor.y, 0); assert.ok(state.actor.settled > 0.99);
  state.actor.x = -1.5; setCapyGame(state, 'dance'); assert.equal(state.actor.x, -1.5);
  for (let i = 0; i < 600; i++) stepCapyPlay(state, 1 / 60);
  assert.ok(Math.abs(state.actor.x) < 0.04); assert.ok(state.actor.settled > 0.99);
  setCapyPlayAction(state, 'rest');
  for (let i = 0; i < 1800; i++) stepCapyPlay(state, 1 / 60);
  assert.equal(state.action, 'rest'); assert.equal(state.mode, null);
  setCapyPlayAction(state, 'wake');
  for (let i = 0; i < 300; i++) stepCapyPlay(state, 1 / 60);
  assert.equal(state.action, 'wake', 'physics must not independently complete a state-machine action');
});

test('bag-free poses preserve outfits and only bag charms restore the shopping image', async () => {
  const model = createCapyModel(); await model.outfit([]);
  assert.equal(model.source, CAPY_ACTION_ART.idle);
  for (const id of CAPY_CLOTHING_IDS) {
    await model.outfit([id]); assert.equal(model.source, CAPY_PUPPET_CLOTHES[id]);
  }
  await model.outfit(['phone']); assert.equal(model.source, CAPY_ORIGINAL_ART);
  await model.outfit([]); assert.equal(model.source, CAPY_ACTION_ART.idle);
  const state = createCapyPlayState();
  for (const [action, source] of [['feed', CAPY_ACTION_ART.snack], ['rest', CAPY_ACTION_ART.sleep], ['wake', CAPY_ACTION_ART.wave]] as const) {
    setCapyPlayAction(state, action); model.pose(state); assert.equal(model.source, source);
  }
  await model.outfit(['cream-hoodie']);
  setCapyGame(state, 'bubbles'); model.pose(state); assert.equal(model.source, CAPY_PUPPET_CLOTHES['cream-hoodie']);
  await model.outfit([]); assert.equal(model.source, CAPY_ACTION_ART.reach);
  model.dispose();
});

test('turns accelerate gradually, jumps anticipate and land before another jump', () => {
  const state = createCapyPlayState(); setCapyGame(state, 'ball');
  Object.assign(state.ball, { x: -2, y: 0.22, vx: 0, vy: 0, vz: 0 });
  let previousSpeed = 0, previousYaw = state.actor.yaw;
  for (let i = 0; i < 120; i++) {
    stepCapyPlay(state, 1 / 60);
    assert.ok(Math.abs(state.actor.speed - previousSpeed) < 0.09, 'speed cannot jump in one frame');
    assert.ok(Math.abs(state.actor.yaw - previousYaw) < 0.06, 'turning has an angular speed limit');
    previousSpeed = state.actor.speed; previousYaw = state.actor.yaw;
  }
  setCapyGame(state, 'bubbles'); Object.assign(state.actor, { x: 0, y: 0, z: 0, speed: 0 });
  let prepared = false, jumped = false, landed = false;
  for (let i = 0; i < 240; i++) {
    stepCapyPlay(state, 1 / 60);
    if (state.actor.anticipation >= 0) prepared = true;
    if (state.actor.y > 0) { assert.ok(prepared, 'jump must have a preparation pose'); jumped = true; }
    if (jumped && state.actor.landing > 0) { landed = true; assert.equal(state.actor.anticipation, -1); break; }
  }
  assert.ok(jumped && landed, 'jump must return to a buffered landing');
});

test('original-image paw deformations retarget once per simulation step', () => {
  const state = createCapyPlayState(), model = createCapyModel(); void model.outfit([]); model.pose(state);
  const before = model.hands[1].position.clone(); setCapyGame(state, 'bubbles');
  state.target = { x: .1, y: 2.3, z: .45 }; stepCapyPlay(state, 1 / 60); model.pose(state);
  const first = model.hands[1].position.clone();
  assert.ok(before.distanceTo(first) < .15, 'the image must not snap to a stretched reach');
  model.pose(state); assert.ok(first.distanceTo(model.hands[1].position) < 1e-7);
  for (let i = 0; i < 60; i++) { stepCapyPlay(state, 1 / 60); model.pose(state); }
  assert.ok(model.hands.some((hand, i) => hand.position.y > (i ? 1.24 : 1.32)), 'the displayed paw should reach upward');
  model.dispose();
});
