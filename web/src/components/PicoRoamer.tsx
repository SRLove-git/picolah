import { useEffect, useRef } from 'react';
import { createCapyRenderer, type CapyFeet, type CapyWearable } from '../lib/capy-renderer';
import { useCapybara } from '../lib/capybara';
import { AccessoryLayer, wornArtwork } from './CapyAccessoryArt';
import { blendCapyPose, capyPose, type CapyPose } from '../lib/capy-motion';
import { CAPY_EXPRESSION_ART, type CapyExpression } from '../lib/capy-face';
import { approach, PICO_GAIT, travelStep, walkingPose, type PicoPace } from '../lib/pico-locomotion';
import poster from '../assets/picolah-capybara-v2.webp';
import './pico-roamer.css';

type Activity = 'idle' | PicoPace | 'turn' | 'wave' | 'hop';
const STROLL = [
  { activity: 'walk', destination: .85 }, { activity: 'run', destination: -.85 },
  { activity: 'walk', destination: -.15 }, { activity: 'run', destination: .7 },
  { activity: 'walk', destination: -.7 }, { activity: 'walk', destination: 0 },
] as const;
const restingFeet: CapyFeet = { leftX: 0, leftY: 0, rightX: 0, rightY: 0, grounded: 0 };
const TURN_DURATION = .36;

