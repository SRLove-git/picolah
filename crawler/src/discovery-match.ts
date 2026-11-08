import { MARKETS, type MarketCode, type PlatformId } from './markets.ts';
import type { DiscoveryListing } from './types.ts';
import { safeWebUrl } from './safe-web-url.ts';
import { currencyDigits } from './currencies.ts';

export function normalizeSearchQuery(value: string): string {
  const query = value.normalize('NFKC').trim().replace(/ +/g, ' ');
  if (query.length < 2 || query.length > 120 || /[\p{Cc}\p{Cf}]/u.test(query)
    || /(?:https?:\/\/|www\.)/i.test(query) || !/[\p{L}\p{N}]/u.test(query)) {
    throw new Error('query 必须是 2–120 字符的商品搜索词，不能是网址');
  }
  return query;
}

/** Accept one model or a useful model prefix, never arbitrary search prose. */
export function normalizeDiscoveryModel(value: string): string {
  const model = value.normalize('NFKC').trim().toUpperCase();
  const compact = model.replace(/[-\s]/g, '');
  if (model.length > 40 || compact.length < 5 || !new RegExp(`^(?:${MODEL_CODE})$`).test(model)) {
    throw new Error('model 必须是单一型号或至少 5 字符的型号片段，例如 FV1413');
  }
  if (/^WHCH\d{3,}[A-Z]*$/.test(compact)) return compact.replace(/^WHCH/, 'WH-CH');
  if (/^(?:WF|WH)\d{3,}XM\d+[A-Z]*$/.test(compact)) return compact.replace(/^(WF|WH)/, '$1-');
  return model;
}

/** A user may supply the stable beginning of a regional SKU (FV1413), while
 * a merchant prints its sellable suffix (FV1413H2BA). Expand only a contiguous
 * suffix from the same title token, then run the ordinary exact-model conflict
 * checks against that complete candidate. */
function expandedTitleModel(model: string, rawTitle: string): string | undefined {
  const compact = model.replace(/[-\s]/g, '').toUpperCase();
  // A stable appliance/TV prefix normally ends in a multi-digit sequence.
  // Do not weaken established complete Sony or camera generations such as
  // WF-1000XM6, WH-CH720N, ZV-E10 and EOS R50.
  if (compact.length < 5 || !/[A-Z]/.test(compact) || !/\d{2,}$/.test(compact)
    || /^(?:WF|WH)\d|^WHCH|^ZVE\d|^EOSR\d/.test(compact)) return;
  const prefix = compact.split('').map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s-]*');
  const title = rawTitle.normalize('NFKC').toUpperCase();
  const match = new RegExp(`(^|[^A-Z0-9])(${prefix})((?:[A-Z0-9]{1,12}|[/.-][A-Z0-9]{1,8})(?:[/.-][A-Z0-9]{1,8})?)(?=$|[^A-Z0-9])`).exec(title);
  if (!match) return;
  const expanded = (match[2] + match[3]).replace(/[\s-]/g, '');
  return expanded.length > compact.length ? expanded : undefined;
}

// Permit spaces inside established Sony families without treating an arbitrary
// brand + model phrase ("Sony WF-1000XM6") as one identifier.
const MODEL_CODE = '(?:XPS[-\\s]*(?:13|14|15|16|17)[-\\s]*\\d{4}|WH[-\\s]*CH[-\\s]*\\d{3,}(?:[-\\s]+N|[A-Z]*)|(?:WF|WH)[-\\s]*\\d{3,}[-\\s]*XM[-\\s]*\\d+[A-Z]*|\\d[A-Z]{2,}\\d{2,}[A-Z0-9]*(?:/[A-Z0-9]+)?|[A-Z]{1,3}(?:-[A-Z]{1,4})+\\d[A-Z0-9]*(?:-[A-Z0-9]+)*(?:/[A-Z0-9]+)?|[A-Z]-?\\d{4,}[A-Z]*/[A-Z0-9]+|[A-Z]{2,}-?\\d{2,}(?:[A-Z]+(?:-[A-Z]+)?\\d+)*[A-Z]*(?:/\\d{2})?)';

