import { COUNTRY_CODES, MARKETS, type CountryCode } from '../../shared/types';

export type MarketLanguage = 'en' | 'ms' | 'th' | 'id' | 'vi';
export function languageForMarket(market: CountryCode): MarketLanguage {
  return MARKETS[market].locale.split('-')[0] as MarketLanguage;
}

export function initialMarketLanguage(): MarketLanguage {
  let market = 'SG';
  try { market = localStorage.getItem('picolah.market') || 'SG'; } catch { /* In-memory defaults still work. */ }
  return languageForMarket(COUNTRY_CODES.includes(market as CountryCode) ? market as CountryCode : 'SG');
}

export function marketName(market: CountryCode, language: string): string {
  return new Intl.DisplayNames([language], { type: 'region' }).of(market) || MARKETS[market].nameEn;
}
