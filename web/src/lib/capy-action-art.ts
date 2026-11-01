import { CAPY_CLOTHING_IDS, type CapyAccessoryId, type CapyClothingId } from '../../shared/capybara';
import type { CapyAction } from './capy-motion';
import type { CapyGame } from './capy-play';

/** Image edits of the approved character; never a replacement 3D model. */
export const CAPY_ORIGINAL_ART = new URL('../assets/picolah-capybara-v2.webp', import.meta.url).href;
export const CAPY_ACTION_ART = {
  idle: new URL('../assets/capy-actions-v1/idle.webp', import.meta.url).href,
  reach: new URL('../assets/capy-actions-v1/reach.webp', import.meta.url).href,
  snack: new URL('../assets/capy-actions-v1/snack.webp', import.meta.url).href,
  sleep: new URL('../assets/capy-actions-v1/sleep.webp', import.meta.url).href,
  wave: new URL('../assets/capy-actions-v1/wave.webp', import.meta.url).href,
};
export type CapyArtState = keyof typeof CAPY_ACTION_ART;
export const CAPY_PUPPET_CLOTHES: Record<CapyClothingId, string> = {
  'strawberry-dress': new URL('../assets/capy-clothes-v3/strawberry-dress.webp', import.meta.url).href,
  'mint-overalls': new URL('../assets/capy-clothes-v3/mint-overalls.webp', import.meta.url).href,
  'cream-hoodie': new URL('../assets/capy-clothes-v3/cream-hoodie.webp', import.meta.url).href,
  'duck-raincoat': new URL('../assets/capy-clothes-v3/duck-raincoat.webp', import.meta.url).href,
  'star-pajamas': new URL('../assets/capy-clothes-v3/star-pajamas.webp', import.meta.url).href,
  'sailor-shirt': new URL('../assets/capy-clothes-v3/sailor-shirt.webp', import.meta.url).href,
};
const SHOPPING_CLOTHES: Record<CapyClothingId, string> = {
  'strawberry-dress': new URL('../assets/capy-clothes-v2/strawberry-dress.webp', import.meta.url).href,
  'mint-overalls': new URL('../assets/capy-clothes-v2/mint-overalls.webp', import.meta.url).href,
  'cream-hoodie': new URL('../assets/capy-clothes-v2/cream-hoodie.webp', import.meta.url).href,
  'duck-raincoat': new URL('../assets/capy-clothes-v2/duck-raincoat.webp', import.meta.url).href,
  'star-pajamas': new URL('../assets/capy-clothes-v2/star-pajamas.webp', import.meta.url).href,
  'sailor-shirt': new URL('../assets/capy-clothes-v2/sailor-shirt.webp', import.meta.url).href,
};
export const CAPY_BAG_CHARMS = new Set<CapyAccessoryId>(['phone', 'serum', 'airfryer', 'speaker', 'coffee']);
type Pair = readonly [number, number];
export interface CapyArtRig {
  scale: number;
  hands: readonly [Pair, Pair];
  feet: readonly [Pair, Pair];
  headY: number;
}
const standing = { scale: 1, feet: [[300, 753], [530, 758]], headY: 355 } as const;
export const CAPY_ART_RIGS: Record<CapyArtState | 'dressed' | 'shopping', CapyArtRig> = {
  idle: { ...standing, hands: [[231, 497], [414, 515]] },
  reach: { ...standing, hands: [[188, 344], [399, 382]] },
  snack: { ...standing, hands: [[277, 350], [370, 362]] },
  wave: { ...standing, hands: [[231, 497], [617, 290]] },
  sleep: { scale: .84, hands: [[250, 557], [398, 571]], feet: [[235, 717], [457, 718]], headY: 400 },
  dressed: { ...standing, hands: [[270, 426], [370, 445]] },
  shopping: { ...standing, hands: [[265, 426], [380, 447]] },
};

export function capyArtState(action: CapyAction, game: CapyGame | null): CapyArtState {
  if (game === 'bubbles') return 'reach';
  if (game === 'dance') return 'wave';
  if (game) return 'idle';
  if (action === 'rest') return 'sleep';
  if (action === 'feed') return 'snack';
  if (action === 'wake' || action === 'pet' || action === 'play' || action === 'outfit') return 'wave';
  return 'idle';
}

/** Keep complete fitted outfits on; bag charms retain their actual bag support. */
export function capyArtwork(worn: readonly CapyAccessoryId[], state: CapyArtState) {
  const clothing = worn.find(id => CAPY_CLOTHING_IDS.includes(id as CapyClothingId)) as CapyClothingId | undefined;
  const shopping = worn.some(id => CAPY_BAG_CHARMS.has(id));
  const variant = shopping ? 'shopping' : clothing ? 'dressed' : state;
  const src = shopping ? (clothing ? SHOPPING_CLOTHES[clothing] : CAPY_ORIGINAL_ART)
    : clothing ? CAPY_PUPPET_CLOTHES[clothing] : CAPY_ACTION_ART[state];
  return { src, variant, rig: CAPY_ART_RIGS[variant] };
}
