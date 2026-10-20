export const COUNTRY_CODES = ['SG', 'MY', 'TH', 'ID', 'PH', 'VN'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export type PriceMode = 'landed' | 'item' | 'shipping' | 'history';

export interface Market {
  code: CountryCode;
  nameZh: string;
  nameEn: string;
  flag: string;
  currency: string;
  locale: string;
  timezone: string;
  platformIds: string[];
}

export const MARKETS: Record<CountryCode, Market> = {
  SG: {
    code: 'SG',
    nameZh: '新加坡',
    nameEn: 'Singapore',
    flag: '🇸🇬',
    currency: 'SGD',
    locale: 'en-SG',
    timezone: 'Asia/Singapore',
    platformIds: ['shopee', 'lazada', 'tiktok', 'amazon-sg'],
  },
  MY: {
    code: 'MY',
    nameZh: '马来西亚',
    nameEn: 'Malaysia',
    flag: '🇲🇾',
    currency: 'MYR',
    locale: 'ms-MY',
    timezone: 'Asia/Kuala_Lumpur',
    platformIds: ['shopee', 'lazada', 'tiktok'],
  },
  TH: {
    code: 'TH',
    nameZh: '泰国',
    nameEn: 'Thailand',
    flag: '🇹🇭',
    currency: 'THB',
    locale: 'th-TH',
    timezone: 'Asia/Bangkok',
    platformIds: ['shopee', 'lazada', 'tiktok'],
  },
  ID: {
    code: 'ID',
    nameZh: '印度尼西亚',
    nameEn: 'Indonesia',
    flag: '🇮🇩',
    currency: 'IDR',
    locale: 'id-ID',
    timezone: 'Asia/Jakarta',
    platformIds: ['shopee', 'tokopedia', 'tiktok', 'lazada'],
  },
  PH: {
    code: 'PH',
    nameZh: '菲律宾',
    nameEn: 'Philippines',
    flag: '🇵🇭',
    currency: 'PHP',
    locale: 'en-PH',
    timezone: 'Asia/Manila',
    platformIds: ['shopee', 'lazada', 'tiktok'],
  },
  VN: {
    code: 'VN',
    nameZh: '越南',
    nameEn: 'Vietnam',
    flag: '🇻🇳',
    currency: 'VND',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    platformIds: ['shopee', 'lazada', 'tiktok', 'tiki'],
  },
};

export const COUNTRY_LIST: Market[] = COUNTRY_CODES.map((code) => MARKETS[code]);

export interface Platform {
  id: string;
  name: string;
  short: string;
  color: string;
  tint: string;
}

export const PLATFORMS: Record<string, Platform> = {
  shopee: { id: 'shopee', name: 'Shopee', short: 'S', color: '#ee4d2d', tint: '#fff0eb' },
  lazada: { id: 'lazada', name: 'Lazada', short: 'L', color: '#7b2ff2', tint: '#f3edff' },
  tiktok: { id: 'tiktok', name: 'TikTok Shop', short: 'T', color: '#18181b', tint: '#f0f0f1' },
  'amazon-sg': { id: 'amazon-sg', name: 'Amazon SG', short: 'A', color: '#e58a00', tint: '#fff7e6' },
  tokopedia: { id: 'tokopedia', name: 'Tokopedia', short: 'T', color: '#03ac0e', tint: '#eafaea' },
  tiki: { id: 'tiki', name: 'Tiki', short: 'T', color: '#1a94ff', tint: '#eaf4ff' },
  official: { id: 'official', name: '品牌官网', short: 'O', color: '#3f5d45', tint: '#edf4ed' },
};

export type ProductVisual =
  | 'headphones'
  | 'phone'
  | 'serum'
  | 'earbuds'
  | 'airfryer'
  | 'sneaker'
  | 'watch'
  | 'speaker'
  | 'coffee';

export const PRODUCT_VISUALS = [
  'headphones',
  'phone',
  'serum',
  'earbuds',
  'airfryer',
  'sneaker',
  'watch',
  'speaker',
  'coffee',
] as const;

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  tagline: string;
  visual: ProductVisual;
  aliases: string[];
  specs: string;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface Offer {
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
  low30d: number;
  history: number[];
}

export interface ComparisonAlternative {
  product: Product;
  offer: Offer | null;
  market: CountryCode;
}

export interface Comparison {
  kind: 'comparison' | 'suggestions' | 'recommendation' | 'empty';
  query: string;
  market: CountryCode;
  product: Product | null;
  offers: Offer[];
  alternatives: ComparisonAlternative[];
  totalOffers: number;
  updatedAt: string;
  sourceCount: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  comparison?: Comparison;
  image?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  market: CountryCode;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}

export interface IngestRun {
  id: string;
  source: string;
  country: CountryCode;
  received: number;
  upserted: number;
  status: 'ok' | 'partial' | 'failed';
  message: string;
  createdAt: string;
}

export interface GatewayStats {
  offers: number;
  products: number;
  markets: number;
  todayOffers: number;
  lastRun: IngestRun | null;
  runs: IngestRun[];
  endpoint: string;
  ingestConfigured: boolean;
}

export interface AppConfig {
  llmConfigured: boolean;
  llmProvider: string;
  llmModel: string;
  markets: Market[];
  gateway: GatewayStats;
}

export interface ChatStreamMeta {
  conversationId: string;
  title: string;
  market: CountryCode;
  userMessageId: string;
}

export type StreamEvent =
  | { type: 'meta'; data: ChatStreamMeta }
  | { type: 'status'; data: { label: string } }
  | { type: 'results'; data: Comparison }
  | { type: 'delta'; data: { text: string } }
  | { type: 'done'; data: { messageId: string; conversationId: string } }
  | { type: 'error'; data: { message: string } };
