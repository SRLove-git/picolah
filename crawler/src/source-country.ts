/** URL country signals only; neutral domains still require a verified local-currency page.
 * Mirrored in crawler/src/source-country.ts and web/shared/source-country.ts because
 * the two deployable images are independent. Keep both copies identical. */
const countries: Record<string, string> = {
  singapore: 'SG', malaysia: 'MY', thailand: 'TH', indonesia: 'ID', philippines: 'PH', vietnam: 'VN',
  usa: 'US', uk: 'GB', 'united-states': 'US', 'united-kingdom': 'GB', australia: 'AU',
  canada: 'CA', india: 'IN', china: 'CN', japan: 'JP', germany: 'DE', france: 'FR',
  'hong-kong': 'HK', taiwan: 'TW',
};
const codes = new Set('SG MY TH ID PH VN US GB UK AU NZ CA IN CN HK TW JP KR DE FR IT ES NL BE CH AT IE AE SA ZA BR MX PL SE NO DK FI PT TR RU'.split(' '));
const genericTwoLetterTlds = new Set(['io', 'ai', 'co', 'me', 'tv', 'fm', 'cc', 'ws', 'to', 'sh']);
function region(value: string): string | undefined {
  const token = value.toLowerCase().replace(/\s+/g, '-');
  const code = countries[token] ?? (codes.has(token.toUpperCase()) ? token.toUpperCase() : undefined);
  if (code) return code === 'UK' ? 'GB' : code;
  const locale = (token.match(/^[a-z]{2}[-_]([a-z]{2})$/)?.[1]?.toUpperCase());
  const reverse = token.match(/^([a-z]{2})[-_](?:en|zh|ms|th|id|fil|vi)$/)?.[1]?.toUpperCase();
  if (reverse && codes.has(reverse)) return reverse === 'UK' ? 'GB' : reverse;
  return locale && codes.has(locale) ? (locale === 'UK' ? 'GB' : locale) : undefined;
}
export function sourceCountry(url: URL, market: string): 'local' | 'foreign' | 'unspecified' {
  const signals: string[] = [];
  const labels = url.hostname.toLowerCase().replace(/^www\./, '').split('.');
  const tld = labels.at(-1)!;
  if (/^[a-z]{2}$/.test(tld) && !genericTwoLetterTlds.has(tld)) signals.push(tld === 'uk' ? 'GB' : tld.toUpperCase());
  if (labels.length > 2) {
    const hostRegion = region(labels[0]); if (hostRegion) signals.push(hostRegion);
  }
  let segments: string[];
  try { segments = decodeURIComponent(url.pathname).toLowerCase().split('/').filter(Boolean); }
  catch { return 'foreign'; }
  const first = region(segments[0] ?? ''); if (first) signals.push(first);
  if (/^(?:store|shop|shoponline|country|locale|en|zh)$/.test(segments[0] ?? '')) {
    const second = region(segments[1] ?? ''); if (second) signals.push(second);
  }
  for (const key of ['country', 'countryCode', 'shipTo', 'locale', 'region']) {
    const value = region(url.searchParams.get(key) ?? ''); if (value) signals.push(value);
  }
  return signals.some(code => code !== market) ? 'foreign' : signals.length ? 'local' : 'unspecified';
}
