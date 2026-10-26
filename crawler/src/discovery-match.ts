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
  const compact = model.replace(/[-\s]/g, '');
  if (model.length > 40 || compact.length < 6 || !new RegExp(`^(?:${MODEL_CODE})$`).test(model)) {
    throw new Error('model 必须是单一完整型号，例如 WF-1000XM6');
  }
  if (/^WHCH\d{3,}[A-Z]*$/.test(compact)) return compact.replace(/^WHCH/, 'WH-CH');
  if (/^(?:WF|WH)\d{3,}XM\d+[A-Z]*$/.test(compact)) return compact.replace(/^(WF|WH)/, '$1-');
  return model;
}

// Permit spaces inside established Sony families without treating an arbitrary
// brand + model phrase ("Sony WF-1000XM6") as one identifier.
const MODEL_CODE = '(?:WH[-\\s]*CH[-\\s]*\\d{3,}(?:[-\\s]+N|[A-Z]*)|(?:WF|WH)[-\\s]*\\d{3,}[-\\s]*XM[-\\s]*\\d+[A-Z]*|[A-Z]{2,}-?\\d{3,}(?:[A-Z]+\\d+)*[A-Z]*)';

const NON_PRODUCT = /\b(?:case|cover|skin|sleeve|protector|cable|charger|adapter|stand|holder|mount|strap|ear\s?(?:tips?|pads?|cushions?)|replacement|compatible|sticker|decal|replica|counterfeit|imitation|fake|copy|clones?|used|refurbished|renewed|pre[-\s]?(?:owned|loved)|second[-\s]?hand|broken|repair|parts?|dummy|open[-\s]box|left\s+only|right\s+only)\b|保护套|保护壳|耳塞套|耳罩|替换|配件|仿制|高仿|二手|翻新|维修|故障|仅包装|空盒|单耳|单只|充电仓|充电盒/i;

function nonProductTitle(rawTitle: string): boolean {
  let title = rawTitle.normalize('NFKC');
  // A bundled charging/carrying case is a normal feature of headphones. Only
  // remove the explicit bundle phrase; a standalone case, replacement or pad
  // remains an accessory even if the title mentions headphones or their model.
  if (/\b(?:earbuds?|earphones?|headphones?|headsets?)\b|耳机/i.test(title)) {
    title = title.replace(/\b(?:with|including|includes?)\s+(?:a\s+)?(?:wireless\s+)?(?:charging|carrying)\s+case\b/gi, ' ');
  }
  return NON_PRODUCT.test(title);
}

function modelGeneration(compact: string): string | undefined {
  return compact.match(/^WH(CH\d+[A-Z]*)$/)?.[1] ?? compact.match(/([A-Z]+\d+[A-Z]*)$/)?.[1];
}

/** Use only after checking the mandatory full model and conflicting full codes. */
function removeModelAliases(title: string, compact: string): string {
  const generation = modelGeneration(compact);
  const aliases = [...new Set([compact, compact.replace(/^[A-Z]+/, ''), ...(generation ? [generation] : [])])];
  const aliasPattern = aliases.map((alias) => alias.split('').join('[\\s-]*')).join('|');
  return title.replace(new RegExp(`(^|[^A-Z0-9])(?:${aliasPattern})(?=$|[^A-Z0-9])`, 'g'), '$1 ');
}

