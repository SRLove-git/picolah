import type { CountryCode } from '../../shared/types';

/**
 * Interface languages that make sense for each market, most common first.
 * The app only ships zh/en today; markets whose mainstream language is not
 * supported yet fall back to English.
 */
export const MARKET_LANGUAGES: Record<CountryCode, ReadonlyArray<'zh' | 'en'>> = {
  SG: ['en', 'zh'],
  MY: ['en', 'zh'],
  TH: ['en'],
  ID: ['en'],
  PH: ['en'],
  VN: ['en'],
};

export function languageForMarket(market: CountryCode, current: string): 'zh' | 'en' {
  const languages = MARKET_LANGUAGES[market];
  const normalized = current.startsWith('zh') ? 'zh' : 'en';
  return languages.includes(normalized) ? normalized : languages[0];
}
