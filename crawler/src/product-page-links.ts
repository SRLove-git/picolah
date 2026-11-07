import { attributes } from './embedded-product.ts';
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

// Retailers sometimes nest an actual SKU page beneath a catalog category.
export function isDirectoryPath(path: string): boolean {
  const dir = path.match(/\/(?:collections|categor(?:y|ies)|brands?)(?:\/|$)/i);
  if (!dir) return false;
  const tail = path.slice(dir.index! + dir[0].length);
  return !/(?:^|\/)(?:products?|p|dp|itm|buy)\/[^/]+/i.test(tail) && !/\/[^/]+\.html?$/i.test(tail);
}

export function editorialPath(path: string): boolean {
  return /\/(?:tech-news|press-release|newsroom)(?:[-/]|$)/i.test(path);
}

/** Filter unresolved URLs before link/host caps can discard real products. */
export function productPageUrl(value: string, followup = false): URL | null {
  const url = safeWebUrl(value);
  if (!url) return null;
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { return null; }
  if (/(?:^|\/)(?:undefined|null|NaN|\[object Object\])(?:\/|$)/i.test(path)) return null;
  // Hyphenated newsroom slugs also occur on retail-looking domains.
  if (editorialPath(path)) return null;
  if (followup) {
    if (path === '/' || /\/(?:search|blogs?|reviews?|articles?|news)(?:\/|$)/i.test(path)) return null;
    // Shopify also serves real products below /collections/<name>/products/.
    if (isDirectoryPath(path)) return null;
  }
  return url;
}

/** A merchant's canonical link is a new candidate, never a price source.
 * Re-open the replacement URL only if this page names the requested product. */
export function canonicalProductPage(html: string, pageUrl: string, query: string, model?: string): WebSearchCandidate | undefined {
  const page = safeWebUrl(pageUrl);
  if (!page || !/canonical/i.test(html)) return;
  const visible = html.replace(/<!--[\s\S]*?-->|<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const headings = [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (headings.length !== 1) return;
  const title = decode(headings[0][1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!queryMatchesTitle(query,title,model)) return;
  const urls = new Map<string, URL>();
  for (const match of visible.matchAll(/<link\b[^>]*>/gi)) {
    const fields = attributes(match[0]);
    if (!fields.get('rel')?.toLowerCase().split(/\s+/).includes('canonical')) continue;
    const href = fields.get('href');
    if (!href) return;
    try {
      const url = productPageUrl(/^https?:/i.test(href) ? href : new URL(href, page).href, true);
      if (!url || url.origin !== page.origin || url.pathname === page.pathname) return;
      // A canonical may remove tracking. It must preserve a selected option,
      // country/locale or item ID instead of silently widening the request.
      const identity = /^(?:variant|variantid|sku|sku_id|skuid|product_id|productid|item_id|itemid|id|size|colou?r|capacity|country|countrycode|region|locale|shipto)$/i;
      for (const key of new Set([...page.searchParams.keys(),...url.searchParams.keys()])) {
        if (identity.test(key) && JSON.stringify(page.searchParams.getAll(key)) !== JSON.stringify(url.searchParams.getAll(key))) return;
      }
      urls.set(url.href,url);
    } catch { return; }
  }
  if (urls.size === 1) return {url:[...urls.keys()][0],title};
}

/** Directory links only supply candidates. Their prices are never read or used. */
export type LinkedProductPage = WebSearchCandidate & { relation?: 'variant' };
export function linkedProductPages(html: string, pageUrl: string, query: string, model?: string): LinkedProductPage[] {
  const page = safeWebUrl(pageUrl);
  if (!page) return [];
  const organic: Array<{ link: string; title: string }> = [];
  const seen = new Set<string>();
  const variants = new Set<string>();
  const canonical = canonicalProductPage(html,pageUrl,query,model);
  if (canonical) { seen.add(canonical.url); organic.push({link:canonical.url,title:canonical.title}); }
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
