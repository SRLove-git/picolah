import i18n from 'i18next';
import translations from '../locales/market-translations.json';

/** Localize the existing component copy without translating user content. */
export function uiText(english: string): string {
  const language = i18n.language?.split('-')[0] as keyof typeof translations;
  const dictionary = translations[language]?.ui as Record<string, string> | undefined;
  return dictionary?.[english] ?? english;
}

export function localizeCopy<T>(copy: T): T {
  if (typeof copy === 'string') return uiText(copy) as T;
  if (Array.isArray(copy)) return copy.map(localizeCopy) as T;
  if (copy && typeof copy === 'object') {
    return Object.fromEntries(Object.entries(copy).map(([key, value]) => [key, localizeCopy(value)])) as T;
  }
  return copy;
}

export function uiTemplate(parts: TemplateStringsArray, ...values: unknown[]): string {
  const key = parts.reduce((text, part, index) => text + (index ? `{{arg${index - 1}}}` : '') + part, '');
  return uiText(key).replace(/\{\{arg(\d+)\}\}/g, (_, index) => String(values[Number(index)]));
}
