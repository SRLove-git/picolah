import { broadMarkdownPrices, retailPricePage, nonPurchasePageText } from '../product-page-prices.ts';
import { createHash } from 'node:crypto';
import { safeWebUrl } from '../safe-web-url.ts';
import { MARKETS, type MarketCode } from '../markets.ts';
import { currencyDigits } from '../currencies.ts';
import type { MarkdownPage } from '../deepseek/fetch.ts';
import type { WebListing } from '../types.ts';
import { parseSearchCandidates, type WebSearchCandidate } from '../brightdata/serp.ts';
import { queryMatchesTitle } from '../discovery-match.ts';
import { marketplacePage } from '../marketplace-search.ts';
import { shopeeMarkdownPrice } from './marketplace-prices.ts';
import { productPageUrl } from '../product-page-links.ts';

const plain = (line: string) => line.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();

type Amount = { price: number; currency: string };
export interface MarkdownInspection { listings: WebListing[]; reason?: string }
const SYMBOLS: Record<string, string> = { 'US$': 'USD', 'S$': 'SGD', 'HK$': 'HKD', 'AU$': 'AUD', 'CA$': 'CAD', '€': 'EUR', '£': 'GBP', '₹': 'INR' };
const STOCK = /^(?:(?:availability|stock|库存|供货状态)\s*[:：]?\s*)?(?:in\s*stock|available now|有货|现货|sofort verfügbar|auf lager|en stock|disponibile|disponible)[.!。]?$/i;
const UNAVAILABLE = /out\s*of\s*stock|sold\s*out|unavailable|pre[- ]?order|back[- ]?order|缺货|售罄|预售|nicht (?:verfügbar|lieferbar)|ausverkauft|rupture de stock|épuisé|non disponibile|agotado/i;
const SECTION = /^#{1,6}\s+(?:about product|features?|specifications?|description|reviews?|faqs?|frequently|related|recommend|you may|produktbeschreibung|details|bewertungen|最近|推荐|评价|产品详情)/i;
const MONEY = /(?:[A-Z]{3}|US\$|S\$|HK\$|AU\$|CA\$|[€£₹$¥￥])\s*\d|\d[\d.,]*\s*(?:[€£₹$¥￥]|\b(?:EUR|USD|SGD|GBP)\b)/;

function amount(value: string, explicitCurrency?: string): Amount | null {
  const token = '(?:[A-Z]{3}|US\\$|S\\$|HK\\$|AU\\$|CA\\$|[€£₹$])';
  const numeric = '(\\d[\\d., \\u00a0]*\\d|\\d)';
  const before = value.match(new RegExp('^(' + token + ')\\s*' + numeric + '$', 'i'));
  const after = value.match(new RegExp('^' + numeric + '\\s*(' + token + ')$', 'i'));
  if (!before && !after) return null;
  const symbol = (before?.[1] ?? after![2]).toUpperCase();
  const currency = SYMBOLS[symbol] ?? (symbol === '$' ? explicitCurrency : symbol);
  if (symbol === '$' && !['USD', 'SGD', 'AUD', 'CAD', 'HKD', 'NZD', 'BND', 'TWD'].includes(currency || '')) return null;
  if (!currency || (explicitCurrency && currency !== explicitCurrency)) return null;
  const digits = currencyDigits(currency); if (digits === null) return null;
  let raw = (before?.[2] ?? after![1]).trim();
  // Accept grouped spaces, US 1,234.56 and decimal-comma 1.234,56, not
  // arbitrary punctuation removal (which could change a decimal by 1000x).
  if (/\s/.test(raw)) {
    if (!/^\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?$/.test(raw)) return null;
    raw = raw.replace(/[ \u00a0]/g, '');
  }
  if (raw.includes(',') && raw.includes('.')) {
    if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(raw)) raw = raw.replace(/,/g, '');
    else return null;
  } else if (raw.includes(',')) {
    if (new RegExp('^\\d+,\\d{1,' + Math.max(1, digits) + '}$').test(raw)) raw = raw.replace(',', '.');
    else if (digits !== 3 && /^\d{1,3}(?:,\d{3})+$/.test(raw)) raw = raw.replace(/,/g, '');
    else return null;
  }
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0 || price >= 1e12 || Math.abs(price * 10 ** digits - Math.round(price * 10 ** digits)) > 1e-6) return null;
  return { price, currency };
}

