import { attributes, microdataProduct, selectedShopifyOffer, owalaSelectedOffer } from './embedded-product.ts';
import { isDirectoryPath, editorialPath } from './product-page-links.ts';
import { createHash } from 'node:crypto';
import { safeWebUrl } from './safe-web-url.ts';
import { currencyDigits } from './currencies.ts';
import { commercePageProduct } from './product-page-state.ts';
import { MARKETS, type MarketCode } from './markets.ts';
import type { WebListing, PriceQuote } from './types.ts';
import type { MarkdownPage } from './deepseek/fetch.ts';
import { queryMatchesTitle } from './discovery-match.ts';
import { sourceCountry } from './source-country.ts';

type Obj = Record<string, any>;
const obj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: any): any[] => v == null ? [] : Array.isArray(v) ? v : [v];
const type = (v: Obj, name: string) => list(v['@type']).some(t => String(t).replace(/^https?:\/\/schema.org\//, '') === name);
const clean = (v: any) => typeof v === 'string' ? v.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
/** Aggregators and editorial guides are discovery sources, not merchant quotes. */
export function nonRetailPriceSource(host: string): boolean {
  return /(^|\.)(?:biggo\.[a-z.]+|bigshopper\.[a-z.]+|photoprice\.ca|buywisely\.com\.au|prices\.appleinsider\.com|staticice\.com\.au|kakaku\.com|applepricehunt\.com|yesky\.com|zol\.com\.cn|manmanbuy\.com|smzdm\.com|cosmetify\.com|goxip\.com|phoneaqua\.com|mobilekishop\.net|smartpicksguides\.com|whistleout\.com\.sg|robbreport\.com\.sg|stockinthechannel\.(?:com|co\.uk))$/i.test(host);
}
export function nonPurchasePageText(text: string): boolean {
  const plain=text.replace(/\s+/g,' ');
  return (/cashback\s+store/i.test(plain) && /(?:product|service) information.{0,100}for reference only/i.test(plain))
    || (/add to quote.{0,60}(?:check inventory|complete pricing)/i.test(plain) && /(?:screen print|imprint colors?|laser options)/i.test(plain))
    || /independent product[- ]recommendation|prices? (?:comparison|aggregator) (?:site|website)|比價平台|价格比较平台/i.test(text)
    || (/we earn a commission|affiliate links|as an amazon associate/i.test(text)
      && /our (?:pick|verdict)|full review|typical price|how we pick|buying guide/i.test(text));
}
/** Known rental-only product amounts must not re-enter via Fetch when HTML fails. */
export function retailPricePage(url: string): boolean {
  const u = safeWebUrl(url);
  const paymentPlan = u && [...u.searchParams].some(([key,value]) =>
    /^(?:plan|payment[_-]?plan|term|tenure|installments?)$/i.test(key) && /(?:month|year|week|\d)/i.test(value));
  return !!u && !paymentPlan && !nonRetailPriceSource(u.hostname) && !isDirectoryPath(u.pathname) && !editorialPath(u.pathname) && !/(^|\.)dealmoon\./i.test(u.hostname) && !/(^|\.)cinch\.sg$/i.test(u.hostname) && !/\/(?:blogs?|articles?|news|reviews?|search)(?:\/|$)/i.test(u.pathname);
}
/** Classify the primary page metadata, not incidental customer reviews. */
export function nonPurchasePageHtml(html: string): boolean {
  const title=clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const metas=[...html.matchAll(/<meta\b[^>]*>/gi)].filter(m=>/(?:name|property)\s*=\s*["'](?:description|og:description|og:title)["']/i.test(m[0])).map(m=>m[0]);
  const visible=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ');
  return nonPurchasePageText(visible) || /compare prices|price comparison|price history|price alerts|rental|rent the latest|monthly rental|租赁|月租|价格历史|比价平台|比價|價格總覽/i.test(title+' '+metas.join(' '));
}
function numeric(v: any): number | undefined {
  if (typeof v === 'string') {
    v = v.trim();
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(v)) v = v.replace(/,/g, '');
    else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
    else if (/^\d+,\d{1,2}$/.test(v)) v = v.replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(v)) return;
  } else if (typeof v !== 'number') return;
  const n = Number(v); return Number.isFinite(n) && n > 0 && n < 1e12 ? n : undefined;
}
const availability = (v: unknown): PriceQuote['availability'] => {
  const s = String(v ?? '');
  if (/OutOfStock|SoldOut|Discontinued|out\s*of\s*stock|sold\s*out|unavailable|缺货|售罄/i.test(s)) return 'out-of-stock';
  if (/PreOrder|PreSale|BackOrder|pre[- ]?order|back[- ]?order|预售/i.test(s)) return 'preorder';
  if (/InStock|LimitedAvailability|in\s*stock|有货|现货/i.test(s)) return 'in-stock';
  return 'unknown';
};
function condition(v: unknown): PriceQuote['condition'] {
  return /RefurbishedCondition|\brefurbished\b|翻新/i.test(String(v)) ? 'refurbished' : /UsedCondition|condition\s*[:：]\s*used|available\s+used\s+from|二手|OpenBox/i.test(String(v)) ? 'used' : /NewCondition/i.test(String(v)) ? 'new' : undefined;
}
function record(title: string, page: URL, market: MarketCode, geography: 'global' | undefined, amount: any, currency: any, quote: PriceQuote, id = ''): WebListing | null {
  const price = numeric(amount), code = clean(currency).toUpperCase(), digits = currencyDigits(code);
  if (!title || title.length > 1000 || price === undefined || digits === null || Math.abs(price * 10 ** digits - Math.round(price * 10 ** digits)) > 1e-6
    || (geography !== 'global' && code !== MARKETS[market].currency)) return null;
  if (quote.maxPrice !== undefined && (!Number.isFinite(quote.maxPrice) || quote.maxPrice < price || Math.abs(quote.maxPrice * 10 ** digits - Math.round(quote.maxPrice * 10 ** digits)) > 1e-6)) return null;
  return { platform: 'web', market, sourceHost: page.hostname.replace(/^www\./, ''), itemId: createHash('sha256').update(page.href + id + title + code + price).digest('hex'),
    title, url: page.href, price, currency: code, inStock: quote.availability === 'in-stock', priceQuote: quote };
}
function bound(value: any, page: URL, variant = false): boolean {
  if (value === undefined) return true;
  if (value === '') return false;
  if (typeof value !== 'string') return false;
  try {
    const u = safeWebUrl(/^https?:/i.test(value) ? value : new URL(value, page).href);
    if (!u || u.origin !== page.origin || (!variant && u.pathname !== page.pathname)) return false;
    if (!variant) for (const key of new Set([...page.searchParams.keys(), ...u.searchParams.keys()])) {
      if (/^(?:variant|sku|id|size|color|colour|capacity)$/i.test(key) && page.searchParams.get(key)!==u.searchParams.get(key)) return false;
    }
    return true;
  } catch { return false; }
}
/** Product-page prices may be exact, a starting price or a declared range. Stock is independent. */
export function broadHtmlPrices(html: string, pageUrl: string, market: MarketCode, geography?: 'global'): WebListing[] {
  const page = safeWebUrl(pageUrl); if (!page || nonPurchasePageHtml(html) || !retailPricePage(pageUrl) || !MARKETS[market] || html.length > 8_000_000) return [];
  html = html.replace(/<!--[\s\S]*?-->/g,'');
  if (/captcha|robot check|verify you are human|access denied/i.test(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')) return [];
  const canonicals = new Set<string>();
  let selectedVariantOnly = false;
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const fields = attributes(tag[0]);
    if (!fields.get('rel')?.toLowerCase().split(/\s+/).includes('canonical')) continue;
    const href = fields.get('href');
    if (!href) return [];
    let canonical: URL;
    try { canonical = new URL(href, page); } catch { return []; }
    if (!bound(href, page)) {
      // Shopify canonicalizes a selected SKU to the base product. In this
      // case only the matching selected-option record can authorize a quote.
      const base = new URL(page);
      const variants = base.searchParams.getAll('variant');
      base.searchParams.delete('variant');
      if (variants.length !== 1 || !/^\d+$/.test(variants[0]) || canonical.href !== base.href || !bound(href, base)) return [];
      selectedVariantOnly = true;
    }
    canonicals.add(canonical.href);
  }
  if (canonicals.size > 1) return [];
  if (selectedVariantOnly && market === 'SG') {
    const option = owalaSelectedOffer(html,page);
    if (option) {
      const row = record(option.title,page,market,geography,option.price,'SGD',{
        kind:'exact',source:'html',availability:option.available?'in-stock':'out-of-stock',variant:option.sku,
      },option.sku);
      if (row) return [row];
    }
  }
  const merchantControl=/<(?:button|input|form)\b[^>]*(?:add[-_ ]?to[-_ ]?(?:cart|bag|basket)|buy[-_ ]?now|name=["']add["'])/i.test(html) || /<button\b[^>]*>[\s\S]{0,250}?(?:add to (?:cart|bag|basket)|buy now|加入购物车|立即购买)/i.test(html);
  const products: Obj[] = []; let invalidPage = false, visited = 0;
  for (const m of html.matchAll(/<script\b[^>]*\stype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(m[1]); } catch { continue; }
    const queue = list(data);
    for (let i = 0; i < queue.length && ++visited < 20000; i++) {
      const node = queue[i]; if (!obj(node)) continue;
      if (['Article','NewsArticle','BlogPosting','CollectionPage','ItemList'].some(t => type(node,t))) invalidPage = true;
      if (type(node,'Product') || type(node,'ProductGroup')) { products.push(node); continue; }
      for (const v of Object.values(node)) if (obj(v) || Array.isArray(v)) queue.push(...list(v));
    }
  }
  if (invalidPage || visited >= 20000) return [];
  const heading = clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]).toLowerCase();
  const output: WebListing[] = [];
  const state = commercePageProduct(html,pageUrl);
  function parse(product: Obj, parent?: Obj, productPage: URL = page!, selectedSku?: string) {
    if (output.length >= 40 || !bound(product.url, productPage, !!parent)) return;
    const rawName = clean(product.name || parent?.name); const brand = clean(product.brand?.name || product.brand || parent?.brand?.name || parent?.brand);
    let title = rawName;
    if (parent && rawName && !rawName.toLowerCase().includes(clean(parent.name).toLowerCase())) title = clean(parent.name) + ' ' + rawName;
    if (brand && !title.toLowerCase().includes(brand.toLowerCase())) title = brand + ' ' + title;
    if (!title) return;
    if (!parent && products.length > 1 && !product.url && (!heading || !heading.includes(title.toLowerCase()))) return;
    for (const variant of list(product.hasVariant)) if (obj(variant)) parse(variant,product);
    for (const offer of list(product.offers)) {
      if (!obj(offer) || !bound(offer.url,productPage,!!parent)) continue;
      if (offer.priceValidUntil !== undefined) {
        const expiry=offer.priceValidUntil;
        if (typeof expiry!=='string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(expiry)) continue;
        const dateOnly=expiry.length===10, zoned=/(?:Z|[+-]\d{2}:\d{2})$/.test(expiry);
        const until=Date.parse(dateOnly?expiry+'T23:59:59.999Z':zoned?expiry:expiry+'Z')-(dateOnly||zoned?0:14*3600000);
        if (!Number.isFinite(until)||until<Date.now()) continue;
      }
      const specifications = list(offer.priceSpecification).filter(obj);
      if (/LeaseOut|Subscription/i.test(String(offer.businessFunction ?? '')) || specifications.some(spec=>spec.billingDuration!==undefined || /Subscription/i.test(String(spec.priceComponentType ?? '')) || /^(?:MON|WEE|DAY|HUR)$/i.test(String(spec.referenceQuantity?.unitCode ?? spec.unitCode ?? '')))) continue;
      if (type(offer,'AggregateOffer') && !merchantControl) continue;
      if (type(offer,'AggregateOffer') && list(offer.offers).some(child=>obj(child)&&typeof child.url==='string'&&!bound(child.url,productPage,true))) continue;
      const specs = offer.price !== undefined || offer.lowPrice !== undefined ? [offer] : specifications;
      for (const spec of specs) {
        const label = clean(spec.name || spec.priceType);
        if (spec.referenceQuantity || spec.billingDuration !== undefined || spec.billingIncrement !== undefined || /^(?:KGM|LTR|GRM|MON|DAY|HUR|WEE|kg|litre|liter)$/i.test(clean(spec.unitCode || spec.unitText))) continue;
        if (/month|installment|lease|subscription|per\s*(?:kg|g|litre|liter)|月供|分期/i.test(label + ' ' + clean(spec.unitText) + ' ' + clean(spec.billingDuration))) continue;
        const sameState = state && typeof product.sku === 'string' && state.code === product.sku;
        const statePrice = sameState && obj(state.price) ? state.price : null;
        const low = numeric(statePrice?.value ?? spec.lowPrice ?? spec.price), high = numeric(spec.highPrice);
        if (low === undefined) continue;
        // A very small minimum beside a normal device price is commonly a
        // deposit, accessory option or instalment masquerading as an aggregate
        // product range. Do not publish that minimum as the device's price.
        if (high !== undefined && high >= low * 4 && high - low >= 100) continue;
        const kind: PriceQuote['kind'] = high !== undefined && high > low ? 'range' : spec.lowPrice !== undefined || type(offer,'AggregateOffer') ? 'from' : 'exact';
        const quote: PriceQuote = { kind, ...(high !== undefined ? {maxPrice:high} : {}), availability: state ? (sameState ? (state.notSellable === true || state.purchasable === false || (obj(state.stock) && state.stock.stockLevel === 0) ? 'out-of-stock' : state.preOrder === true ? 'preorder' : availability(obj(state.stock) ? state.stock.stockLevelStatus : undefined)) : 'unknown') : availability(offer.availability ?? product.availability), source:'html',
          ...(condition(offer.itemCondition ?? product.itemCondition) ? {condition:condition(offer.itemCondition ?? product.itemCondition)} : {}),
          ...(parent || selectedSku ? {variant:clean(selectedSku || product.sku || product.name).slice(0,200)} : {}),
          ...(label ? {note:label.slice(0,200)} : {}) };
        const row = record(title,productPage,market,geography,low,statePrice?.currencyIso ?? spec.priceCurrency ?? offer.priceCurrency ?? product.priceCurrency,quote,String(product.sku || offer.sku || ''));
        if (row) { row.productDetails = { ...(brand ? {brand:brand.slice(0,120)} : {}), ...(typeof product.model === 'string' ? {model:product.model.slice(0,120)} : {}) }; row.seller = clean(offer.seller?.name || offer.seller) || row.sourceHost; output.push(row); }
      }
    }
  }
  if (!products.length) {
    const product = microdataProduct(html, href => bound(href,page));
    if (product) products.push(product);
  }
  if (!selectedVariantOnly) for (const product of products) parse(product);
  if (!output.length && products.length===1 && type(products[0],'Product')) {
    const selected=selectedShopifyOffer(html,products[0],page);
    if (selected) parse(selected.product,undefined,selected.url,selected.sku);
  }
  // A primary, visible stock summary can be newer than a provider's cached
  // Markdown. Some used-product stores put a generic /model URL in JSON-LD.
  // Bind this fallback to one Product and its exact H1, never related cards.
  if (!selectedVariantOnly && !output.length && products.length===1 && type(products[0],'Product')) {
    const h1s=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
    const name=clean(products[0].name);
    if(h1s.length===1 && clean(h1s[0][1]).toLowerCase()===name.toLowerCase()) {
      const start=h1s[0].index!+h1s[0][0].length;
      const primary=html.slice(start,start+12000).split(/<h[1-6]\b/i)[0];
      const summaries=[...primary.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>clean(m[1]));
      const summary=summaries.find(s=>/^\d+ available used from [£€₹]/.test(s));
      if(summary) {
        const rows=broadMarkdownPrices({format:'markdown',title:name,content:'# '+name+'\n'+summary},pageUrl,market,geography);
        for(const row of rows) if(row.priceQuote){row.priceQuote.source='html';row.priceQuote.condition='used';output.push(row);}
      }
    }
  }
  const seen = new Set<string>(); return output.filter(r=>{const key=r.itemId+JSON.stringify(r.priceQuote);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,40);
}
const symbols: Record<string,string> = {'US$':'USD','S$':'SGD','HK$':'HKD','AU$':'AUD','CA$':'CAD','€':'EUR','£':'GBP','₹':'INR'};
export function broadMarkdownPrices(page: MarkdownPage, pageUrl: string, market: MarketCode, geography?: 'global', firstVisibleQuote = false): WebListing[] {
  const url=safeWebUrl(pageUrl);if(!url||!retailPricePage(pageUrl)||nonPurchasePageText(page.content)||!MARKETS[market]||page.content.length>2_000_000)return [];
  const plain=(s:string)=>s.replace(/~~[^~]*~~/g,'').replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[*_`]/g,'').trim();
  let title=clean(page.title).replace(/\s*-\s*Internet Explorer.*$/i,'').replace(/\s+[|–]\s+[^|]+$/, '');
  if (!title || /review|comparison|compare prices|price history|price alerts|rental|coupon|评测|优惠券|租赁|月租/i.test(title)) return [];
  const lines=page.content.split(/\r?\n/);
  const modelNumbers=(text:string)=>text.replace(/\d+\s*(?:GB|TB|inch|mm)\b/gi,'').match(/\d+/g)??[];
  const numbers=new Set(modelNumbers(title));
  if (lines.filter(line=>/^#\s/.test(line)).some(line=>modelNumbers(line).some(n=>!numbers.has(n)))) return [];
  const words=title.toLowerCase().match(/[a-z0-9]+/g)??[];
  if(lines.filter(line=>/^#\s/.test(line)).some(line=>words.filter(w=>plain(line).toLowerCase().includes(w)).length<Math.max(2,words.length*.6)))return [];
  let start=lines.findIndex(line=>/^#{1,3}\s/.test(line)&&words.filter(w=>plain(line).toLowerCase().includes(w)).length>=Math.max(2,words.length*.6));
  if(start<0 && !/add to (?:cart|bag|basket)|buy now|加入购物车|立即购买|in stock|availability/i.test(page.content))return [];
  if (start>=0 && /^#\s/.test(lines[start])) title=clean(plain(lines[start].replace(/^#\s+/,'')));
  const block=lines.slice(Math.max(0,start+1),Math.max(0,start+1)+160);const end=block.findIndex((l,i)=>/^(?:#{1,6}\s+)?(?:related|recommend(?:ed|ations?)|product specifications?|reviews|price history|how .*compares|full specifications|other products|similar products|more products|description|specifications?|features|delivery|click.?&.?collect delivery|home delivery|shipping options|next day delivery|returns|payment|finance|from.*per week|you may|you might|model overview|推荐|评价|产品描述|规格参数|付款|配送)/i.test(l) && (/^#{1,6}\s/.test(l) || block.slice(0,i).some(before=>/(?:[€£₹¥￥$]|\b[A-Z]{3})\s*\d/.test(before))));
  const body=(end<0?block:block.slice(0,end)).map(plain);const text=body.join('\n');
  if(!text || text.length>20000)return [];
  if (!/add to (?:cart|bag|basket)|buy now|加入购物车|立即购买/i.test(text) && /we compare.{0,30}stores|average price|price (?:tier|history)|prices? from.{0,20}merchants/i.test(page.content)) return [];
  const declared=[...text.matchAll(/(?:currency|币种)\s*[:：]\s*([A-Z]{3})\b/gi)].map(m=>m[1].toUpperCase());
  if(new Set(declared).size>1)return [];
  // These domestic storefronts display yuan without repeating its ISO code.
  // A bare yen/dollar symbol on an unknown store remains unsupported.
  const localMarketplace = Object.values(MARKETS[market].domains).some(domain => {
    const host = domain.replace(/^www\./, '');
    return url.hostname === host || url.hostname.endsWith('.' + host);
  });
  const sourceCurrency=localMarketplace||sourceCountry(url,market)==='local'?MARKETS[market].currency:/(^|\.)(?:colipu|suning|jd)\.com$/i.test(url.hostname)?'CNY':undefined;
  const currencyHint=declared[0]??sourceCurrency;
  const money=/(US\$|S\$|HK\$|AU\$|CA\$|[€£₹¥￥]|\b[A-Z]{3}\b|\$)\s*(\d[\d.,]*(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)|(?<![\p{L}\p{N}_.])(\d[\d.,]*)\s*(EUR|USD|SGD|GBP|€|£|₹)\b/gu;
  const candidates:Array<{price:number;currency:string;line:string}>=[];
  for(const line of body){
    if(/^\+\s*(?:[A-Z]{3}|[€£$¥￥])|^(?:[A-Z]{3}|(?:S|US|HK|A|NZ|CA)?\$|[€£₹¥￥])\s*\d[\d.,]*\s*off\b|^was\b|original price|list price|rrp|save\b|you save|shipping|delivery|deposit|booking fee|down payment|instalments?|installments?|payments? of|payment plans?|monthly|\/month|pay in|cash\s*back|rewards?|loyalty|earn\b|interest[- ]free|per (?:month|week)|\/(?:mo|wk)\b|orders? over|spend|credit|月供|分期|订金|定金|返现|积分|运费|原价/i.test(line))continue;
    for(const match of line.matchAll(money)){
      const symbol=match[1]||match[4], currency=symbols[symbol]??(symbol==='$'&&['USD','SGD','AUD','CAD','HKD','NZD'].includes(currencyHint)?currencyHint:/^[¥￥]$/.test(symbol)&&['CNY','JPY'].includes(currencyHint)?currencyHint:symbol.toUpperCase()); const price=numeric((match[2]||match[3]).replace(/(?<=\d)[.,]$/,''));
      if(price!==undefined&&currency&&currencyDigits(currency)!==null) {
        candidates.push({price,currency,line});
        const tail=line.slice(match.index!+match[0].length);
        const upper=tail.match(/^\s*[-–~]\s*(\d[\d.,]*)(?=$|\s|[);])/);
        const high=upper ? numeric(upper[1]) : undefined;
        if (high!==undefined && !/^\s*(?:mm|cm|inch|kg|gb|tb|%)/i.test(tail.slice(upper![0].length))) candidates.push({price:high,currency,line});
      }
    }
  }
  if(!candidates.length || new Set(candidates.map(c=>c.currency)).size>1)return [];
  const taxIncluded=candidates.filter(c=>/tax included|incl\.?\s*(?:tax|vat)|including (?:tax|vat)|含税/i.test(c.line));
  const taxFiltered=taxIncluded.length?taxIncluded:candidates;
  const explicitCurrent=taxFiltered.filter(c=>/^(?:now(?: price)?|sale price|current price|our price|售价|现价)/i.test(c.line));
  const selected=explicitCurrent.length?explicitCurrent:taxFiltered;
  let values=[...new Set(selected.map(c=>c.price))].sort((a,b)=>a-b);
  const isRange=/price range|starting at|from\s+(?:[A-Z]{3}|[€£$])|起价|\d[\d.,]*\s*[-–~]\s*(?:[A-Z]{3}|[€£$])?\s*\d/i.test(selected.map(c=>c.line).join('\n'));
  const choose=/^(?:choose|select)\s+(?:a\s+)?(?:model|variant|size|color|colour)|^选择.*(?:规格|型号|颜色)/im.test(text);
  if (values.length > 1 && values.at(-1)! >= values[0] * 4 && values.at(-1)! - values[0] >= 100) return [];
  const usedFirstVisible = firstVisibleQuote && values.length>1 && !isRange;
  if(values.length>1&&!isRange) {
    if (!firstVisibleQuote) return [];
    // A tiny first amount followed by a much larger product amount is usually
    // an instalment/monthly-payment widget whose label was lost by rendering.
    // Do not turn that ambiguity into a confident item price.
    const first=selected[0].price;
    if(!explicitCurrent.length && values.some(value=>value>=first*5 && value-first>=50))return [];
    values=[selected[0].price];
  }
  const kind: PriceQuote['kind']=values.length>1?'range':isRange||choose?'from':'exact';
  const quote: PriceQuote={kind,availability:availability(text),source:'fetch',...(values.length>1?{maxPrice:values.at(-1)}:{}),
    ...(condition(text)?{condition:condition(text)}:{}),...(taxIncluded.length?{note:'页面含税价'}:selected.some(c=>/tax excluded|excl\.?\s*(?:tax|vat)|excluding (?:tax|vat)|未税/i.test(c.line))?{note:'页面未税价，税费另计'}:usedFirstVisible?{note:'页面首个主报价，其他金额未采用'}:/member|coupon|rebate|会员|券后/i.test(text)?{note:'页面含会员或优惠条件，购买前确认适用条件'}:{})};
  const row=record(title,url,market,geography,values[0],candidates[0].currency,quote);return row?[row]:[];
}

const htmlEntity = (value: string): string => value
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
  .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (raw, hex: string | undefined, decimal: string | undefined) => {
    const point = parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : raw;
  });

function quoteIdentity(pageTitle: string, headings: string[], query: string, model?: string): string | undefined {
  const candidates = [...headings, pageTitle]
    .map(value => clean(htmlEntity(value)).replace(/\s+[|–—]\s+[^|–—]+$/, ''))
    .filter((value, index, rows) => value.length >= 2 && rows.indexOf(value) === index);
  return candidates.find(value => queryMatchesTitle(query, value, model));
}

/**
 * Last-resort quote mode. The requested product must still match the detail
 * page identity, but stock, condition, schema.org and heading layout are not
 * required. broadMarkdownPrices continues to reject freight, instalments,
 * rewards and prices outside the primary product block.
 */
export function quoteOnlyMarkdownPrice(page: MarkdownPage, pageUrl: string, market: MarketCode,
  query: string, model?: string, geography?: 'global'): WebListing[] {
  const url = safeWebUrl(pageUrl);
  if (!url || !retailPricePage(pageUrl) || nonPurchasePageText(page.content) || page.content.length > 2_000_000) return [];
  const lines = page.content.split(/\r?\n/);
  const headings = lines.filter(line => /^#{1,2}\s+/.test(line)).slice(0, 20)
    .map(line => line.replace(/^#{1,2}\s+/, ''));
  const identity = quoteIdentity(page.title, headings, query, model);
  if (!identity) return [];
  const matchingHeading = lines.findIndex(line => /^#{1,3}\s+/.test(line)
    && queryMatchesTitle(query, plainMarkdown(line.replace(/^#{1,3}\s+/, '')), model));
  // Some storefront renderers emit the product summary and price before the
  // semantic H1. Retain that identity-bound summary instead of starting after
  // the later description heading.
  const start = matchingHeading < 0 || lines.slice(0, matchingHeading).some(line => MONEY_LINE.test(line))
    ? 0 : matchingHeading + 1;
  const primary = lines.slice(start, start + 180);
  const nextProduct = primary.findIndex((line, index) => index > 0 && /^#{1,2}\s+/.test(line)
    && queryMatchesTitle(query, plainMarkdown(line.replace(/^#{1,2}\s+/, '')), model) === false
    && MONEY_LINE.test(line));
  const body = (nextProduct < 0 ? primary : primary.slice(0, nextProduct))
    .map(line => /^#{1,6}\s+/.test(line) ? line.replace(/^#{1,6}\s+/, '') : line);
  return broadMarkdownPrices({ ...page, title: identity, content: '# ' + identity + '\n' + body.join('\n') }, pageUrl, market, geography, true);
}

const plainMarkdown = (value: string): string => value.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
const MONEY_LINE = /(?:[A-Z]{3}|(?:S|US|HK|A|NZ|CA)?\$|[€£₹¥￥])\s*\d|\d[\d.,]*\s*(?:EUR|USD|SGD|GBP|€|£|₹)\b/i;

/** Read a visible amount when a product page has no usable Product schema. */
export function quoteOnlyHtmlPrice(html: string, pageUrl: string, market: MarketCode,
  query: string, model?: string, geography?: 'global'): WebListing[] {
  const url = safeWebUrl(pageUrl);
  if (!url || html.length > 8_000_000 || !retailPricePage(pageUrl) || nonPurchasePageHtml(html)) return [];
  const withoutCode = html.replace(/<!--[^]*?-->|<(script|style|template|noscript|svg)\b[^>]*>[^]*?<\/\1\s*>/gi, '');
  const pageTitle = htmlEntity(withoutCode.match(/<title\b[^>]*>([^]*?)<\/title\s*>/i)?.[1] ?? '').replace(/<[^>]*>/g, ' ');
  const headingMatches = [...withoutCode.matchAll(/<h1\b[^>]*>([^]*?)<\/h1\s*>/gi)].slice(0, 10);
  const headings = headingMatches.map(match => htmlEntity(match[1].replace(/<[^>]*>/g, ' ')));
  const identity = quoteIdentity(pageTitle, headings, query, model);
  if (!identity) return [];
  const matchingHeading = headingMatches.find(match => queryMatchesTitle(query,
    clean(htmlEntity(match[1].replace(/<[^>]*>/g, ' '))), model));
  const start = matchingHeading ? matchingHeading.index! + matchingHeading[0].length : 0;
  const fragment = withoutCode.slice(start, start + 80_000).split(/<h1\b/i, 1)[0]
    .replace(/<(?:br|p|div|li|section|article|h[2-6]|button|label|option|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  const visible = htmlEntity(fragment).split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean).slice(0, 180).join('\n');
  return quoteOnlyMarkdownPrice({ format:'markdown', title:identity, content:'# ' + identity + '\n' + visible },
    pageUrl, market, query, model, geography).map(row => ({ ...row, priceQuote:{ ...row.priceQuote!, source:'html' } }));
}
