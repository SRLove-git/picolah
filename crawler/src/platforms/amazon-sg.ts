import { BrightDataError, fetchHtml } from '../brightdata/web-unlocker.ts';
import { extractImageUrl } from '../image-url.ts';
import type { MarketCode } from '../markets.ts';
import type { RawListing } from '../types.ts';
import type { PlatformAdapter } from './types.ts';

export function amazonSearchUrl(query: string): string {
  return `https://www.amazon.sg/s?k=${encodeURIComponent(query)}`;
}

export function decodeAmazonHtml(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (entity, hex: string | undefined, decimal: string | undefined) => {
      const point = Number.parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

function attribute(block: string, pattern: RegExp): string {
  return decodeAmazonHtml(block.match(pattern)?.[1] ?? '');
}

function extractAmazonShipping(block: string): number | undefined {
  if (/free\s+(?:delivery|shipping)/i.test(block)) return 0;
  const match = block.match(/(?:S\$|SGD)\s?([\d.,]+)\s*(?:delivery|shipping)/i);
  return match ? Number(match[1].replace(/,/g, '')) : undefined;
}

function extractAmazonDiscount(block: string): number | undefined {
  const match = block.match(/(?:save|coupon)[^<]{0,80}?(?:S\$|SGD)\s?([\d.,]+)/i)
    ?? block.match(/(?:S\$|SGD)\s?([\d.,]+)\s*(?:coupon|off)/i);
  return match ? Number(match[1].replace(/,/g, '')) : undefined;
}

/** Parse only complete, priced Amazon search cards; matching happens centrally. */
export function parseAmazonSearch(html: string): RawListing[] {
  const starts = [...html.matchAll(/<div\b[^>]*\brole="listitem"[^>]*\bdata-asin="([A-Z0-9]{10})"[^>]*>/gi)];
  const listings: RawListing[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const itemId = match[1].toUpperCase();
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? html.length;
    const block = html.slice(start, end);
    const title = attribute(block, /<h2\b[^>]*\baria-label="([^"]+)"/i)
      || attribute(block, /<img\b[^>]*\balt="([^"]+)"/i);
    const priceText = attribute(
      block,
      /data-cy="price-recipe"[\s\S]{0,4000}?<span\b[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>([^<]+)<\/span>/i,
    );
    const price = Number(priceText.replace(/[^\d.]/g, ''));
    const ratingText = attribute(block, /aria-label="([\d.]+) out of 5 stars(?:, [^"]*)?"/i);
    const reviewsText = attribute(block, /aria-label="([\d,]+) ratings?"/i).replace(/,/g, '');
    const rating = ratingText ? Number(ratingText) : undefined;
    const reviews = reviewsText ? Number(reviewsText) : undefined;
    if (!title || !Number.isFinite(price) || price <= 0) continue;

    const shippingFee = extractAmazonShipping(block);
    const discount = extractAmazonDiscount(block);
    const imageUrl = extractImageUrl([...block.matchAll(/<img\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => /\bclass\s*=\s*["'][^"']*\bs-image\b/i.test(tag))
      .map((tag) => attribute(tag, /\bsrc\s*=\s*["']([^"']+)["']/i)));
    listings.push({
      platform: 'amazon-sg',
      market: 'SG',
      itemId,
      title,
      url: `https://www.amazon.sg/dp/${itemId}`,
      ...(imageUrl ? { imageUrl } : {}),
      price,
      currency: 'SGD',
      ...(shippingFee !== undefined ? { shippingFee } : {}),
      ...(discount !== undefined ? { discount } : {}),
      ...(rating !== undefined && Number.isFinite(rating) && rating >= 0 && rating <= 5 ? { rating } : {}),
      ...(reviews !== undefined && Number.isSafeInteger(reviews) && reviews >= 0 ? { reviews } : {}),
      seller: 'Amazon SG',
      inStock: !/currently unavailable|temporarily out of stock/i.test(block),
    });
  }
  return listings;
}

function pageContent(html: string): { markup: string; visible: string } {
  const markup = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<([a-z][\w-]*)\b[^>]*(?:\shidden(?=\s|=|>)|\saria-hidden\s*=\s*["']true["']|\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["'])[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  return { markup, visible: decodeAmazonHtml(markup.replace(/<[^>]+>/g, ' ')) };
}

function assertNotBlocked(markup: string, visible: string): void {
  if (/\brobot\s+check\b|\bcaptcha\b|verify\s+(?:that\s+)?you\s+are\s+(?:a\s+)?human|(?:enter|type)\s+the\s+characters\s+you\s+see|make\s+sure\s+you['’]?re\s+not\s+a\s+robot|automated\s+access\s+to\s+amazon|\baccess\s+denied\b|\bunusual\s+traffic\b|验证码|安全验证/i.test(visible)
    || /(?:id|name)\s*=\s*["'](?:captchacharacters|captcha|cvf_captcha_input)["']|\/errors\/validateCaptcha/i.test(markup)) {
    throw new BrightDataError('Amazon 返回了访问验证页面，尚未取得商品搜索结果', { code: 'SOURCE_PAGE_BLOCKED' });
  }
}

function assertExplicitlyEmpty(visible: string): void {
  if (!/\bno\s+(?:matching\s+)?(?:results?|products?|items?)\s+(?:for\b|found\b|available\b)|\b(?:0|zero)\s+(?:results?|products?|items?)\s+(?:for\b|found\b)|\b(?:couldn['’]?t|could\s+not|didn['’]?t|did\s+not)\s+find\s+(?:any\s+)?(?:results?|products?|items?)\b|没有找到(?:相关|匹配|任何)?商品|未找到(?:相关|匹配|任何)?商品/i.test(visible)) {
    throw new BrightDataError('Amazon 搜索页未能解析出可验证的商品结果，可能是页面未完成或结构已变更', { code: 'SOURCE_PAGE_UNREADABLE' });
  }
}

export async function searchAmazonSg(
  market: MarketCode,
  query: string,
  dependencies: { fetchHtml?: typeof fetchHtml } = {},
): Promise<RawListing[]> {
  if (market !== 'SG') throw new Error(`Amazon SG 不支持市场 ${market}`);
  const html = await (dependencies.fetchHtml ?? fetchHtml)(amazonSearchUrl(query), { country: 'SG', timeoutMs: 90_000, retries: 0 });
  const { markup, visible } = pageContent(html);
  assertNotBlocked(markup, visible);
  const listings = parseAmazonSearch(markup);
  if (!listings.length) assertExplicitlyEmpty(visible);
  console.log(`[crawler] amazon-sg SG "${query.slice(0, 60)}" -> ${listings.length} listings`);
  return listings;
}

export const amazonSgAdapter: PlatformAdapter = {
  id: 'amazon-sg',
  search: searchAmazonSg,
};
