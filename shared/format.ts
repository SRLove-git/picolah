import type { CountryCode } from './types.ts';
import { MARKETS } from './types.ts';

/**
 * Currency formatting shared by the server, the mock crawler and the browser.
 * Uses only Intl, so it is safe in every runtime.
 */
export function formatMoney(value: number, country: CountryCode): string {
  const market = MARKETS[country];
  const maximumFractionDigits = market.currency === 'IDR' || market.currency === 'VND' ? 0 : 2;
  const formatted = new Intl.NumberFormat(market.locale, {
    style: 'currency',
    currency: market.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: maximumFractionDigits === 0 ? 0 : 2,
    maximumFractionDigits,
  }).format(value);
  return market.currency === 'SGD' ? formatted.replace(/^\$/, 'S$') : formatted;
}

export function formatCompactMoney(value: number, country: CountryCode): string {
  const market = MARKETS[country];
  return new Intl.NumberFormat(market.locale, {
    style: 'currency',
    currency: market.currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}
