import { MARKETS, type CountryCode, type Product, type ProductVisual } from './types.ts';

/**
 * The Picolah capybara grows with the shopper. Everything in this module is
 * pure and shared by the API and the browser so both sides agree on levels,
 * unlocked accessories and how much XP an action is worth.
 */

export const CAPY_MAX_LEVEL = 30;

/** Cumulative XP needed to *reach* a level (level 1 needs 0). */
export function capyXpForLevel(level: number): number {
  const normalized = Math.min(Math.max(1, Math.floor(level)), CAPY_MAX_LEVEL);
  return 10 * (normalized - 1) * (normalized + 2);
}

export function capyLevelForXp(xp: number): number {
  const safe = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = 1;
  while (level < CAPY_MAX_LEVEL && capyXpForLevel(level + 1) <= safe) level += 1;
  return level;
}

export interface CapyStage {
  id: string;
  minLevel: number;
  nameZh: string;
  nameEn: string;
  taglineZh: string;
  taglineEn: string;
  /** Relative size of the mascot artwork at this stage. */
  scale: number;
  /** Soft halo colour behind the mascot. */
  aura: string;
}

export const CAPY_STAGES: CapyStage[] = [
  {
    id: 'baby',
    minLevel: 1,
    nameZh: '水豚宝宝',
    nameEn: 'Baby Capy',
    taglineZh: '刚搬进 Picolah，最喜欢躲在购物袋里。',
    taglineEn: 'Just moved into Picolah. Loves hiding inside the shopping bag.',
    scale: 0.82,
    aura: '#ffe2c2',
  },
  {
    id: 'little',
    minLevel: 5,
    nameZh: '小水豚',
    nameEn: 'Little Capy',
    taglineZh: '会自己挑耳机了，听到好价会抖耳朵。',
    taglineEn: 'Picks its own headphones now, and twitches an ear at a good price.',
    scale: 0.9,
    aura: '#ffd6e0',
  },
  {
    id: 'teen',
    minLevel: 10,
    nameZh: '水豚少年',
    nameEn: 'Capy Teen',
    taglineZh: '开始有自己的穿搭，出门前要照三分钟镜子。',
    taglineEn: 'Has opinions about outfits and checks the mirror for three minutes.',
    scale: 0.97,
    aura: '#dbe7ff',
  },
  {
    id: 'grown',
    minLevel: 17,
    nameZh: '成年水豚',
    nameEn: 'Grown Capy',
    taglineZh: '逛遍七个市场，一眼就能看出哪家包邮。',
    taglineEn: 'Has shopped all seven markets and spots free shipping instantly.',
    scale: 1.04,
    aura: '#e6dcff',
  },
  {
    id: 'legend',
    minLevel: 24,
    nameZh: '传奇水豚',
    nameEn: 'Legend Capy',
    taglineZh: 'Picolah 的传说，购物袋里装着一整个衣橱。',
    taglineEn: 'A Picolah legend whose shopping bag holds a whole wardrobe.',
    scale: 1.1,
    aura: '#ffe9a8',
  },
];

export function capyStageForLevel(level: number): CapyStage {
  let current = CAPY_STAGES[0];
  for (const stage of CAPY_STAGES) {
    if (level >= stage.minLevel) current = stage;
  }
  return current;
}

export function capyNextStage(level: number): CapyStage | null {
  return CAPY_STAGES.find((stage) => stage.minLevel > level) || null;
}

export interface CapyProgress {
  level: number;
  stage: CapyStage;
  nextStage: CapyStage | null;
  /** XP earned inside the current level. */
  into: number;
  /** XP needed to finish the current level. */
  span: number;
  /** 0–1 with a completed level counting as 1. */
  progress: number;
  nextLevelAt: number;
  maxed: boolean;
}

export function capyProgressForXp(xp: number): CapyProgress {
  const safe = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  const level = capyLevelForXp(safe);
  const maxed = level >= CAPY_MAX_LEVEL;
  const floorAt = capyXpForLevel(level);
  const nextLevelAt = maxed ? floorAt : capyXpForLevel(level + 1);
  const span = Math.max(1, nextLevelAt - floorAt);
  const into = maxed ? span : Math.min(span, safe - floorAt);
  return {
    level,
    stage: capyStageForLevel(level),
    nextStage: capyNextStage(level),
    into,
    span,
    progress: maxed ? 1 : into / span,
    nextLevelAt,
    maxed,
  };
}

