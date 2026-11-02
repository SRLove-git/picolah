import type { CapyClothingId } from '../../shared/capybara';
import strawberryDress from '../assets/capy-clothes-v2/strawberry-dress.webp';
import mintOveralls from '../assets/capy-clothes-v2/mint-overalls.webp';
import creamHoodie from '../assets/capy-clothes-v2/cream-hoodie.webp';
import duckRaincoat from '../assets/capy-clothes-v2/duck-raincoat.webp';
import starPajamas from '../assets/capy-clothes-v2/star-pajamas.webp';
import sailorShirt from '../assets/capy-clothes-v2/sailor-shirt.webp';

/** Complete dressed characters, including sleeves, paws and contact shadows.
 * Never paint the original bare arms over these fitted garments. */
export const CAPY_CLOTHING_ART: Record<CapyClothingId, string> = {
  'strawberry-dress': strawberryDress, 'mint-overalls': mintOveralls,
  'cream-hoodie': creamHoodie, 'duck-raincoat': duckRaincoat,
  'star-pajamas': starPajamas, 'sailor-shirt': sailorShirt,
};

/** Feather only the facial features. The neck, silhouette, garment and limbs
 * remain one continuous painted surface in both SVG and WebGL rendering. */
export { CAPY_CLOTHING_FACE } from './capy-face';
