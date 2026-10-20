import type { CountryCode, Product, ProductVisual } from '../shared/types.ts';
import { MARKETS } from '../shared/types.ts';

export interface SeedProduct extends Product {
  baseSgd: number;
}

export const PRODUCTS: SeedProduct[] = [
  {
    id: 'sony-wh1000xm5',
    name: 'Sony WH-1000XM5 无线降噪耳机',
    brand: 'Sony',
    category: '耳机',
    tagline: '旗舰降噪 · 30 小时续航',
    visual: 'headphones',
    specs: '午夜黑 · 双设备连接',
    aliases: [
      'sony wh-1000xm5',
      'wh-1000xm5',
      'wh1000xm5',
      'xm5',
      'sony xm5',
      '索尼 xm5',
      '索尼耳机',
      'sony headphones',
      '降噪耳机',
      '头戴式耳机',
      'headphones',
    ],
    baseSgd: 429,
  },
  {
    id: 'iphone-15-128',
    name: 'iPhone 15 128GB',
    brand: 'Apple',
    category: '手机',
    tagline: '灵动岛 · USB-C',
    visual: 'phone',
    specs: '128GB · 蓝色',
    aliases: ['iphone 15', 'iphone15', '苹果 15', '苹果手机', 'iphone', '苹果', '手机'],
    baseSgd: 1089,
  },
  {
    id: 'skii-facial-essence-230',
    name: 'SK-II 护肤精华露 230ml',
    brand: 'SK-II',
    category: '护肤',
    tagline: 'PITERA™ · 经典神仙水',
    visual: 'serum',
    specs: '230ml · 保湿修护',
    aliases: ['sk-ii', 'skii', 'sk2', '神仙水', '护肤精华露', '精华水', 'skii 神仙水'],
    baseSgd: 289,
  },
  {
    id: 'airpods-pro-2',
    name: 'AirPods Pro 2 (USB-C)',
    brand: 'Apple',
    category: '耳机',
    tagline: '自适应降噪 · 通透模式',
    visual: 'earbuds',
    specs: 'USB-C 充电盒 · 白色',
    aliases: ['airpods pro', 'airpods pro 2', 'airpods', '苹果耳机', '降噪豆', '无线耳机'],
    baseSgd: 329,
  },
  {
    id: 'xiaomi-air-fryer-6l',
    name: '小米智能空气炸锅 6L',
    brand: 'Xiaomi',
    category: '家电',
    tagline: '6L 大容量 · App 智控',
    visual: 'airfryer',
    specs: '6L · 米家互联',
    aliases: ['xiaomi air fryer', '小米空气炸锅', '空气炸锅', 'air fryer', '米家空气炸锅'],
    baseSgd: 129,
  },
  {
    id: 'new-balance-530',
    name: 'New Balance 530 复古跑鞋',
    brand: 'New Balance',
    category: '鞋履',
    tagline: '复古跑鞋 · 轻量缓震',
    visual: 'sneaker',
    specs: '男女同款 · US 8–11',
    aliases: ['new balance 530', 'nb530', 'nb 530', 'new balance', '纽巴伦', '复古跑鞋', '跑鞋', '运动鞋', '球鞋'],
    baseSgd: 159,
  },
  {
    id: 'apple-watch-se-2',
    name: 'Apple Watch SE (第 2 代) 44mm',
    brand: 'Apple',
    category: '穿戴',
    tagline: '健康监测 · 家庭共享',
    visual: 'watch',
    specs: '44mm · GPS · 午夜色',
    aliases: ['apple watch se', 'watch se', 'apple watch', '苹果手表', '智能手表', '手表'],
    baseSgd: 379,
  },
  {
    id: 'jbl-charge-5',
    name: 'JBL Charge 5 便携蓝牙音箱',
    brand: 'JBL',
    category: '音频',
    tagline: 'IP67 防水 · 20 小时续航',
    visual: 'speaker',
    specs: '黑色 · 蓝牙 5.1',
    aliases: ['jbl charge 5', 'jbl charge5', 'charge 5', 'jbl', '蓝牙音箱', '便携音箱', '音箱', 'speaker'],
    baseSgd: 219,
  },
  {
    id: 'nespresso-vertuo-pop',
    name: 'Nespresso Vertuo Pop 咖啡机',
    brand: 'Nespresso',
    category: '家电',
    tagline: '一键萃取 · 紧凑机身',
    visual: 'coffee',
    specs: '薄荷绿 · 19 bar',
    aliases: ['nespresso', 'vertuo pop', '咖啡机', '胶囊咖啡机', 'coffee machine'],
    baseSgd: 149,
  },
  {
    id: 'la-roche-posay-mela-b3',
    name: '理肤泉 Mela B3 淡斑精华 30ml',
    brand: 'La Roche-Posay',
    category: '护肤',
    tagline: '烟酰胺 · 淡斑提亮',
    visual: 'serum',
    specs: '30ml · 敏感肌适用',
    aliases: ['la roche-posay', '理肤泉', 'mela b3', '淡斑精华', '烟酰胺精华', '精华'],
    baseSgd: 69,
  },
];

