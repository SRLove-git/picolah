import * as T from 'three';
import type { CapyAccessoryId } from '../../shared/capybara';
import { capyPose, blendCapyPose } from './capy-motion';
import type { CapyPlayState, Point3 } from './capy-play';
import { CAPY_ACTION_ART, capyArtwork, capyArtState, type CapyArtRig, type CapyArtState } from './capy-action-art';
export { CAPY_ORIGINAL_ART, CAPY_PUPPET_CLOTHES } from './capy-action-art';

export interface PuppetLayer {
  src: string; clothing?: boolean; id?: CapyAccessoryId;
  layout: { x: number; y: number; scale: number; rotate?: number; width?: number; height?: number };
}
const UNIT = 3.05 / 804;
const smooth = T.MathUtils.smoothstep;
const spot = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => Math.exp(-2 * (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
function control(x: number, y: number, rig: CapyArtRig) {
  return { x, y,
    head: 1 - smooth(y, rig.headY - 50, rig.headY + 55), chest: smooth(y, 330, 440) * (1 - smooth(y, 640, 750)),
    ears: [spot(x, y, 302, 94, 51, 55), spot(x, y, 543, 132, 54, 57)],
    muzzle: spot(x, y, 327, 268, 134, 75), bag: spot(x, y, 292, 552, 172, 160),
    hands: rig.hands.map(([cx, cy]) => spot(x, y, cx, cy, 95, 90)),
    feet: rig.feet.map(([cx, cy]) => spot(x, y, cx, cy, 82, 100)),
  };
}
type Control = ReturnType<typeof control>;

/** Reference-derived sprites on continuous meshes. Each pose has its own paw
 * anchors; visible paws and contact points share the deformation and dissolve. */
export function createCapyImagePuppet(onArtwork?: (ready: boolean) => void) {
  const root = new T.Group(), board = new T.Group(); root.add(board); root.name = 'Original artwork puppet';
  board.position.z = .3;
  const hands = [new T.Object3D(), new T.Object3D()], feet = [new T.Object3D(), new T.Object3D()];
  [...hands, ...feet].forEach(p => board.add(p));
  type Record = { mesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>; points: Control[]; rig: CapyArtRig };
  let records: Record[] = [], outgoing: Record[] = [];
  const textures = new Map<string, Promise<T.Texture>>();
  const loaded = new Set<T.Texture>();
  const loader = typeof document === 'undefined' ? null : new T.TextureLoader();
  let disposed = false, ready = false, artworkVersion = 0, outfitKey = '', retryAt = 0, motion = true;
  let art = capyArtwork([], 'idle'), previousArt = art, artAt = -1, artState: CapyArtState = 'idle';
  let wornIds: CapyAccessoryId[] = [], wornLayers: PuppetLayer[] = [];
  let pawControls = [...art.rig.hands, ...art.rig.feet].map(([x, y]) => control(x, y, art.rig));
  let previousPaws = pawControls;
  let poseTime = -1, pose = capyPose('idle', 0, 0), previous = pose, clip = '', clipAt = 0;
  let headCos = 1, headSin = 0, earCos = 1, earSin = 0, leanCos = 1, leanSin = 0;
  const handOffsets = [new T.Vector3(), new T.Vector3()], footOffsets = [new T.Vector3(), new T.Vector3()];
  const targetHands = [new T.Vector3(), new T.Vector3()], targetFeet = [new T.Vector3(), new T.Vector3()];
  const orientation = new T.Quaternion(), cameraOrientation = new T.Quaternion();
  const temp = new T.Vector3(), oldPaw = new T.Vector3();

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
  function makeLayer(layer: PuppetLayer | null, map: T.Texture, rig: CapyArtRig) {
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
        if (layer?.id === 'watch') { px += rig.hands[0][0] - 265; py += rig.hands[0][1] - 426; }
        else if (layer?.id === 'sneaker') {
          px += (rig.feet[0][0] + rig.feet[1][0]) / 2 - 406.5;
          py += (rig.feet[0][1] + rig.feet[1][1]) / 2 - 757.5;
        } else if (rig.scale < 1) py += rig.headY - 355;
      }
      positions.push((px - 400) * UNIT, (774 - py) * UNIT, 0);
      uv.push(x / cols, 1 - y / rows); points.push(control(px, py, rig));
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
    return { mesh, points, rig };
  }
  function deform(c: Control, result: T.Vector3, rig: CapyArtRig) {
    let x = c.x + (c.x - 400) * pose.breath * c.chest;
    let y = c.y - 300 * pose.breath * c.chest;
    for (let i = 0; i < 2; i++) {
      const cx = i ? 515 : 318, cy = i ? 165 : 128, s = earSin * (i ? -1 : 1), dx = x - cx, dy = y - cy;
      x += (dx * (earCos - 1) - s * dy) * c.ears[i]; y += (s * dx + dy * (earCos - 1)) * c.ears[i];
    }
    y += pose.chew * c.muzzle + pose.bag * .28 * c.bag; x += pose.chew * .22 * c.muzzle + pose.bag * c.bag;
    const dx = x - 400, dy = y - rig.headY;
    x += (dx * (headCos - 1) - headSin * dy) * c.head;
    y += (headSin * dx + dy * (headCos - 1)) * c.head;
    x = 400 + (x - 400) * (1 - pose.stretch * .5); y = 774 + (y - 774) * (1 + pose.stretch);
    const lx = x - 400, ly = y - 774;
    x = 400 + leanCos * lx - leanSin * ly; y = 774 + leanSin * lx + leanCos * ly + pose.lift;
    result.set((x - 400) * UNIT, (774 - y) * UNIT, 0);
    for (let i = 0; i < 2; i++) { result.addScaledVector(handOffsets[i], c.hands[i]); result.addScaledVector(footOffsets[i], c.feet[i]); }
    return result.multiplyScalar(rig.scale);
  }
  function remove(list: Record[]) {
    list.forEach(({ mesh }) => { board.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); });
  }
  function applyPose() {
    const fade = motion ? smooth((poseTime - artAt) / .18, 0, 1) : 1;
    for (const { mesh, points, rig } of [...outgoing, ...records]) {
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < points.length; i++) { deform(points[i], temp, rig); position.setXYZ(i, temp.x, temp.y, temp.z); }
      position.needsUpdate = true;
      mesh.material.opacity = outgoing.length ? (outgoing.some(record => record.mesh === mesh) ? 1 - fade : fade) : 1;
    }
    [...hands, ...feet].forEach((paw, i) => {
      deform(pawControls[i], paw.position, art.rig);
      if (fade < 1) { deform(previousPaws[i], oldPaw, previousArt.rig); paw.position.lerp(oldPaw, 1 - fade); }
    });
    if (fade === 1 && outgoing.length) { remove(outgoing); outgoing = []; }
    root.updateMatrixWorld(true);
  }
  async function updateArtwork() {
    const next = capyArtwork(wornIds, artState), accessories = wornLayers.filter(layer => !layer.clothing);
    const key = JSON.stringify([next.src, accessories]);
    if (key === outfitKey || Date.now() < retryAt) return;
    outfitKey = key; const version = ++artworkVersion;
    try {
      const maps = loader ? await Promise.all([next.src, ...accessories.map(a => a.src)].map(texture)) : [];
      if (disposed || version !== artworkVersion) return;
      const replacements = maps.map((map, i) => makeLayer(i ? accessories[i - 1] : null, map, next.rig));
      remove(outgoing); outgoing = records; records = replacements;
      previousArt = art; previousPaws = pawControls;
      art = next; artAt = ready ? poseTime : poseTime - 1;
      pawControls = [...art.rig.hands, ...art.rig.feet].map(([x, y]) => control(x, y, art.rig));
      replacements.forEach(({ mesh }) => board.add(mesh));
      ready = true; applyPose(); onArtwork?.(true);
      // Warm only the small action set; outfits stay lazy-loaded.
      if (loader && next.variant === 'idle') for (const src of Object.values(CAPY_ACTION_ART)) void texture(src).catch(() => {});
    } catch {
      if (!disposed && version === artworkVersion) {
        outfitKey = ''; retryAt = Date.now() + 5000;
        // A failed later pose must not blank a successfully loaded character.
        onArtwork?.(ready);
      }
    }
  }
  return {
    root, hands, feet,
    get ready() { return ready; }, get source() { return art.src; }, get variant() { return art.variant; },
    motion(enabled: boolean) { motion = enabled; if (!motion) applyPose(); },
    detail(_amount: number) { /* The image mesh is already small on every device. */ },
    faceCamera(camera: T.Camera) {
      root.updateMatrixWorld(true); root.getWorldQuaternion(orientation); camera.getWorldQuaternion(cameraOrientation);
      orientation.invert(); board.position.set(0, 0, .3).applyQuaternion(orientation);
      board.quaternion.copy(orientation).multiply(cameraOrientation);
    },
    async outfit(worn: CapyAccessoryId[], layers: PuppetLayer[] = []) {
      wornIds = [...worn]; wornLayers = layers; retryAt = 0;
      await updateArtwork();
    },
    pose(state: CapyPlayState, _swingGrip?: Point3[]) {
      const a = state.actor, t = state.time;
      artState = capyArtState(state.action, state.mode); void updateArtwork();
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
      if (art.variant !== 'shopping') next.bag = 0;
      pose = blendCapyPose(previous, next, (t - clipAt) / .18);
      headCos = Math.cos(pose.head); headSin = Math.sin(pose.head); earCos = Math.cos(pose.ears); earSin = Math.sin(pose.ears);
      leanCos = Math.cos(pose.lean); leanSin = Math.sin(pose.lean);
      targetHands.forEach(p => p.set(0, 0, 0)); targetFeet.forEach(p => p.set(0, 0, 0));
      for (let i = 0; i < 2; i++) {
        const phase = a.gait + i * Math.PI;
        targetFeet[i].set(Math.sin(phase) * .022 * a.walk, Math.max(0, Math.sin(phase)) * .065 * a.walk, 0);
      }
      if (art.variant === 'wave') {
        targetHands[1].set(Math.sin(t * 5) * .04, Math.sin(t * 5 - .6) * .035, 0);
      } else if (art.variant === 'snack') {
        targetHands.forEach(p => p.set(0, Math.sin(t * 17) * .008, 0));
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
        const px = (pawControls[i].x - 400) * UNIT * art.rig.scale, py = (774 - pawControls[i].y) * UNIT * art.rig.scale;
        targetHands[i].set(T.MathUtils.clamp(temp.x - px, -.13, .13), T.MathUtils.clamp(temp.y - py, 0, .24), T.MathUtils.clamp(temp.z, -.2, .2));
      }
      const amount = 1 - Math.exp(-18 * dt);
      for (let i = 0; i < 2; i++) { handOffsets[i].lerp(targetHands[i], amount); footOffsets[i].lerp(targetFeet[i], amount); }
      applyPose();
    },
    dispose() { disposed = true; artworkVersion++; remove(outgoing); remove(records); outgoing = []; records = []; loaded.forEach(texture => texture.dispose()); loaded.clear(); textures.clear(); },
  };
}
