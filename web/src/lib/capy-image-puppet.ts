import * as T from 'three';
import { CAPY_CLOTHING_IDS, type CapyAccessoryId, type CapyClothingId } from '../../shared/capybara';
import { capyPose, blendCapyPose, type CapyPose } from './capy-motion';
import type { CapyPlayState, Point3 } from './capy-play';

// These are the original approved files, not generated replacements. Literal
// URLs let Vite fingerprint the assets while keeping the motion rig testable.
export const CAPY_ORIGINAL_ART = new URL('../assets/picolah-capybara-v2.webp', import.meta.url).href;
export const CAPY_PUPPET_CLOTHES: Record<CapyClothingId, string> = {
  'strawberry-dress': new URL('../assets/capy-clothes-v2/strawberry-dress.webp', import.meta.url).href,
  'mint-overalls': new URL('../assets/capy-clothes-v2/mint-overalls.webp', import.meta.url).href,
  'cream-hoodie': new URL('../assets/capy-clothes-v2/cream-hoodie.webp', import.meta.url).href,
  'duck-raincoat': new URL('../assets/capy-clothes-v2/duck-raincoat.webp', import.meta.url).href,
  'star-pajamas': new URL('../assets/capy-clothes-v2/star-pajamas.webp', import.meta.url).href,
  'sailor-shirt': new URL('../assets/capy-clothes-v2/sailor-shirt.webp', import.meta.url).href,
};
export interface PuppetLayer {
  src: string; clothing?: boolean;
  layout: { x: number; y: number; scale: number; rotate?: number; width?: number; height?: number };
}
const UNIT = 3.05 / 804;
const smooth = T.MathUtils.smoothstep;
const spot = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => Math.exp(-2 * (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
function control(x: number, y: number) {
  return { x, y,
    head: 1 - smooth(y, 305, 410), chest: smooth(y, 330, 440) * (1 - smooth(y, 640, 750)),
    ears: [spot(x, y, 302, 94, 51, 55), spot(x, y, 543, 132, 54, 57)],
    muzzle: spot(x, y, 327, 268, 134, 75), bag: spot(x, y, 292, 552, 172, 160),
    hands: [spot(x, y, 265, 426, 100, 95), spot(x, y, 380, 447, 140, 110)],
    feet: [spot(x, y, 292, 754, 82, 100), spot(x, y, 521, 761, 85, 100)],
  };
}
type Control = ReturnType<typeof control>;

/** Original-pixel puppet on a continuous mesh. UVs never change; no face redraw,
 * image generation, lighting recolour, mirrored face, or 3D character substitute.
 * Paw contacts use the exact same deformation as the displayed image. */
export function createCapyImagePuppet(onArtwork?: (ready: boolean) => void) {
  const root = new T.Group(), board = new T.Group(); root.add(board); root.name = 'Original artwork puppet';
  board.position.z = .3;
  const hands = [new T.Object3D(), new T.Object3D()], feet = [new T.Object3D(), new T.Object3D()];
  [...hands, ...feet].forEach(p => board.add(p));
  const pawControls = [control(265, 426), control(380, 447), control(292, 754), control(521, 761)];
  const records: { mesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>; points: Control[] }[] = [];
  const textures = new Map<string, Promise<T.Texture>>();
  const loaded = new Set<T.Texture>();
  const loader = typeof document === 'undefined' ? null : new T.TextureLoader();
  let disposed = false, ready = false, artworkVersion = 0, outfitKey = '', source = CAPY_ORIGINAL_ART;
  let poseTime = -1, pose = capyPose('idle', 0, 0), previous = pose, clip = '', clipAt = 0;
  let headCos = 1, headSin = 0, earCos = 1, earSin = 0, leanCos = 1, leanSin = 0;
  const handOffsets = [new T.Vector3(), new T.Vector3()], footOffsets = [new T.Vector3(), new T.Vector3()];
  const targetHands = [new T.Vector3(), new T.Vector3()], targetFeet = [new T.Vector3(), new T.Vector3()];
  const orientation = new T.Quaternion(), cameraOrientation = new T.Quaternion();
  const temp = new T.Vector3();

  function texture(src: string) {
    if (!textures.has(src)) textures.set(src, new Promise<T.Texture>((resolve, reject) => {
      if (!loader) { resolve(new T.Texture()); return; }
      loader.load(src, value => {
        value.colorSpace = T.SRGBColorSpace; value.anisotropy = 4;
        if (disposed) value.dispose(); else loaded.add(value);
        resolve(value);
      }, undefined, reject);
    }).catch(error => { textures.delete(src); throw error; }));
    return textures.get(src)!;
  }
  function makeLayer(layer: PuppetLayer | null, map: T.Texture) {
    const cols = layer ? 12 : 48, rows = layer ? 12 : 50;
    const positions: number[] = [], uv: number[] = [], indices: number[] = [], points: Control[] = [];
    const layout = layer?.layout;
    const angle = (layout?.rotate ?? 0) * Math.PI / 180;
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) {
      let px = x / cols * 768, py = y / rows * 804;
      if (layout) {
        const dx = (x / cols - .5) * (layout.width ?? 100) * layout.scale;
        const dy = (y / rows - .5) * (layout.height ?? 100) * layout.scale;
        px = layout.x + dx * Math.cos(angle) - dy * Math.sin(angle);
        py = layout.y + dx * Math.sin(angle) + dy * Math.cos(angle);
      }
      positions.push((px - 400) * UNIT, (774 - py) * UNIT, 0);
      uv.push(x / cols, 1 - y / rows); points.push(control(px, py));
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * (cols + 1) + x;
      indices.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    geometry.boundingSphere = new T.Sphere(new T.Vector3(0, 1.5, 0), 2.5);
    const material = new T.MeshBasicMaterial({ map, transparent: true, alphaTest: .006, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    const mesh = new T.Mesh(geometry, material); mesh.name = layer ? 'Original accessory art' : 'Original capybara image';
    mesh.renderOrder = layer ? 4 : 3; mesh.position.z = layer ? .006 : 0;
    return { mesh, points };
  }
  function deform(c: Control, result: T.Vector3) {
    let x = c.x + (c.x - 400) * pose.breath * c.chest;
    let y = c.y - 300 * pose.breath * c.chest;
    for (let i = 0; i < 2; i++) {
      const cx = i ? 515 : 318, cy = i ? 165 : 128, s = earSin * (i ? -1 : 1), dx = x - cx, dy = y - cy;
      x += (dx * (earCos - 1) - s * dy) * c.ears[i]; y += (s * dx + dy * (earCos - 1)) * c.ears[i];
    }
    y += pose.chew * c.muzzle + pose.bag * .28 * c.bag; x += pose.chew * .22 * c.muzzle + pose.bag * c.bag;
    const dx = x - 400, dy = y - 355;
    x += (dx * (headCos - 1) - headSin * dy) * c.head;
    y += (headSin * dx + dy * (headCos - 1)) * c.head;
    x = 400 + (x - 400) * (1 - pose.stretch * .5); y = 774 + (y - 774) * (1 + pose.stretch);
    const lx = x - 400, ly = y - 774;
    x = 400 + leanCos * lx - leanSin * ly; y = 774 + leanSin * lx + leanCos * ly + pose.lift;
    result.set((x - 400) * UNIT, (774 - y) * UNIT, 0);
    for (let i = 0; i < 2; i++) { result.addScaledVector(handOffsets[i], c.hands[i]); result.addScaledVector(footOffsets[i], c.feet[i]); }
    return result;
  }
  function applyPose() {
    for (const { mesh, points } of records) {
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < points.length; i++) { deform(points[i], temp); position.setXYZ(i, temp.x, temp.y, temp.z); }
      position.needsUpdate = true;
    }
    [...hands, ...feet].forEach((paw, i) => deform(pawControls[i], paw.position));
    root.updateMatrixWorld(true);
  }
  return {
    root, hands, feet,
    get ready() { return ready; }, get source() { return source; },
    detail(_amount: number) { /* The image mesh is already small on every device. */ },
    faceCamera(camera: T.Camera) {
      root.updateMatrixWorld(true); root.getWorldQuaternion(orientation); camera.getWorldQuaternion(cameraOrientation);
      orientation.invert(); board.position.set(0, 0, .3).applyQuaternion(orientation);
      board.quaternion.copy(orientation).multiply(cameraOrientation);
    },
    async outfit(worn: CapyAccessoryId[], layers: PuppetLayer[] = []) {
      const clothing = worn.find(id => CAPY_CLOTHING_IDS.includes(id as CapyClothingId)) as CapyClothingId | undefined;
      const next = clothing ? CAPY_PUPPET_CLOTHES[clothing] : CAPY_ORIGINAL_ART;
      const accessories = layers.filter(layer => !layer.clothing), key = JSON.stringify([next, accessories]);
      if (key === outfitKey) return; outfitKey = key; const version = ++artworkVersion;
      // Node physics tests need no DOM/image decoder; source selection is still
      // observable and the same visible-paw control field remains active.
      if (!loader) { source = next; ready = true; return; }
      try {
        const maps = await Promise.all([next, ...accessories.map(a => a.src)].map(texture));
        if (disposed || version !== artworkVersion) return;
        const replacements = maps.map((map, i) => makeLayer(i ? accessories[i - 1] : null, map));
        for (const old of records) { board.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); }
        records.splice(0, records.length, ...replacements); replacements.forEach(({ mesh }) => board.add(mesh));
        source = next; ready = true; applyPose(); onArtwork?.(true);
      } catch { if (!disposed && version === artworkVersion) { outfitKey = ''; ready = false; onArtwork?.(false); } }
    },
    pose(state: CapyPlayState, _swingGrip?: Point3[]) {
      const a = state.actor, t = state.time;
      if (poseTime === t) { root.updateMatrixWorld(true); return; }
      const dt = poseTime < 0 ? 1 : Math.min(.05, t - poseTime); poseTime = t;
      const nextClip = `${state.action}:${state.mode ?? ''}`;
      if (clip !== nextClip) { clip = nextClip; previous = pose; clipAt = t; }
      const next = capyPose(state.mode ? 'idle' : state.action, state.actionTime, t);
      // Fixed artwork cannot turn around. A small lean and grounded foot cycle
      // communicate travel while its original face stays visible and unchanged.
      next.lean += Math.sin(a.gait) * .012 * a.walk;
      next.bag += Math.sin(a.gait - .4) * 2 * a.walk;
      next.head += T.MathUtils.clamp(a.turn * .008, -.028, .028);
      const crouch = a.anticipation >= 0 ? Math.sin(a.anticipation / .18 * Math.PI / 2) : 0;
      const landing = a.landing > 0 ? Math.sin(a.landing / .28 * Math.PI) : 0;
      next.stretch -= (crouch + landing) * .025;
      if (state.mode === 'dance') {
        next.lean += Math.sin(t * 4) * .045 * a.settled;
        next.head += Math.sin(t * 4 - .5) * .035 * a.settled;
        next.bag += Math.sin(t * 4 - .7) * 5 * a.settled;
      }
      pose = blendCapyPose(previous, next, (t - clipAt) / .18);
      headCos = Math.cos(pose.head); headSin = Math.sin(pose.head); earCos = Math.cos(pose.ears); earSin = Math.sin(pose.ears);
      leanCos = Math.cos(pose.lean); leanSin = Math.sin(pose.lean);
      targetHands.forEach(p => p.set(0, 0, 0)); targetFeet.forEach(p => p.set(0, 0, 0));
      for (let i = 0; i < 2; i++) {
        const phase = a.gait + i * Math.PI;
        targetFeet[i].set(Math.sin(phase) * .022 * a.walk, Math.max(0, Math.sin(phase)) * .065 * a.walk, 0);
      }
      root.updateMatrixWorld(true);
      if (state.mode === 'ball' && a.kick >= 0) {
        const i = state.ball.x < a.x ? 0 : 1;
        temp.set(state.ball.x, state.ball.y, state.ball.z); board.worldToLocal(temp);
        const amount = Math.sin(Math.min(1, a.kick / .55) * Math.PI);
        targetFeet[i].set(T.MathUtils.clamp(temp.x - feet[i].position.x, -.32, .32) * amount, .10 * amount, T.MathUtils.clamp(temp.z, -.35, .45) * amount);
      }
      if (state.mode === 'bubbles' && state.target) {
        temp.set(state.target.x, state.target.y, state.target.z); board.worldToLocal(temp);
        const i = temp.x < -.28 ? 0 : 1;
        const px = (pawControls[i].x - 400) * UNIT, py = (774 - pawControls[i].y) * UNIT;
        targetHands[i].set(T.MathUtils.clamp(temp.x - px, -.13, .13), T.MathUtils.clamp(temp.y - py, 0, .24), T.MathUtils.clamp(temp.z, -.2, .2));
      }
      const amount = 1 - Math.exp(-18 * dt);
      for (let i = 0; i < 2; i++) { handOffsets[i].lerp(targetHands[i], amount); footOffsets[i].lerp(targetFeet[i], amount); }
      applyPose();
    },
    dispose() { disposed = true; artworkVersion++; loaded.forEach(texture => texture.dispose()); loaded.clear(); textures.clear(); },
  };
}
