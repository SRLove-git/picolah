import { fetchHtml } from '../brightdata/web-unlocker.ts';
import { config } from '../config.ts';
import { MARKETS, type MarketCode } from '../markets.ts';
import { parsePrice } from '../money.ts';
import type { RawListing } from '../types.ts';
import type { PlatformAdapter } from './types.ts';

interface JsonLdItem {
  name?: string;
  url?: string;
  aggregateRating?: { ratingValue?: string | number; ratingCount?: string | number };
}

interface JsonLdProductMeta {
  name: string;
  url: string;
  rating?: number;
  reviews?: number;
}

export function lazadaSearchUrl(market: MarketCode, query: string): string {
  const domain = MARKETS[market].domains.lazada;
  if (!domain) throw new Error(`Lazada 不支持市场 ${market}`);
  return `https://${domain}/catalog/?q=${encodeURIComponent(query)}`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function extractShippingFee(card: string, decimals: 0 | 2): number | undefined {
  if (/free\s*(?:shipping|delivery)|免运费|包邮/i.test(card)) return 0;
  const match = card.match(
    /(?:shipping|delivery|运费|配送)[^<]{0,60}?((?:S\$|RM|฿|₱|Rp|\$)\s?[\d.,]+)/i,
  );
  return match ? (parsePrice(match[1], decimals) ?? undefined) : undefined;
}

function extractFixedDiscount(card: string, decimals: 0 | 2): number | undefined {
  const match = card.match(
    /((?:S\$|RM|฿|₱|Rp|\$)\s?[\d.,]+)\s*(?:off|discount|优惠)/i,
  );
  return match ? (parsePrice(match[1], decimals) ?? undefined) : undefined;
}

function parseJsonLd(html: string): Map<string, JsonLdProductMeta> {
  const result = new Map<string, JsonLdProductMeta>();
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const queue: unknown[] = [data];
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      const record = current as Record<string, unknown>;
      if (record['@type'] === 'ItemList' && Array.isArray(record.itemListElement)) {
        for (const element of record.itemListElement) {
          const item = (element as { item?: JsonLdItem })?.item;
          if (!item?.url) continue;
          const id = item.url.match(/pdp-i(\d+)/)?.[1];
          if (!id) continue;
          const rating = Number(item.aggregateRating?.ratingValue);
          const reviews = Number(item.aggregateRating?.ratingCount);
          result.set(id, {
            name: item.name || '',
            url: item.url,
            rating: Number.isFinite(rating) ? rating : undefined,
            reviews: Number.isFinite(reviews) ? reviews : undefined,
          });
        }
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') queue.push(value);
      }
    }
  }
  return result;
}

/**
 * Lazada's search page is server-rendered. Cards are marked with
 * data-qa-locator="product-item" and carry data-item-id; the price uses the
 * ooOxS class. JSON-LD ItemList supplies names/ratings when the card class
 * names change.
 */
export function parseLazadaSearch(html: string, market: MarketCode): RawListing[] {
  const marketConfig = MARKETS[market];
  const metas = parseJsonLd(html);
  const markers = [...html.matchAll(/data-qa-locator="product-item"/g)];
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < markers.length; index += 1) {
    const start = markers[index].index ?? 0;
    const end = index + 1 < markers.length ? (markers[index + 1].index ?? html.length) : html.length;
    const card = html.slice(start, end);

    const itemId = card.match(/data-item-id="(\d+)"/)?.[1]
      ?? card.match(/pdp-i(\d+)\.html/)?.[1];
    if (!itemId || seen.has(itemId)) continue;

    const meta = metas.get(itemId);
    const titleMatch = card.match(/<div class="[^"]*\bRfADt\b[^"]*">\s*<a[^>]*\btitle="([^"]+)"/);
    const title = decodeEntities(titleMatch?.[1] || meta?.name || '').trim();
    if (!title) continue;

    const hrefMatch = card.match(/href="([^"]*pdp-i\d+\.html)"/);
    const href = hrefMatch?.[1] || meta?.url;
    if (!href) continue;
    const url = normalizeLazadaUrl(href, marketConfig.domains.lazada || '');

    const priceText = card.match(/<span class="[^"]*\booOxS\b[^"]*"[^>]*>([^<]+)<\/span>/)?.[1]
      ?? card.match(/(?:S\$|RM|฿|₱|Rp|\$)\s?[\d.,]+/)?.[0]
      ?? '';
    const price = parsePrice(priceText, marketConfig.decimals);
    if (price === null) continue;

    const location = card.match(/<span class="oa6ri[^"]*"[^>]*\btitle="([^"]+)"/)?.[1];
    const official = /\bLazMall\b/i.test(card);

    listings.push({
      platform: 'lazada',
      market,
      itemId,
      title,
      url,
      price,
      currency: marketConfig.currency,
      shippingFee: extractShippingFee(card, marketConfig.decimals),
      discount: extractFixedDiscount(card, marketConfig.decimals),
      rating: meta?.rating,
      reviews: meta?.reviews,
      seller: 'Lazada',
      location: location ? decodeEntities(location) : undefined,
      isOfficial: official,
      inStock: true,
    });
    seen.add(itemId);
  }

  return listings;
}

function normalizeLazadaUrl(href: string, domain: string): string {
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `https://${domain}${href}`;
  return href;
}

export async function searchLazada(market: MarketCode, query: string): Promise<RawListing[]> {
  const url = lazadaSearchUrl(market, query);
  // Lazada's catalog page is server-rendered only when Web Unlocker fetches it;
  // the plain ISP proxy gets the JS shell (no product cards), so prefer API mode.
  const useApi = Boolean(config.brightData.apiToken && config.brightData.zone);
  const html = await fetchHtml(url, useApi ? { transport: 'api' } : {});
  const listings = parseLazadaSearch(html, market);
  console.log(`[crawler] lazada ${market} "${query.slice(0, 60)}" -> ${listings.length} listings`);
  return listings;
}

export const lazadaAdapter: PlatformAdapter = {
  id: 'lazada',
  search: searchLazada,
};