function exactTitle(model: string, rawTitle: string): boolean {
  const title = rawTitle.normalize('NFKC').toUpperCase();
  if (!title.trim() || nonProductTitle(title)) return false;
  const compact = model.replace(/[-\s]/g, '');
  const fullModel = compact.split('').join('[\\s-]*');
  const match = new RegExp(`(^|[^A-Z0-9])(${fullModel})(?=$|[^A-Z0-9])`).exec(title);
  if (!match) return false;

  // Merchants often repeat one model as "WF1000XM6 | WF-1000XM6 |
  // 1000XM6 | XM6". The full code above is mandatory; only its exact suffixes
  // may be removed as aliases before looking for conflicting models.
  const generation = modelGeneration(compact);
  // A listing advertising multiple models/variants cannot establish which variant its price buys.
  // Check full conflicts first: stripping 1000XM6 prematurely would hide WH-1000XM6.
  // Keep a non-word separator so removal cannot join a brand to a later alias
  // ("Sony WF1000XM6 1000XM6" must not become a fictional "Sony 1000XM6" code).
  const withoutFullModel = title.replace(new RegExp(`(^|[^A-Z0-9])(${fullModel})(?=$|[^A-Z0-9])`, 'g'), '$1#');
  // Remove exact suffix aliases only after detecting different full families.
  // CH720N is an allowed WH-CH720N alias, but WH-CH710N is not.
  if (/\b[A-Z]{2,}[-\s]+CH[-\s]*\d{3,}[A-Z]*\b/.test(withoutFullModel)) return false;
  const withoutSameGeneration = generation && /^WHCH/.test(compact)
    ? withoutFullModel.replace(new RegExp(`(^|[^A-Z0-9])${generation.split('').join('[\\s-]*')}(?=$|[^A-Z0-9])`, 'g'), '$1#')
    : withoutFullModel;
  if (/[A-Z]{2,}[-\s]*\d{3,}(?:[-\s]*[A-Z]+[-\s]*\d+)*[A-Z]*/.test(withoutSameGeneration)) return false;
  const remaining = removeModelAliases(withoutFullModel, compact);
  // The dropped-prefix form must also agree: 1000XM5 and 2000XM6 are not aliases.
  if (/\b\d{3,}[-\s]*[A-Z]+(?:[-\s]*\d+)*[A-Z0-9]*\b/.test(remaining)) return false;
  const tail = removeModelAliases(title.slice((match.index || 0) + match[0].length), compact);
  if (/^(?:\s*[/&|+]\s*)+(?:[A-Z]+[-\s]*)?\d/.test(tail)) return false;
  // Reject shortened alternative generations as well, e.g. WF-1000XM6 and XM5.
  if (generation) {
    const family = generation.match(/^[A-Z]+/)?.[0];
    // CH 720 N is the same model, but CH 720 NB / N2 are not. Require a
    // complete separated N so the next word (for example "Noise") cannot
    // become a model suffix on a code without N, such as WH-CH520.
    const suffix = family === 'CH' ? '(?:[-\\s]+N(?=$|[^A-Z0-9])|[A-Z]*)' : '[A-Z]*';
    for (const candidate of title.matchAll(new RegExp(`\\b${family}[-\\s]*\\d+${suffix}\\b`, 'g'))) {
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
  if (!listing.title?.trim() || listing.title.length > 1000 || nonProductTitle(listing.title)) return false;
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
  model ??= query.normalize('NFKC').toUpperCase().match(new RegExp(`(?:^|[^A-Z0-9])(${MODEL_CODE})(?=$|[^A-Z0-9])`))?.[1];
  if (model && !exactDiscoveryListing(model, listing, market, platform)) return false;
  const compactModel = model?.replace(/[-\s]/g, '').toUpperCase();
  // The exact guard has already matched the model character-by-character.
  // Token comparison must not re-reject WHCH720N versus WH-CH720N because one
  // spelling has "whch" and the other has separate "wh" / "ch" tokens.
  const requested = queryTokens(compactModel ? removeModelAliases(query.normalize('NFKC').toUpperCase(), compactModel) : query);
  const titleTokens = new Set(queryTokens(compactModel ? removeModelAliases(listing.title.normalize('NFKC').toUpperCase(), compactModel) : listing.title));
  if ((!requested.length && !model) || !requested.every((token) => titleTokens.has(token))) return false;
  if (queryTokens(query).some((token) => /^\d+$/.test(token))) {
    // The exact guard already verified aliases such as "XM6 | 1000XM6";
    // they are not a numeric/capacity choice like "128 / 256GB".
    const variantTitle = model
      ? removeModelAliases(listing.title.normalize('NFKC').toUpperCase(), compactModel!)
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
