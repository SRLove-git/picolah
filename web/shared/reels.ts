import type { CountryCode, ProductVisual } from './types.ts';

export interface Reel {
  id: string;
  productId: string;
  category: string;
  brand: string;
  topics: string[];
  durationMs: number;
  publishedAt: string;
  /** Empty for the existing animated demo cards. */
  videoUrl?: string;
  handle: string;
  author: string;
  authorTag: string;
  shortTitle: string;
  title: string;
  caption: string;
  tags: string;
  productName: string;
  query: string;
  visual: ProductVisual;
  price: string;
  compare: string;
  market: CountryCode;
  likes: number;
  comments: number;
  shares: number;
  accent: string;
  gradient: [string, string];
  captionTone: 'light' | 'dark';
}

const DEMO_REELS: Omit<Reel, 'productId' | 'category' | 'brand' | 'topics' | 'durationMs' | 'publishedAt'>[] = [
  {
    id: 'xm5-six-markets',
    handle: '@pico.finds',
    author: 'Pico 比价所',
    authorTag: '数码 · 测评',
    shortTitle: 'XM5 六国比价，差价够吃三顿火锅',
    title: '同一副 Sony XM5，六个国家差了多少钱？',
    caption: '新加坡 S$429，越南只要 S$371。算上运费和券，最后我还是在 Shopee 下了单。',
    tags: '#降噪耳机 #SonyXM5 #东南亚比价',
    productName: 'Sony WH-1000XM5',
    query: 'Sony WH-1000XM5 哪里买最便宜？',
    visual: 'headphones',
    price: 'S$371',
    compare: '6 个市场 · 最低在越南',
    market: 'SG',
    likes: 12800,
    comments: 342,
    shares: 96,
    accent: '#ff7aa2',
    gradient: ['#ffd6e3', '#ffe9c6'],
    captionTone: 'dark',
  },
  {
    id: 'iphone15-wait',
    handle: '@sea.deal.girl',
    author: 'Mika 在新加坡',
    authorTag: '手机 · 好价',
    shortTitle: 'iPhone 15 现在入手，还是等 16？',
    title: 'iPhone 15 跌到多少，才值得现在买？',
    caption: '我把 30 天价格拉了一条线：这周是近一个月低点，但 16 发布前可能还有一波。',
    tags: '#iPhone15 #30日低点 #换机',
    productName: 'iPhone 15 128GB',
    query: 'iPhone 15 128GB 现在划算吗？',
    visual: 'phone',
    price: 'S$1,029',
    compare: '比上月低 S$60 · 30 日低点',
    market: 'SG',
    likes: 8640,
    comments: 518,
    shares: 120,
    accent: '#6b9cff',
    gradient: ['#cfe0ff', '#e7d8ff'],
    captionTone: 'dark',
  },
  {
    id: 'skii-duty-free',
    handle: '@glow.check',
    author: '小鹿成分室',
    authorTag: '护肤 · 实测',
    shortTitle: '神仙水 230ml，官方店和免税店差多少',
    title: 'SK-II 神仙水，真的有必要蹲免税店吗？',
    caption: '官方店送小样，免税店便宜 S$42。按毫升算完，我反而选了官方店。',
    tags: '#SKII #神仙水 #护肤比价',
    productName: 'SK-II 护肤精华露 230ml',
    query: 'SK-II 神仙水 230ml 比价',
    visual: 'serum',
    price: 'S$247',
    compare: '免税渠道 · 比官方省 S$42',
    market: 'SG',
    likes: 22100,
    comments: 903,
    shares: 288,
    accent: '#d98cff',
    gradient: ['#f1dcff', '#ffe1ef'],
    captionTone: 'dark',
  },
  {
    id: 'airpods-low',
    handle: '@pico.finds',
    author: 'Pico 比价所',
    authorTag: '数码 · 30 日低',
    shortTitle: 'AirPods Pro 2 跌到 30 日低，冲不冲？',
    title: 'AirPods Pro 2 到 30 日低点了，但我劝你先看这条',
    caption: 'Lazada 券后 S$279，比官方低 S$50。库存只剩 12 件，手慢真的会没。',
    tags: '#AirPodsPro2 #30日低 #真无线',
    productName: 'AirPods Pro 2 (USB-C)',
    query: 'AirPods Pro 2 现在划算吗？',
    visual: 'earbuds',
    price: 'S$279',
    compare: '4 个平台 · 30 日最低',
    market: 'SG',
    likes: 15600,
    comments: 421,
    shares: 201,
    accent: '#45c7a4',
    gradient: ['#c8f4e5', '#d9f0ff'],
    captionTone: 'dark',
  },
  {
    id: 'airfryer-vietnam',
    handle: '@banhmi.deals',
    author: 'An 在胡志明',
    authorTag: '家电 · 开箱',
    shortTitle: '6L 空气炸锅，越南买比新加坡便宜一半',
    title: '同一台 6L 空气炸锅，凭什么越南便宜一半？',
    caption: '本地电压一样，插头也一样。算上跨境运费，还是便宜 S$48。',
    tags: '#空气炸锅 #越南好价 #小家电',
    productName: '小米智能空气炸锅 6L',
    query: '小米智能空气炸锅 6L 比价',
    visual: 'airfryer',
    price: '₫1,890,000',
    compare: '越南 · 折合 S$101',
    market: 'VN',
    likes: 6320,
    comments: 187,
    shares: 74,
    accent: '#ffb35c',
    gradient: ['#ffe3bf', '#ffe9d7'],
    captionTone: 'dark',
  },
];

