import { MARKETS, type CountryCode } from '../../shared/types';

export const UI_LANGUAGES = [
  { code: 'en', name: 'English', label: 'Language', voice: 'en-SG' },
  { code: 'zh', name: '简体中文', label: '语言', voice: 'zh-CN' },
  { code: 'ms', name: 'Bahasa Melayu', label: 'Bahasa', voice: 'ms-MY' },
  { code: 'th', name: 'ไทย', label: 'ภาษา', voice: 'th-TH' },
  { code: 'id', name: 'Bahasa Indonesia', label: 'Bahasa', voice: 'id-ID' },
  { code: 'vi', name: 'Tiếng Việt', label: 'Ngôn ngữ', voice: 'vi-VN' },
] as const;

function matchLanguage(locale?: string | null) {
  const base = locale?.toLowerCase().split(/[-_]/)[0];
  return UI_LANGUAGES.find(language => language.code === base);
}

export function uiLanguage(locale: string) {
  return matchLanguage(locale) ?? UI_LANGUAGES[0];
}

export function initialLanguage() {
  try {
    const saved = matchLanguage(localStorage.getItem('picolah.language'));
    if (saved) return saved.code;
  } catch { /* Storage may be disabled. */ }
  for (const locale of navigator.languages ?? [navigator.language]) {
    const language = matchLanguage(locale);
    if (language) return language.code;
  }
  return 'en';
}

export function marketName(market: CountryCode, language: string): string {
  return new Intl.DisplayNames([language], { type: 'region' }).of(market) || MARKETS[market].nameEn;
}
