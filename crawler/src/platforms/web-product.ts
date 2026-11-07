import { createHash } from 'node:crypto';
import { MARKETS, type MarketCode } from '../markets.ts';
import { safeWebUrl } from '../safe-web-url.ts';
import { extractImageUrl } from '../image-url.ts';
import type { WebListing } from '../types.ts';
import { currencyDigits } from '../currencies.ts';
import { commercePageProduct } from '../product-page-state.ts';
import { broadHtmlPrices, retailPricePage, nonPurchasePageHtml } from '../product-page-prices.ts';
import { lazadaTrackingPrice } from './marketplace-prices.ts';
import { marketplacePage } from '../marketplace-search.ts';
import { parseAmazonProduct } from './amazon-product.ts';

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
      if (selectedOption.test(key)
        && page.searchParams.get(key) !== url.searchParams.get(key)) return null;
    }
    return url;
  } catch { return null; }
}

function parseProduct(product: RecordValue, page: URL, canonical: URL, market: MarketCode, geography?: 'global', state?: RecordValue | null): WebListing | null {
  if (types(product['@type']).includes('ProductGroup') || product.hasVariant !== undefined
    || product.priceRange !== undefined || Array.isArray(product.name) || Array.isArray(product.sku)) return null;
  const name = text(product.name, 1000);
  const brand = text(record(product.brand)?.name, 120) ?? text(product.brand, 120);
  // Some stores publish name="17" and brand="Xiaomi" separately. Keep the
  // explicit brand attached in the displayed identity as well as in matching.
  const title = name && brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name;
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  if (!title || offers.length !== 1) return null;
  const offer = record(offers[0]);
  if (!offer || !types(offer['@type']).includes('Offer') || types(offer['@type']).includes('AggregateOffer')
    || offer.lowPrice !== undefined || offer.highPrice !== undefined || offer.priceRange !== undefined
    || offer.priceSpecification !== undefined) return null;
  for (const condition of [product.itemCondition, offer.itemCondition]) {
    if (condition !== undefined && (typeof condition !== 'string'
      || condition.replace(/^https?:\/\/schema\.org\//i, '') !== 'NewCondition')) return null;
  }
  if (offer.priceValidUntil !== undefined) {
    const expiry = offer.priceValidUntil;
    const dateOnly = typeof expiry === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiry);
    const dateTime = typeof expiry === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(expiry);
    const zoned = dateTime && /(?:Z|[+-]\d{2}:\d{2})$/.test(expiry as string);
    // For a timezone-less timestamp, use the earliest possible instant (UTC+14).
    // This can reject a nearly-expired quote but cannot extend its validity.
    const until = dateOnly ? Date.parse(`${expiry}T23:59:59.999Z`)
      : dateTime ? Date.parse(zoned ? expiry as string : `${expiry}Z`) - (zoned ? 0 : 14 * 3600_000) : NaN;
    if (!Number.isFinite(until) || until < Date.now()) return null;
  }
  const price = number(offer.price);
  const currency = text(offer.priceCurrency, 3)?.toUpperCase();
  const digits = currency ? currencyDigits(currency) : null;
  const factor = 10 ** (digits ?? 2);
  if (price === undefined || price <= 0 || price >= 1e12 || !currency || digits === null || (geography !== 'global' && currency !== MARKETS[market].currency)
    || Math.abs(price * factor - Math.round(price * factor)) > 1e-6) return null;
  let availability = typeof offer.availability === 'string' ? offer.availability.replace(/^https?:\/\/schema\.org\//i, '') : '';
  if (state) {
    const statePrice = record(state.price);
    const stock = record(state.stock);
    // Both state and JSON-LD must identify the same SKU, URL and current price.
    if (typeof product.sku !== 'string' || state.code !== product.sku || !boundUrl(state.url, page)
      || statePrice?.currencyIso !== currency || number(statePrice?.value) !== price
      || statePrice?.priceType !== 'BUY' || state.purchasable !== true
      || state.notSellable === true || state.preOrder === true || stock?.stockLevelStatus !== 'inStock'
      || (stock.stockLevel !== undefined && !(Number(stock.stockLevel) > 0))) return null;
    if (!availability) availability = 'InStock';
  }
  if (!['InStock', 'LimitedAvailability'].includes(availability)) return null;
  // Some merchant JSON-LD encodes an absent offer URL as {}. Accept it only
  // when the product's explicit identity binds the single offer to this page.
  const emptyOfferUrl = record(offer.url) && Object.keys(offer.url as RecordValue).length === 0;
  const offerUrl = emptyOfferUrl && typeof product['@id'] === 'string' && boundUrl(product['@id'], page)
    ? undefined : offer.url;
  if (!boundUrl(product.url, page) || !boundUrl(offerUrl, page)) return null;

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
  const model = text(product.model, 120);
  const description = typeof product.description === 'string'
    ? text(product.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000), 1000) : undefined;
  const productDetails = { ...(brand ? { brand } : {}), ...(model ? { model } : {}), ...(description ? { description } : {}) };
  return {
    platform: 'web', sourceHost: host, market, itemId: createHash('sha256').update(url).digest('hex'),
    title, url, price, currency, inStock: true, seller,
    ...(imageUrl ? { imageUrl } : {}),
    ...(rating !== undefined ? { rating } : {}), ...(reviews !== undefined ? { reviews } : {}),
    ...(Object.keys(productDetails).length ? { productDetails } : {}),
  };
}

/** Extract only a single current product's explicit JSON-LD price; never search snippets. */
function parseStrictWebProduct(html: string, pageUrl: string, market: MarketCode, geography?: 'global'): WebListing[] {
  const page = safeWebUrl(pageUrl);
  if (!page || !Object.hasOwn(MARKETS, market) || html.length > 8_000_000) return [];
  if (/^(?:www\.)?amazon\.(?:com|sg|co\.uk)$/.test(page.hostname) && /\/(?:dp|gp\/product|gp\/aw\/d)\//.test(page.pathname)) return parseAmazonProduct(html, page, market, geography);
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
  const state = commercePageProduct(cleanHtml, canonical.href);
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
    const listing = parseProduct(product, page, canonical, market, geography, state);
    if (!listing || (found && JSON.stringify(found) !== JSON.stringify(listing))) return [];
    found = listing;
  }
  return found ? [found] : [];
}

const selectedOption = /^(?:variant|sku|sku_id|skuid|product_id|productid|item_id|itemid|id|size|color|colour|capacity)$/i;

function applyVisibleStartingPrice(rows: WebListing[], html: string, pageUrl: string): WebListing[] {
  const [row] = rows;
  if (rows.length !== 1 || row.priceQuote?.variant || (row.priceQuote && row.priceQuote.kind !== 'exact')
    || [...new URL(pageUrl).searchParams.keys()].some(key => selectedOption.test(key)) || !/<h1\b/i.test(html)) return rows;

  // Structured offers can omit a qualifier printed beside the main product name.
  const visible = html.replace(/<!--[\s\S]*?-->|<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const headings = [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)];
  if (headings.length !== 1) return rows;
  const [heading] = headings;
  const plain = (value: string) => decodeAttribute(value.replace(/<[^>]*>/g, ' ')).replace(/&nbsp;|\s+/gi, ' ').trim();
  const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!(' '+words(plain(heading[1]))+' ').includes(' '+words(row.title)+' ')) return rows;
  const after = visible.slice(heading.index! + heading[0].length, heading.index! + heading[0].length + 4096);
  const label = plain(after.split(/<h[1-6]\b/i, 1)[0]).match(
    /^(?:from\s+|starting\s+at\s+|起价\s*[:：]?\s*)([A-Z]{3}|(?:S|US|HK|A|NZ|CA)?\$|£|€)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?![\d.,])/i);
  if (!label || Number(label[2].replace(/,/g, '')) !== row.price) return rows;
  const currencies: Record<string, string[]> = {
    '$': ['SGD','USD','HKD','AUD','NZD','CAD'], 'S$': ['SGD'], 'US$': ['USD'], 'HK$': ['HKD'],
    'A$': ['AUD'], 'NZ$': ['NZD'], 'CA$': ['CAD'], '£': ['GBP'], '€': ['EUR'],
  };
  const code = label[1].toUpperCase();
  if (!(currencies[code] ?? [code]).includes(row.currency)) return rows;
  return [{ ...row, priceQuote: { availability: row.inStock ? 'in-stock' : 'unknown', source: 'html', ...row.priceQuote, kind: 'from' } }];
}

export function parseWebProduct(html: string, pageUrl: string, market: MarketCode, geography?: 'global'): WebListing[] {
  if (!retailPricePage(pageUrl) || nonPurchasePageHtml(html)) return [];
  if (html.includes('pdpTrackingData') && marketplacePage(pageUrl, market, 'lazada')) return lazadaTrackingPrice(html, pageUrl, market);
  const strict = parseStrictWebProduct(html, pageUrl, market, geography);
  const rows = strict.length ? strict : broadHtmlPrices(html, pageUrl, market, geography);
  return applyVisibleStartingPrice(rows, html, pageUrl);
}