const NON_PRODUCT = /\b(?:case|cover|skin|sleeve|protector|cable|charger|adapter|stand|holder|mount|strap|ear\s?(?:tips?|pads?|cushions?)|replacement|compatible|sticker|decal|replica|counterfeit|imitation|fake|copy|clones?|used|refurbished|renewed|pre[-\s]?(?:owned|loved)|second[-\s]?hand|broken|repair|parts?|dummy|open[-\s]box|left\s+only|right\s+only)\b|\b(?:batter(?:y|ies)|filters?|brush(?:es)?|rollers?|hoses?|remotes?)\s+(?:for|compatible\s+with)\b|保护套|保护壳|耳塞套|耳罩|替换|配件|仿制|高仿|二手|翻新|维修|故障|仅包装|空盒|单耳|单只|充电仓|充电盒/i;

function nonProductTitle(rawTitle: string): boolean {
  let title = rawTitle.normalize('NFKC');
  if (/\bnot\s+(?:an?\s+)?(?:[a-z0-9]+\s+)?(?:brand|original|genuine)\b|非原装|非原厂|非苹果品牌/i.test(title)) return true;
  // "Repair" and "skin" describe skincare benefits, not spare parts or a
  // repair service. Device repair kits must keep the ordinary exclusions.
  if (/\b(?:serum|cream|lotion|balm|moisturi[sz](?:er|ing)|cleanser|skin[ -]*care|night[ -]*repair)\b/i.test(title)
    && !/\b(?:phone|iphone|pixel|galaxy|laptop|camera|screen|headphones?|charger|repair kit)\b/i.test(title)) {
    title=title.replace(/\b(?:repair|skin)\b/gi,' ');
  }
  // A watch's metal case is its housing, not an accessory sold separately.
  if (/\b(?:smartwatch|watch)\b|手表|手錶/i.test(title)) {
    title=title.replace(/\b(?:alumini?um|titanium|stainless\s+steel|ceramic)\s+case\b/gi,' ');
  }
  // A power bank is itself a portable charger, not a charger accessory for a
  // different requested product.
  if (/\b(?:power|battery)\s*bank\b|移动电源|充电宝/i.test(title)) {
    title=title.replace(/\bportable\s+chargers?\b/gi,' ');
  }
  // "Stand mixer" names the appliance itself; a standalone stand remains an
  // accessory and continues to match NON_PRODUCT below.
  if (/\bstand\s+mixers?\b/i.test(title)) title=title.replace(/\bstand\b/gi,' ');
  // A bundled charging/carrying case is a normal feature of headphones. Only
  // remove the explicit bundle phrase; a standalone case, replacement or pad
  // remains an accessory even if the title mentions headphones or their model.
  if (/\b(?:earbuds?|earphones?|headphones?|headsets?)\b|耳机/i.test(title)) {
    title = title.replace(/\b(?:with|including|includes?)\s+(?:a\s+)?(?:wireless\s+)?(?:charging|carrying)\s+case\b/gi, ' ');
  }
  return NON_PRODUCT.test(title);
}

