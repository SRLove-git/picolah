import type { ReactElement } from 'react';
import type { CapyAccessoryId, CapyAccessory } from '../../shared/capybara';

/**
 * Accessories are drawn in a 100×100 glyph box and placed on the 768×804
 * mascot artwork with translate/rotate/scale. Keeping the glyphs vector and
 * flat means they scale crisply from a 34px sidebar avatar to the big
 * companion page without shipping more image assets.
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

function Headphones() {
  return (
    <g>
      <path d="M11 46 C11 26 21 16 34 14" fill="none" stroke="#4b3a63" strokeWidth="6" strokeLinecap="round" />
      <path d="M89 46 C89 26 79 16 66 14" fill="none" stroke="#4b3a63" strokeWidth="6" strokeLinecap="round" />
      <circle cx="34" cy="14" r="3.6" fill="#f0c04a" />
      <circle cx="66" cy="14" r="3.6" fill="#f0c04a" />
      <rect x="0" y="34" width="22" height="38" rx="10" fill="#5b4a78" stroke="#3b2a4f" strokeWidth="2" />
      <rect x="78" y="34" width="22" height="38" rx="10" fill="#5b4a78" stroke="#3b2a4f" strokeWidth="2" />
      <rect x="5" y="42" width="9" height="22" rx="4.5" fill="#ffd1df" />
      <rect x="86" y="42" width="9" height="22" rx="4.5" fill="#ffd1df" />
      <path d="M4 40 q4 -3 8 0" fill="none" stroke="#8d7aa8" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function Earbuds() {
  return (
    <g>
      <g transform="translate(8 36) rotate(-14)">
        <rect x="0" y="0" width="18" height="17" rx="8.5" fill="#f7f3ff" stroke="#4a3f63" strokeWidth="2" />
        <rect x="6.5" y="13" width="5.5" height="16" rx="2.75" fill="#4a3f63" />
        <circle cx="9" cy="7" r="3.2" fill="#b9a7ff" />
      </g>
      <g transform="translate(74 36) rotate(14)">
        <rect x="0" y="0" width="18" height="17" rx="8.5" fill="#f7f3ff" stroke="#4a3f63" strokeWidth="2" />
        <rect x="6" y="13" width="5.5" height="16" rx="2.75" fill="#4a3f63" />
        <circle cx="9" cy="7" r="3.2" fill="#b9a7ff" />
      </g>
      <path d="M30 30 q-5 6 0 12" fill="none" stroke="#cbb8ff" strokeWidth="2" strokeLinecap="round" />
      <path d="M70 30 q5 6 0 12" fill="none" stroke="#cbb8ff" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function Sunglasses() {
  return (
    <g>
      <path d="M0 44 H9" stroke="#2f2a35" strokeWidth="4" strokeLinecap="round" />
      <path d="M91 44 H100" stroke="#2f2a35" strokeWidth="4" strokeLinecap="round" />
      <rect x="9" y="32" width="30" height="26" rx="11" fill="#2f2a35" stroke="#1b1720" strokeWidth="2" />
      <rect x="61" y="32" width="30" height="26" rx="11" fill="#2f2a35" stroke="#1b1720" strokeWidth="2" />
      <path d="M39 40 q11 -4 22 0" fill="none" stroke="#2f2a35" strokeWidth="3" />
      <path d="M14 38 q9 -3 14 5" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M66 38 q9 -3 14 5" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2.6" strokeLinecap="round" />
    </g>
  );
}

function Scarf() {
  return (
    <g>
      <path
        d="M8 34 C30 24 70 24 92 34 L92 43 C70 52 30 52 8 43 Z"
        fill="#ef6a7d"
        stroke="#c74e61"
        strokeWidth="2"
      />
      <path d="M12 39 C32 31 68 31 88 39" fill="none" stroke="#ffe1e6" strokeWidth="2.6" />
      <path d="M74 43 C71 54 73 64 80 72 L91 67 C85 58 82 49 85 44 Z" fill="#f4808f" stroke="#c74e61" strokeWidth="2" />
      <path d="M82 44 C85 54 91 62 98 67 L105 60 C98 54 93 48 92 43 Z" fill="#ef6a7d" stroke="#c74e61" strokeWidth="2" />
      <path d="M82 51 l8 5 M88 59 l8 4" stroke="#ffe1e6" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="84" cy="43" r="5" fill="#ef6a7d" stroke="#c74e61" strokeWidth="1.8" />
    </g>
  );
}

function Medal() {
  return (
    <g>
      <path d="M37 10 L50 45 L63 10 L56 8 L50 33 L44 8 Z" fill="#4f7bd9" stroke="#33538f" strokeWidth="2" />
      <circle cx="50" cy="64" r="21" fill="#f0c04a" stroke="#c9932c" strokeWidth="2.6" />
      <circle cx="50" cy="64" r="14" fill="none" stroke="#fff3c4" strokeWidth="2.2" />
      <path d="M42 64 l6 6 11 -12" fill="none" stroke="#8a6415" strokeWidth="3.6" strokeLinecap="round" />
    </g>
  );
}

function Watch() {
  return (
    <g>
      <rect x="38" y="0" width="24" height="22" rx="7" fill="#7a4a33" />
      <rect x="38" y="78" width="24" height="22" rx="7" fill="#7a4a33" />
      <circle cx="50" cy="50" r="25" fill="#f6e7c8" stroke="#c9932c" strokeWidth="5" />
      <circle cx="50" cy="50" r="17.5" fill="#fffaf0" />
      <path d="M50 38 V50 L59 56" fill="none" stroke="#5b4632" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="50" cy="50" r="2.4" fill="#5b4632" />
    </g>
  );
}

function Shoe({ x, flip }: { x: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} 0)${flip ? ' scale(-1 1) translate(-24 0)' : ''}`}>
      <path
        d="M3 50 C3 43 5 38 10 35 C13 33 16 32 19 32 C21 32 22 34 22 37 V50 Z"
        fill="#f0654f"
        stroke="#b8412f"
        strokeWidth="1.6"
      />
      <path d="M2 50 h21 v3 a3 3 0 0 1 -3 3 H5 a3 3 0 0 1 -3 -3 Z" fill="#fff8f4" stroke="#cbb8ae" strokeWidth="1.4" />
      <path d="M9 41 h8 M8 45 h10" stroke="#ffd9cf" strokeWidth="2" strokeLinecap="round" />
      <circle cx="18" cy="38" r="1.4" fill="#fff" />
    </g>
  );
}

function Sneaker() {
  return (
    <g>
      <Shoe x={12} />
      <Shoe x={62} flip />
      <path d="M44 30 q6 -6 12 0" fill="none" stroke="#ffd9cf" strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

function Flower() {
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <g>
      {petals.map((angle) => (
        <ellipse
          key={angle}
          cx="50"
          cy="27"
          rx="13"
          ry="17"
          fill="#ffd6e4"
          stroke="#e08aa5"
          strokeWidth="1.8"
          transform={`rotate(${angle} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="12" fill="#f4b942" stroke="#d99a25" strokeWidth="2" />
      <circle cx="46" cy="47" r="2" fill="#fff3c4" />
    </g>
  );
}

function CharmString() {
  return (
    <g>
      <path d="M50 4 V20" stroke="#d9ab68" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="22" r="4" fill="none" stroke="#d9ab68" strokeWidth="2.4" />
    </g>
  );
}

function PhoneCharm() {
  return (
    <g>
      <CharmString />
      <rect x="34" y="26" width="32" height="56" rx="8" fill="#2b3550" stroke="#1a2136" strokeWidth="2.2" />
      <rect x="38" y="31" width="24" height="42" rx="3" fill="#8ec0ff" />
      <path d="M42 38 h14 M42 44 h9" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M50 55 c-5 -5 -10 1 0 8 10 -7 5 -13 0 -8 Z" fill="#ffffff" />
      <circle cx="50" cy="77" r="2" fill="#8ec0ff" />
    </g>
  );
}

function SerumCharm() {
  return (
    <g>
      <CharmString />
      <rect x="30" y="20" width="40" height="16" rx="5" fill="#f6dfe8" stroke="#d98aa6" strokeWidth="2" />
      <rect x="36" y="34" width="28" height="48" rx="10" fill="#ffe9f1" stroke="#d98aa6" strokeWidth="2.2" />
      <rect x="36" y="54" width="28" height="28" rx="10" fill="#f08fb0" />
      <path d="M43 44 v14" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="3.4" strokeLinecap="round" />
      <rect x="45" y="28" width="10" height="6" rx="2" fill="#8a5a6b" />
    </g>
  );
}

function SpeakerCharm() {
  return (
    <g>
      <CharmString />
      <rect x="24" y="28" width="52" height="54" rx="14" fill="#3f6d5c" stroke="#2a4a3e" strokeWidth="2.2" />
      <circle cx="50" cy="56" r="15" fill="#8fd0b8" />
      <circle cx="50" cy="56" r="6" fill="#2a4a3e" />
      <circle cx="50" cy="37" r="3" fill="#cdeee2" />
      <rect x="43" y="24" width="14" height="5" rx="2.5" fill="#cdeee2" />
    </g>
  );
}

function AirfryerCharm() {
  return (
    <g>
      <CharmString />
      <rect x="24" y="30" width="52" height="50" rx="15" fill="#e2864c" stroke="#b5612f" strokeWidth="2.2" />
      <rect x="32" y="21" width="36" height="12" rx="6" fill="#4a3a33" />
      <path d="M36 48 h28" stroke="#ffd9b8" strokeWidth="4.4" strokeLinecap="round" />
      <circle cx="50" cy="63" r="7" fill="#ffd9b8" opacity="0.9" />
      <circle cx="50" cy="63" r="3" fill="#b5612f" />
    </g>
  );
}

function CoffeeCharm() {
  return (
    <g>
      <CharmString />
      <path d="M32 38 h36 l-4 40 a8 8 0 0 1 -8 7 H44 a8 8 0 0 1 -8 -7 Z" fill="#fff6ee" stroke="#b58a6a" strokeWidth="2.2" />
      <rect x="27" y="30" width="46" height="10" rx="5" fill="#8a5a3b" />
      <rect x="31" y="52" width="38" height="16" fill="#c98a5c" />
      <path d="M44 44 h12" stroke="#fff6ee" strokeWidth="3" strokeLinecap="round" />
      <path d="M44 18 q4 -6 0 -10" fill="none" stroke="#d9c3b3" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M55 18 q4 -6 0 -10" fill="none" stroke="#d9c3b3" strokeWidth="2.6" strokeLinecap="round" />
    </g>
  );
}

const GLYPHS: Record<CapyAccessoryId, () => ReactElement> = {
  headphones: Headphones,
  earbuds: Earbuds,
  sunglasses: Sunglasses,
  scarf: Scarf,
  medal: Medal,
  watch: Watch,
  sneaker: Sneaker,
  flower: Flower,
  phone: PhoneCharm,
  serum: SerumCharm,
  airfryer: AirfryerCharm,
  speaker: SpeakerCharm,
  coffee: CoffeeCharm,
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

export function AccessoryLayer({ worn }: { worn: CapyAccessory[] }) {
  const bag = worn.filter((accessory) => BAG_IDS.has(accessory.id));
  return (
    <>
      {DRAW_ORDER.filter((id) => worn.some((accessory) => accessory.id === id)).map((id) => {
        const bagIndex = bag.findIndex((accessory) => accessory.id === id);
        const layout = layoutFor(id, Math.max(0, bagIndex));
        const Glyph = GLYPHS[id];
        return (
          <g
            key={id}
            transform={`translate(${layout.x} ${layout.y}) rotate(${layout.rotate ?? 0}) scale(${layout.scale}) translate(-50 -50)`}
          >
            <Glyph />
          </g>
        );
      })}
    </>
  );
}

/** Standalone glyph for wardrobe cards. */
export function AccessoryPreview({ id, className = '' }: { id: CapyAccessoryId; className?: string }) {
  const Glyph = GLYPHS[id];
  const boost = id === 'sneaker' ? 1.3 : 1;
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <g transform={`translate(50 50) scale(${0.94 * boost}) translate(-50 -50)`}>
        <Glyph />
      </g>
    </svg>
  );
}
