import { fetchHtml } from '../brightdata/web-unlocker.ts';
import type { MarketCode } from '../markets.ts';
import type { RawListing } from '../types.ts';
import type { PlatformAdapter } from './types.ts';

export function amazonSearchUrl(query: string): string {
  return `https://www.amazon.sg/s?k=${encodeURIComponent(query)}`;
}

export function decodeAmazonHtml(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
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
    const rating = Number(attribute(block, /aria-label="([\d.]+) out of 5 stars(?:, [^"]*)?"/i));
    const reviews = Number(attribute(block, /aria-label="([\d,]+) ratings?"/i).replace(/,/g, ''));
    if (!title || !Number.isFinite(price) || price <= 0) continue;

    const shippingFee = extractAmazonShipping(block);
    const discount = extractAmazonDiscount(block);
    listings.push({
      platform: 'amazon-sg',
      market: 'SG',
      itemId,
      title,
      url: `https://www.amazon.sg/dp/${itemId}`,
      price,
      currency: 'SGD',
      ...(shippingFee !== undefined ? { shippingFee } : {}),
      ...(discount !== undefined ? { discount } : {}),
      rating: Number.isFinite(rating) ? rating : undefined,
      reviews: Number.isFinite(reviews) ? reviews : undefined,
      seller: 'Amazon SG',
      inStock: !/currently unavailable|temporarily out of stock/i.test(block),
    });
  }
  return listings;
}

export async function searchAmazonSg(market: MarketCode, query: string): Promise<RawListing[]> {
  if (market !== 'SG') throw new Error(`Amazon SG 不支持市场 ${market}`);
  const html = await fetchHtml(amazonSearchUrl(query), { country: 'SG' });
  const listings = parseAmazonSearch(html);
  console.log(`[crawler] amazon-sg SG "${query.slice(0, 60)}" -> ${listings.length} listings`);
  return listings;
}

export const amazonSgAdapter: PlatformAdapter = {
  id: 'amazon-sg',
  search: searchAmazonSg,
};
