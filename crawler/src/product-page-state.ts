import { safeWebUrl } from './safe-web-url.ts';

export type PageRecord = Record<string, unknown>;
export const pageRecord = (value: unknown): PageRecord | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as PageRecord : null;

/** Read only a completed SAP Commerce product state bound to this page URL.
 * Never evaluate JavaScript or accept unrelated/recommended product records.
 */
export function commercePageProduct(html: string, pageUrl: string): PageRecord | null {
  const page = safeWebUrl(pageUrl);
  if (!page) return null;
  const matches: PageRecord[] = [];
  for (const script of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\bid\s*=\s*["']ng-state["']/i.test(script[1]) || !/\btype\s*=\s*["']application\/json["']/i.test(script[1])) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(script[2]); } catch { continue; }
    const state = pageRecord(pageRecord(parsed)?.['cx-state']);
    const entities = pageRecord(pageRecord(pageRecord(state?.product)?.details)?.entities);
    for (const [key, entity] of Object.entries(entities ?? {}).slice(0, 100)) {
      const details = pageRecord(pageRecord(entity)?.details);
      const value = pageRecord(details?.value);
      if (details?.success !== true || details.loading !== false || details.error !== false || !value || value.code !== key || typeof value.url !== 'string') continue;
      try {
        const url = safeWebUrl(new URL(value.url, page).href);
        if (!url || url.origin !== page.origin || url.pathname !== page.pathname) continue;
        const variantKeys = new Set([...url.searchParams.keys(), ...page.searchParams.keys()]);
        if ([...variantKeys].some((key) => /^(?:variant|variantid|sku|sku_id|skuid|product_id|productid|item_id|itemid|id|size|color|colour|capacity)$/i.test(key)
          && url.searchParams.get(key) !== page.searchParams.get(key))) continue;
        matches.push(value);
      } catch { /* Invalid URLs cannot identify this page. */ }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}