export const CURRENCY_RATES: Record<CountryCode, number> = {
  SG: 1,
  MY: 3.34,
  TH: 26.8,
  ID: 12350,
  PH: 45.6,
  VN: 19850,
};

export const COUNTRY_PRICE_INDEX: Record<CountryCode, number> = {
  SG: 1,
  MY: 0.97,
  TH: 1.02,
  ID: 1.04,
  PH: 1.07,
  VN: 0.94,
};

export const CURRENCY_STEP: Record<CountryCode, number> = {
  SG: 1,
  MY: 10,
  TH: 10,
  ID: 1000,
  PH: 10,
  VN: 10000,
};

export const PLATFORM_PRICE_FACTOR: Record<string, number> = {
  shopee: 0.965,
  lazada: 0.995,
  tiktok: 0.95,
  'amazon-sg': 1.02,
  tokopedia: 1.005,
  tiki: 0.975,
};

const SHIPPING_OPTIONS: Record<CountryCode, number[]> = {
  SG: [1.99, 2.99, 4.99],
  MY: [3.9, 4.9, 7.9],
  TH: [25, 35, 50],
  ID: [8000, 12000, 18000],
  PH: [39, 49, 79],
  VN: [18000, 25000, 35000],
};

const OFFICIAL_BRANDS: Record<string, string> = {
  Sony: 'Sony Official Store',
  Apple: 'Apple Official Store',
  'SK-II': 'SK-II Official Store',
  Xiaomi: 'Xiaomi Official Store',
  'New Balance': 'New Balance Official Store',
  JBL: 'JBL Official Store',
  Nespresso: 'Nespresso Official Store',
  'La Roche-Posay': 'La Roche-Posay Official Store',
};

const RESELLERS: Record<string, string[]> = {
  耳机: ['Audio Loft', 'Sound House', 'Tech Avenue'],
  手机: ['Digital Loft', 'Mobile Hub', 'Gadget House'],
  护肤: ['Glow Lab', 'The Skin Edit', 'Beauty Corner'],
  家电: ['Home & Co.', 'Kitchen Edit', 'Living Lab'],
  鞋履: ['Sole Society', 'Urban Steps', 'The Sneaker Room'],
  音频: ['Audio Loft', 'Bass Works', 'Sound House'],
  穿戴: ['Wearable Co.', 'Digital Loft', 'Gadget House'],
};

const PLATFORM_DOMAINS: Record<CountryCode, Record<string, string>> = {
  SG: {
    shopee: 'https://shopee.sg',
    lazada: 'https://www.lazada.sg',
    tiktok: 'https://www.tiktok.com/shop',
    'amazon-sg': 'https://www.amazon.sg',
  },
  MY: {
    shopee: 'https://shopee.com.my',
    lazada: 'https://www.lazada.com.my',
    tiktok: 'https://www.tiktok.com/shop',
  },
  TH: {
    shopee: 'https://shopee.co.th',
    lazada: 'https://www.lazada.co.th',
    tiktok: 'https://www.tiktok.com/shop',
  },
  ID: {
    shopee: 'https://shopee.co.id',
    lazada: 'https://www.lazada.co.id',
    tokopedia: 'https://www.tokopedia.com',
    tiktok: 'https://www.tiktok.com/shop',
  },
  PH: {
    shopee: 'https://shopee.ph',
    lazada: 'https://www.lazada.com.ph',
    tiktok: 'https://www.tiktok.com/shop',
  },
  VN: {
    shopee: 'https://shopee.vn',
    lazada: 'https://www.lazada.vn',
    tiktok: 'https://www.tiktok.com/shop',
    tiki: 'https://tiki.vn',
  },
};

