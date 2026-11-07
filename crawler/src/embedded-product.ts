import { safeWebUrl } from './safe-web-url.ts';

// Read actual attributes so quoted, unquoted and reordered merchant markup work
// identically. Ignore words that merely appear inside another attribute's value.
export function attributes(tag: string): Map<string, string> {
  const fields = new Map<string, string>();
  const body = tag.replace(/^<[a-z][\w:-]*|\/?>$/gi, '');
  for (const match of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const key = match[1].toLowerCase();
    if (!fields.has(key)) fields.set(key, (match[2] ?? match[3] ?? match[4] ?? '').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"'));
  }
  return fields;
}
function schemaType(fields: Map<string, string>): string | undefined {
  if (!fields.has('itemscope')) return;
  return fields.get('itemtype')?.match(/^https?:\/\/schema\.org\/(\w+)\/?$/i)?.[1];
}

/** Read sibling meta elements only. A nested review or another product cannot
 * supply fields for the current Product or Offer. */
function metaFields(content: string, start: number) {
  const values: Record<string, string> = Object.create(null);
  const meta = /\s*(<meta\b[^<>]*>)/iy;
  meta.lastIndex = start;
  let end = start;
  for (let match = meta.exec(content); match; match = meta.exec(content)) {
    const fields = attributes(match[1]);
    const key = fields.get('itemprop'), value = fields.get('content');
    if (key && value) {
      if (key in values && values[key] !== value) return;
      values[key] = value;
    }
    end = meta.lastIndex;
  }
  return { values, end };
}

const nonProductTypes = new Set(['ItemList', 'CollectionPage', 'Article', 'NewsArticle', 'ProductGroup', 'AggregateOffer']);
const plain = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

export function microdataProduct(html: string, matchesPage: (value: string) => boolean) {
  if (!/schema\.org\/Product\b/i.test(html)) return;
  const content = html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const headings = [...content.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (headings.length !== 1) return;
  let start: number | undefined;
  let offerCount = 0;
  for (const match of content.matchAll(/<[a-z][\w:-]*\b[^<>]*>/gi)) {
    if (!/\b(?:itemscope|canonical)\b/i.test(match[0])) continue;
    const fields = attributes(match[0]);
    const type = schemaType(fields);
    if (type === 'Product') {
      if (start !== undefined) return;
      start = match.index + match[0].length;
    }
    if (type === 'Offer') offerCount++;
    if (type && nonProductTypes.has(type)) return;
    if (/^<link\b/i.test(match[0]) && fields.get('rel')?.toLowerCase().split(/\s+/).includes('canonical')) {
      const href = fields.get('href');
      if (!href || !matchesPage(href)) return;
    }
  }
  if (start === undefined || offerCount !== 1) return;
  const product = metaFields(content, start);
  if (!product?.values.name || plain(product.values.name) !== plain(headings[0][1])) return;
  const next = /^\s*(<([a-z][\w:-]*)\b[^<>]*>)/i.exec(content.slice(product.end));
  if (!next) return;
  const fields = attributes(next[1]);
  if (schemaType(fields) !== 'Offer' || fields.get('itemprop') !== 'offers') return;
  const offer = metaFields(content, product.end + next[0].length);
  if (!offer?.values.url || !matchesPage(offer.values.url) || !offer.values.price || !offer.values.priceCurrency ||
      !content.slice(offer.end).trimStart().toLowerCase().startsWith('</' + next[2].toLowerCase() + '>')) return;
  return { ...product.values, '@type': 'Product', offers: { ...offer.values, '@type': 'Offer' } };
}

type Data = Record<string, unknown>;
const object = (v: unknown): v is Data => typeof v === 'object' && v !== null && !Array.isArray(v);
const centCurrencies = new Set(['SGD', 'MYR', 'THB', 'PHP', 'USD', 'EUR', 'GBP', 'AUD', 'CAD']);

function variantUrl(value: unknown, base: URL, id: string): URL | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = safeWebUrl(/^https?:/i.test(value) ? value : new URL(value, base).href);
    if (!url) return;
    const canonical = new URL(url);
    const variants = canonical.searchParams.getAll('variant');
    canonical.searchParams.delete('variant');
    if (variants.length === 1 && variants[0] === id && canonical.href === base.href) return url;
  } catch { /* Unusable merchant URL. */ }
}

/** Join Shopify's selected option to its own structured Offer. Other sizes,
 * kits or adjacent product widgets cannot donate their prices to this option. */
export function selectedShopifyOffer(html: string, product: Data, page: URL) {
  if (!/\/products\/[^/]+\/?$/i.test(page.pathname) || typeof product.url !== 'string' || typeof product.name !== 'string') return;
  const scripts = [...html.matchAll(/<script\b[^>]*\bdata-selected-variant\b[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1 || scripts[0][1].length > 64_000) return;
  const attrs = attributes(scripts[0][0].slice(0, scripts[0][0].indexOf('>') + 1));
  if (!attrs.has('data-selected-variant') || attrs.get('type') !== 'application/json') return;
  let v: unknown;
  try { v = JSON.parse(scripts[0][1]); } catch { return; }
  if (!object(v) || !Number.isSafeInteger(v.id) || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 200 ||
      typeof v.sku !== 'string' || !v.sku.trim() || !Number.isSafeInteger(v.price) || typeof v.available !== 'boolean') return;
  const base = new URL(page);
  base.searchParams.delete('variant');
  try { if (new URL(product.url, page).href !== base.href) return; } catch { return; }
  const id = String(v.id), requested = page.searchParams.get('variant');
  if (requested && requested !== id) return;
  const offers = (Array.isArray(product.offers) ? product.offers : [product.offers]).filter(object);
  const selected = offers.filter(o => o['@type'] === 'Offer' && o.sku === v.sku && variantUrl(o.url, base, id));
  if (selected.length !== 1) return;
  const offer = selected[0];
  if (offer.priceSpecification !== undefined || offer.highPrice !== undefined || offer.lowPrice !== undefined) return;
  const amount = Number(offer.price);
  if (!(amount > 0) || Math.abs(amount * 100 - Number(v.price)) > 1e-6 || !centCurrencies.has(String(offer.priceCurrency))) return;
  if (typeof offer.availability === 'string' && (/InStock$/i.test(offer.availability) && !v.available ||
      /OutOfStock$/i.test(offer.availability) && v.available)) return;
  const url = new URL(String(offer.url), page);
  return { url, sku: v.sku, product: { ...product, name: product.name + ' - ' + v.title, url: url.href, sku: v.sku, offers: [offer] } };
}
