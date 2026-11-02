// Build-time only. This module and Three.js never enter the room's runtime bundle.
import * as T from 'three';
import { createCapyImagePuppet } from '../../src/lib/capy-image-puppet';
import { createCapyPlayState } from '../../src/lib/capy-play';
import { capyArtwork, capyArtState } from '../../src/lib/capy-action-art';
import type { CapyAction } from '../../src/lib/capy-motion';
import { CAPY_CLOTHING_IDS } from '../../shared/capybara';
const UNIT = 3.05 / 804, WIDTH = 384, HEIGHT = 482;
const renderer = new T.WebGLRenderer({ canvas: document.querySelector('canvas')!, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(WIDTH, HEIGHT); renderer.setClearColor(0, 0); renderer.outputColorSpace = T.SRGBColorSpace;
const camera = new T.OrthographicCamera(-400 * UNIT, 368 * UNIT, 854.4 * UNIT, -109.6 * UNIT, .1, 10);
camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0);
const variants = [
  ...['idle', 'wave', 'snack', 'sleep', 'reach'].map(id => ({ id, worn: [] })),
  ...CAPY_CLOTHING_IDS.map(id => ({ id: `dressed-${id}`, worn: [id] })),
  { id: 'shopping', worn: ['phone'] },
  ...CAPY_CLOTHING_IDS.map(id => ({ id: `shopping-${id}`, worn: [id, 'phone'] })),
];
const round = (v: number) => Math.round(v * 10000) / 10000;
const point = (p: T.Vector3) => ({ x: round(p.x), y: round(p.y), z: round(p.z) });
Object.assign(window, { variants, async bake(id: string, movement = 'alive') {
  const variant = variants.find(v => v.id === id)!;
  const puppet = createCapyImagePuppet(), scene = new T.Scene(); scene.add(puppet.root);
  const state = createCapyPlayState();
  const action = id === 'snack' ? 'feed' : id === 'sleep' ? 'rest' : id === 'wave' ? 'pet' : 'idle';
  state.action = action; state.mode = id === 'reach' ? 'bubbles' : null;
  const reaction = ['pet', 'feed', 'rest', 'wake', 'play'].includes(movement);
  if (reaction) { state.action = movement as CapyAction; state.mode = null; }
  if (movement === 'walk' || movement.startsWith('kick')) { state.action = 'play'; state.mode = 'ball'; }
  state.time = 0; puppet.pose(state);
  await puppet.outfit(variant.worn as never[]);
  await new Promise(resolve => setTimeout(resolve, 30));
  const frames = [], count = 16, duration = movement === 'walk' ? .8 : movement.startsWith('kick') ? .65 : movement === 'rest' || id === 'sleep' ? 4.8 : reaction ? 4.2 : id === 'snack' ? 1.48 : 4.2;
  // Settle all artwork/action crossfades before recording a seamless periodic cycle.
  for (let j = 0; j < 40; j++) { state.time = 10 + j / 60; state.actionTime = 1; puppet.pose(state); }
  for (let i = 0; i < count; i++) {
    const phase = i / count * Math.PI * 2;
    state.time = 11.1 + i / count * duration;
    state.actionTime = reaction && movement !== 'rest' ? i / (count - 1) * duration : 1 + i / count * .5;
    state.actor.walk = movement === 'walk' ? 1 : 0; state.actor.gait = phase;
    if (movement.startsWith('kick')) {
      const side = movement === 'kick-left' ? -1 : 1;
      state.actor.kick = i / (count - 1) * .65;
      state.ball.x = side * .7; state.ball.y = .22; state.ball.z = .65;
    }
    // Ping-pong the idle expression cycle at runtime. Walk frames are one full stride.
    puppet.pose(state); scene.updateMatrixWorld(true); renderer.render(scene, camera);
    const source = capyArtwork(variant.worn as never[], capyArtState(state.action, state.mode));
    const centers = { head: [400, 200], chest: [400, 410], bag: [285, 590], hand: source.rig.hands[0], feet: [406.5, 757.5] };
    const anchors = Object.fromEntries(Object.entries(centers).map(([key, value]) => {
      const a = puppet.samplePoint(value[0], value[1]), b = puppet.samplePoint(value[0] + 100, value[1]);
      return [key, { ...point(a), angle: round(-Math.atan2(b.y - a.y, b.x - a.x)), scale: round(a.distanceTo(b) / (100 * UNIT)), origin: value }];
    }));
    frames.push({ png: renderer.domElement.toDataURL('image/png').split(',')[1], hands: puppet.hands.map(p => point(p.position)), feet: puppet.feet.map(p => point(p.position)), anchors });
  }
  puppet.dispose(); return { frames, width: WIDTH, height: HEIGHT, duration, loop: !movement.startsWith('kick') && (!reaction || movement === 'rest'), pingPong: movement === 'alive' || movement === 'rest' };
}});
