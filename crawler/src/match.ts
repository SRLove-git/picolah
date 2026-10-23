import type { CatalogProduct, RawListing } from './types.ts';

/** Listings that mention a model but are accessories, not the product itself. */
const ACCESSORY_PATTERNS = [
  /\bcase\b/,
  /\bcover\b/,
  /\bskin\b/,
  /\bsleeve\b/,
  /\bscreen protector\b/,
  /\btempered glass\b/,
  /\bcable\b/,
  /\bcharger\b/,
  /\badapter\b/,
  /\bstand\b/,
  /\bholder\b/,
  /\bmount\b/,
  /\bstrap\b/,
  /\bear ?tips?\b/,
  /\bear ?pads?\b/,
  /\breplacement\b/,
  /\bcompatible\b/,
  /\bsticker\b/,
  /\bdecal\b/,
  /^for\b/,
];

const GENERIC_WORDS = new Set([
  'the', 'and', 'with', 'for', 'wireless', 'bluetooth', 'headphone', 'headphones',
  'earphone', 'earphones', 'earbud', 'earbuds', 'speaker', 'smartphone', 'phone',
  'inch', 'gen', 'generation', 'series', 'edition', 'official', 'original', 'new',
  'latest', 'global', 'version', 'black', 'white',
]);

export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeCompact(text: string): string {
  return normalize(text).replace(/\s+/g, '');
}

/** Model-like tokens: anything containing a digit (wh1000xm5, v15, 2nd, 1000xm5). */
export function modelTokens(name: string): string[] {
  return normalize(name)
    .split(' ')
    .filter((token) => token.length >= 2 && /\d/.test(token) && !GENERIC_WORDS.has(token));
}

/**
 * Expand a model token into the strings a marketplace title may use:
 *   "wh1000xm5" -> wh1000xm5, 1000xm5, xm5
 */
export function modelVariants(name: string): string[] {
  const variants = new Set<string>();
  for (const token of modelTokens(name)) {
    variants.add(token);
    const withoutPrefix = token.replace(/^[a-z]+/, '');
    if (withoutPrefix.length >= 3) variants.add(withoutPrefix);
    const suffix = token.match(/[a-z]+\d*[a-z0-9]*$/)?.[0];
    if (suffix && suffix.length >= 3 && suffix !== token) variants.add(suffix);
    const trailing = token.match(/([a-z]+\d{2,}[a-z0-9]*)$/)?.[1];
    if (trailing) variants.add(trailing);
  }
  return [...variants];
}

export interface MatchResult {
  score: number;
  hitTokens: string[];
}

/**
 * Decide whether a search result is the tracked product.
 * Conservative on purpose: a wrong price is worse than a missing one.
 */
export function matchListing(product: CatalogProduct, listing: RawListing): MatchResult | null {
  const title = normalize(listing.title);
  if (!title) return null;
  if (ACCESSORY_PATTERNS.some((pattern) => pattern.test(title))) return null;

  const brandTokens = normalize(product.brand)
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token));
  if (brandTokens.length && !brandTokens.every((token) => title.includes(token))) return null;

  const variants = modelVariants(product.name);
  const hits = variants.filter((variant) => title.includes(variant));

  if (variants.length > 0 && hits.length === 0) return null;

  const distinctive = normalize(product.name)
    .split(' ')
    .filter((token) => token.length >= 4 && !GENERIC_WORDS.has(token));
  const distinctiveHits = distinctive.filter((token) => title.includes(token));

  // No model code in the catalog name: require brand + at least two name words.
  if (!variants.length && (!brandTokens.length || distinctiveHits.length < 2)) return null;

  if (!brandTokens.length && hits.length === 0) return null;

  const modelScore = variants.length ? hits.length / variants.length : 0;
  const wordScore = distinctive.length ? distinctiveHits.length / distinctive.length : 0;
  const ratingScore = Math.min(1, (listing.rating ?? 0) / 5);
  const reviewScore = Math.min(1, Math.log10((listing.reviews ?? 0) + 1) / 3);
  const score = modelScore * 0.55 + wordScore * 0.2 + ratingScore * 0.1 + reviewScore * 0.15;

  return { score, hitTokens: hits };
}

/**
 * Drop accessory-priced outliers when several candidates matched the same product.
 * Only applied with enough candidates to make a median meaningful.
 */
export function dropPriceOutliers(listings: RawListing[]): RawListing[] {
  if (listings.length < 4) return listings;
  const prices = listings.map((listing) => listing.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const floor = median * 0.35;
  return listings.filter((listing) => listing.price >= floor);
}

export function pickBestListing(
  product: CatalogProduct,
  listings: RawListing[],
): { listing: RawListing; match: MatchResult } | null {
  const candidates = dropPriceOutliers(listings);
  let best: { listing: RawListing; match: MatchResult } | null = null;
  for (const listing of candidates) {
    const match = matchListing(product, listing);
    if (!match) continue;
    if (!best || match.score > best.match.score) best = { listing, match };
  }
  return best;
}

/** Search query: brand + Latin model name, with Chinese marketing copy removed. */
export function buildQuery(product: CatalogProduct): string {
  const cleaned = product.name
    .replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return product.name;
  const brand = product.brand.trim();
  const withoutBrand = cleaned.toLowerCase().startsWith(brand.toLowerCase())
    ? cleaned.slice(brand.length).trim()
    : cleaned;
  return `${brand} ${withoutBrand}`.replace(/\s+/g, ' ').trim();
}