/** XP awarded for each tracked shopping action. */
export const CAPY_XP_RULES = {
  comparison: 10,
  offerClick: 15,
  watchlist: 10,
  purchase: 40,
  reelView: 1,
  reelWatch: 3,
  reelLike: 6,
  reelSave: 6,
  reelFollow: 10,
  reelShare: 4,
  reelCompare: 6,
} as const;

export type CapyXpSource = keyof typeof CAPY_XP_RULES;

export interface CapyCounts {
  comparisons: number;
  offerClicks: number;
  watchlist: number;
  purchases: number;
  reelViews: number;
  reelWatches: number;
  reelLikes: number;
  reelSaves: number;
  reelFollows: number;
  reelShares: number;
  reelCompares: number;
}

export function emptyCapyCounts(): CapyCounts {
  return {
    comparisons: 0,
    offerClicks: 0,
    watchlist: 0,
    purchases: 0,
    reelViews: 0,
    reelWatches: 0,
    reelLikes: 0,
    reelSaves: 0,
    reelFollows: 0,
    reelShares: 0,
    reelCompares: 0,
  };
}

const COUNT_TO_SOURCE: Array<[keyof CapyCounts, CapyXpSource]> = [
  ['comparisons', 'comparison'],
  ['offerClicks', 'offerClick'],
  ['watchlist', 'watchlist'],
  ['purchases', 'purchase'],
  ['reelViews', 'reelView'],
  ['reelWatches', 'reelWatch'],
  ['reelLikes', 'reelLike'],
  ['reelSaves', 'reelSave'],
  ['reelFollows', 'reelFollow'],
  ['reelShares', 'reelShare'],
  ['reelCompares', 'reelCompare'],
];

export function capyXpTotal(counts: CapyCounts): number {
  let total = 0;
  for (const [countKey, source] of COUNT_TO_SOURCE) {
    total += Math.max(0, counts[countKey] || 0) * CAPY_XP_RULES[source];
  }
  return total;
}

export interface CapyXpRow {
  source: CapyXpSource;
  count: number;
  unit: number;
  xp: number;
  labelZh: string;
  labelEn: string;
}

const XP_LABELS: Record<CapyXpSource, [string, string]> = {
  comparison: ['让 Picolah 帮你比一次价', 'Let Picolah compare a price'],
  offerClick: ['去看看某家店的报价', 'Open a store listing'],
  watchlist: ['收藏一件想买的商品', 'Add a product to the watchlist'],
  purchase: ['记录一件真正买下的商品', 'Mark a product as purchased'],
  reelView: ['刷到一个购物短视频', 'See a shopping reel'],
  reelWatch: ['把短视频看完', 'Watch a reel to the end'],
  reelLike: ['给喜欢的短视频点赞', 'Like a reel'],
  reelSave: ['收藏一条购物灵感', 'Save a reel'],
  reelFollow: ['关注一个创作者', 'Follow a creator'],
  reelShare: ['分享一条好物', 'Share a reel'],
  reelCompare: ['从短视频里发起比价', 'Compare from a reel'],
};

export function capyXpRows(counts: CapyCounts): CapyXpRow[] {
  return COUNT_TO_SOURCE.map(([countKey, source]) => {
    const count = Math.max(0, counts[countKey] || 0);
    return {
      source,
      count,
      unit: CAPY_XP_RULES[source],
      xp: count * CAPY_XP_RULES[source],
      labelZh: XP_LABELS[source][0],
      labelEn: XP_LABELS[source][1],
    };
  });
}

export type CapySlot = 'head' | 'face' | 'neck' | 'wrist' | 'feet' | 'bag';

export interface CapySlotInfo {
  id: CapySlot;
  nameZh: string;
  nameEn: string;
}

