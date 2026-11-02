import type { CapyAction } from './capy-motion';
import type { CapyGame } from './capy-play';

export type CapyExpression = 'idle' | 'happy' | 'snack' | 'playful' | 'sleepy';
export const CAPY_EXPRESSION_ART: Record<CapyExpression, string> = {
  idle: new URL('../assets/picolah-capybara-v2.webp', import.meta.url).href,
  happy: new URL('../assets/capy-expressions-v3/happy.webp', import.meta.url).href,
  snack: new URL('../assets/capy-expressions-v3/snack.webp', import.meta.url).href,
  playful: new URL('../assets/capy-expressions-v3/playful.webp', import.meta.url).href,
  sleepy: new URL('../assets/capy-expressions-v3/sleepy.webp', import.meta.url).href,
};
export const CAPY_CLOTHING_FACE = { x: 370, y: 216, rx: 178, ry: 140, solid: 0.84 } as const;
export function capyFace(action: CapyAction, game: CapyGame | null): CapyExpression {
  if (game === 'dance' || game === 'bubbles') return 'playful';
  if (action === 'rest') return 'sleepy';
  if (action === 'feed') return 'snack';
  if (action === 'pet' || action === 'wake') return 'happy';
  if (action === 'play' || action === 'outfit') return 'playful';
  return 'idle';
}

/** Bake the approved facial features into the same continuous dressed/body mesh. */
export function createCapyFacePlate(base: CanvasImageSource, face: CanvasImageSource, lids: CanvasImageSource, expression: CapyExpression, seated: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 804;
  const ctx = canvas.getContext('2d')!;
  function patch(image: CanvasImageSource, eyes = false) {
    const layer = document.createElement('canvas'); layer.width = 768; layer.height = 804;
    const paint = layer.getContext('2d')!;
    paint.drawImage(image, 0, 0, 768, 804); paint.globalCompositeOperation = 'destination-in';
    const mask = document.createElement('canvas'); mask.width = 768; mask.height = 804;
    const pen = mask.getContext('2d')!;
    const zones = eyes ? [{ x: 462, y: 174, rx: 42, ry: 38, solid: .62 }, { x: 293, y: 141, rx: 30, ry: 30, solid: .62 }] : [CAPY_CLOTHING_FACE];
    for (const { x, y, rx, ry, solid } of zones) {
      pen.save(); pen.translate(x, y); pen.scale(rx, ry);
      const feather = pen.createRadialGradient(0, 0, 0, 0, 0, 1);
      feather.addColorStop(solid, '#fff'); feather.addColorStop(1, '#fff0');
      pen.fillStyle = feather; pen.fillRect(-1, -1, 2, 2); pen.restore();
    }
    paint.drawImage(mask, 0, 0); return layer;
  }
  const features = expression === 'idle' || seated ? null : patch(face);
  const eyelids = expression === 'idle' && !seated ? patch(lids, true) : null;
  return { canvas, draw(blink: number) {
    ctx.clearRect(0, 0, 768, 804); ctx.globalAlpha = 1; ctx.drawImage(base, 0, 0, 768, 804);
    if (features) ctx.drawImage(features, 0, 0);
    if (eyelids && blink > 0) { ctx.globalAlpha = blink; ctx.drawImage(eyelids, 0, 0); ctx.globalAlpha = 1; }
  } };
}
