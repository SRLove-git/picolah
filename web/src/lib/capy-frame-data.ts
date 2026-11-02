import rawManifest from '../assets/capy-frames-v1/manifest.json';
import { CAPY_CLOTHING_IDS, type CapyAccessoryId, type CapyClothingId } from '../../shared/capybara';
import { CAPY_ART_RIGS, capyArtwork, capyArtState, type CapyArtRig } from './capy-action-art';
import type { CapyPlayState, Point3 } from './capy-play';
export const CAPY_ART_UNIT = 3.05 / 804;
interface Anchor extends Point3 { angle: number; scale: number; origin: number[] }
export interface CapyFrame { hands: Point3[]; feet: Point3[]; anchors: Record<string, Anchor> }
export interface Clip { frames: CapyFrame[]; width: number; height: number; duration: number; columns: number; loop: boolean; pingPong: boolean }
export const manifest: Record<string, Clip> = Object.fromEntries(Object.entries(rawManifest).map(([key, clip]) => {
  const rig = CAPY_ART_RIGS[clip.rig as keyof typeof CAPY_ART_RIGS];
  const centers = { head: [400, 200], chest: [400, 410], bag: [285, 590], hand: [...rig.hands[0]], feet: [406.5, 757.5] };
  const frames = clip.frames.map(values => {
    const v = values.map(n => n / 10000), point = (i: number) => ({ x: v[i], y: v[i + 1], z: v[i + 2] });
    return { hands: [point(0), point(3)], feet: [point(6), point(9)], anchors: Object.fromEntries(Object.entries(centers).map(([name, origin], i) => {
      const n = 12 + i * 4; return [name, { x: v[n], y: v[n + 1], z: 0, angle: v[n + 2], scale: v[n + 3], origin }];
    })) };
  });
  return [key, { ...clip, frames }];
}));
export function frameKey(state: CapyPlayState, worn: CapyAccessoryId[]) {
  const art = capyArtwork(worn, capyArtState(state.action, state.mode));
  const clothing = worn.find(id => CAPY_CLOTHING_IDS.includes(id as CapyClothingId));
  const base = art.variant === 'dressed' ? `dressed-${clothing}` : art.variant === 'shopping' ? `shopping${clothing ? `-${clothing}` : ''}` : art.variant;
  const moving = base === 'idle' || art.variant === 'dressed' || art.variant === 'shopping';
  // Clothing chooses the body, never the action. Each outfit has its own
  // relaxed paws, feeding, happy wave, stretch and closed-eye sleep sequence.
  const reaction = state.mode === 'dance' ? 'play' : state.mode === 'bubbles' ? 'wake' : state.mode ? ''
    : state.action === 'outfit' ? 'play' : state.action === 'idle' ? '' : state.action;
  const dressed = art.variant === 'dressed' || art.variant === 'shopping';
  const suffix = reaction && (dressed || (base === 'wave' && ['wake', 'play'].includes(reaction))) ? `-${reaction}`
    : !moving ? '' : state.actor.kick >= 0 ? `-kick-${state.ball.x < state.actor.x ? 'left' : 'right'}` : state.actor.walk > .15 ? '-walk' : '';
  return { key: `${base}${suffix}`, base, art };
}
export function clipFrame(clip: Clip, state: CapyPlayState, key: string, reduced = false) {
  if (reduced) return Math.min(8, clip.frames.length - 1);
  let phase = key.includes('-kick-') ? Math.max(0, Math.min(.999, state.actor.kick / .65))
    : key.endsWith('-walk') ? state.actor.gait / (Math.PI * 2) % 1
    : !clip.loop && !state.mode ? Math.max(0, Math.min(.999, state.actionTime / clip.duration))
    : state.time / clip.duration % (clip.pingPong ? 2 : 1);
  if (phase > 1) phase = 2 - phase;
  return Math.min(clip.frames.length - 1, Math.floor(phase * clip.frames.length));
}
