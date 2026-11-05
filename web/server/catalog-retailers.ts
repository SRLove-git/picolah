import { MARKETS, type CountryCode } from '../shared/types.ts';

const retailers: Record<string, { name: string; origin: string; productPath: string }> = {
  'web:mistermobile.com.sg': { name: 'Mister Mobile', origin: 'https://www.mistermobile.com.sg', productPath: '/product/' },
  'web:viimart.com': { name: 'VIIMART', origin: 'https://viimart.com', productPath: '/products/' },
  'web:limitededt.com': { name: 'Limited Edt', origin: 'https://limitededt.com', productPath: '/products/' },
};

export function catalogRetailer(id: string) {
  return Object.hasOwn(retailers, id) ? retailers[id] : undefined;
}

// Direct retailers are catalog sources. Live marketplace crawls and seed generation use MARKETS.
export function catalogPlatforms(country: CountryCode): string[] {
  return country === 'SG' ? [...MARKETS.SG.platformIds, ...Object.keys(retailers)] : MARKETS[country].platformIds;
}

export function isRetailProductUrl(id: string, raw: string): boolean {
  const retailer = catalogRetailer(id);
  if (!retailer) return false;
  const url = URL.parse(raw);
  return !!url && url.origin === retailer.origin && !url.username && !url.password &&
    url.pathname.startsWith(retailer.productPath) && /^[a-z0-9-]+\/?$/i.test(url.pathname.slice(retailer.productPath.length));
}
