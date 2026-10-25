import { MARKETS, type MarketCode, type PlatformId } from './markets.ts';
import type { DiscoveryListing } from './types.ts';
import { safeWebUrl } from './safe-web-url.ts';

export function normalizeSearchQuery(value: string): string {
  const query = value.normalize('NFKC').trim().replace(/ +/g, ' ');
  if (query.length < 2 || query.length > 120 || /[\p{Cc}\p{Cf}]/u.test(query)
    || /(?:https?:\/\/|www\.)/i.test(query) || !/[\p{L}\p{N}]/u.test(query)) {
    throw new Error('query 必须是 2–120 字符的商品搜索词，不能是网址');
  }
  return query;
}

/** Discovery is intentionally limited to one explicit model, not arbitrary search prose. */
export function normalizeDiscoveryModel(value: string): string {
  const model = value.normalize('NFKC').trim().toUpperCase();
  const compact = model.replace(/-/g, '');
  if (model.length > 40 || compact.length < 6 || !/^[A-Z]{2,}-?\d{3,}(?:[A-Z]+\d+)*$/.test(model)) {
    throw new Error('model 必须是单一完整型号，例如 WF-1000XM6');
  }
  return model;
}

const NON_PRODUCT = /\b(?:case|cover|skin|sleeve|protector|cable|charger|adapter|stand|holder|mount|strap|ear\s?(?:tips?|pads?|cushions?)|replacement|compatible|sticker|decal|replica|counterfeit|imitation|fake|copy|clones?|used|refurbished|renewed|pre[-\s]?(?:owned|loved)|second[-\s]?hand|broken|repair|parts?|dummy|open[-\s]box|left\s+only|right\s+only)\b|保护套|保护壳|耳塞套|耳罩|替换|配件|仿制|高仿|二手|翻新|维修|故障|仅包装|空盒|单耳|单只|充电仓|充电盒/i;

/** Use only after checking the mandatory full model and conflicting full codes. */
function removeModelAliases(title: string, compact: string): string {
  const generation = compact.match(/([A-Z]+\d+)$/)?.[1];
  const aliases = [...new Set([compact, compact.replace(/^[A-Z]+/, ''), ...(generation ? [generation] : [])])];
  const aliasPattern = aliases.map((alias) => alias.split('').join('[\\s-]*')).join('|');
  return title.replace(new RegExp(`(^|[^A-Z0-9])(?:${aliasPattern})(?=$|[^A-Z0-9])`, 'g'), '$1 ');
}

function exactTitle(model: string, rawTitle: string): boolean {
  const title = rawTitle.normalize('NFKC').toUpperCase();
  if (!title.trim() || NON_PRODUCT.test(title) || /\bFOR\b/.test(title)) return false;
  const compact = model.replace(/-/g, '');
  const fullModel = compact.split('').join('[\\s-]*');
  const match = new RegExp(`(^|[^A-Z0-9])(${fullModel})(?=$|[^A-Z0-9])`).exec(title);
  if (!match) return false;

  // Merchants often repeat one model as "WF1000XM6 | WF-1000XM6 |
  // 1000XM6 | XM6". The full code above is mandatory; only its exact suffixes
  // may be removed as aliases before looking for conflicting models.
  const generation = compact.match(/([A-Z]+\d+)$/)?.[1];
  // A listing advertising multiple models/variants cannot establish which variant its price buys.
  // Check full conflicts first: stripping 1000XM6 prematurely would hide WH-1000XM6.
  // Keep a non-word separator so removal cannot join a brand to a later alias
  // ("Sony WF1000XM6 1000XM6" must not become a fictional "Sony 1000XM6" code).
  const withoutFullModel = title.replace(new RegExp(`(^|[^A-Z0-9])(${fullModel})(?=$|[^A-Z0-9])`, 'g'), '$1#');
  if (/[A-Z]{2,}[-\s]*\d{3,}(?:[-\s]*[A-Z]+[-\s]*\d+)*/.test(withoutFullModel)) return false;
  const remaining = removeModelAliases(withoutFullModel, compact);
  // The dropped-prefix form must also agree: 1000XM5 and 2000XM6 are not aliases.
  if (/\b\d{3,}[-\s]*[A-Z]+[-\s]*\d+[A-Z0-9]*\b/.test(remaining)) return false;
  const tail = removeModelAliases(title.slice((match.index || 0) + match[0].length), compact);
  if (/^(?:\s*[/&|+]\s*)+(?:[A-Z]+[-\s]*)?\d/.test(tail)) return false;
  // Reject shortened alternative generations as well, e.g. WF-1000XM6 and XM5.
  if (generation) {
    const family = generation.match(/^[A-Z]+/)?.[0];
    for (const candidate of title.matchAll(new RegExp(`\\b${family}[-\\s]*\\d+\\b`, 'g'))) {
      if (candidate[0].replace(/[-\s]/g, '') !== generation) return false;
    }
  }
  return true;
}

