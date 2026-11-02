import { capyArtwork } from './capy-action-art';
import type { CapyArtRig } from './capy-action-art';
import type { CapyAccessoryId } from '../../shared/capybara';
import type { CapyPlayState, Point3 } from './capy-play';
import { CAPY_ART_UNIT, manifest, frameKey, clipFrame, type Clip, type CapyFrame } from './capy-frame-data';
import { capyFace, CAPY_EXPRESSION_ART, createCapyFacePlate, type CapyExpression } from './capy-face';
export { CAPY_ART_UNIT } from './capy-frame-data';
const urls = import.meta.glob('../assets/capy-frames-v1/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
function posterFrame(rig: CapyArtRig): CapyFrame {
  const convert = ([x, y]: readonly number[]) => ({ x: (x - 400) * CAPY_ART_UNIT * rig.scale, y: (774 - y) * CAPY_ART_UNIT * rig.scale, z: 0 });
  const centers = { head: [400, 200], chest: [400, 410], bag: [285, 590], hand: rig.hands[0], feet: [406.5, 757.5] };
  return { hands: rig.hands.map(convert), feet: rig.feet.map(convert), anchors: Object.fromEntries(Object.entries(centers).map(([key, value]) => [key, { ...convert(value), angle: 0, scale: rig.scale, origin: [...value] }])) };
}
type Loaded = { bitmap: ImageBitmap; clip?: Clip; rig: CapyArtRig; source: string; variant: string; key: string };
type Entry = { controller: AbortController; loaded?: Loaded; requested: number };
/** Decode only requested clips. At most three atlases remain decoded; all close on disposal. */
export function createCapyFramePlayer(changed: (available: boolean) => void) {
  const cache = new Map<string, Entry>();
  const composite = document.createElement('canvas'); composite.width = 384; composite.height = 482;
  const paint = composite.getContext('2d')!;
  let current: Loaded | undefined, outgoing: Loaded | undefined, at = -1, desired = '', disposed = false, unavailable = false;
  let worn: CapyAccessoryId[] = [];
  let lastState: CapyPlayState;
  function trim() {
    for (const [key, entry] of cache) {
      if (cache.size <= 3) break;
      if (key === desired || key === current?.key || key === outgoing?.key) continue;
      entry.controller.abort(); entry.loaded?.bitmap.close(); cache.delete(key);
    }
  }
  async function request(key: string, source: string, art: ReturnType<typeof capyArtwork>, expression: CapyExpression, clip?: Clip) {
    const existing = cache.get(key);
    if (existing) { if (existing.loaded) select(existing.loaded); return; }
    const entry: Entry = { controller: new AbortController(), requested: Date.now() }; cache.set(key, entry); trim();
    try {
      const response = await fetch(source, { signal: entry.controller.signal });
      if (!response.ok) throw new Error('Missing clip');
      let bitmap = await createImageBitmap(await response.blob());
      if (!clip && expression !== 'idle' && art.variant !== 'sleep') {
        // A missing atlas still shows the correct face, including clothed sleep.
        let face: ImageBitmap | undefined;
        try {
          const mood = await fetch(CAPY_EXPRESSION_ART[expression], { signal: entry.controller.signal });
          if (!mood.ok) throw new Error('Missing face');
          face = await createImageBitmap(await mood.blob());
          const plate = createCapyFacePlate(bitmap, face, face, expression, false); plate.draw(0);
          const composed = await createImageBitmap(plate.canvas); bitmap.close(); bitmap = composed;
        } catch { /* The original character remains available if both assets fail. */ }
        finally { face?.close(); }
      }
      if (disposed || entry.controller.signal.aborted) { bitmap.close(); return; }
      entry.loaded = { bitmap, clip, rig: art.rig, source: art.src, variant: art.variant, key };
      if (key === desired) select(entry.loaded);
      trim();
    } catch {
      if (disposed || entry.controller.signal.aborted) return;
      // Keep the matching original pose functional if a frame sheet cannot load.
      if (clip && key === desired) { desired = `poster:${key}`; void request(desired, art.src, art, expression); }
      // Leave a failed entry briefly to avoid retrying a broken URL every frame.
      entry.requested = Date.now();
      if (!clip && key === desired) { unavailable = true; changed(false); }
    }
  }
  function select(loaded: Loaded) {
    if (loaded.key !== desired) return;
    const recovered = unavailable; unavailable = false;
    if (loaded === current) { if (recovered) changed(true); return; }
    outgoing = current; current = loaded; at = lastState?.time ?? 0; changed(true);
  }
  function frame(loaded: Loaded, state: CapyPlayState, reduced: boolean) {
    const index = loaded.clip ? clipFrame(loaded.clip, state, loaded.key, reduced) : 0;
    return { index, meta: loaded.clip?.frames[index] ?? posterFrame(loaded.rig) };
  }
  function blend(state: CapyPlayState, reduced: boolean) { return reduced ? 1 : Math.max(0, Math.min(1, (state.time - at) / .18)); }
  return {
    get ready() { return Boolean(current) && !unavailable; }, get source() { return current?.source ?? ''; }, get variant() { return current?.variant ?? ''; },
    get animation() { return current?.clip ? 'sequence' : 'poster'; },
    get loading() { return current?.key !== desired; },
    get cacheSize() { return cache.size; }, get key() { return current?.key ?? ''; },
    outfit(ids: CapyAccessoryId[]) { worn = ids; },
    update(state: CapyPlayState) {
      lastState = state; const { key, art } = frameKey(state, worn);
      const entry = cache.get(key), pendingPoster = desired === `poster:${key}`;
      if (pendingPoster && entry && Date.now() - entry.requested < 10000) return;
      if (entry && !entry.loaded && Date.now() - entry.requested > 10000) { entry.controller.abort(); cache.delete(key); }
      desired = key;
      void request(key, urls[`../assets/capy-frames-v1/${key}.webp`] ?? art.src, art, capyFace(state.action, state.mode), manifest[key]);
    },
    metadata(state: CapyPlayState, reduced: boolean) {
      if (!current) return null;
      const next = frame(current, state, reduced).meta, amount = blend(state, reduced);
      if (!outgoing || amount >= 1) { outgoing = undefined; trim(); return next; }
      const old = frame(outgoing, state, reduced).meta;
      const mix = (p: Point3, q: Point3) => ({ x: q.x + (p.x - q.x) * amount, y: q.y + (p.y - q.y) * amount, z: q.z + (p.z - q.z) * amount });
      return { ...next, hands: next.hands.map((p, i) => mix(p, old.hands[i])), feet: next.feet.map((p, i) => mix(p, old.feet[i])) };
    },
    draw(ctx: CanvasRenderingContext2D, state: CapyPlayState, scale: number, reduced: boolean) {
      if (!current) return;
      const amount = blend(state, reduced);
      paint.setTransform(1, 0, 0, 1, 0, 0); paint.clearRect(0, 0, 384, 482);
      paint.translate(200, 427.2); paint.globalCompositeOperation = 'source-over';
      const draw = (loaded: Loaded, opacity: number) => {
        paint.globalAlpha = opacity;
        if (loaded.clip) {
          const { width, height, columns } = loaded.clip, { index } = frame(loaded, state, reduced);
          paint.drawImage(loaded.bitmap, index % columns * width, Math.floor(index / columns) * height, width, height, -200, -427.2, 384, 482);
        } else paint.drawImage(loaded.bitmap, -200 * loaded.rig.scale, -387 * loaded.rig.scale, 384 * loaded.rig.scale, 402 * loaded.rig.scale);
      };
      // Sum premultiplied frames offscreen: source-over crossfades make the fur
      // translucent at their midpoint and reveal the room through the body.
      if (outgoing && amount < 1) { draw(outgoing, 1 - amount); paint.globalCompositeOperation = 'lighter'; }
      draw(current, outgoing ? amount : 1); paint.globalAlpha = 1;
      ctx.drawImage(composite, -400 * CAPY_ART_UNIT * scale, -854.4 * CAPY_ART_UNIT * scale, 768 * CAPY_ART_UNIT * scale, 964 * CAPY_ART_UNIT * scale);
    },
    dispose() { disposed = true; cache.forEach(entry => { entry.controller.abort(); entry.loaded?.bitmap.close(); }); cache.clear(); current = outgoing = undefined; },
  };
}
