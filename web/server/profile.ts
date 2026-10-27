import { randomUUID } from 'node:crypto';
import type {
  Comparison,
  CountryCode,
  OfferClickEvent,
  PersonaCopy,
  PersonaKey,
  ProfileActivity,
  ProfileBudget,
  ProfileDimension,
  ProfileTrait,
  ShoppingProfile,
} from '../shared/types.ts';
import { MARKETS, PLATFORMS } from '../shared/types.ts';
import { db } from './db.ts';
import { getProduct } from './repo.ts';
import type { VideoProfile } from '../shared/reels.ts';
import { getVideoProfile, mergeVideoProfile, resetVideoProfile } from './reels.ts';
import { deleteCapybara } from './capybara.ts';

export { requestUserId } from './user-id.ts';

interface EventRow {
  id: string;
  type: string;
  market: string;
  product_id: string | null;
  category: string | null;
  brand: string | null;
  platform_id: string | null;
  price: number | null;
  currency: string | null;
  is_lowest: number | null;
  position: number | null;
  metadata: string | null;
  created_at: string;
}

interface UserRow {
  id: string;
  created_at: string;
  last_seen_at: string;
}

interface ComparisonMeta {
  query?: string;
  kind?: string;
  conversationId?: string | null;
  productName?: string | null;
  titleZh?: string;
  titleEn?: string;
  platformFilter?: string[];
  offers?: Array<{
    platformId?: string;
    price?: number;
    currency?: string;
    official?: boolean;
  }>;
  alternatives?: Array<{
    productName?: string;
    category?: string;
    brand?: string;
  }>;
}

const CATEGORY_EN: Record<string, string> = {
  耳机: 'Audio',
  音频: 'Audio',
  手机: 'Phones',
  护肤: 'Skincare',
  家电: 'Home appliances',
  穿戴: 'Wearables',
  鞋履: 'Footwear',
};

