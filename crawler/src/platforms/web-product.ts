import { createHash } from 'node:crypto';
import { MARKETS, type MarketCode } from '../markets.ts';
import { safeWebUrl } from '../safe-web-url.ts';
import { extractImageUrl } from '../image-url.ts';
import type { WebListing } from '../types.ts';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
const types = (value: unknown): string[] => (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === 'string').map((item) => item.replace(/^https?:\/\/schema\.org\//i, ''));

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= limit && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function decodeAttribute(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (raw, hex: string | undefined, decimal: string | undefined) => {
    const point = parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : raw;
  }).replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? decodeAttribute(match[1] ?? match[2] ?? match[3]) : undefined;
}

const sourceHost = (url: URL): string => url.hostname.replace(/^www\./, '');

function boundUrl(raw: unknown, page: URL): URL | null {
  if (raw === undefined) return page;
  const value = text(raw, 4000);
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !safeWebUrl(value)) return null;
    if (value.startsWith('//') && !safeWebUrl(`https:${value}`)) return null;
    const url = safeWebUrl(new URL(value, page).href);
    if (!url || sourceHost(url) !== sourceHost(page) || url.pathname !== page.pathname) return null;
    // A URL may omit tracking parameters, but must not select a different variant.
    for (const key of new Set([...page.searchParams.keys(), ...url.searchParams.keys()])) {
      if (/^(?:variant|sku|sku_id|skuid|product_id|productid|item_id|itemid|id|size|color|colour|capacity)$/i.test(key)
        && page.searchParams.get(key) !== url.searchParams.get(key)) return null;
    }
    return url;
  } catch { return null; }
}

function parseProduct(product: RecordValue, page: URL, canonical: URL, market: MarketCode): WebListing | null {
  if (types(product['@type']).includes('ProductGroup') || product.hasVariant !== undefined
    || product.priceRange !== undefined || Array.isArray(product.name) || Array.isArray(product.sku)) return null;
  const title = text(product.name, 1000);
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  if (!title || offers.length !== 1) return null;
  const offer = record(offers[0]);
  if (!offer || !types(offer['@type']).includes('Offer') || types(offer['@type']).includes('AggregateOffer')
    || offer.lowPrice !== undefined || offer.highPrice !== undefined || offer.priceRange !== undefined
    || offer.priceSpecification !== undefined) return null;
  const price = number(offer.price);
  const currency = text(offer.priceCurrency, 3)?.toUpperCase();
  const factor = 10 ** MARKETS[market].decimals;
  if (price === undefined || price <= 0 || price >= 1e12 || currency !== MARKETS[market].currency
    || Math.abs(price * factor - Math.round(price * factor)) > 1e-6) return null;
  if (!['InStock', 'LimitedAvailability'].includes(typeof offer.availability === 'string'
    ? offer.availability.replace(/^https?:\/\/schema\.org\//i, '') : '')) return null;
  if (!boundUrl(product.url, page) || !boundUrl(offer.url, page)) return null;

  const aggregate = record(product.aggregateRating);
  const rawRating = number(aggregate?.ratingValue);
  const scale = aggregate?.bestRating === undefined ? 5 : number(aggregate.bestRating);
  const rating = scale === 5 && rawRating !== undefined && rawRating >= 0 && rawRating <= 5 ? rawRating : undefined;
  const rawReviews = number(aggregate?.reviewCount);
  const reviews = rawReviews !== undefined && Number.isInteger(rawReviews) && rawReviews >= 0 && rawReviews <= 1e8 ? rawReviews : undefined;
  const host = sourceHost(page);
  const seller = text(record(offer.seller)?.name, 120) ?? text(offer.seller, 120) ?? host;
  const url = canonical.href;
  const imageUrl = extractImageUrl(product.image, page.href);
  return {
    platform: 'web', sourceHost: host, market, itemId: createHash('sha256').update(url).digest('hex'),
    title, url, price, currency, inStock: true, seller,
    ...(imageUrl ? { imageUrl } : {}),
    ...(rating !== undefined ? { rating } : {}), ...(reviews !== undefined ? { reviews } : {}),
  };
}

/** Extract only a single current product's explicit JSON-LD price; never search snippets. */
export function parseWebProduct(html: string, pageUrl: string, market: MarketCode): WebListing[] {
  const page = safeWebUrl(pageUrl);
  if (!page || !Object.hasOwn(MARKETS, market) || html.length > 8_000_000) return [];
  const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const head = cleanHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  let canonical = page;
  let hasCanonical = false;
  for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
    if (!attribute(match[0], 'rel')?.split(/\s+/).some((rel) => rel.toLowerCase() === 'canonical')) continue;
    const raw = attribute(match[0], 'href');
    const url = raw ? boundUrl(raw, page) : null;
    if (!url || (hasCanonical && canonical.href !== url.href)) return [];
    canonical = url;
    hasCanonical = true;
  }
  const products: RecordValue[] = [];
  let visited = 0;
  for (const script of cleanHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attribute(script[1], 'type')?.toLowerCase() !== 'application/ld+json') continue;
    let parsed: unknown;
    try { parsed = JSON.parse(script[2]); } catch { continue; }
    const queue: unknown[] = [parsed];
    for (let index = 0; index < queue.length; index += 1) {
      visited += 1;
      if (visited > 20_000) return [];
      const current = queue[index];
      if (Array.isArray(current)) {
        if (current.length + queue.length > 20_000) return [];
        for (const child of current) queue.push(child);
        continue;
      }
      const node = record(current);
      if (!node) continue;
      const nodeTypes = types(node['@type']);
      if (nodeTypes.some((type) => ['ItemList', 'CollectionPage', 'ProductGroup'].includes(type))) return [];
      if (nodeTypes.includes('Product')) products.push(node);
      for (const child of Object.values(node)) if (child && typeof child === 'object') {
        if (queue.length >= 20_000) return [];
        queue.push(child);
      }
    }
  }
  let found: WebListing | undefined;
  const identities = new Map<string, string>();
  for (const product of products) {
    // Multiple variants can have identical titles and prices. Do not merge them
    // merely because their projected listing fields happen to look the same.
    for (const key of ['sku', 'gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14', 'mpn', 'productID']) {
      if (product[key] === undefined) continue;
      if (typeof product[key] !== 'string' && typeof product[key] !== 'number') return [];
      const identity = String(product[key]).trim();
      if (!identity || (identities.has(key) && identities.get(key) !== identity)) return [];
      identities.set(key, identity);
    }
    const listing = parseProduct(product, page, canonical, market);
    if (!listing || (found && JSON.stringify(found) !== JSON.stringify(listing))) return [];
    found = listing;
  }
  return found ? [found] : [];
}