function modelGeneration(compact: string): string | undefined {
  if (/^XPS(?:13|14|15|16|17)\d{4}$/.test(compact)) return;
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
  let title = rawTitle.normalize('NFKC').toUpperCase()
    .replace(/\bSERIES\s+\d{3,4}\b/g, ' ')
    .replace(/\b(?:DIAMONDCLEAN|SONICARE)\s+\d{3,4}\b/g, ' ');
  if (!title.trim() || nonProductTitle(title)) return false;
  title=title.replace(/\b([A-Z]{3})\s*\d[\d.,]*(?=\s|$)/g,(value,code)=>currencyDigits(code)!==null?' ':value);
  const compact = model.replace(/[-\s]/g, '');
  // KitchenAid and similar appliance families append colour/region letters to
  // a documented base SKU (5KSM175PS -> 5KSM175PSBCA). The attached suffix is
  // a sellable variant of that base appliance, not another generation.
  if (/^\d[A-Z]{2,}\d{2,}[A-Z]{1,3}$/.test(compact)) {
    const base = compact.split('').join('[-\\s]*');
    title = title.replace(new RegExp(`(${base})[A-Z]{1,4}(?=$|[^A-Z0-9])`, 'g'), '$1');
  }
  if (/^(?:HX|HD|HR|HC|MG|BR|NA)\d+[A-Z]*$/.test(compact)) {
    const family=compact.split('').join('[-\\s]*');
    title=title.replace(new RegExp(`(${family})/\\d{2}(?=$|[^A-Z0-9])`,'g'),'$1');
  }
  const fullModel = compact.split('').join('[\\s-]*');
  const expanded = expandedTitleModel(model, rawTitle);
  if (expanded) return exactTitle(expanded, rawTitle);
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
  // Laptop stores append a regional configuration SKU to the requested base
  // chassis (UX5406SA-PZ267W). It is still the requested product family; the
  // suffix remains mandatory when the user explicitly includes it.
  const withoutRegionalSku = withoutSameGeneration
    .replace(/#[-\s]+[A-Z]{1,3}\d{2,5}[A-Z]{0,3}(?=$|[^A-Z0-9])/g, '#')
    .replace(/\bU[3579][ -]\d{3}[A-Z]\b/g, ' ')
    .replace(/\bI[3579][ -]\d{4,5}[A-Z]*\b/g, ' ')
    .replace(/\b(?:INTEL\s+)?CORE\s+ULTRA\s+[3579]\s+\d{3}[A-Z]\b/g, ' ');
  if (/\b[A-Z]{2,5}[-\s]*\d{3,}(?:[-\s]*[A-Z]+[-\s]*\d+)*[A-Z]*/.test(withoutRegionalSku)) return false;
  const shortFamily=compact.match(/^([A-Z]{2,})(\d{2})(?!\d)/)?.[1];
  if (shortFamily && new RegExp(`\\b${shortFamily}[-\\s]*\\d{2,}`).test(withoutSameGeneration)) return false;
  const remaining = removeModelAliases(withoutRegionalSku, compact);
  // The dropped-prefix form must also agree: 1000XM5 and 2000XM6 are not aliases.
  if (/\b\d{3,}[-\s]*[A-Z]+(?:[-\s]*\d+)+[A-Z]*\b/.test(remaining)) return false;
  const tail = removeModelAliases(title.slice((match.index || 0) + match[0].length), compact)
    .replace(/^\s*-\s*[A-Z]{1,3}\d{2,5}[A-Z]{0,3}(?=$|[^A-Z0-9])/, ' ');
  if (/^(?:\s*[/&|+]\s*)+(?:[A-Z]+[-\s]*)?\d/.test(tail)) return false;
  // Reject shortened alternative generations as well, e.g. WF-1000XM6 and XM5.
  if (generation) {
    const family = generation.match(/^[A-Z]+/)?.[0];
    // CH 720 N is the same model, but CH 720 NB / N2 are not. Require a
    // complete separated N so the next word (for example "Noise") cannot
    // become a model suffix on a code without N, such as WH-CH520.
    const suffix = family === 'CH' ? '(?:[-\\s]+N(?=$|[^A-Z0-9])|[A-Z]*)' : '[A-Z]*(?:-[A-Z]+)*';
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

export function validSourceListing(listing: DiscoveryListing, market: MarketCode, platform: PlatformId | 'web', geography?: 'global'): boolean {
  if (!(market in MARKETS) || listing.market !== market || listing.platform !== platform || (listing.inStock !== true && !listing.priceQuote)) return false;
  if (!Number.isFinite(listing.price) || listing.price <= 0 || listing.price > 1_000_000_000_000) return false;
  if ((geography === 'global' && platform === 'web' ? currencyDigits(listing.currency) === null : listing.currency !== MARKETS[market].currency) || !listing.itemId?.trim() || listing.itemId.length > 150) return false;
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

const NAMED_NOT_MODEL = /^(?:LEGO|PRIME|PRO|PLUS|MINI|ULTRA|MAX|BALANCE|CREAM|ESSENCE|SERIES|EDITION|INSTA)(?:[-\s]|\d)/i;

function queryTokens(value: string): string[] {
  // Equivalent category spellings used by international retailers. Model and
  // capacity tokens remain mandatory; these aliases never choose a product.
  let normalized=/\bapple\b/i.test(value) ? value.replace(/\bwatch\s*(?:series\s*)?(\d{1,2})\b/gi,'watch series $1') : value;
  // Sony uses Alpha, the Greek alpha glyph and A interchangeably in retail
  // titles (Alpha 7 V / α7 V / A7 V). Restrict the alias to Sony identities so
  // an ordinary article never becomes a product token.
  if (/\bsony\b|索尼/i.test(normalized)) normalized=normalized.replace(/(?:\balpha\b|α)\s*(?=\d)/gi,'a');
  normalized=normalized.replace(/\bplaystation\s*5\b/gi,'ps5');
  return normalized.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\bganprime\b/g, ' gan prime ')
    .replace(/\b([a-z]{1,5}\d+)\s*\+(?!\s*\d)/g, '$1 plus ')
    .replace(/\bthinkpad\b/g, ' lenovo thinkpad ').replace(/\b(?:macbook|ipad|iphone|airpods)\b/g, word=>' apple '+word+' ')
    .replace(/荣耀|榮耀/g, ' honor ').replace(/飞利浦|飛利浦/g, ' philips ').replace(/乐高/g, ' lego ').replace(/博朗/g, ' braun ').replace(/雅诗兰黛/g, ' estee lauder ').replace(/小米/g, ' xiaomi ').replace(/索尼/g, ' sony ').replace(/三星/g, ' samsung ').replace(/华为/g, ' huawei ')
    .replace(/九阳/g, ' joyoung ').replace(/豆浆机/g, ' soy milk maker ')
    .replace(/\bsoy(?:a|bean)?[\s-]*milk\b/g, 'soy milk')
    .replace(/\bsoy milk machine\b/g, 'soy milk maker')
    .replace(/\bgen(?:eration)?\.?\s*(\d+)(?:st|nd|rd|th)?\b/g, 'generation $1')
    .replace(/\b(\d+)(?:st|nd|rd|th)?\s*gen(?:eration)?\b/g, 'generation $1')
    .match(/[a-z]+|\d+|[\p{L}]+/gu) ?? [];
}

export function queryMatchesListing(query: string, listing: DiscoveryListing, market: MarketCode, platform: PlatformId | 'web', model?: string, geography?: 'global'): boolean {
  if (!validSourceListing(listing, market, platform, geography)) return false;
  const compact=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const present=compact(listing.title);
  const extra=(value?:string)=>value&&!present.includes(compact(value))?value:undefined;
  const identity = [extra(listing.productDetails?.brand),listing.title,extra(listing.productDetails?.model)].filter(Boolean).join(' ');
  return queryMatchesTitle(query, identity, model);
}

/** RAM is not a conflicting storage variant (for example 8GB RAM / 256GB SSD). */
function storageCapacities(text: string): string[] {
  const values=[...text.toLowerCase().matchAll(/\d+(?:\.\d+)?\s*(?:gb|tb)\b/g)].map(match=>{
    const before=text.slice(Math.max(0,match.index!-18),match.index!).toLowerCase();
    const after=text.slice(match.index!+match[0].length,match.index!+match[0].length+18).toLowerCase();
    const ram=/^\s*(?:unified\s+)?(?:ram|memory|ddr)\b/.test(after) || /(?:\b(?:ram|memory)|メモリ|内存)\s*[:=]?\s*$/.test(before);
    const storage=/^\s*(?:ssd|storage|rom|hdd)\b/.test(after) || /(?:\b(?:ssd|storage|rom|hdd)|存储|容量)\s*[:=]?\s*$/.test(before);
    return {value:match[0].replace(/\.0+(?=\s*[gt]b)/,'').replace(/\s/g,''),ram,storage};
  });
  return values.filter(v=>!v.ram && (!values.some(x=>x.storage)||v.storage)).map(v=>v.value);
}

/** A generation suffix belongs to the device only immediately after its model. */
function sameCameraGeneration(query: string, title: string): boolean {
  const pattern=/\b(zv[-\s]*e\d+)(?:\s*(?:mark\s*)?(iv|iii|ii|[2-4]))?\b/gi;
  const requested=[...query.matchAll(pattern)][0];
  if (!requested) return true;
  const generation=(suffix?:string)=>({ii:'2',iii:'3',iv:'4'}[suffix?.toLowerCase()??'']??suffix??'1');
  const model=(value:string)=>value.toLowerCase().replace(/[-\s]/g,'');
  const matches=[...title.matchAll(pattern)];
  return matches.length>0 && matches.every(found=>model(found[1])===model(requested[1]) && generation(found[2])===generation(requested[2]));
}

/** Discovery can filter titles without trusting search-card prices or stock. */
export function queryMatchesTitle(query: string, title: string, model?: string): boolean {
  if (!title?.trim() || title.length > 1000 || nonProductTitle(title)) return false;
  // A book about a device or a category spanning multiple editions does not
  // quote the requested item. Keep explicit book searches and real bundles.
  const manual = /\b(?:guide to (?:digital )?photography|camera guide series|user(?:'s)? manual|instruction (?:book|manual)|field guide|handbook)\b|摄影指南|使用手册/i;
  if (manual.test(title) && !manual.test(query)) return false;
  if (/\b(?:OLED\s*(?:&|and|\/)\s*(?:Switch\s+)?Lite|Lite\s*(?:&|and|\/)\s*(?:Switch\s+)?OLED)\s+(?:consoles?|models?|systems?)\b/i.test(title)) return false;
  if (!sameCameraGeneration(query, title)) return false;
  // A camera body page often omits the words "body only" while still naming
  // the exact camera. Accept that omission only when the merchant title does
  // not advertise a lens kit or a kit variant.
  const cameraBody = /\b(?:sony|nikon|canon|fujifilm|panasonic|lumix|leica|olympus)\b/i.test(query)
    && /\bbody(?:\s+only)?\b/i.test(query);
  if (cameraBody && !/\b(?:lens|kit)\b/i.test(query)) {
    const kit = /\blens\s+kit\b|\bkit\b(?!\s*box\b.{0,30}\bbody\s+only\b)|\bwith\b.{0,45}\b(?:lens|\d{2,3}\s*(?:-|–)\s*\d{2,3}\s*mm)\b/i;
    if (kit.test(title) && !/\bbody\s+only\b/i.test(title)) return false;
  }
  // Standalone soundbar searches must not quote a soundbar + subwoofer set.
  // The set remains searchable when the user explicitly asks for the Sub.
  if (/\bsonos\b.{0,30}\b(?:arc|beam)\b|\b(?:soundbar|sound bar)\b/i.test(query)
    && !/\bsub(?:woofer)?\b/i.test(query)
    && /\b(?:with|and|\+)\b.{0,30}\bsub(?:woofer)?\s*\d*\b/i.test(title)) return false;
  // Marketplace titles that combine PS5 Pro and PS5 Slim are variant menus,
  // not a verified price for the requested console edition.
  if (/\b(?:playstation\s*5|ps5)\b/i.test(query)) {
    const editions = (text:string) => [...new Set([...text.matchAll(/\b(?:playstation\s*5|ps5)\s*(pro|slim)\b/gi)]
      .map(match=>match[1].toLowerCase()))];
    const requested=editions(query), offered=editions(title);
    if (requested.length && (offered.length!==1 || offered[0]!==requested[0])) return false;
  }
  // A television page may mention its included remote, but a replacement
  // remote page is never a quote for the television itself.
  const replacementRemote = /\b(?:replace(?:ment)?|compatible)\b.{0,30}\bremote controls?\b|\bremote controls?\b.{0,90}\b(?:works?\s+(?:on|with)|compatible\s+with|replacement\s+for)\b/i;
  if (!/\bremote controls?\b/i.test(query) && replacementRemote.test(title)) return false;
  // Dell's 9340 specifications list Core Ultra H CPUs; an older Core i CPU
  // contradicts that model. https://www.dell.com/support/manuals/en-us/xps-13-9340-laptop
  if (/\bxps\s*13\s*[- ]?9340\b/i.test(title) && /\bi[3579][-\s]\d{4,5}[a-z]*\b/i.test(title)) return false;
  // These names designate different devices rather than colours or bundle contents.
  const familyEditions = [
    {family:/\binstant\s+pot\s+duo\b/i, edition:/\b(?:crisp|plus|ultimate|nova|evo|easy)\b/gi},
    {family:/\bowala\s+freesip\b/i, edition:/\b(?:twist|sway)\b/gi},
    {family:/\bdeathadder\s+v3\b/i, edition:/\b(?:hyperspeed|hyper\s+speed|pro)\b/gi},
  ];
  for(const {family,edition} of familyEditions) if(family.test(query)) {
    const names=(text:string)=>[...new Set((text.match(edition)??[]).map(s=>s.toLowerCase().replace(/\s/g,'')))].sort().join(',');
    if(names(query)!==names(title)) return false;
  }

  // Action-camera merchants often name the camera first even for a standalone accessory.
  if (/\b(?:insta360|gopro|action camera)\b/i.test(query)) {
    const addon=/\b(?:batter(?:y|ies)|(?:premium |standard )?lens guards?|selfie sticks?)\b/i;
    const match=addon.exec(title);
    if (match && !addon.test(query) && !/\b(?:with|includes|including|bundle)\b|\+|含|套装/i.test(title.slice(0,match.index))) return false;
  }
  const accessory=/\bbattery\s+(?:handle|grip)|\b(?:fast[-\s]+)?charg(?:e|ing)\s+hub\b|\b(?:quick|memory[-\s]+card|micro[-\s]?sd|card)\s+readers?\b|\b(?:dust\s+bags?|mop\s+pads?)\b|\b(?:(?:magnetic\s+)?(?:nd|cpl|polarizing|neutral[- ]density)\s+filters?|wide[- ]angle\s+lens)\b|电池手柄|充电管家|尘袋|拖布|滤镜|廣角鏡|广角镜/i;
  // Only an explicit bundle phrase can make a device accessory part of the device.
  // Keep accessory searches possible when the user asks for that accessory itself.
  const bundle=/\b(?:with|including|includes)\b.{0,35}(?:battery\s+(?:handle|grip)|(?:fast[-\s]+)?charg(?:e|ing)\s+hub|(?:quick|memory[-\s]+card|micro[-\s]?sd|card)\s+readers?|(?:magnetic\s+)?(?:nd|cpl|polarizing|neutral[- ]density)\s+filters?|wide[- ]angle\s+lens)/i;
  if (!accessory.test(query) && accessory.test(title) && !bundle.test(title)) return false;
  // Short named phone families are identities too: Xiaomi 17 is neither 17T
  // nor Redmi Note 17. A shared numeric token alone cannot establish a match.
  const named = query.normalize('NFKC').replace(/小米/g, 'Xiaomi ').match(/\b(xiaomi|iphone|pixel|oneplus)\s*(\d{1,2}[a-z]?)\b/i);
  if (named) {
    const family = named[1].toLowerCase() === 'xiaomi' ? 'xiaomi(?:\\s+mi)?' : named[1];
    const names = [...title.normalize('NFKC').replace(/小米/g, 'Xiaomi ').matchAll(new RegExp(`\\b${family}\\s*(\\d{1,2}[a-z]?)\\b`, 'gi'))];
    if (!names.length || names.some((match) => match[1].toLowerCase() !== named[2].toLowerCase())) return false;
  }
  // Camera model suffixes designate a different device, not an unspecified colour.
  const camera=query.normalize('NFKC').match(/\beos\s*(r\d+)(?:\s*(v|mark\s*(?:iv|iii|ii|\d+)))?\b/i);
  if (camera) {
    const identities=[...title.normalize('NFKC').matchAll(/\b(r\d+)(?:\s*(v|mark\s*(?:iv|iii|ii|\d+)))?\b/gi)];
    const key=(model:string,suffix='')=>(model+suffix).toLowerCase().replace(/\s/g,'');
    if(!identities.length||identities.some(found=>key(found[1],found[2])!==key(camera[1],camera[2])))return false;
  }
  // Word-numbered generations and named editions can be distinct devices
  // even without a numeric model code ("Beam One" versus "Beam One Pro").
  const names = queryTokens(query);
  if (names.length >= 3 && (/^(?:one|two|three|four|ii|iii|iv)$/.test(names.at(-1)!) ||
      names.some(name => /^(?:ultra|max|pro|lite)$/.test(name)))) {
    const words = queryTokens(title);
    const [previous, last] = names.slice(-2);
    if (words.some((word,index) => word === last && words[index-1] === previous &&
      /^(?:pro|plus|max|ultra|lite|ii|iii|iv)$/.test(words[index+1] || ''))) return false;
  }
  // The optional hint must not be required for exact-code safety.
  model ??= query.normalize('NFKC').toUpperCase().match(new RegExp(`(?:^|[^A-Z0-9])(${MODEL_CODE})(?=$|[^A-Z0-9])`))?.[1];
  if (model && (NAMED_NOT_MODEL.test(model) || /^[A-Z]+[-\s]*\d+(?:GB|TB|ML|MM|CM|KG|MG|G|OZ|LB|CL|DL|L)$/i.test(model))) model=undefined;
  if (model && !exactTitle(model, title)) return false;
  const compactModel = model?.replace(/[-\s]/g, '').toUpperCase();
  // The exact guard has already matched the model character-by-character.
  // Token comparison must not re-reject WHCH720N versus WH-CH720N because one
  // spelling has "whch" and the other has separate "wh" / "ch" tokens.
  const requested = queryTokens(compactModel ? removeModelAliases(query.normalize('NFKC').toUpperCase(), compactModel) : query)
    .filter(token => !(cameraBody && token === 'body'));
  const titleTokens = new Set(queryTokens(compactModel ? removeModelAliases(title.normalize('NFKC').toUpperCase(), compactModel) : title));
  // A complete manufacturer SKU is the product identity. Merchant titles
  // routinely omit marketing/category words around appliance SKUs, so do not
  // require every remaining prose token once that exact code is present.
  if ((!requested.length && !model) || (!model && !requested.every((token) => titleTokens.has(token)))) return false;
  if (model) {
    const explicitQualifiers = requested.filter(token => /^(?:black|white|silver|blue|pink|green|gold|grey|gray|red)$/.test(token));
    if (explicitQualifiers.some(token => !titleTokens.has(token))) return false;
  }
  if (queryTokens(query).some((token) => /^\d+$/.test(token))) {
    // The exact guard already verified aliases such as "XM6 | 1000XM6";
    // they are not a numeric/capacity choice like "128 / 256GB".
    const variantTitle = model
      ? removeModelAliases(title.normalize('NFKC').toUpperCase(), compactModel!)
      : title;
    if (/\d+\s*[/|]\s*\d+/.test(variantTitle)) return false;
    const variants = ['pro', 'max', 'plus', 'mini', 'ultra', 'lite', 'se', ...(/air[\s-]*(?:fryer|purifier|purification|cleaner|conditioner|cooler)/i.test(title) ? [] : ['air'])];
    const deviceVariantText=variantTitle
      .replace(/\b(?:windows|win|w)\s*1[01]\s*pro\b/gi,' ')
      .replace(/\b(?:intel\s+(?:core\s+)?|core\s+)ultra\s*\d+(?:[- ]\d+[a-z]?)?/gi,' ');
    const variantTokens=new Set(queryTokens(deviceVariantText));
    if (!model && variants.some((variant) => variantTokens.has(variant) && !requested.includes(variant))) return false;
    const capacities = storageCapacities(query);
    if (capacities.length) {
      const titleCapacities = storageCapacities(title);
      if (titleCapacities.some((capacity) => !capacities.includes(capacity))) return false;
    }
  }
  return true;
}
