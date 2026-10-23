export type MarketCode = 'SG' | 'MY' | 'TH' | 'ID' | 'PH' | 'VN';

export type PlatformId = 'shopee' | 'lazada' | 'tiktok' | 'amazon-sg' | 'tokopedia' | 'tiki';

export interface MarketConfig {
  code: MarketCode;
  name: string;
  currency: string;
  /** IDR / VND have no minor units. */
  decimals: 0 | 2;
  domains: Partial<Record<PlatformId, string>>;
  /** Platform matrix from docs/ingest-api.md. */
  platforms: PlatformId[];
}

export const MARKETS: Record<MarketCode, MarketConfig> = {
  SG: {
    code: 'SG',
    name: 'Singapore',
    currency: 'SGD',
    decimals: 2,
    domains: { shopee: 'shopee.sg', lazada: 'www.lazada.sg', tiktok: 'shop.tiktok.com', 'amazon-sg': 'www.amazon.sg' },
    platforms: ['shopee', 'lazada', 'tiktok', 'amazon-sg'],
  },
  MY: {
    code: 'MY',
    name: 'Malaysia',
    currency: 'MYR',
    decimals: 2,
    domains: { shopee: 'shopee.com.my', lazada: 'www.lazada.com.my', tiktok: 'shop.tiktok.com' },
    platforms: ['shopee', 'lazada', 'tiktok'],
  },
  TH: {
    code: 'TH',
    name: 'Thailand',
    currency: 'THB',
    decimals: 2,
    domains: { shopee: 'shopee.co.th', lazada: 'www.lazada.co.th', tiktok: 'shop.tiktok.com' },
    platforms: ['shopee', 'lazada', 'tiktok'],
  },
  ID: {
    code: 'ID',
    name: 'Indonesia',
    currency: 'IDR',
    decimals: 0,
    domains: { shopee: 'shopee.co.id', lazada: 'www.lazada.co.id', tiktok: 'shop.tiktok.com', tokopedia: 'www.tokopedia.com' },
    platforms: ['shopee', 'lazada', 'tiktok', 'tokopedia'],
  },
  PH: {
    code: 'PH',
    name: 'Philippines',
    currency: 'PHP',
    decimals: 2,
    domains: { shopee: 'shopee.ph', lazada: 'www.lazada.com.ph', tiktok: 'shop.tiktok.com' },
    platforms: ['shopee', 'lazada', 'tiktok'],
  },
  VN: {
    code: 'VN',
    name: 'Vietnam',
    currency: 'VND',
    decimals: 0,
    domains: { shopee: 'shopee.vn', lazada: 'www.lazada.vn', tiktok: 'shop.tiktok.com', tiki: 'tiki.vn' },
    platforms: ['shopee', 'lazada', 'tiktok', 'tiki'],
  },
};

export const MARKET_CODES = Object.keys(MARKETS) as MarketCode[];

export function parseMarkets(raw: string[]): MarketCode[] {
  const values = raw
    .flatMap((item) => item.split(','))
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (!values.length) return MARKET_CODES;
  const invalid = values.filter((value) => !(value in MARKETS));
  if (invalid.length) {
    throw new Error(`未知市场：${invalid.join(', ')}。可选：${MARKET_CODES.join(', ')}`);
  }
  return [...new Set(values as MarketCode[])];
}

export function isPlatformSupported(market: MarketConfig, platform: PlatformId): boolean {
  return market.platforms.includes(platform);
}
