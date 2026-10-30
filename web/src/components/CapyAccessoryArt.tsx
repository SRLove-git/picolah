import type { CapyAccessoryId, CapyAccessory } from '../../shared/capybara';
import airfryerArt from '../assets/capy-accessories-v2/airfryer.png';
import coffeeArt from '../assets/capy-accessories-v2/coffee.png';
import earbudsArt from '../assets/capy-accessories-v2/earbuds.png';
import flowerArt from '../assets/capy-accessories-v2/flower.png';
import headphonesArt from '../assets/capy-accessories-v2/headphones.png';
import medalArt from '../assets/capy-accessories-v2/medal.png';
import phoneArt from '../assets/capy-accessories-v2/phone.png';
import scarfArt from '../assets/capy-accessories-v2/scarf.png';
import serumArt from '../assets/capy-accessories-v2/serum.png';
import sneakerArt from '../assets/capy-accessories-v2/sneaker.png';
import speakerArt from '../assets/capy-accessories-v2/speaker.png';
import sunglassesArt from '../assets/capy-accessories-v2/sunglasses.png';
import watchArt from '../assets/capy-accessories-v2/watch.png';

/**
 * Image 2.5 accessories share a transparent 512×512 canvas. They are placed in
 * a 100×100 glyph box before the existing mascot translate/rotate/scale layout
 * is applied, so wardrobe cards and worn accessories use the exact same art.
 */

interface AccessoryLayout {
  x: number;
  y: number;
  scale: number;
  rotate?: number;
}

const BASE_LAYOUTS: Record<Exclude<CapyAccessoryId, 'phone' | 'serum' | 'airfryer' | 'speaker' | 'coffee'>, AccessoryLayout> = {
  headphones: { x: 405, y: 142, scale: 2.8 },
  earbuds: { x: 390, y: 146, scale: 3.1 },
  sunglasses: { x: 382, y: 166, scale: 3.2 },
  scarf: { x: 390, y: 382, scale: 2.9, rotate: -2 },
  medal: { x: 418, y: 422, scale: 0.95 },
  watch: { x: 248, y: 402, scale: 0.92, rotate: -22 },
  sneaker: { x: 390, y: 748, scale: 4.05 },
  flower: { x: 550, y: 88, scale: 0.95 },
};

/** Six spots on the shopping bag so any three bag charms can hang together. */
const BAG_SPOTS: AccessoryLayout[] = [
  { x: 214, y: 604, scale: 0.68, rotate: -7 },
  { x: 274, y: 648, scale: 0.68, rotate: 3 },
  { x: 344, y: 606, scale: 0.68, rotate: 8 },
  { x: 205, y: 520, scale: 0.56, rotate: -12 },
  { x: 360, y: 528, scale: 0.56, rotate: 12 },
  { x: 300, y: 555, scale: 0.6, rotate: 0 },
];

const GLYPH_IMAGES: Record<CapyAccessoryId, string> = {
  headphones: headphonesArt,
  earbuds: earbudsArt,
  phone: phoneArt,
  serum: serumArt,
  airfryer: airfryerArt,
  sneaker: sneakerArt,
  watch: watchArt,
  speaker: speakerArt,
  coffee: coffeeArt,
  scarf: scarfArt,
  sunglasses: sunglassesArt,
  medal: medalArt,
  flower: flowerArt,
};

const BAG_IDS = new Set<CapyAccessoryId>(['phone', 'serum', 'airfryer', 'speaker', 'coffee']);

/** Feet → bag → wrist → neck → head → face, so eyewear sits on top. */
const DRAW_ORDER: CapyAccessoryId[] = [
  'sneaker',
  'phone',
  'serum',
  'airfryer',
  'speaker',
  'coffee',
  'watch',
  'scarf',
  'medal',
  'headphones',
  'earbuds',
  'flower',
  'sunglasses',
];

function layoutFor(id: CapyAccessoryId, bagIndex: number): AccessoryLayout {
  if (BAG_IDS.has(id)) return BAG_SPOTS[bagIndex % BAG_SPOTS.length];
  return BASE_LAYOUTS[id as keyof typeof BASE_LAYOUTS];
}

function GlyphImage({ id }: { id: CapyAccessoryId }) {
  return (
    <image
      href={GLYPH_IMAGES[id]}
      x="0"
      y="0"
      width="100"
      height="100"
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

export function AccessoryLayer({ worn }: { worn: CapyAccessory[] }) {
  const bag = worn.filter((accessory) => BAG_IDS.has(accessory.id));
  return (
    <>
      {DRAW_ORDER.filter((id) => worn.some((accessory) => accessory.id === id)).map((id) => {
        const bagIndex = bag.findIndex((accessory) => accessory.id === id);
        const layout = layoutFor(id, Math.max(0, bagIndex));
        return (
          <g
            key={id}
            transform={`translate(${layout.x} ${layout.y}) rotate(${layout.rotate ?? 0}) scale(${layout.scale}) translate(-50 -50)`}
          >
            <GlyphImage id={id} />
          </g>
        );
      })}
    </>
  );
}

/** Standalone Image 2.5 glyph for wardrobe cards. */
export function AccessoryPreview({ id, className = '' }: { id: CapyAccessoryId; className?: string }) {
  const boost = id === 'sneaker' ? 1.3 : 1;
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <g transform={`translate(50 50) scale(${0.94 * boost}) translate(-50 -50)`}>
        <GlyphImage id={id} />
      </g>
    </svg>
  );
}
