import { parseSearchCandidates, type WebSearchCandidate } from './brightdata/serp.ts';
import { queryMatchesTitle } from './discovery-match.ts';
import { safeWebUrl } from './safe-web-url.ts';
import { commercePageProduct, pageRecord } from './product-page-state.ts';

function decode(value: string): string {
  return value.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (raw, hex: string | undefined, decimal: string | undefined) => {
    const point = parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : raw;
  }).replace(/&(?:amp|quot|apos|nbsp);/gi, (entity) => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity.toLowerCase()]!);
}

/** Filter unresolved URLs before link/host caps can discard real products. */
export function productPageUrl(value: string, followup = false): URL | null {
  const url = safeWebUrl(value);
  if (!url) return null;
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { return null; }
  if (/(?:^|\/)(?:undefined|null|NaN|\[object Object\])(?:\/|$)/i.test(path)) return null;
  if (followup) {
    if (path === '/' || /\/(?:search|blogs?|reviews?|articles?|news)(?:\/|$)/i.test(path)) return null;
    // Shopify also serves real products below /collections/<name>/products/.
    const directory = path.match(/\/(?:collections|categor(?:y|ies)|brands?)(?:\/|$)/i);
    if (directory && !/\/(?:products?|p|dp|itm|buy)\/[^/]+/i.test(path.slice(directory.index! + directory[0].length))) return null;
  }
  return url;
}

/** Directory links only supply candidates. Their prices are never read or used. */
export type LinkedProductPage = WebSearchCandidate & { relation?: 'variant' };
export function linkedProductPages(html: string, pageUrl: string, query: string, model?: string): LinkedProductPage[] {
  const page = safeWebUrl(pageUrl);
  if (!page) return [];
  const organic: Array<{ link: string; title: string }> = [];
  const seen = new Set<string>();
  const variants = new Set<string>();
  const state = commercePageProduct(html, pageUrl);
  if (state && typeof state.seoTitle === 'string' && Array.isArray(state.baseOptions)) {
    const labels = (value: unknown): string[] => Array.isArray(value) ? value.flatMap((item) => {
      const text = pageRecord(item)?.value;
      return typeof text === 'string' ? [text.split('|').at(-1)!.trim()] : [];
    }).filter((text) => text.length > 0 && text.length < 80) : [];
    for (const group of state.baseOptions.slice(0, 10)) {
      const data = pageRecord(group);
      const selected = pageRecord(data?.selected);
      const selectedLabels = labels(selected?.variants);
      if (selected?.code !== state.code || !selectedLabels.length || !Array.isArray(data?.options)) continue;
      let base = state.seoTitle;
      for (const label of selectedLabels) base = base.replace(new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
      for (const value of data.options.slice(0, 50)) {
        const variant = pageRecord(value);
        const variantLabels = labels(variant?.variants);
        if (typeof variant?.url !== 'string' || typeof variant.code !== 'string' || !variantLabels.length) continue;
        const title = `${base} ${variant.code} ${variantLabels.join(' ')}`.replace(/\s+/g, ' ').trim();
        if (!queryMatchesTitle(query, title, model)) continue;
        try {
          const url = productPageUrl(new URL(variant.url, page).href, true);
          if (!url || url.origin !== page.origin || url.href === page.href || seen.has(url.href)) continue;
          seen.add(url.href); variants.add(url.href); organic.push({ link: url.href, title });
        } catch { /* Variants only provide safe candidates, never prices. */ }
      }
    }
  }
  const visible = html.replace(/<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, '');
  for (const anchor of visible.matchAll(/<a\b([^>]{0,8192})>([\s\S]{0,10000}?)<\/a\s*>/gi)) {
    const href = anchor[1].match(/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const title = decode(anchor[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!href || !queryMatchesTitle(query, title, model)) continue;
    try {
      const url = productPageUrl(new URL(decode(href[1] ?? href[2] ?? href[3]), page).href, true);
      if (!url || url.origin !== page.origin || url.pathname === page.pathname || seen.has(url.href)) continue;
      seen.add(url.href);
      organic.push({ link: url.href, title });
      if (organic.length === 30) break;
    } catch { /* Ignore malformed links; no network request has been made. */ }
  }
  return parseSearchCandidates({ organic }).map((candidate) => ({ ...candidate, ...(variants.has(candidate.url) ? { relation: 'variant' as const } : {}) }));
}
