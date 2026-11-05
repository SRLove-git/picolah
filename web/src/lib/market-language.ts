import { MARKETS, type CountryCode } from '../../shared/types';

function supportedLanguage(locale?: string | null) {
  const base = locale?.toLowerCase().split(/[-_]/)[0];
  return base === 'zh' || base === 'en' ? base : undefined;
}

export function initialLanguage() {
  try {
    const saved = supportedLanguage(localStorage.getItem('picolah.language'));
    if (saved) return saved;
  } catch { /* Storage may be disabled. */ }
  for (const locale of navigator.languages ?? [navigator.language]) {
    const language = supportedLanguage(locale);
    if (language) return language;
  }
  return 'en';
}

export function marketName(market: CountryCode, language: string): string {
  return new Intl.DisplayNames([language], { type: 'region' }).of(market) || MARKETS[market].nameEn;
}
