import { useEffect, useRef } from 'react';
import idleAtlas from '../assets/capy-frames-v1/shopping.webp';
import walkAtlas from '../assets/capy-frames-v1/shopping-walk.webp';
import waveAtlas from '../assets/capy-frames-v1/shopping-pet.webp';
import hopAtlas from '../assets/capy-frames-v1/shopping-play.webp';
import poster from '../assets/picolah-capybara-v2.webp';
import './pico-roamer.css';

type Activity = 'idle' | 'walk' | 'run' | 'wave' | 'hop';
type Clip = 'idle' | 'walk' | 'wave' | 'hop';
// These four approved atlases share a 4 × 4 grid of 384 × 482 frames.
const SOURCES: Record<Clip, string> = { idle: idleAtlas, walk: walkAtlas, wave: waveAtlas, hop: hopAtlas };
const STROLL = [
  { activity: 'walk', destination: .85 },
  { activity: 'run', destination: -.85 },
  { activity: 'walk', destination: -.15 },
  { activity: 'run', destination: .7 },
  { activity: 'walk', destination: -.7 },
  { activity: 'walk', destination: 0 },
] as const;

/** A local, wordless mascot. Its motion never writes to the pet room or chat. */
export function PicoRoamer() {
  const stage = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const interact = useRef<() => void>(() => {});
  const hold = useRef(false);
  const focused = useRef(false);

  useEffect(() => {
    const area = stage.current!, button = actor.current!, surface = canvas.current!;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const images: Partial<Record<Clip, HTMLImageElement>> = {};
    let disposed = false, visible = true, raf = 0, previous = 0;
    let x = 0, limit = 0, direction = -1, step = 0, clicks = 0;
    let activity: Activity = 'idle', elapsed = 0, idleFor = .9;
    let drawn = '', reducedReactionTimer = 0;

    const reacting = () => activity === 'wave' || activity === 'hop';
    const canAnimate = () => !disposed && visible && !document.hidden && !media.matches;
    function position() {
      button.style.transform = `translate3d(${x}px, 0, 0)`;
      // The original three-quarter artwork faces left.
      surface.style.transform = `scaleX(${-direction})`;
    }
    function setActivity(next: Activity) {
      activity = next;
      elapsed = 0;
      area.dataset.activity = next;
    }
    function paint() {
      const clip: Clip = activity === 'run' ? 'walk' : activity;
      const image = images[clip] ?? images.idle;
      if (!image) return;
      let phase = 0;
      if (media.matches || focused.current) phase = reacting() ? .35 : 0;
      else if (reacting()) phase = Math.min(.999, elapsed / 1.8);
      else if (activity === 'idle' || hold.current) {
        phase = elapsed / 4.2 % 2;
        if (phase > 1) phase = 2 - phase;
      } else phase = elapsed / (activity === 'run' ? .42 : .8) % 1;
      const index = Math.min(15, Math.floor(phase * 16));
      const key = `${image.src}:${index}`;
      if (drawn === key) return;
      ctx!.clearRect(0, 0, 384, 482);
      ctx!.drawImage(image, index % 4 * 384, Math.floor(index / 4) * 482, 384, 482, 0, 0, 384, 482);
      drawn = key;
      surface.dataset.frame = String(index);
      surface.dataset.clip = clip;
      area.dataset.ready = 'true';
    }
    function tick(now: number) {
      raf = 0;
      if (!canAnimate()) return;
      const dt = previous ? Math.min((now - previous) / 1000, .05) : 0;
      previous = now;
      // Hold the hit target still under a mouse/finger or keyboard focus.
      if ((!hold.current && !focused.current) || reacting()) {
        elapsed += dt;
        if (reacting()) {
          if (elapsed >= 1.8) { setActivity('idle'); idleFor = .8; }
        } else if (activity === 'idle') {
          if (elapsed >= idleFor && images.walk) {
            const next = STROLL[step];
            direction = next.destination * limit < x ? -1 : 1;
            setActivity(next.activity);
          }
        } else {
          const target = STROLL[step].destination * limit;
          const distance = target - x;
          const travel = (activity === 'run' ? 92 : 32) * dt;
          if (Math.abs(distance) <= travel) {
            x = target;
            step = (step + 1) % STROLL.length;
            setActivity('idle');
            idleFor = step % 2 ? 1.1 : 1.7;
          } else x += Math.sign(distance) * travel;
        }
      }
      position();
      paint();
      raf = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(raf);
      raf = 0;
      previous = 0;
      area.dataset.running = String(canAnimate());
      // Changing the system preference during a response must still let it settle.
      if (media.matches && reacting() && !reducedReactionTimer) {
        reducedReactionTimer = window.setTimeout(() => {
          reducedReactionTimer = 0;
          setActivity('idle');
          paint();
        }, 1800);
      }
      paint();
      if (canAnimate()) raf = requestAnimationFrame(tick);
    }
    function resize() {
      limit = Math.max(0, (area.clientWidth - button.offsetWidth) / 2 - 6);
      x = Math.max(-limit, Math.min(limit, x));
      position();
    }
    interact.current = () => {
      // Let the current response finish on rapid taps, keeping its pose continuous.
      if (reacting()) return;
      setActivity(clicks++ % 2 ? 'hop' : 'wave');
      area.dataset.reaction = String(clicks);
      paint();
      if (media.matches || focused.current) {
        window.clearTimeout(reducedReactionTimer);
        reducedReactionTimer = window.setTimeout(() => {
          reducedReactionTimer = 0;
          setActivity('idle');
          paint();
        }, 1800);
      }
      sync();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(area);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(area);
    document.addEventListener('visibilitychange', sync);
    media.addEventListener('change', sync);
    resize();
    // Loading is independent: a failed sequence leaves the original mascot visible.
    for (const [name, src] of Object.entries(SOURCES)) {
      const image = new Image();
      image.onload = () => { if (!disposed) { images[name as Clip] = image; paint(); sync(); } };
      image.src = src;
    }
    sync();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(reducedReactionTimer);
      resizeObserver.disconnect();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      media.removeEventListener('change', sync);
      interact.current = () => {};
    };
  }, []);

  return <div className="pc-pico-roamer" ref={stage} data-activity="idle">
    <button className="pc-pico-roamer-touch" ref={actor} type="button" aria-label="Pico"
      onPointerEnter={event => { if (event.pointerType === 'mouse') hold.current = true; }}
      onPointerLeave={() => { hold.current = false; }}
      onPointerDown={() => { hold.current = true; }}
      onPointerUp={event => { if (event.pointerType !== 'mouse') hold.current = false; }}
      onPointerCancel={() => { hold.current = false; }}
      onFocus={event => { focused.current = event.currentTarget.matches(':focus-visible'); }}
      onBlur={() => { focused.current = false; }}
      onKeyDown={() => { focused.current = true; }}
      onClick={() => interact.current()}>
      <img className="pc-pico-roamer-poster" src={poster} alt="" draggable={false} />
      <canvas ref={canvas} width={384} height={482} aria-hidden="true" />
    </button>
  </div>;
}
