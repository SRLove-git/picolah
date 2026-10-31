import { useEffect, useRef, useState } from 'react';
import type { CapyAccessory } from '../../shared/capybara';
import { blendCapyPose, capyPose, type CapyMotion } from '../lib/capy-motion';
import { createCapyRenderer } from '../lib/capy-renderer';
import { CAPY_EXPRESSION_ART, CapyExpressionArt, type CapyExpression } from './CapyExpressionArt';
import { wornArtwork } from './CapyAccessoryArt';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** No React renders per frame; keep the original artwork as an immediate fallback. */
export function CapyMotionArt({ expression, motion, worn = [] }: {
  expression: CapyExpression; motion: CapyMotion; worn?: CapyAccessory[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef({ expression, motion });
  current.current = { expression, motion };
  const sync = useRef<(() => void) | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  // Include order: bag charms use their equipped order for placement.
  const wornKey = worn.map(({ id }) => id).join(',');

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false, lost = false, visible = true, presented = false;
    let frame = 0, clock = 0, last: number | undefined, started = 0, faded = 0;
    let sequence = '', from: CapyExpression = 'idle', to: CapyExpression = 'idle';
    let pose = capyPose('idle', 0, 0), previous = pose;
    let renderer: ReturnType<typeof createCapyRenderer> = null;
    setReady(false);

    const active = () => !disposed && !lost && visible && document.visibilityState !== 'hidden' && current.current.motion.playing;
    function stop() { cancelAnimationFrame(frame); frame = 0; last = undefined; }
    function draw(now: number) {
      frame = 0;
      if (!active() || !renderer) { last = undefined; return; }
      if (last !== undefined) clock += Math.min((now - last) / 1000, 0.05);
      last = now;
      const { motion: next, expression: face } = current.current;
      const nextSequence = `${next.action}:${next.sequence}`;
      if (sequence !== nextSequence) { sequence = nextSequence; started = clock; previous = pose; }
      if (to !== face) { from = to; to = face; faded = clock; }
      pose = blendCapyPose(previous, capyPose(next.action, clock - started, clock), (clock - started) / 0.18);
      renderer.draw(pose, from, to, Math.min(1, (clock - faded) / 0.18));
      if (!presented) { presented = true; setReady(true); }
      frame = requestAnimationFrame(draw);
    }
    function resume() {
      if (!active()) { stop(); return; }
      if (renderer && !frame) frame = requestAnimationFrame(draw);
    }
    sync.current = resume;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', resume);
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; stop(); setReady(false); };
    const contextRestored = () => setGeneration((value) => value + 1);
    element.addEventListener('webglcontextlost', contextLost);
    element.addEventListener('webglcontextrestored', contextRestored);

    const artwork = wornArtwork(worn);
    void (async () => {
      const faces = await Promise.allSettled(Object.entries(CAPY_EXPRESSION_ART).map(async ([name, src]) => [name, await loadImage(src)] as const));
      // A missing wearable must leave the whole static outfit visible.
      const accessories = await Promise.all(artwork.map(async ({ src, layout }) => ({ image: await loadImage(src), layout })));
      if (disposed || lost) return;
      const images = Object.fromEntries(faces.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []));
      renderer = createCapyRenderer(element, images, accessories);
      resume();
    })().catch(() => { /* Static image and SVG outfit remain visible. */ });

    return () => {
      disposed = true; stop(); renderer?.dispose(); observer.disconnect(); sync.current = undefined;
      document.removeEventListener('visibilitychange', resume);
      element.removeEventListener('webglcontextlost', contextLost);
      element.removeEventListener('webglcontextrestored', contextRestored);
    };
  }, [wornKey, generation]);

  useEffect(() => { sync.current?.(); }, [motion.playing, motion.action, motion.sequence]);
  return <span className="pc-capy-motion" data-ready={ready && motion.playing} data-clip={motion.action}>
    <CapyExpressionArt expression={expression} />
    <canvas ref={canvas} width={768} height={965} aria-hidden="true" />
  </span>;
}