/** A wordless, articulated mascot. Travel and planted paws share one clock. */
export function PicoRoamer() {
  const { view } = useCapybara();
  const worn = view.worn;
  // Share the server-backed wardrobe, including accessory placement order.
  const wornKey = worn.map(({ id }) => id).join(',');
  const artwork = wornArtwork(worn);
  const clothing = artwork.find(item => item.clothing);
  const stage = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const interact = useRef<() => void>(() => {});
  const syncMotion = useRef<() => void>(() => {});
  const hold = useRef(false);
  const focused = useRef(false);

  useEffect(() => {
    const area = stage.current!, button = actor.current!, surface = canvas.current!, ground = shadow.current!;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fallback = button.querySelector<HTMLImageElement>('.pc-pico-roamer-poster')!;
    const fallbackArt = button.querySelector<HTMLElement>('.pc-pico-roamer-fallback')!;
    const outfit = wornArtwork(worn);
    const outfitPoster = outfit.find(item => item.clothing)?.src;
    let renderer: ReturnType<typeof createCapyRenderer> = null;
    let wearables: CapyWearable[] = [], artworkReady = false;
    let images: Partial<Record<CapyExpression, HTMLImageElement>> = {};
    let disposed = false, visible = true, lost = false, raf = 0, previous = 0;
    let x = 0, speed = 0, limit = 0, artScale = 176 / 768, direction = -1, nextDirection = -1;
    let step = 0, clicks = 0, clock = 0, gait = 0, weight = 0;
    let activity: Activity = 'idle', pace: PicoPace = 'walk', elapsed = 0, idleFor = 1.3;
    let pose: CapyPose = capyPose('idle', 0, 0), priorPose = pose, blendAt = -1;
    let feet = restingFeet, priorFeet = feet, reactionTimer = 0;
    let face: CapyExpression = 'idle', fromFace: CapyExpression = 'idle', faceAt = -1;

    const reacting = () => activity === 'wave' || activity === 'hop';
    const still = () => media.matches || focused.current;
    const staticMode = () => still() || !renderer || lost;
    const canAnimate = () => !disposed && !lost && Boolean(renderer) && visible && !document.hidden && !still();
    function setActivity(next: Activity) {
      priorPose = pose; priorFeet = feet; blendAt = clock;
      activity = next; elapsed = 0; area.dataset.activity = next;
      const expression = next === 'wave' ? 'happy' : next === 'hop' ? 'playful' : 'idle';
      if (expression !== face) { fromFace = face; face = expression; faceAt = clock; }
    }
    function paint() {
      const moving = activity === 'walk' || activity === 'run';
      const active = reacting();
      const action = activity === 'wave' ? 'pet' : activity === 'hop' ? 'play' : 'idle';
      const time = staticMode() ? (active ? .7 : 0) : elapsed;
      let next = capyPose(action, time, staticMode() ? 0 : clock);
      let nextFeet = restingFeet;
      const walk = walkingPose(gait, staticMode() || active ? 0 : weight, pace);
      if (!active && !staticMode()) {
        next.lift += walk.lift; next.lean += walk.lean; next.head += walk.head;
        next.bag += walk.bag; next.ears += walk.ears;
        // The bag follows the chest rather than the feet, with a small delay.
        next.handLY += Math.sin(gait - .6) * 5 * weight;
        next.handRY += Math.sin(gait - .8) * 5 * weight;
        nextFeet = walk.feet;
        if (activity === 'turn') {
          const pivot = Math.sin(Math.min(1, elapsed / TURN_DURATION) * Math.PI);
          next.stretch -= .025 * pivot; next.head += .055 * pivot;
          next.bag += Math.sin(elapsed / TURN_DURATION * Math.PI * 2) * 6;
          nextFeet = { ...restingFeet, leftY: -18 * pivot, grounded: 1 };
        }
      }
      const blend = staticMode() ? 1 : Math.min(1, (clock - blendAt) / .18);
      pose = blendCapyPose(priorPose, next, blend);
      feet = Object.fromEntries(Object.keys(nextFeet).map(key => {
        const k = key as keyof CapyFeet;
        return [key, priorFeet[k] + (nextFeet[k] - priorFeet[k]) * blend];
      })) as unknown as CapyFeet;
      button.style.transform = `translate3d(${x}px, 0, 0)`;
      // Turn only after braking, with a short planted pivot instead of flipping
      // during lateral travel. Never rotate a flat image through an edge-on pose.
      const pivotScale = activity === 'turn' && !staticMode() ? 1 - .06 * Math.sin(elapsed / TURN_DURATION * Math.PI) : 1;
      surface.style.transform = `scale(${-direction * pivotScale}, 1)`;
      fallbackArt.style.transform = surface.style.transform;
      const height = Math.max(0, active ? -pose.lift : walk.flight);
      ground.style.transform = `translateX(-50%) scale(${1 - Math.min(.22, height / 230)}, ${1 - Math.min(.25, height / 180)})`;
      ground.style.opacity = String(.22 - Math.min(.1, height / 550));
      if (!lost) renderer?.draw(pose, fromFace, face, still() ? 1 : Math.min(1, (clock - faceAt) / .18), feet);
      const fallbackSrc = outfitPoster ?? images[face]?.src ?? poster;
      if (fallback.getAttribute('src') !== fallbackSrc) fallback.src = fallbackSrc;
      area.dataset.ready = String(Boolean(renderer) && !lost);
      area.dataset.gait = String(Math.round(gait * 100) / 100);
      area.dataset.speed = String(Math.round(speed * 10) / 10);
      area.dataset.phase = active ? 'reaction' : activity === 'turn' ? 'pivot' : moving ? 'stride' : 'settle';
    }
    function tick(now: number) {
      raf = 0;
      if (!canAnimate()) return;
      const dt = previous ? Math.min((now - previous) / 1000, .05) : 0;
      previous = now; clock += dt;
      const held = hold.current || focused.current;
      if (reacting()) {
        elapsed += dt;
        if (elapsed >= 4.1) { setActivity('idle'); idleFor = 1; }
      } else if (!held) {
        elapsed += dt;
        if (activity === 'idle' && elapsed >= idleFor && limit > 1) {
          pace = STROLL[step].activity;
          nextDirection = STROLL[step].destination * limit < x ? -1 : 1;
          setActivity(nextDirection === direction ? pace : 'turn');
        } else if (activity === 'turn') {
          if (elapsed >= TURN_DURATION / 2) direction = nextDirection;
          if (elapsed >= TURN_DURATION) setActivity(pace);
        } else if (activity === 'walk' || activity === 'run') {
          const next = travelStep(x, speed, STROLL[step].destination * limit, dt, artScale, pace);
          x = next.x; speed = next.speed; gait += next.phase;
          if (next.arrived) {
            step = (step + 1) % STROLL.length;
            setActivity('idle'); idleFor = step % 2 ? 1.1 : 1.7;
          }
        }
      } else speed = 0; // A pointer/finger always gets a stable hit target.
      const desiredWeight = !held && !reacting() ? Math.min(1, Math.abs(speed) / (PICO_GAIT[pace].speed * artScale * .4)) : 0;
      weight = approach(weight, desiredWeight, dt * 5);
      paint(); raf = requestAnimationFrame(tick);
    }
    function settleStillReaction() {
      if (!staticMode() || !reacting() || reactionTimer) return;
      reactionTimer = window.setTimeout(() => {
        reactionTimer = 0; setActivity('idle'); idleFor = 1; paint();
      }, 1200);
    }
    function sync() {
      cancelAnimationFrame(raf); raf = 0; previous = 0;
      if (still()) { speed = 0; weight = 0; }
      area.dataset.running = String(canAnimate());
      settleStillReaction(); paint();
      if (canAnimate()) raf = requestAnimationFrame(tick);
    }
    function resize() {
      artScale = button.offsetWidth / 768;
      limit = Math.max(0, (area.clientWidth - button.offsetWidth) / 2 - 12);
      x = Math.max(-limit, Math.min(limit, x));
      speed = 0; paint();
    }
    interact.current = () => {
      if (reacting()) return;
      speed = 0; weight = 0;
      setActivity(clicks++ % 2 ? 'hop' : 'wave');
      area.dataset.reaction = String(clicks); sync();
    };
    syncMotion.current = sync;
    function createRenderer() {
      renderer?.dispose(); renderer = artworkReady ? createCapyRenderer(surface, images, wearables) : null; sync();
    }
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; sync(); };
    const contextRestored = () => { lost = false; createRenderer(); };
    surface.addEventListener('webglcontextlost', contextLost);
    surface.addEventListener('webglcontextrestored', contextRestored);
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(area);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }); observer.observe(area);
    document.addEventListener('visibilitychange', sync); media.addEventListener('change', sync);
    resize();
    const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
    });
    void Promise.all([
      Promise.allSettled((['idle', 'happy', 'playful', 'sleepy'] as const).map(async name => [name, await loadImage(CAPY_EXPRESSION_ART[name])] as const)),
      Promise.all(outfit.map(async ({ src, layout, clothing }) => ({ image: await loadImage(src), layout, clothing }))),
    ]).then(([results, loadedWearables]) => {
      if (disposed) return;
      images = Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
      wearables = loadedWearables; artworkReady = true;
      if (!lost) createRenderer();
    }).catch(() => { /* Keep the selected outfit visible if animation art cannot load. */ });
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(reactionTimer); renderer?.dispose();
      resizeObserver.disconnect(); observer.disconnect();
      document.removeEventListener('visibilitychange', sync); media.removeEventListener('change', sync);
      surface.removeEventListener('webglcontextlost', contextLost); surface.removeEventListener('webglcontextrestored', contextRestored);
      interact.current = () => {}; syncMotion.current = () => {};
    };
  }, [wornKey]);

  return <div className="pc-pico-roamer" ref={stage} data-activity="idle" data-clothing={clothing?.id ?? 'none'} data-worn={wornKey}>
    <button className="pc-pico-roamer-touch" ref={actor} type="button" aria-label="Pico"
      onPointerEnter={event => { if (event.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) hold.current = true; }}
      onPointerLeave={() => { hold.current = false; }}
      onPointerDown={() => { hold.current = true; }}
      onPointerUp={event => { if (event.pointerType !== 'mouse') hold.current = false; }}
      onPointerCancel={() => { hold.current = false; }}
      onFocus={event => { focused.current = event.currentTarget.matches(':focus-visible'); syncMotion.current(); }}
      onBlur={() => { focused.current = false; syncMotion.current(); }}
      onKeyDown={() => { focused.current = true; syncMotion.current(); }}
      onClick={() => interact.current()}>
      <span className="pc-pico-roamer-shadow" ref={shadow} aria-hidden="true" />
      <span className="pc-pico-roamer-fallback" aria-hidden="true">
        <img className="pc-pico-roamer-poster" src={clothing?.src ?? poster} alt="" draggable={false} />
        <svg className="pc-pico-roamer-accessories" viewBox="0 0 768 804"><AccessoryLayer worn={worn} /></svg>
      </span>
      <canvas ref={canvas} width={384} height={482} aria-hidden="true" />
    </button>
  </div>;
}