export const CAPY_SLOTS: CapySlotInfo[] = [
  { id: 'head', nameZh: '头顶', nameEn: 'Head' },
  { id: 'face', nameZh: '脸上', nameEn: 'Face' },
  { id: 'neck', nameZh: '颈间', nameEn: 'Neck' },
  { id: 'wrist', nameZh: '手腕', nameEn: 'Wrist' },
  { id: 'feet', nameZh: '脚上', nameEn: 'Feet' },
  { id: 'bag', nameZh: '购物袋', nameEn: 'Bag' },
];

export const CAPY_SLOT_LIMITS: Record<CapySlot, number> = {
  head: 1,
  face: 1,
  neck: 1,
  wrist: 1,
  feet: 1,
  bag: 3,
};

export type CapyAccessoryId =
  | 'headphones'
  | 'earbuds'
  | 'phone'
  | 'serum'
  | 'airfryer'
  | 'sneaker'
  | 'watch'
  | 'speaker'
  | 'coffee'
  | 'scarf'
  | 'sunglasses'
  | 'medal'
  | 'flower';

export interface CapyAccessory {
  id: CapyAccessoryId;
  slot: CapySlot;
  /** Buying a product with this visual unlocks the accessory. */
  visual: ProductVisual | null;
  /** Reaching this level unlocks the accessory for free. */
  unlockLevel: number | null;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  accent: string;
}

export const CAPY_ACCESSORIES: CapyAccessory[] = [
  {
    id: 'headphones',
    slot: 'head',
    visual: 'headphones',
    unlockLevel: null,
    nameZh: '降噪耳机',
    nameEn: 'Noise-cancelling headphones',
    descriptionZh: '买下头戴式耳机后，水豚会把它一直戴在头上。',
    descriptionEn: 'Buy over-ear headphones and your capy wears them everywhere.',
    accent: '#5b6ee1',
  },
  {
    id: 'earbuds',
    slot: 'head',
    visual: 'earbuds',
    unlockLevel: null,
    nameZh: '真无线耳机',
    nameEn: 'Wireless earbuds',
    descriptionZh: '轻轻塞在耳朵边，走路也有自己的 BGM。',
    descriptionEn: 'Tucked by the ears, with a personal soundtrack on every walk.',
    accent: '#7c5cff',
  },
  {
    id: 'phone',
    slot: 'bag',
    visual: 'phone',
    unlockLevel: null,
    nameZh: '新手机挂饰',
    nameEn: 'New phone charm',
    descriptionZh: '挂在购物袋上的小手机，屏幕还亮着比价页面。',
    descriptionEn: 'A tiny phone hanging from the bag, still showing a price page.',
    accent: '#3f8cff',
  },
  {
    id: 'serum',
    slot: 'bag',
    visual: 'serum',
    unlockLevel: null,
    nameZh: '精华瓶挂饰',
    nameEn: 'Serum bottle charm',
    descriptionZh: '一小瓶发光精华，挂在水豚的购物袋上。',
    descriptionEn: 'A glowing serum bottle clipped to the capy shopping bag.',
    accent: '#f08fb0',
  },
  {
    id: 'airfryer',
    slot: 'bag',
    visual: 'airfryer',
    unlockLevel: null,
    nameZh: '空气炸锅挂饰',
    nameEn: 'Air fryer charm',
    descriptionZh: '看完测评就下单的厨房小家电，变成迷你挂件。',
    descriptionEn: 'The kitchen gadget bought after one review, now a mini charm.',
    accent: '#e2864c',
  },
  {
    id: 'sneaker',
    slot: 'feet',
    visual: 'sneaker',
    unlockLevel: null,
    nameZh: '新球鞋',
    nameEn: 'Fresh sneakers',
    descriptionZh: '穿上新鞋，逛十家店都不累。',
    descriptionEn: 'New shoes make a ten-store shopping day feel easy.',
    accent: '#f0654f',
  },
  {
    id: 'watch',
    slot: 'wrist',
    visual: 'watch',
    unlockLevel: null,
    nameZh: '腕表',
    nameEn: 'Wristwatch',
    descriptionZh: '表盘会提醒水豚：闪购还有五分钟结束。',
    descriptionEn: 'The dial reminds your capy that the flash sale ends in five minutes.',
    accent: '#c9932c',
  },
  {
    id: 'speaker',
    slot: 'bag',
    visual: 'speaker',
    unlockLevel: null,
    nameZh: '蓝牙音箱挂饰',
    nameEn: 'Speaker charm',
    descriptionZh: '挂在袋子上，边走边放购物歌单。',
    descriptionEn: 'Hangs from the bag and plays the shopping playlist on the go.',
    accent: '#3f6d5c',
  },
  {
    id: 'coffee',
    slot: 'bag',
    visual: 'coffee',
    unlockLevel: null,
    nameZh: '咖啡杯挂饰',
    nameEn: 'Coffee cup charm',
    descriptionZh: '逛累了就来一口，比价也要有精神。',
    descriptionEn: 'A sip for stamina between price checks.',
    accent: '#8a5a3b',
  },
  {
    id: 'scarf',
    slot: 'neck',
    visual: null,
    unlockLevel: 3,
    nameZh: '条纹围巾',
    nameEn: 'Striped scarf',
    descriptionZh: '升到 3 级时水豚自己织的，说这样更有大人样。',
    descriptionEn: 'Knit by your capy at level 3 to look more grown up.',
    accent: '#ef6a7d',
  },
  {
    id: 'sunglasses',
    slot: 'face',
    visual: null,
    unlockLevel: 8,
    nameZh: '黑框墨镜',
    nameEn: 'Black sunglasses',
    descriptionZh: '8 级礼物：比价时看起来非常冷静。',
    descriptionEn: 'Level 8 gift: makes every price check look ice-cold.',
    accent: '#2f2a35',
  },
  {
    id: 'medal',
    slot: 'neck',
    visual: null,
    unlockLevel: 14,
    nameZh: '省钱勋章',
    nameEn: 'Savings medal',
    descriptionZh: '14 级纪念：为省下的每一块钱颁发的勋章。',
    descriptionEn: 'Level 14 token for every dollar saved.',
    accent: '#e0a72e',
  },
  {
    id: 'flower',
    slot: 'head',
    visual: null,
    unlockLevel: 22,
    nameZh: '小雏菊',
    nameEn: 'Daisy',
    descriptionZh: '22 级礼物：传说水豚路过都会多看一眼。',
    descriptionEn: 'Level 22 gift: even legend capys do a double take.',
    accent: '#f4b942',
  },
];

