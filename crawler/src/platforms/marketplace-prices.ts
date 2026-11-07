import type { MarkdownPage } from '../deepseek/fetch.ts';
import { MARKETS, type MarketCode } from '../markets.ts';
import { marketplacePage } from '../marketplace-search.ts';
import type { WebListing } from '../types.ts';
import { lazadaProductUrl } from './lazada-structured.ts';

const currencies: Record<MarketCode, RegExp> = {
  SG: /^(?:SGD|S\$|\$)\s*(.+)$/i, MY: /^(?:MYR|RM)\s*(.+)$/i,
  TH: /^(?:THB|฿)\s*(.+)$/i, PH: /^(?:PHP|₱)\s*(.+)$/i,
  ID: /^(?:IDR|Rp\.?)\s*(.+)$/i, VN: /^(?:VND|₫)\s*(.+)$|^(.+?)\s*(?:VND|₫|đ)$/i,
};
function localAmount(value: unknown, market: MarketCode): number | undefined {
  if (typeof value !== 'string') return;
  const match = value.trim().match(currencies[market]);
  if (!match) return;
  let digits = (match[1] ?? match[2]).trim();
  if (MARKETS[market].decimals === 0) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(digits)) return;
    digits = digits.replace(/\./g, '');
  } else {
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(digits)) return;
    digits = digits.replace(/,/g, '');
  }
  const amount = Number(digits);
  return amount > 0 && amount < 1e12 ? amount : undefined;
}

/** Lazada binds its displayed variant price to both platform IDs in the detail-page data. */
export function lazadaTrackingPrice(html: string, pageUrl: string, market: MarketCode): WebListing[] {
  const url = marketplacePage(pageUrl, market, 'lazada');
  const requested = url && lazadaProductUrl(url.href, market);
  if (!url || !requested || html.length > 4_000_000) return [];
  const products = [];
  const tracking = [];
  for (const [,attrs,script] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\btype\s*=\s*(["'])application\/ld\+json\1/i.test(attrs)) {
      try {
        const data = JSON.parse(script);
        if (data?.['@type'] === 'Product') products.push(data);
      } catch { /* Only the page's own valid product record can bind the price. */ }
    } else {
      const match = script.match(/\bvar pdpTrackingData\s*=\s*("(?:\\.|[^"\\])*")\s*;/);
      if (match) {
        try { tracking.push(JSON.parse(JSON.parse(match[1]))); } catch { return []; }
      }
    }
  }
  if (products.length !== 1 || tracking.length !== 1) return [];
  const [data] = tracking, [product] = products;
  const offer = product.offers;
  if (data?.pagetype !== 'pdp' || data.core?.country !== market || data.core?.currencyCode !== MARKETS[market].currency ||
    typeof data.pdt_name !== 'string' || data.pdt_name.length > 1000 || !data.pdt_name.trim() || data.pdt_name !== product.name ||
    String(data.pdt_sku) !== requested.itemId || !/^\d+$/.test(String(data.pdt_simplesku)) ||
    (requested.skuId && String(data.pdt_simplesku) !== requested.skuId) || offer?.['@type'] !== 'Offer') return [];
  for (const value of [product.url, offer.url]) {
    const id = lazadaProductUrl(value, market);
    if (id?.itemId !== requested.itemId || id.skuId !== String(data.pdt_simplesku)) return [];
  }
  if ([...url.searchParams.keys()].some(key => /^(?:sku|sku_id|skuId|variant|itemId)$/i.test(key))) return [];
  const price = localAmount(data.pdt_price, market);
  if (price === undefined || (offer.price !== undefined && Number(offer.price) !== price) ||
    (offer.priceCurrency !== undefined && offer.priceCurrency !== MARKETS[market].currency)) return [];
  const availability = String(offer.availability).replace(/^https?:\/\/schema\.org\//, '');
  const inStock = ['InStock', 'LimitedAvailability'].includes(availability);
  return [{ platform:'web', sourceHost:url.hostname.replace(/^www\./, ''), market,
    itemId:requested.itemId + '-' + data.pdt_simplesku, title:product.name, url:url.href, price,
    currency:MARKETS[market].currency, inStock, priceQuote:{kind:'exact', source:'html',
      availability:inStock ? 'in-stock' : /OutOfStock|SoldOut|Discontinued/.test(availability) ? 'out-of-stock' : 'unknown'} }];
}

/** The amount on Shopee precedes Shop Vouchers, Shipping and product recommendations. */
export function shopeeMarkdownPrice(page: MarkdownPage, pageUrl: string, market: MarketCode): WebListing[] {
  const url = marketplacePage(pageUrl, market, 'shopee');
  if (!url || page.content.length > 2_000_000) return [];
  const lines = page.content.split(/\r?\n/);
  const headings = lines.map((line,index) => ({line, index})).filter(row => /^#\s/.test(row.line));
  if (headings.length !== 1) return [];
  const heading = headings[0], title = heading.line.replace(/^#\s+/, '').trim();
  if (title.length < 5 || !page.title.toLowerCase().includes(title.toLowerCase()) || /sold out|out of stock|售罄|缺货/i.test(page.title + ' ' + lines.slice(0, heading.index).join(' '))) return [];
  const block: string[] = [];
  for (const raw of lines.slice(heading.index+1, heading.index+25)) {
    const line = raw.trim();
    if (/^#{1,6}\s|^(?:shop vouchers?|shipping|quantity|bundle deals?|shopping guarantee|product (?:details|specifications|description)|recommended|similar products)\b/i.test(line)) break;
    if (line) block.push(line);
  }
  if (block.some(line => /\b(?:off|save|shipping|delivery|spend|deposit|installment|monthly|member|sold out|from|up to)\b|[-–~]\s*(?:\$|\d)/i.test(line))) return [];
  const amounts = block.map(line => localAmount(line, market)).filter((n): n is number => n !== undefined);
  if (amounts.length !== 1) return [];
  const voucher = block.some(line => /^after voucher$/i.test(line));
  return [{ platform:'web', sourceHost:url.hostname.replace(/^www\./, ''), market, itemId:url.pathname.match(/\d+\/?$/)![0].replace('/',''),
    title, url:url.href, price:amounts[0], currency:MARKETS[market].currency, inStock:false,
    priceQuote:{kind:'exact', source:'fetch', availability:'unknown', ...(voucher ? {note:'券后价'} : {})} }];
}