export function exactDiscoveryListing(
  model: string,
  listing: DiscoveryListing,
  market: MarketCode,
  platform: PlatformId | 'web',
): boolean {
  try { model = normalizeDiscoveryModel(model); } catch { return false; }
  return validSourceListing(listing, market, platform) && exactTitle(model, listing.title);
}

export function validSourceListing(listing: DiscoveryListing, market: MarketCode, platform: PlatformId | 'web'): boolean {
  if (!(market in MARKETS) || listing.market !== market || listing.platform !== platform || listing.inStock !== true) return false;
  if (!Number.isFinite(listing.price) || listing.price <= 0 || listing.price > 1_000_000_000_000) return false;
  if (listing.currency !== MARKETS[market].currency || !listing.itemId?.trim() || listing.itemId.length > 150) return false;
  if (!listing.title?.trim() || listing.title.length > 1000 || NON_PRODUCT.test(listing.title) || /\bfor\b/i.test(listing.title)) return false;
  const domain = platform === 'web' ? undefined : MARKETS[market].domains[platform]?.replace(/^www\./, '');
  try {
    const url = new URL(listing.url);
    if (platform === 'web') {
      if (listing.platform !== 'web' || !safeWebUrl(listing.url) || listing.sourceHost !== url.hostname.replace(/^www\./, '')) return false;
    } else {
      if (!domain || url.protocol !== 'https:' || url.username || url.password || url.port) return false;
      if (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) return false;
    }
    if (listing.url.length > 2000) return false;
  } catch {
    return false;
  }
  for (const value of [listing.shippingFee, listing.discount]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1_000_000_000)) return false;
  }
  if (listing.price + (listing.shippingFee ?? 0) - (listing.discount ?? 0) <= 0) return false;
  if (listing.rating !== undefined && (!Number.isFinite(listing.rating) || listing.rating < 0 || listing.rating > 5)) return false;
  if (listing.reviews !== undefined && (!Number.isFinite(listing.reviews) || listing.reviews < 0 || listing.reviews > 100_000_000)) return false;
  return true;
}

function queryTokens(value: string): string[] {
  return value.normalize('NFKC').toLowerCase().match(/[a-z]+|\d+|[\p{L}]+/gu) ?? [];
}

export function queryMatchesListing(query: string, listing: DiscoveryListing, market: MarketCode, platform: PlatformId | 'web', model?: string): boolean {
  if (!validSourceListing(listing, market, platform)) return false;
  // The optional hint must not be required for exact-code safety.
  model ??= query.toUpperCase().match(/(?:^|[^A-Z0-9])([A-Z]{2,}-?\d{3,}(?:[A-Z]+\d+)*)(?=$|[^A-Z0-9])/)?.[1];
  if (model && !exactDiscoveryListing(model, listing, market, platform)) return false;
  const requested = queryTokens(query);
  const titleTokens = new Set(queryTokens(listing.title));
  if (!requested.length || !requested.every((token) => titleTokens.has(token))) return false;
  if (requested.some((token) => /^\d+$/.test(token))) {
    // The exact guard already verified aliases such as "XM6 | 1000XM6";
    // they are not a numeric/capacity choice like "128 / 256GB".
    const variantTitle = model
      ? removeModelAliases(listing.title.normalize('NFKC').toUpperCase(), model.replace(/-/g, '').toUpperCase())
      : listing.title;
    if (/\d+\s*[/|]\s*\d+/.test(variantTitle)) return false;
    const variants = ['pro', 'max', 'plus', 'mini', 'ultra', 'lite', 'se', 'air'];
    if (variants.some((variant) => titleTokens.has(variant) && !requested.includes(variant))) return false;
    const capacities = query.toLowerCase().match(/\d+\s*(?:gb|tb)\b/g)?.map((value) => value.replace(/\s/g, '')) ?? [];
    if (capacities.length) {
      const titleCapacities = listing.title.toLowerCase().match(/\d+\s*(?:gb|tb)\b/g)?.map((value) => value.replace(/\s/g, '')) ?? [];
      if (titleCapacities.some((capacity) => !capacities.includes(capacity))) return false;
    }
  }
  return true;
}