export function capyAccessory(id: string): CapyAccessory | null {
  return CAPY_ACCESSORIES.find((accessory) => accessory.id === id) || null;
}

export function capyAccessoryForVisual(visual: ProductVisual): CapyAccessory | null {
  return CAPY_ACCESSORIES.find((accessory) => accessory.visual === visual) || null;
}

export function capyUnlockedAccessoryIds(
  level: number,
  visuals: Iterable<ProductVisual>,
): Set<CapyAccessoryId> {
  const owned = new Set(visuals);
  const unlocked = new Set<CapyAccessoryId>();
  for (const accessory of CAPY_ACCESSORIES) {
    if (accessory.unlockLevel !== null && level >= accessory.unlockLevel) {
      unlocked.add(accessory.id);
    }
    if (accessory.visual && owned.has(accessory.visual)) {
      unlocked.add(accessory.id);
    }
  }
  return unlocked;
}

/**
 * Drops unknown, locked and duplicate accessories and enforces per-slot caps.
 * The server runs this on every write so a crafted request cannot dress the
 * capybara in things it has not earned.
 */
export function normalizeCapyOutfit(
  requested: readonly string[],
  level: number,
  visuals: Iterable<ProductVisual>,
): string[] {
  const unlocked = capyUnlockedAccessoryIds(level, visuals);
  const used: Record<CapySlot, number> = {
    head: 0,
    face: 0,
    neck: 0,
    wrist: 0,
    feet: 0,
    bag: 0,
  };
  const result: string[] = [];
  for (const raw of requested) {
    const accessory = capyAccessory(raw);
    if (!accessory || !unlocked.has(accessory.id) || result.includes(accessory.id)) continue;
    if (used[accessory.slot] >= CAPY_SLOT_LIMITS[accessory.slot]) continue;
    used[accessory.slot] += 1;
    result.push(accessory.id);
  }
  return result;
}