/** Parse the primary offer without inferring currency, stock or a cheap variant. */
function inspectStrictMarkdownProduct(page: MarkdownPage, pageUrl: string, market: MarketCode, geography?: 'global'): MarkdownInspection {
  const reject = (reason: string): MarkdownInspection => ({ listings: [], reason });
  const url = safeWebUrl(pageUrl), title = plain(page.title);
  if (!url || !Object.hasOwn(MARKETS, market) || !title || title.length > 1000 || page.content.length > 2 * 1024 * 1024
    || !retailPricePage(pageUrl)) return reject('PAGE_NOT_PRODUCT');
  const lines = page.content.split(/\r?\n/);
  const allHeadings = lines.map((line, index) => ({ text: plain(line.replace(/^#{1,2}\s+/, '')), index, level: line.match(/^(#{1,2})\s+/)?.[1].length }));
  let headings = allHeadings.filter(row => row.level === 1);
  // Repeated desktop/mobile headings are one identity. Different H1 identities
  // still mean a collection or an ambiguous page, regardless of their prices.
  if (!headings.length) headings = allHeadings.filter(row => row.level === 2 && row.text.length >= 8 && title.toLowerCase().includes(row.text.toLowerCase()));
  if (!headings.length || new Set(headings.map(row => row.text.toLowerCase())).size !== 1
    || headings[0].text.length < 8 || !title.toLowerCase().includes(headings[0].text.toLowerCase())) return reject('PRODUCT_HEADING_UNVERIFIED');
  const primaryTitle = headings[0].text;
  const block: string[] = [];
  for (const line of lines.slice(headings[0].index + 1, headings[0].index + 121)) {
    if (SECTION.test(line)) break;
    block.push(line);
  }
  const text = block.join('\n');
  if (headings.some(row => row.index > headings[0].index + block.length)) return reject('PRODUCT_HEADING_UNVERIFIED');
  if (text.length > 12000) return reject('PRIMARY_BLOCK_TOO_LARGE');
  if (/\b(?:choose|select)\s+(?:a\s+|your\s+)?(?:colou?r|size|option|variant|model)\b/i.test(text)) return reject('VARIANT_NOT_SELECTED');
  if (/price range|starting at|起价/i.test(text)) return reject('VARIANT_PRICE_RANGE');
  if (UNAVAILABLE.test(primaryTitle + '\n' + text)) return reject('PRODUCT_UNAVAILABLE');
  if (/\b(?:refurbished|renewed|used|open[- ]box)\b|二手|翻新/i.test(primaryTitle + '\n' + text)) return reject('PRODUCT_NOT_NEW');
  const normalized = block.map(line => plain(line.replace(/~~[^~]*~~/g, ''))).filter(Boolean);
  // A rendered product summary may precede the H1. It can supply stock/currency
  // only when it binds the exact product title AND the exact requested page URL.
  const bound = lines.slice(0, headings[0].index).map(plain).filter(line => line.includes(primaryTitle)
    && line.split(/\s+/).some(token => safeWebUrl(token)?.href === url.href));
  if (bound.some(line => UNAVAILABLE.test(line))) return reject('PRODUCT_UNAVAILABLE');
  if (!normalized.some(line => STOCK.test(line)) && !bound.some(line => /\bInStock\b/.test(line))) return reject('STOCK_NOT_EXPLICIT');
  const declarations = normalized.map(line => line.match(/^(?:currency|币种)\s*[:：]\s*([A-Z]{3})$/i)?.[1].toUpperCase()).filter(Boolean);
  if (new Set(declarations).size > 1) return reject('CURRENCY_CONFLICT');
  const explicitCurrency = declarations[0];
  const conditional = /friends? price|members?[- ]?(?:only|price)|loyal customer|with coupon|after rebate|starting at|price range|会员价|券后|起价/i.test(text);
  const current: Amount[] = [], regular: Amount[] = [];
  const savings: Array<{ original: Amount; discount: Amount }> = [];
  for (const line of normalized) {
    if (/^(?:original price|list price|rrp|uvp)\b|^(?:save|spare)\b|^inkl\.|^shipping\b|^delivery\b|^运费/i.test(line)) continue;
    const saving = line.match(/^(.+?)\s*[-–]\s*(?:Spare|Save)\s*(.+)$/i);
    if (saving) {
      const original = amount(saving[1], explicitCurrency), discount = amount(saving[2], explicitCurrency);
      if (!original || !discount) return reject('PRICE_FORMAT_UNSUPPORTED');
      savings.push({ original, discount }); continue;
    }
    const regularMatch = line.match(/(?:^|\s)Regular price\s*[:：]?\s*(.+)$/i);
    if (regularMatch) {
      const parsed = amount(regularMatch[1], explicitCurrency);
      if (!parsed) return reject('PRICE_FORMAT_UNSUPPORTED');
      regular.push(parsed); continue;
    }
    if (conditional) continue; // Only an explicitly labeled public regular price is eligible here.
    const value = line.replace(/^(?:sale price|current price|our price|price|preis|prix|precio|售价|现价|价格)\s*[:：]?\s*/i, '');
    const parsed = amount(value, explicitCurrency);
    if (parsed) current.push(parsed);
    else if (MONEY.test(line) && !/\b(?:installments?|per month|apr)\b|\bx\s*\d+\b|\/mo\b/i.test(line)) return reject('PRICE_FORMAT_UNSUPPORTED');
  }
  const prices = current.length ? current : regular;
  if (!prices.length) return reject(conditional ? 'CONDITIONAL_PRICE_ONLY' : 'PRICE_OR_CURRENCY_MISSING');
  if (prices.some(p => p.price !== prices[0].price || p.currency !== prices[0].currency)) return reject('PRICE_CONFLICT');
  if (current.length && regular.some(p => p.currency !== prices[0].currency || p.price < prices[0].price)) return reject('PRICE_CONFLICT');
  if (savings.some(({ original, discount }) => original.currency !== prices[0].currency || discount.currency !== prices[0].currency
    || Math.abs(original.price - discount.price - prices[0].price) > 1e-6)) return reject('PRICE_CONFLICT');
  // Corroborate a preceding identity-bound summary when it exposes an amount.
  for (const line of bound) {
    const suffix = line.match(/\bInStock\s+(.+)$/)?.[1];
    if (suffix) {
      const value = amount(suffix);
      if (!value || value.price !== prices[0].price || value.currency !== prices[0].currency) return reject('PRICE_CONFLICT');
    }
  }
  if (geography !== 'global' && prices[0].currency !== MARKETS[market].currency) return reject('CURRENCY_NOT_IN_MARKET');
  const sourceHost = url.hostname.replace(/^www\./, '');
  return { listings: [{ platform: 'web', sourceHost, market, itemId: createHash('sha256').update(url.href).digest('hex'),
    title: primaryTitle, url: url.href, ...prices[0], inStock: true, seller: sourceHost }] };
}

export function parseMarkdownProduct(page: MarkdownPage, pageUrl: string, market: MarketCode, geography?: 'global'): WebListing[] {
  return inspectMarkdownProduct(page, pageUrl, market, geography).listings;
}

/** Markdown links discover candidates only; labels never provide prices. */
export function linkedMarkdownProducts(page: MarkdownPage, pageUrl: string, query: string, model?: string): WebSearchCandidate[] {
  const source = safeWebUrl(pageUrl);
  if (!source) return [];
  const organic: Array<{ link: string; title: string }> = [];
  for (const match of page.content.matchAll(/(?<!!)\[([^\]\n]{1,1000})\]\(([^\s)]+)\)/g)) {
    const title = plain(match[1]);
    if (!queryMatchesTitle(query, title, model)) continue;
    try {
      const url = productPageUrl(new URL(match[2], source).href, true);
      if (url && url.origin === source.origin && url.href !== source.href) organic.push({ link: url.href, title });
      if (organic.length >= 30) break;
    } catch { /* Invalid destinations are never requested. */ }
  }
  return parseSearchCandidates({ organic });
}

/** Amazon uses H1 for both the product and informational sections. Keep only
 * the exact primary title and its immediate price block; a model subtitle must
 * precede all price/section rows, never come from recommendations. */
function amazonPrimaryMarkdown(page: MarkdownPage, pageUrl: string): MarkdownPage {
  const url=safeWebUrl(pageUrl);
  if(!url || !/^(?:www\.)?amazon\.co\.uk$/.test(url.hostname)
    || !/\/(?:dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}(?:\/|$)/i.test(url.pathname)) return page;
  const title=plain(page.title), lines=page.content.split(/\r?\n/);
  const matches=lines.map((line,index)=>({line,index})).filter(x=>/^#\s+/.test(x.line) && plain(x.line.replace(/^#\s+/,''))===title);
  if(matches.length!==1 || title.length<12 || title.length>500)return page;
  const following=lines.slice(matches[0].index+1,matches[0].index+81);
  const end=following.findIndex(line=>/^#{1,6}\s+/.test(line));
  const block=(end<0?following:following.slice(0,end));
  const first=block.map(plain).find(Boolean)??'';
  const subtitle=first.length<=500 && /\([A-Z]{2,}[- ]?\d{3,}(?:[A-Z0-9-]*)(?:\/\d{2})?\)/i.test(first)
    && !MONEY.test(first) && !/related|recommend|compare|compatible|replacement/i.test(first) ? first : '';
  const identity=(title+(subtitle?' — '+subtitle:'')).replace(/[|–]/g,'—');
  return {...page,title:identity,content:'# '+identity+'\n'+block.join('\n')};
}

export function inspectMarkdownProduct(page: MarkdownPage, pageUrl: string, market: MarketCode, geography?: 'global'): MarkdownInspection {
  if (!retailPricePage(pageUrl) || nonPurchasePageText(page.content)) return { listings: [], reason: 'PAGE_NOT_PRODUCT' };
  if (marketplacePage(pageUrl, market, 'shopee')) {
    const listings = shopeeMarkdownPrice(page, pageUrl, market);
    return listings.length ? { listings } : { listings:[], reason:'PRIMARY_PRICE_UNVERIFIED' };
  }
  page=amazonPrimaryMarkdown(page,pageUrl);
  const strict = inspectStrictMarkdownProduct(page, pageUrl, market, geography);
  const listings = strict.listings.length ? strict.listings : broadMarkdownPrices(page, pageUrl, market, geography);
  if (page.stockUnconfirmed) for (const row of listings) if (row.inStock) {
    row.inStock = false;
    row.priceQuote = { ...row.priceQuote, kind: row.priceQuote?.kind ?? 'exact', availability: 'unknown', source: 'fetch' };
  }
  return listings.length ? { listings } : strict;
}
