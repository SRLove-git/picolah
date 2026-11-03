import type { ProductVisual } from '../../shared/types';

export type DiscoverScene = ProductVisual | 'vacuum' | 'canister-vacuum' | 'purifier'
  | 'ironing-station' | 'fan' | 'iron' | 'toaster' | 'rice-cooker' | 'hotpot'
  | 'egg-cooker' | 'kettle' | 'blender' | 'hand-blender' | 'hand-mixer'
  | 'garment-steamer' | 'hand-steamer' | 'mop' | 'idle';

interface ArtProduct { id: string; name: string; visual: ProductVisual }

// Imported home appliances share coarse legacy visual values. Resolve their
// actual kind first so, for example, a vacuum never wears an air-fryer image.
const APPLIANCE_SCENES: ReadonlyArray<readonly [RegExp, DiscoverScene]> = [
  [/\b(?:fc9352|xb2023)|canister|无尘袋吸尘器/i, 'canister-vacuum'],
  [/vacuum|吸尘器/i, 'vacuum'],
  [/purifier|净化/i, 'purifier'],
  [/ais6010|ironing.station|一体式熨烫/i, 'ironing-station'],
  [/sth\d|handheld.steam|手持挂烫/i, 'hand-steamer'],
  [/ste\d|garment.steam|立式挂烫/i, 'garment-steamer'],
  [/dst\d|steam.iron|熨斗/i, 'iron'],
  [/tower.fan|cx7550|塔扇/i, 'fan'],
  [/toaster|hd2582|烤面包/i, 'toaster'],
  [/rice.cooker|hd3170|电饭煲/i, 'rice-cooker'],
  [/hotpot|hd3300|电火锅/i, 'hotpot'],
  [/egg.cooker|hd9137|煮蛋/i, 'egg-cooker'],
  [/kettle|hd93(?:16|95)|水壶/i, 'kettle'],
  [/hr2684|hand.blender|手持搅拌/i, 'hand-blender'],
  [/hr3705|hand.mixer|打蛋器/i, 'hand-mixer'],
  [/hr222[12]|blender|搅拌机/i, 'blender'],
  [/xv5113|\bmop\b|拖把/i, 'mop'],
];

const SCENES = new Set<string>(['headphones', 'earbuds', 'watch', 'sneaker', 'phone', 'serum', 'speaker', 'coffee', 'airfryer']);

export function discoverScene(product: ArtProduct): DiscoverScene {
  const identity = `${product.id} ${product.name}`;
  return APPLIANCE_SCENES.find(([pattern]) => pattern.test(identity))?.[1]
    ?? (SCENES.has(product.visual) ? product.visual : 'idle');
}
