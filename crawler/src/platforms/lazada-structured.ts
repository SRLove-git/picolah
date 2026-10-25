import { MARKETS, type MarketCode } from '../markets.ts';
import type { RawListing } from '../types.ts';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function schemaTypes(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/^https?:\/\/schema\.org\//i, ''));
}

function number(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const result = value.trim();
  return result.length && result.length <= limit ? result : undefined;
}

export function lazadaProductUrl(value: unknown, market: MarketCode): { url: string; itemId: string; skuId?: string } | null {
  const raw = text(value, 2000);
  const domain = MARKETS[market].domains.lazada;
  if (!raw || !domain) return null;
  try {
    const url = new URL(raw.replace(/&amp;/g, '&'), `https://${domain}`);
    const host = domain.replace(/^www\./, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || (url.hostname !== host && !url.hostname.endsWith(`.${host}`))) return null;
    // The item id is derived from the actual Lazada product URL, never from a
    // model/brand SKU or an unrelated structured-data identifier.
    const id = url.pathname.match(/^\/products\/[^/]*\bi(\d+)(?:-s(\d+))?\.html$/i)
      ?? url.pathname.match(/^\/products\/i(\d+)(?:-s(\d+))?\.html$/i);
    if (!id) return null;
    url.hash = '';
    return { url: url.href, itemId: id[1], skuId: id[2] };
  } catch { return null; }
}

function stock(value: unknown): boolean | undefined {
  if (typeof value !== 'string') return undefined;
  const availability = value.replace(/^https?:\/\/schema\.org\//i, '');
  if (availability === 'InStock' || availability === 'LimitedAvailability') return true;
  if (['OutOfStock', 'SoldOut', 'Discontinued', 'PreOrder', 'PreSale', 'BackOrder'].includes(availability)) return false;
  return undefined;
}

function parseProduct(product: RecordValue, market: MarketCode): RawListing | null {
  const types = schemaTypes(product['@type']);
  if (!types.includes('Product') || types.includes('ProductGroup')) return null;
  const title = text(product.name, 1000);
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  if (!title || offers.length !== 1) return null;
  const offer = record(offers[0]);
  const offerTypes = schemaTypes(offer?.['@type']);
  if (!offer || !offerTypes.includes('Offer') || offerTypes.includes('AggregateOffer')) return null;
  if (offer.lowPrice !== undefined || offer.highPrice !== undefined || offer.priceRange !== undefined || product.priceRange !== undefined) return null;

  const price = number(offer.price);
  const currency = text(offer.priceCurrency, 3)?.toUpperCase();
  if (price === undefined || price <= 0 || price >= 1e12 || currency !== MARKETS[market].currency) return null;
  const factor = 10 ** MARKETS[market].decimals;
  if (Math.abs(price * factor - Math.round(price * factor)) > 1e-6) return null;

  const direct = lazadaProductUrl(product.url, market);
  const offered = lazadaProductUrl(offer.url, market);
  // An explicitly supplied invalid/cross-market URL must not be masked by the other URL.
  if ((product.url !== undefined && !direct) || (offer.url !== undefined && !offered)) return null;
  const url = offered ?? direct;
  if (!url || (direct && offered && (direct.itemId !== offered.itemId
    || (direct.skuId && offered.skuId && direct.skuId !== offered.skuId)))) return null;
  // RawListing has no unknown-stock state: omit unknown availability instead of
  // manufacturing an in-stock claim from a price alone.
  const inStock = stock(offer.availability);
  if (inStock === undefined) return null;

  const aggregate = record(product.aggregateRating);
  const scale = aggregate?.bestRating === undefined ? 5 : number(aggregate.bestRating);
  const rawRating = number(aggregate?.ratingValue);
  const rating = scale === 5 && rawRating !== undefined && rawRating >= 0 && rawRating <= 5 ? rawRating : undefined;
  // ratingCount counts ratings, not necessarily written reviews.
  const reviewCount = number(aggregate?.reviewCount);
  const reviews = reviewCount !== undefined && Number.isInteger(reviewCount) && reviewCount >= 0 && reviewCount <= 1e8 ? reviewCount : undefined;
  const seller = text(record(offer.seller)?.name, 120);
  return {
    platform: 'lazada', market, itemId: url.itemId, title, url: url.url, price, currency, inStock,
    ...(rating !== undefined ? { rating } : {}),
    ...(reviews !== undefined ? { reviews } : {}),
    ...(seller ? { seller } : {}),
  };
}

/** Parse JSON-LD as data only. No eval/JS execution or guessed hydration keys. */
export function parseLazadaStructured(html: string, market: MarketCode): RawListing[] {
  if (!Object.hasOwn(MARKETS, market)) return [];
  const found = new Map<string, RawListing>();
  const conflicting = new Set<string>();
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\btype\s*=\s*(["'])application\/ld\+json\1/i.test(script[1])) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(script[2]); } catch { continue; }
    const queue: unknown[] = [parsed];
    for (let index = 0; index < queue.length && index < 20_000; index += 1) {
      const current = queue[index];
      if (Array.isArray(current)) { queue.push(...current); continue; }
      const node = record(current);
      if (!node) continue;
      const listing = parseProduct(node, market);
      if (listing) {
        const previous = found.get(listing.itemId);
        if (previous && (previous.price !== listing.price || previous.title !== listing.title
          || previous.url !== listing.url || previous.inStock !== listing.inStock)) {
          conflicting.add(listing.itemId);
        }
        if (!previous) found.set(listing.itemId, listing);
      }
      for (const child of Object.values(node)) if (child && typeof child === 'object') queue.push(child);
    }
  }
  return [...found.values()].filter((listing) => !conflicting.has(listing.itemId));
}
