import { BrightDataError, fetchHtml } from '../brightdata/web-unlocker.ts';
import { config } from '../config.ts';
import { MARKETS, type MarketCode } from '../markets.ts';
import { parsePrice } from '../money.ts';
import { extractImageUrl } from '../image-url.ts';
import type { RawListing } from '../types.ts';
import type { PlatformAdapter } from './types.ts';
import { lazadaProductUrl, parseLazadaStructured } from './lazada-structured.ts';

interface JsonLdItem {
  name?: string;
  url?: string;
  image?: unknown;
  aggregateRating?: { ratingValue?: string | number; ratingCount?: string | number };
}

interface JsonLdProductMeta {
  name: string;
  url: string;
  rating?: number;
  reviews?: number;
  imageUrl?: string;
}

export function lazadaSearchUrl(market: MarketCode, query: string): string {
  const domain = MARKETS[market].domains.lazada;
  if (!domain) throw new Error(`Lazada 不支持市场 ${market}`);
  return `https://${domain}/catalog/?q=${encodeURIComponent(query)}`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (entity, hex: string, decimal: string) => {
      const code = Number.parseInt(hex || decimal, hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeEntities(match[2]).trim() : undefined;
}

function visibleText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function salePrice(text: string, market: MarketCode): number | null {
  const currency = {
    SG: '(?:S\\$|SGD|\\$)', MY: '(?:RM|MYR)', TH: '(?:฿|THB)',
    ID: '(?:Rp|IDR)', PH: '(?:₱|PHP)', VN: '(?:₫|VND)',
  }[market];
  // One amount only, in the page's market currency. Never interpret ranges,
  // instalments or a foreign currency as a definitive local sale price.
  const amount = '(?:\\d{1,3}(?:[,.\\s]\\d{3})+(?:[.,]\\d{2})?|\\d+(?:[.,]\\d{2})?)';
  if (!new RegExp(`^(?:${currency}\\s*)?${amount}(?:\\s*${currency})?$`, 'i').test(text)) return null;
  return parsePrice(text, MARKETS[market].decimals);
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

function parseJsonLd(html: string, market: MarketCode): Map<string, JsonLdProductMeta> {
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
          const ratingValue = item.aggregateRating?.ratingValue;
          const reviewValue = item.aggregateRating?.ratingCount;
          const rating = ratingValue === undefined || ratingValue === null || ratingValue === '' ? NaN : Number(ratingValue);
          const reviews = reviewValue === undefined || reviewValue === null || reviewValue === '' ? NaN : Number(reviewValue);
          result.set(id, {
            name: item.name || '',
            url: item.url,
            imageUrl: extractImageUrl(item.image, `https://${MARKETS[market].domains.lazada}`),
            rating: Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : undefined,
            reviews: Number.isInteger(reviews) && reviews >= 0 ? reviews : undefined,
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
 * Prefer explicit, source-bound prices. JSON-LD can stand alone; DOM parsing
 * uses product markers, not the first currency amount in a marketing banner.
 */
export function parseLazadaSearch(html: string, market: MarketCode): RawListing[] {
  const marketConfig = MARKETS[market];
  const metas = parseJsonLd(html, market);
  const structured = parseLazadaStructured(html, market);
  const dom = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const markers = [...dom.matchAll(/<([a-z][\w-]*)\b[^>]*\bdata-qa-locator\s*=\s*(["'])product-item\2[^>]*>/gi)];
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < markers.length; index += 1) {
    const start = markers[index].index ?? 0;
    const end = index + 1 < markers.length ? (markers[index + 1].index ?? dom.length) : dom.length;
    let card = dom.slice(start, end);
    // Stop at the card's own closing tag, so footer promotions do not leak in.
    let depth = 0;
    for (const tag of card.matchAll(new RegExp(`<\\/?${markers[index][1]}\\b[^>]*>`, 'gi'))) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { card = card.slice(0, tag.index! + tag[0].length); break; }
    }

    const itemId = attribute(markers[index][0], 'data-item-id')
      ?? card.match(/pdp-i(\d+)\.html/)?.[1];
    if (!itemId || seen.has(itemId)) continue;

    const meta = metas.get(itemId);
    const links = [...card.matchAll(/<a\b[^>]*>/gi)].map((match) => match[0]);
    const titleLink = links.find((link) => attribute(link, 'title') && lazadaProductUrl(attribute(link, 'href'), market)?.itemId === itemId);
    const title = attribute(titleLink || '', 'title') || meta?.name || '';
    if (!title) continue;

    const href = attribute(titleLink || links[0] || '', 'href') || meta?.url;
    const source = lazadaProductUrl(href, market);
    if (!source || source.itemId !== itemId) continue;
    const url = source.url;
    const imageTags = [...card.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    const imageUrl = extractImageUrl([
      ...imageTags.map((tag) => attribute(tag, 'src')),
      ...imageTags.map((tag) => attribute(tag, 'data-src')),
      ...imageTags.map((tag) => attribute(tag, 'data-ks-lazyload')),
      meta?.imageUrl,
    ], url);

    const priceElement = [...card.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)]
      .find((match) => (attribute(match[1], 'class') || '').split(/\s+/).includes('ooOxS'));
    const priceText = visibleText(priceElement?.[2] || '');
    if (priceElement && /<span\b/i.test(priceElement[2])) continue;
    const price = salePrice(priceText, market);
    if (price === null) continue;

    const location = card.match(/<span class="oa6ri[^"]*"[^>]*\btitle="([^"]+)"/)?.[1];
    const official = /\bLazMall\b/i.test(card);

    listings.push({
      platform: 'lazada',
      market,
      itemId,
      title,
      url,
      ...(imageUrl ? { imageUrl } : {}),
      price,
      currency: marketConfig.currency,
      shippingFee: extractShippingFee(card, marketConfig.decimals),
      discount: extractFixedDiscount(card, marketConfig.decimals),
      rating: meta?.rating,
      reviews: meta?.reviews,
      seller: 'Lazada',
      location: location ? decodeEntities(location) : undefined,
      isOfficial: official,
      inStock: !/\b(?:out of stock|sold out|pre[- ]?order|unavailable)\b|已售罄|无货/i.test(visibleText(card)),
    });
    seen.add(itemId);
  }

  // A structured stock declaration is stronger than a DOM card merely being listed.
  const byId = new Map(listings.map((listing) => [listing.itemId, listing]));
  for (const listing of structured) {
    const card = byId.get(listing.itemId);
    byId.set(listing.itemId, {
      ...card,
      ...listing,
      ...(listing.imageUrl ?? card?.imageUrl ? { imageUrl: listing.imageUrl ?? card?.imageUrl } : {}),
    });
  }
  return [...byId.values()];
}

function verifyEmptySearchPage(html: string): void {
  // A successful transport can still contain a challenge or a JS-only shell.
  // Only visible, explicit empty-search copy is evidence of a completed empty search.
  const visible = decodeEntities(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
  if (/captcha|verify\s+(?:that\s+)?you\s+are\s+(?:a\s+)?human|security\s+(?:check|verification)|access\s+denied|slide\s+to\s+verify|unusual\s+traffic|验证码|安全验证|滑动验证/i.test(visible)
    || /(?:id|class)\s*=\s*["'][^"']*(?:captcha|nc-container|nc_wrapper)/i.test(html)) {
    throw new BrightDataError('Lazada 返回了访问验证页面，尚未取得商品搜索结果', { code: 'SOURCE_PAGE_BLOCKED' });
  }
  const explicitlyEmpty = /\bno\s+(?:matching\s+)?(?:products?|items?|results?)\s+(?:found|available|for\b)|\b(?:0|zero)\s+(?:products?|items?|results?)\s+found\b|\b(?:couldn['’]?t|could\s+not|didn['’]?t|did\s+not)\s+find\s+(?:any\s+)?(?:products?|items?|results?)\b|没有找到(?:相关|匹配|任何)?商品|未找到(?:相关|匹配|任何)?商品|无相关商品/i.test(visible);
  if (!explicitlyEmpty) {
    throw new BrightDataError('Lazada 搜索页未能解析出可验证的商品结果，可能需要页面渲染或适配更新', { code: 'SOURCE_PARSE_FAILED' });
  }
}

export async function searchLazada(
  market: MarketCode,
  query: string,
  dependencies: { fetchHtml?: typeof fetchHtml; transport?: 'api' | 'proxy' } = {},
): Promise<RawListing[]> {
  const url = lazadaSearchUrl(market, query);
  const transport = dependencies.transport ?? (config.brightData.apiToken && config.brightData.zone ? 'api' : config.brightData.transport);
  const request = dependencies.fetchHtml ?? fetchHtml;
  // A normal HTTP success can still be a partially rendered page. Retry just
  // once with documented browser rendering, without multiplying inner retries.
  for (let attempt = 0; attempt < (transport === 'api' ? 2 : 1); attempt += 1) {
    try {
      const html = await request(url, { transport, retries: 0, timeoutMs: 90_000, ...(attempt ? { render: true } : {}) });
      const listings = parseLazadaSearch(html, market);
      if (!listings.length) {
        console.warn(`[crawler] lazada page unreadable-or-empty: chars=${html.length} rendered=${attempt > 0}`);
        verifyEmptySearchPage(html);
      }
      console.log(`[crawler] lazada ${market} "${query.slice(0, 60)}" -> ${listings.length} listings`);
      return listings;
    } catch (error) {
      const retryable = error instanceof BrightDataError
        ? !['IP_BLOCKED', 'PROXY_AUTH_FAILED', 'SOURCE_PAGE_BLOCKED'].includes(error.code)
          && (error.code === 'SOURCE_PARSE_FAILED' || error.code === 'EMPTY_RESPONSE' || (error.status !== undefined && error.status >= 500))
        : error instanceof Error && ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name);
      if (attempt || transport !== 'api' || !retryable) throw error;
      console.warn('[crawler] lazada retrying once with JavaScript rendering');
    }
  }
  throw new BrightDataError('Lazada 搜索未完成', { code: 'SOURCE_PARSE_FAILED' });
}

export const lazadaAdapter: PlatformAdapter = {
  id: 'lazada',
  search: searchLazada,
};