/** Appends a newly unlocked accessory when its slot still has room. */
export function capyAutoEquip(
  outfit: readonly string[],
  accessoryId: string,
  level: number,
  visuals: Iterable<ProductVisual>,
): string[] {
  if (outfit.includes(accessoryId)) return [...outfit];
  return normalizeCapyOutfit([...outfit, accessoryId], level, visuals);
}

export interface CapyPurchase {
  id: string;
  product: Product;
  market: CountryCode;
  price: number | null;
  currency: string;
  createdAt: string;
}

/** What the API stores for a user and sends back to the browser. */
export interface CapyPayload {
  xp: number;
  equipped: string[];
  purchases: CapyPurchase[];
  counts: CapyCounts;
  createdAt: string | null;
  daysTogether: number;
}

export function emptyCapyPayload(): CapyPayload {
  return {
    xp: 0,
    equipped: [],
    purchases: [],
    counts: emptyCapyCounts(),
    createdAt: null,
    daysTogether: 1,
  };
}

export interface CapyAccessoryView extends CapyAccessory {
  unlocked: boolean;
  equipped: boolean;
  /** Product that unlocked this accessory, if it came from a purchase. */
  unlockProduct: { id: string; name: string; brand: string; visual: ProductVisual } | null;
  unlockLabelZh: string;
  unlockLabelEn: string;
}

export interface CapyView {
  xp: number;
  level: number;
  stage: CapyStage;
  nextStage: CapyStage | null;
  into: number;
  span: number;
  progress: number;
  nextLevelAt: number;
  maxed: boolean;
  counts: CapyCounts;
  xpRows: CapyXpRow[];
  purchases: CapyPurchase[];
  accessories: CapyAccessoryView[];
  equipped: string[];
  /** Accessories worn by the mascot, resolved for rendering. */
  worn: CapyAccessory[];
  daysTogether: number;
  createdAt: string | null;
}

export function capySnapshot(payload: CapyPayload): CapyView {
  const progress = capyProgressForXp(payload.xp);
  const visuals = payload.purchases.map((purchase) => purchase.product.visual);
  const unlocked = capyUnlockedAccessoryIds(progress.level, visuals);
  const equipped = normalizeCapyOutfit(payload.equipped, progress.level, visuals);
  const purchasesByVisual = new Map<ProductVisual, CapyPurchase>();
  for (const purchase of payload.purchases) {
    if (!purchasesByVisual.has(purchase.product.visual)) {
      purchasesByVisual.set(purchase.product.visual, purchase);
    }
  }

  const accessories: CapyAccessoryView[] = CAPY_ACCESSORIES.map((accessory) => {
    const source = accessory.visual ? purchasesByVisual.get(accessory.visual) : undefined;
    return {
      ...accessory,
      unlocked: unlocked.has(accessory.id),
      equipped: equipped.includes(accessory.id),
      unlockProduct: source
        ? {
            id: source.product.id,
            name: source.product.name,
            brand: source.product.brand,
            visual: source.product.visual,
          }
        : null,
      unlockLabelZh:
        accessory.unlockLevel !== null
          ? `达到 ${accessory.unlockLevel} 级解锁`
          : source
            ? `买下 ${source.product.brand} 后解锁`
            : '购买对应商品后解锁',
      unlockLabelEn:
        accessory.unlockLevel !== null
          ? `Unlocks at level ${accessory.unlockLevel}`
          : source
            ? `Unlocked by buying ${source.product.brand}`
            : 'Unlocks when you buy a matching product',
    };
  });

  const worn = equipped
    .map((id) => capyAccessory(id))
    .filter((accessory): accessory is CapyAccessory => Boolean(accessory));

  return {
    xp: payload.xp,
    level: progress.level,
    stage: progress.stage,
    nextStage: progress.nextStage,
    into: progress.into,
    span: progress.span,
    progress: progress.progress,
    nextLevelAt: progress.nextLevelAt,
    maxed: progress.maxed,
    counts: payload.counts,
    xpRows: capyXpRows(payload.counts),
    purchases: payload.purchases,
    accessories,
    equipped,
    worn,
    daysTogether: payload.daysTogether,
    createdAt: payload.createdAt,
  };
}

export function capyMarketCurrency(market: CountryCode): string {
  return MARKETS[market]?.currency || 'SGD';
}