const CONTENT_LABELS = [
  { productId: 'sony-wh1000xm5', category: '耳机', brand: 'Sony', topics: ['降噪', '跨市场比价', '测评'] },
  { productId: 'iphone-15-128', category: '手机', brand: 'Apple', topics: ['换机', '价格趋势', '数码'] },
  { productId: 'skii-facial-essence-230', category: '护肤', brand: 'SK-II', topics: ['成分', '官方店', '护肤'] },
  { productId: 'airpods-pro-2', category: '耳机', brand: 'Apple', topics: ['降噪', '价格趋势', '数码'] },
  { productId: 'xiaomi-air-fryer-6l', category: '家电', brand: 'Xiaomi', topics: ['厨房', '跨市场比价', '开箱'] },
];

/** Shared content registry: server-owned labels, never supplied by event clients. */
export const REELS: Reel[] = DEMO_REELS.map((reel, index) => ({
  ...reel,
  ...CONTENT_LABELS[index],
  durationMs: 16_250,
  publishedAt: '2026-10-21T00:00:00.000Z',
}));

export const REEL_EVENT_TYPES = [
  'view', 'watch', 'like', 'unlike', 'save', 'unsave', 'follow', 'unfollow',
  'share', 'not_interested', 'compare',
] as const;
export type ReelEventType = typeof REEL_EVENT_TYPES[number];

export interface ReelEventInput {
  eventId: string;
  sessionId: string;
  reelId: string;
  type: ReelEventType;
  market: CountryCode;
  /** Cumulative visible, playing time for this viewing session. */
  watchMs?: number;
  /** True when navigating away or finishing the clip, never just pausing. */
  ended?: boolean;
}

export interface ReelFeedItem extends Reel {
  reason: {
    code: 'interest' | 'following' | 'popular' | 'explore' | 'market' | 'fresh';
    labelZh: string;
    labelEn: string;
  };
  liked: boolean;
  saved: boolean;
  following: boolean;
}

export interface ReelFeed {
  items: ReelFeedItem[];
  personalized: boolean;
  algorithmVersion: string;
}

export interface VideoInterest {
  id: string;
  labelZh: string;
  labelEn: string;
  score: number;
  share: number;
}

export interface VideoProfile {
  hasData: boolean;
  views: number;
  watchedMs: number;
  completions: number;
  skips: number;
  likes: number;
  saves: number;
  follows: number;
  completionRate: number;
  categories: VideoInterest[];
  brands: VideoInterest[];
  topics: VideoInterest[];
  creators: VideoInterest[];
  recent: Array<{
    reelId: string;
    title: string;
    type: ReelEventType;
    createdAt: string;
  }>;
}
