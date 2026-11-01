import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { CAPY_CLOTHING_IDS } from '../../shared/capybara';
import { createCapyModel } from './capy-three-model';
import { blowCapyBubbles, createCapyPlayState, pushCapySwing, resolveCapyContacts, setCapyGame, setCapyPlayAction, stepCapyPlay, type CapyPlayState } from './capy-play';

function rigSimulation(state: CapyPlayState, seconds: number) {
  const model = createCapyModel();
  model.outfit([]);
  const feet = [new Vector3(), new Vector3()], hands = [new Vector3(), new Vector3()];
  let highest = 0;
  for (let i = 0; i < seconds * 60; i++) {
    stepCapyPlay(state, 1 / 60);
    model.root.position.set(state.actor.x, state.actor.y, state.actor.z);
    model.root.rotation.y = state.actor.yaw; model.pose(state);
    model.feet.forEach((p, j) => p.getWorldPosition(feet[j])); model.hands.forEach((p, j) => p.getWorldPosition(hands[j]));
    resolveCapyContacts(state, feet, hands);
    highest = Math.max(highest, state.actor.y);
  }
  return { model, highest };
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
  state.contacts = 4; setCapyGame(state, 'swing');
  assert.equal(state.contacts, 0); assert.equal(state.bubbles.length, 0); assert.equal(state.target, null);
  setCapyPlayAction(state, 'rest');
  for (let i = 0; i < 1800; i++) stepCapyPlay(state, 1 / 60);
  assert.equal(state.action, 'rest'); assert.equal(state.mode, null);
  setCapyPlayAction(state, 'wake');
  for (let i = 0; i < 300; i++) stepCapyPlay(state, 1 / 60);
  assert.equal(state.action, 'idle');
});

test('all six outfits have real geometry and long sleeves belong to the moving arms', () => {
  const model = createCapyModel();
  model.outfit([]);
  let baseline = 0;
  model.root.traverseVisible((object) => { if ('isMesh' in object && object.isMesh) baseline++; });
  for (const id of CAPY_CLOTHING_IDS) {
    model.outfit([id]);
    let meshes = 0;
    model.root.traverseVisible((object) => {
      if ('isMesh' in object && object.isMesh) {
        meshes++;
        const mesh = object as import('three').Mesh;
        assert.notEqual(mesh.geometry.type, 'PlaneGeometry');
        assert.equal((mesh.material as import('three').MeshStandardMaterial).map, null);
      }
    });
    assert.ok(meshes > baseline, id);
  }
  model.outfit(['cream-hoodie']);
  for (const arm of model.arms) {
    const sleeve = arm.children.find((child) => child.type === 'Group' && child.visible && child.children.length === 2);
    assert.ok(sleeve, 'a sleeve must follow each arm, not be a front overlay');
    const before = sleeve.getWorldQuaternion(new Quaternion());
    arm.rotation.x = -1; model.root.updateMatrixWorld(true);
    assert.ok(before.angleTo(sleeve.getWorldQuaternion(new Quaternion())) > 0.9);
  }
});