const PERSONAS: Record<PersonaKey, PersonaCopy> = {
  deal_hunter: {
    key: 'deal_hunter',
    emoji: '🔎',
    accent: '#ef4f7e',
    nameZh: '精算型买手',
    nameEn: 'The Deal Hunter',
    taglineZh: '比价是本能，低价是奖赏。',
    taglineEn: 'Comparing is instinct. The lowest price is the reward.',
    descriptionZh: '你会为一款商品打开多个平台，也愿意点开最低价。对你来说，比价本身就是购物的一部分。',
    descriptionEn: 'You open several platforms for one product and gravitate to the lowest price. Comparing is part of the purchase.',
  },
  brand_loyalist: {
    key: 'brand_loyalist',
    emoji: '💎',
    accent: '#b79bff',
    nameZh: '品牌收藏家',
    nameEn: 'The Brand Loyalist',
    taglineZh: '信任的品牌，值得反复选择。',
    taglineEn: 'A trusted brand is worth coming back to.',
    descriptionZh: '你更愿意在自己信任的品牌里做选择，品牌偏好清晰，重复购买的倾向也很明显。',
    descriptionEn: 'You prefer brands you already trust. Your brand preference is clear and repeat purchases are common.',
  },
  explorer: {
    key: 'explorer',
    emoji: '🧭',
    accent: '#57c9a8',
    nameZh: '探索型发现者',
    nameEn: 'The Explorer',
    taglineZh: '不设清单，逛到哪算哪。',
    taglineEn: 'No fixed list. You follow the interesting find.',
    descriptionZh: '你逛的品类很分散，喜欢发现新东西，不把自己锁在固定的购物清单里。',
    descriptionEn: 'You browse across many categories and enjoy discovering new things rather than sticking to a fixed list.',
  },
  platform_native: {
    key: 'platform_native',
    emoji: '🛍️',
    accent: '#f2b53c',
    nameZh: '平台常驻客',
    nameEn: 'The Platform Native',
    taglineZh: '认准一个平台，路径越短越好。',
    taglineEn: 'One platform, the shortest path.',
    descriptionZh: '你习惯在固定平台上完成搜索和购买，路径短、决策快，很少在不同平台之间来回切换。',
    descriptionEn: 'You search and buy on a familiar platform. Short paths and quick decisions beat hopping between stores.',
  },
  balanced: {
    key: 'balanced',
    emoji: '⚖️',
    accent: '#5b9cf5',
    nameZh: '理性均衡派',
    nameEn: 'The Balanced Buyer',
    taglineZh: '价格、品牌、品类，都看一点。',
    taglineEn: 'A little price, a little brand, a little curiosity.',
    descriptionZh: '价格、品牌和品类你都会看一点，属于稳中求省的均衡型买家。',
    descriptionEn: 'You weigh price, brand and category together — a balanced buyer who looks for a sensible deal.',
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function percent(value: number): number {
  return Math.round(value * 100);
}

function parseMeta(value: string | null): ComparisonMeta {
  if (!value) return {};
  try {
    return JSON.parse(value) as ComparisonMeta;
  } catch {
    return {};
  }
}

function addDimension(
  bucket: Map<string, { labelZh: string; labelEn: string; count: number }>,
  id: string,
  labelZh: string,
  labelEn: string,
): void {
  if (!id) return;
  const current = bucket.get(id);
  if (current) current.count += 1;
  else bucket.set(id, { labelZh, labelEn, count: 1 });
}

function dimensions(
  bucket: Map<string, { labelZh: string; labelEn: string; count: number }>,
): ProfileDimension[] {
  const total = [...bucket.values()].reduce((sum, item) => sum + item.count, 0);
  return [...bucket.entries()]
    .map(([id, item]) => ({
      id,
      labelZh: item.labelZh,
      labelEn: item.labelEn,
      count: item.count,
      share: total ? Number((item.count / total).toFixed(3)) : 0,
    }))
    .sort((left, right) => right.count - left.count || left.labelZh.localeCompare(right.labelZh));
}

function marketLabel(id: string): { labelZh: string; labelEn: string } {
  const market = MARKETS[id as CountryCode];
  return market ? { labelZh: market.nameZh, labelEn: market.nameEn } : { labelZh: id, labelEn: id };
}

function platformLabel(id: string): { labelZh: string; labelEn: string } {
  const platform = PLATFORMS[id];
  return platform ? { labelZh: platform.name, labelEn: platform.name } : { labelZh: id, labelEn: id };
}

function categoryLabel(value: string): { labelZh: string; labelEn: string } {
  return { labelZh: value, labelEn: CATEGORY_EN[value] || value };
}

function emptyProfile(userId: string, video: VideoProfile, user?: UserRow | null): ShoppingProfile {
  const stamp = nowIso();
  return {
    hasData: video.hasData,
    video,
    user: {
      anonymousId: userId,
      firstSeen: user?.created_at || stamp,
      lastSeen: user?.last_seen_at || stamp,
      activeDays: 0,
    },
    totals: { comparisons: 0, clicks: 0, offersSeen: 0, conversations: 0 },
    persona: null,
    traits: [],
    markets: [],
    platforms: [],
    categories: [],
    brands: [],
    budget: null,
    recent: [],
  };
}

export async function ensureUser(userId: string): Promise<void> {
  const stamp = nowIso();
  await db.run(
    `INSERT INTO app_users (id, created_at, last_seen_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    [userId, stamp, stamp],
  );
}

/**
 * Move what the browser learned before sign-in onto the account. The client
 * sends its anonymous id on /api/auth/login and /api/auth/register, so a user
 * who compares first and signs up later keeps the persona instead of starting
 * from zero. The anonymous app_users row is removed afterwards.
 */
export async function mergeAnonymousProfile(anonymousId: string, accountId: string): Promise<number> {
  const anonymous = String(anonymousId || '').trim();
  const account = String(accountId || '').trim();
  if (
    anonymous === account ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(anonymous) ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(account)
  ) {
    return 0;
  }
  await ensureUser(account);
  const exists = await db.get('SELECT 1 FROM app_users WHERE id = ?', [anonymous]);
  if (!exists) return 0;
  const result = await db.run('UPDATE user_events SET user_id = ? WHERE user_id = ?', [account, anonymous]);
  const videoEvents = await mergeVideoProfile(anonymous, account);
  await db.run('DELETE FROM app_users WHERE id = ?', [anonymous]);
  return Number(result.changes) + videoEvents;
}

async function insertEvent(input: {
  userId: string;
  type: 'comparison' | 'offer_click';
  market: CountryCode;
  productId?: string | null;
  category?: string | null;
  brand?: string | null;
  platformId?: string | null;
  price?: number | null;
  currency?: string | null;
  isLowest?: boolean | null;
  position?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.run(
    `INSERT INTO user_events
      (id, user_id, type, market, product_id, category, brand, platform_id, price,
       currency, is_lowest, position, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    randomUUID(),
    input.userId,
    input.type,
    input.market,
    input.productId ?? null,
    input.category ?? null,
    input.brand ?? null,
    input.platformId ?? null,
    input.price ?? null,
    input.currency ?? null,
    input.isLowest === undefined || input.isLowest === null ? null : input.isLowest ? 1 : 0,
    input.position ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    nowIso(),
    ],
  );
}

/**
 * Store a meaningful comparison. Chit-chat / empty suggestion screens are not
 * recorded: they say nothing about a shopping habit.
 */
export async function recordComparisonEvent(
  userId: string,
  comparison: Comparison,
  conversationId?: string | null,
): Promise<void> {
  const product = comparison.product;
  if (!product && comparison.kind !== 'recommendation') return;
  await ensureUser(userId);

  const alternatives = product
    ? []
    : comparison.alternatives.slice(0, 4).map((item) => ({
        productName: item.product.name,
        category: item.product.category,
        brand: item.product.brand,
      }));
  const offers = comparison.offers.slice(0, 20).map((offer) => ({
    platformId: offer.platformId,
    price: offer.finalPrice,
    currency: offer.currency,
    official: offer.isOfficial,
  }));
  const titleZh = product
    ? product.name
    : `${alternatives[0]?.productName || '推荐商品'}${alternatives.length > 1 ? ` 等 ${alternatives.length} 款` : ''}`;
  const titleEn = titleZh;

  await insertEvent({
    userId,
    type: 'comparison',
    market: comparison.market,
    productId: product?.id ?? null,
    category: product?.category ?? null,
    brand: product?.brand ?? null,
    metadata: {
      query: comparison.query.slice(0, 240),
      kind: comparison.kind,
      conversationId: conversationId || null,
      productName: product?.name ?? null,
      titleZh,
      titleEn,
      platformFilter: comparison.platformFilter ?? [],
      offers,
      alternatives,
    },
  });
}

export async function recordOfferClick(userId: string, event: OfferClickEvent): Promise<void> {
  const product = event.productId ? await getProduct(event.productId) : null;
  const platform = PLATFORMS[event.platformId];
  await ensureUser(userId);
  await insertEvent({
    userId,
    type: 'offer_click',
    market: event.market,
    productId: product?.id ?? event.productId ?? null,
    category: event.category || product?.category || null,
    brand: event.brand || product?.brand || null,
    platformId: event.platformId,
    price: event.price,
    currency: product ? MARKETS[event.market].currency : null,
    isLowest: event.isLowest,
    position: event.position,
    metadata: {
      productName: product?.name || null,
      platformName: platform?.name || event.platformId,
    },
  });
}

export async function getShoppingProfile(userId: string): Promise<ShoppingProfile> {
  const video = await getVideoProfile(userId);
  const user = await db.get<UserRow>('SELECT id, created_at, last_seen_at FROM app_users WHERE id = ?', [userId]);
  const events = await db.all<EventRow>(
    `SELECT id, type, market, product_id, category, brand, platform_id, price,
            currency, is_lowest, position, metadata, created_at
       FROM user_events
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [userId],
  );

  if (!events.length) return emptyProfile(userId, video, user);

  const markets = new Map<string, { labelZh: string; labelEn: string; count: number }>();
  const platforms = new Map<string, { labelZh: string; labelEn: string; count: number }>();
  const categories = new Map<string, { labelZh: string; labelEn: string; count: number }>();
  const brands = new Map<string, { labelZh: string; labelEn: string; count: number }>();
  const conversations = new Set<string>();
  const prices: Array<{ market: string; price: number }> = [];
  let comparisons = 0;
  let clicks = 0;
  let offersSeen = 0;
  let lowestClicks = 0;

  for (const event of events) {
    const market = event.market as CountryCode;
    const marketNames = marketLabel(event.market);
    addDimension(markets, event.market, marketNames.labelZh, marketNames.labelEn);

    if (event.type === 'offer_click') {
      clicks += 1;
      if (event.is_lowest === 1) lowestClicks += 1;
      if (event.platform_id) {
        const names = platformLabel(event.platform_id);
        addDimension(platforms, event.platform_id, names.labelZh, names.labelEn);
      }
      if (event.category) {
        const names = categoryLabel(event.category);
        addDimension(categories, event.category, names.labelZh, names.labelEn);
      }
      if (event.brand) addDimension(brands, event.brand, event.brand, event.brand);
      if (event.price && event.price > 0) prices.push({ market: event.market, price: event.price });
      continue;
    }

    comparisons += 1;
    const meta = parseMeta(event.metadata);
    if (meta.conversationId) conversations.add(meta.conversationId);
    for (const offer of meta.offers || []) {
      if (!offer.platformId) continue;
      offersSeen += 1;
      const names = platformLabel(offer.platformId);
      addDimension(platforms, offer.platformId, names.labelZh, names.labelEn);
      if (offer.price && offer.price > 0) prices.push({ market: event.market, price: offer.price });
    }
    if (event.category) {
      const names = categoryLabel(event.category);
      addDimension(categories, event.category, names.labelZh, names.labelEn);
    }
    if (event.brand) addDimension(brands, event.brand, event.brand, event.brand);
    for (const alternative of meta.alternatives || []) {
      if (alternative.category) {
        const names = categoryLabel(alternative.category);
        addDimension(categories, alternative.category, names.labelZh, names.labelEn);
      }
      if (alternative.brand) {
        addDimension(brands, alternative.brand, alternative.brand, alternative.brand);
      }
    }
  }

  const marketDimensions = dimensions(markets);
  const platformDimensions = dimensions(platforms);
  const categoryDimensions = dimensions(categories);
  const brandDimensions = dimensions(brands);

  const topMarket = marketDimensions[0]?.id as CountryCode | undefined;
  const budgetPrices = topMarket
    ? prices.filter((entry) => entry.market === topMarket).map((entry) => entry.price)
    : prices.map((entry) => entry.price);
  const budget = budgetPrices.length ? buildBudget(budgetPrices, topMarket) : null;

  const avgOffers = comparisons ? offersSeen / comparisons : 0;
  const lowestShare = clicks ? lowestClicks / clicks : 0;
  const actionRate = clicks / Math.max(1, comparisons);
  const topBrand = brandDimensions[0];
  const topCategory = categoryDimensions[0];
  const topPlatform = platformDimensions[0];
  const confidence = Math.min(1, events.length / 4);

  const priceScore = clamp(20 + Math.min(avgOffers, 6) / 6 * 45 + lowestShare * 35);
  const brandScore = clamp((topBrand?.share || 0) * 100 * confidence);
  const explorationScore = clamp(Math.min(1, categoryDimensions.length / 5) * 100);
  const platformScore = clamp((topPlatform?.share || 0) * 100 * confidence);
  const actionScore = clamp(Math.min(1, actionRate / 0.5) * 100);

  const traits: ProfileTrait[] = [
    {
      key: 'price_sensitivity',
      score: priceScore,
      labelZh: '价格敏感度',
      labelEn: 'Price sensitivity',
      evidenceZh: `平均每次比价查看 ${avgOffers.toFixed(1)} 条报价，${percent(lowestShare)}% 的点击落在最低价。`,
      evidenceEn: `You view ${avgOffers.toFixed(1)} offers per comparison; ${percent(lowestShare)}% of your clicks were on the lowest price.`,
    },
    {
      key: 'brand_loyalty',
      score: brandScore,
      labelZh: '品牌偏好',
      labelEn: 'Brand loyalty',
      evidenceZh: topBrand
        ? `最常出现的品牌是 ${topBrand.labelZh}，占 ${percent(topBrand.share)}%。`
        : '还没有形成明显的品牌偏好。',
      evidenceEn: topBrand
        ? `Your most frequent brand is ${topBrand.labelEn}, at ${percent(topBrand.share)}%.`
        : 'No clear brand preference yet.',
    },
    {
      key: 'exploration',
      score: explorationScore,
      labelZh: '探索广度',
      labelEn: 'Exploration',
      evidenceZh: topCategory
        ? `你浏览过 ${categoryDimensions.length} 个品类，最常看的是 ${topCategory.labelZh}。`
        : '继续比价后会逐渐清晰。',
      evidenceEn: topCategory
        ? `You have explored ${categoryDimensions.length} categories; ${topCategory.labelEn} appears most.`
        : 'This will become clearer as you compare more.',
    },
    {
      key: 'platform_focus',
      score: platformScore,
      labelZh: '平台集中度',
      labelEn: 'Platform focus',
      evidenceZh: topPlatform
        ? `${topPlatform.labelZh} 占你查看报价的 ${percent(topPlatform.share)}%。`
        : '还没有足够的平台记录。',
      evidenceEn: topPlatform
        ? `${topPlatform.labelEn} accounts for ${percent(topPlatform.share)}% of the offers you view.`
        : 'Not enough platform history yet.',
    },
    {
      key: 'action_rate',
      score: actionScore,
      labelZh: '行动力',
      labelEn: 'Action rate',
      evidenceZh: `每 ${Math.max(comparisons, 1)} 次比价产生 ${clicks} 次平台点击。`,
      evidenceEn: `${clicks} store clicks across ${Math.max(comparisons, 1)} comparisons.`,
    },
  ];

  const personaKey = pickPersona({
    priceScore,
    brandScore,
    explorationScore,
    platformScore,
    actionScore,
    comparisons,
    categories: categoryDimensions.length,
  });

  const activeDays = new Set(events.map((event) => event.created_at.slice(0, 10))).size;
  const firstSeen = user?.created_at || events[events.length - 1].created_at;
  const lastSeen = user?.last_seen_at || events[0].created_at;

  return {
    hasData: true,
    video,
    user: {
      anonymousId: userId,
      firstSeen,
      lastSeen,
      activeDays,
    },
    totals: {
      comparisons,
      clicks,
      offersSeen,
      conversations: conversations.size,
    },
    persona: PERSONAS[personaKey],
    traits,
    markets: marketDimensions,
    platforms: platformDimensions,
    categories: categoryDimensions,
    brands: brandDimensions,
    budget,
    recent: events.slice(0, 8).map((event) => toActivity(event)),
  };
}

function pickPersona(input: {
  priceScore: number;
  brandScore: number;
  explorationScore: number;
  platformScore: number;
  actionScore: number;
  comparisons: number;
  categories: number;
}): PersonaKey {
  if (input.comparisons < 1) return 'balanced';
  if (input.priceScore >= 62 && input.actionScore >= 40) return 'deal_hunter';
  if (input.brandScore >= 50) return 'brand_loyalist';
  if (input.explorationScore >= 55 && input.categories >= 3) return 'explorer';
  if (input.platformScore >= 55) return 'platform_native';
  return 'balanced';
}

function buildBudget(prices: number[], market?: CountryCode): ProfileBudget | null {
  if (!prices.length) return null;
  const sorted = [...prices].sort((left, right) => left - right);
  const currency = market ? MARKETS[market].currency : 'SGD';
  const round = currency === 'IDR' || currency === 'VND'
    ? (value: number) => Math.round(value)
    : (value: number) => Math.round(value * 100) / 100;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    median: round(median),
    currency,
  };
}

function toActivity(event: EventRow): ProfileActivity {
  const meta = parseMeta(event.metadata);
  const market = event.market as CountryCode;
  if (event.type === 'offer_click') {
    const platform = event.platform_id ? PLATFORMS[event.platform_id]?.name || event.platform_id : '';
    const productName = meta.productName || '';
    const title = [platform, productName].filter(Boolean).join(' · ') || '平台点击';
    return {
      id: event.id,
      type: 'offer_click',
      titleZh: title,
      titleEn: title,
      market,
      createdAt: event.created_at,
    };
  }
  const titleZh = meta.titleZh || meta.productName || '一次比价';
  return {
    id: event.id,
    type: 'comparison',
    titleZh,
    titleEn: meta.titleEn || titleZh,
    market,
    createdAt: event.created_at,
  };
}

export async function resetProfile(userId: string): Promise<void> {
  await resetVideoProfile(userId);
  await deleteCapybara(userId);
  await db.run('DELETE FROM user_events WHERE user_id = ?', [userId]);
}