export const PLATFORM_NAMES: Record<string, string> = {
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok: 'TikTok Shop',
  'amazon-sg': 'Amazon SG',
  tokopedia: 'Tokopedia',
  tiki: 'Tiki',
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function platformUrl(platformId: string, country: CountryCode, query: string): string {
  const encoded = encodeURIComponent(query);
  const domain = PLATFORM_DOMAINS[country][platformId] || 'https://www.google.com/search';
  if (platformId === 'shopee') return `${domain}/search?keyword=${encoded}`;
  if (platformId === 'lazada') return `${domain}/catalog/?q=${encoded}`;
  if (platformId === 'amazon-sg') return `${domain}/s?k=${encoded}`;
  if (platformId === 'tokopedia') return `${domain}/search?q=${encoded}`;
  if (platformId === 'tiki') return `${domain}/search?q=${encoded}`;
  return domain;
}

export interface GeneratedOffer {
  id: string;
  productId: string;
  platformId: string;
  platform: string;
  seller: string;
  country: CountryCode;
  currency: string;
  itemPrice: number;
  shippingFee: number;
  discount: number;
  finalPrice: number;
  url: string;
  rating: number;
  reviews: number;
  inStock: boolean;
  isOfficial: boolean;
  lastSeen: string;
  history: { date: string; price: number }[];
}

function priceHistory(finalPrice: number, rng: () => number, country: CountryCode): { date: string; price: number }[] {
  const step = CURRENCY_STEP[country];
  const points: { date: string; price: number }[] = [];
  const now = Date.now();
  let previous = finalPrice * (1.035 + rng() * 0.035);
  for (let index = 13; index >= 0; index -= 1) {
    const daysAgo = index * 2;
    const drift = (1.035 - (13 - index) * 0.0025) + (rng() - 0.5) * 0.02;
    let price = roundTo(finalPrice * drift, step);
    if (index === 0) price = finalPrice;
    if (index === 4 && rng() > 0.55) price = roundTo(price * 0.96, step);
    if (index === 9) price = Math.max(step, roundTo(previous * (0.99 + rng() * 0.02), step));
    points.push({
      date: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      price,
    });
    previous = price;
  }
  return points;
}

export function generateOffers(): GeneratedOffer[] {
  const offers: GeneratedOffer[] = [];
  const now = Date.now();

  for (const product of PRODUCTS) {
    for (const code of Object.keys(MARKETS) as CountryCode[]) {
      const market = MARKETS[code];
      const rate = CURRENCY_RATES[code];
      const step = CURRENCY_STEP[code];
      for (const platformId of market.platformIds) {
        const seed = hashString(`${product.id}:${code}:${platformId}`);
        const rng = mulberry32(seed);
        const factor = PLATFORM_PRICE_FACTOR[platformId] ?? 1;
        const jitter = 0.985 + rng() * 0.035;
        const itemPrice = roundTo(
          product.baseSgd * rate * COUNTRY_PRICE_INDEX[code] * factor * jitter,
          step,
        );

        const isOfficial =
          platformId === 'lazada' ||
          platformId === 'amazon-sg' ||
          (platformId !== 'tiktok' && rng() > 0.48);

        const shippingChance = platformId === 'lazada' ? 0.82 : rng();
        let shippingFee = 0;
        if (shippingChance < 0.32) {
          const options = SHIPPING_OPTIONS[code];
          shippingFee = options[hashString(`${seed}:ship`) % options.length];
        }

        const voucherRoll = rng();
        const discountRate =
          voucherRoll > 0.35
            ? platformId === 'tiktok'
              ? 0.05 + rng() * 0.05
              : 0.02 + rng() * 0.06
            : 0;
        const discount = roundTo(itemPrice * discountRate, step);
        const finalPrice = Math.max(step, itemPrice + shippingFee - discount);

        const officialSeller = OFFICIAL_BRANDS[product.brand] || `${product.brand} Official Store`;
        const resellerList = RESELLERS[product.category] || ['City Market', 'Everyday Store'];
        const seller = isOfficial
          ? platformId === 'lazada'
            ? `LazMall · ${officialSeller}`
            : officialSeller
          : resellerList[hashString(`${seed}:seller`) % resellerList.length];

        const lastSeen = new Date(now - (3 + (hashString(`${seed}:seen`) % 54)) * 60 * 1000).toISOString();
        const history = priceHistory(finalPrice, rng, code);

        offers.push({
          id: `seed-${product.id}-${code}-${platformId}`,
          productId: product.id,
          platformId,
          platform: PLATFORM_NAMES[platformId] || platformId,
          seller,
          country: code,
          currency: market.currency,
          itemPrice,
          shippingFee,
          discount,
          finalPrice,
          url: platformUrl(platformId, code, product.name),
          rating: Number((4.55 + rng() * 0.39).toFixed(1)),
          reviews: 120 + Math.floor(rng() * 8900),
          inStock: true,
          isOfficial,
          lastSeen,
          history,
        });
      }
    }
  }

  return offers;
}
