import type { CountryCode, Offer, PriceMode } from '../../shared/types';
import { MARKETS } from '../../shared/types';

export const PRICE_MODES: {
  id: PriceMode;
  label: string;
  short: string;
  hint: string;
  bestLabel: string;
}[] = [
  {
    id: 'landed',
    label: '到手价',
    short: '到手',
    hint: '商品价 + 运费 − 优惠券，实际要付的钱',
    bestLabel: '最低到手价',
  },
  {
    id: 'item',
    label: '商品价',
    short: '商品',
    hint: '商品标价，不含运费和优惠',
    bestLabel: '最低商品价',
  },
  {
    id: 'shipping',
    label: '含运费',
    short: '含运',
    hint: '商品价 + 运费，不扣优惠券',
    bestLabel: '最低含运费',
  },
  {
    id: 'history',
    label: '30日低',
    short: '30日低',
    hint: '该平台近 30 天出现过的最低价',
    bestLabel: '近 30 天低点',
  },
];

export function priceModeMeta(mode: PriceMode) {
  return PRICE_MODES.find((item) => item.id === mode) || PRICE_MODES[0];
}

export function offerValue(offer: Offer, mode: PriceMode): number {
  switch (mode) {
    case 'item':
      return offer.itemPrice;
    case 'shipping':
      return offer.itemPrice + offer.shippingFee;
    case 'history':
      return offer.low30d;
    case 'landed':
    default:
      return offer.finalPrice;
  }
}

export function sortOffers(offers: Offer[], mode: PriceMode): Offer[] {
  return [...offers].sort((a, b) => offerValue(a, mode) - offerValue(b, mode));
}

export function formatMoney(value: number, country: CountryCode): string {
  const market = MARKETS[country];
  const noDecimals = market.currency === 'IDR' || market.currency === 'VND';
  const formatted = new Intl.NumberFormat(market.locale, {
    style: 'currency',
    currency: market.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: noDecimals ? 0 : 2,
    maximumFractionDigits: noDecimals ? 0 : 2,
  }).format(value);
  return market.currency === 'SGD' ? formatted.replace(/^\$/, 'S$') : formatted;
}

export function formatPlain(value: number, country: CountryCode): string {
  const market = MARKETS[country];
  return new Intl.NumberFormat(market.locale, {
    maximumFractionDigits: market.currency === 'IDR' || market.currency === 'VND' ? 0 : 2,
  }).format(value);
}

export function formatCompact(value: number, country: CountryCode): string {
  const market = MARKETS[country];
  return new Intl.NumberFormat(market.locale, {
    style: 'currency',
    currency: market.currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function relativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60_000);
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  if (minutes < 1) return english ? 'Just now' : '刚刚';
  if (minutes < 60) return english ? `${minutes} min ago` : `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return english ? `${hours} hr ago` : `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return english ? 'Yesterday' : '昨天';
  if (days < 7) return english ? `${days} days ago` : `${days} 天前`;
  return new Intl.DateTimeFormat(english ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric' }).format(timestamp);
}

export function formatClock(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

export function dayGroup(iso: string): '今天' | '昨天' | '更早' {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return '今天';
  if (time >= startOfToday - 86_400_000) return '昨天';
  return '更早';
}

export function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(value: string, length: number): string {
  const text = value.trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

export function savingsPercent(value: number, reference: number): number {
  if (!reference) return 0;
  return Math.round(((reference - value) / reference) * 1000) / 10;
}
