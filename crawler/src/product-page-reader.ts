import { canonicalProductPage } from './product-page-links.ts';
import { config } from './config.ts';
import { fetchDeepSeekPage, type MarkdownPage } from './deepseek/fetch.ts';
import { fetchWebProductPage } from './brightdata/web-page.ts';
import { inspectMarkdownProduct } from './platforms/markdown-product.ts';
import { nonPurchasePageHtml, nonPurchasePageText, quoteOnlyMarkdownPrice } from './product-page-prices.ts';
import { queryMatchesListing } from './discovery-match.ts';
import { parseWebProduct } from './platforms/web-product.ts';
import type { MarketCode } from './markets.ts';

export type ProductPageContent = string | MarkdownPage;
export type PageReaderEvent = { provider: 'deepseek' | 'brightdata'; outcome: 'request' | 'parsed' | 'verified' | 'unverified' | 'fetched' | 'error' | 'conflict'; code?: string; status?: number };
const errorCode = (error: unknown) => error && typeof error === 'object' && 'code' in error ? String(error.code) : 'WEB_PAGE_NETWORK_ERROR';
const errorStatus = (error: unknown): { status?: number } => {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {};
};
const SECURITY_ERRORS = ['UNSAFE_WEB_URL', 'WEB_DNS_FAILED', 'WEB_DNS_TIMEOUT', 'WEB_PAGE_REDIRECT_REJECTED'];

/** Read both representations in parallel. HTML wins when it provides product
 * prices; a usable fetched page survives HTML failures or missing structured data. */
export async function readProductPage(url: string, market: MarketCode, options: {
  geography?: 'global'; query?: string; model?: string; provider?: 'deepseek' | 'brightdata'; fallback?: boolean;
  fetchMarkdown?: typeof fetchDeepSeekPage; fetchHtml?: typeof fetchWebProductPage;
  consumeRetry?: () => boolean; onEvent?: (event: PageReaderEvent) => void;
} = {}): Promise<ProductPageContent> {
  const provider = options.provider ?? config.pageFetch.provider;
  const event = (v: PageReaderEvent) => options.onEvent?.(v);
  const getHtml = async () => {
    const fetchHtml = options.fetchHtml ?? fetchWebProductPage;
    event({provider:'brightdata',outcome:'request'});
    try {
      let html: string;
      try { html = await fetchHtml(url, market, {timeoutMs:40_000,geography:options.geography}); }
      catch(error) {
        if (!['WEB_PAGE_TIMEOUT','WEB_PAGE_NETWORK_ERROR'].includes(errorCode(error)) || !options.consumeRetry?.()) throw error;
        event({provider:'brightdata',outcome:'error',code:errorCode(error),...errorStatus(error)});
        event({provider:'brightdata',outcome:'request'});
        html = await fetchHtml(url,market,{timeoutMs:15_000,geography:options.geography});
      }
      event({provider:'brightdata',outcome:'fetched'}); return html;
    } catch(error) { event({provider:'brightdata',outcome:'error',code:errorCode(error),...errorStatus(error)}); throw error; }
  };
  if (provider !== 'deepseek') return getHtml();
  const getMarkdown = async () => {
    event({provider:'deepseek',outcome:'request'});
    try {
      const page = await (options.fetchMarkdown ?? fetchDeepSeekPage)(url,{timeoutMs:25_000});
      const result=inspectMarkdownProduct(page,url,market,options.geography);
      if (!result.listings.length && options.query) result.listings = quoteOnlyMarkdownPrice(
        page,url,market,options.query,options.model,options.geography);
      event({provider:'deepseek',outcome:result.listings.length?'parsed':'unverified',...(!result.listings.length?{code:result.reason}:{})});
      return page;
    } catch(error) { event({provider:'deepseek',outcome:'error',code:errorCode(error),...errorStatus(error)}); throw error; }
  };
  if (!(options.fallback ?? config.pageFetch.fallback)) return getMarkdown();
  const [md,html] = await Promise.allSettled([getMarkdown(),getHtml()]);
  for (const response of [md,html]) if(response.status==='rejected' && SECURITY_ERRORS.includes(errorCode(response.reason))) throw response.reason;
  // Explicit non-retail text must not be overridden by a placeholder JSON-LD price.
  if (md.status==='fulfilled' && nonPurchasePageText(md.value.content)) return md.value;
  if (html.status==='fulfilled') {
    if (nonPurchasePageHtml(html.value)) return html.value;
    const offers=parseWebProduct(html.value,url,market,options.geography);
    // UK title differentiators can be omitted by one representation. Only
    // corroborate an exact model from Fetch when its primary title extends the
    // single HTML identity; an explicitly different model still wins as conflict.
    if (offers.length && options.query && md.status==='fulfilled' && /^(?:www\.)?amazon\.co\.uk$/.test(new URL(url).hostname)) {
      const identity=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
      const base=identity(offers[0].title);
      const matches=(row:typeof offers[number])=>queryMatchesListing(options.query!,row,market,'web',options.model,options.geography);
      if(base.length>=20 && offers.every(row=>identity(row.title)===base && !row.productDetails?.model) && !offers.some(matches)) {
        const fetched=inspectMarkdownProduct(md.value,url,market,options.geography).listings;
        if(fetched.some(row=>matches(row)&&identity(row.title).startsWith(base+' ')))return {...md.value,stockUnconfirmed:true};
      }
    }
    if (offers.length || md.status==='rejected') {
      if (offers.length && options.query && !offers.some(row => queryMatchesListing(
        options.query!,row,market,'web',options.model,options.geography)) && md.status==='fulfilled') {
        const fetched=quoteOnlyMarkdownPrice(md.value,url,market,options.query,options.model,options.geography);
        if(fetched.some(row=>queryMatchesListing(options.query!,row,market,'web',options.model,options.geography)))
          return {...md.value,stockUnconfirmed:true};
      }
      return html.value;
    }
    // Let discovery verify the merchant's new URL rather than quote Markdown
    // cached under an obsolete slug. Harvey Norman is an exception: campaign
    // URLs are live aliases of the canonical PDP, while the canonical renderer
    // currently omits its primary price. A freshly fetched exact-model quote on
    // that alias remains bound to the current HTML canonical identity.
    const canonical = options.query && canonicalProductPage(html.value,url,options.query,options.model);
    if (canonical) {
      if (/^(?:www\.)?harveynorman\.com\.sg$/i.test(new URL(url).hostname) && md.status === 'fulfilled') {
        const fetched=quoteOnlyMarkdownPrice(md.value,url,market,options.query!,options.model,options.geography);
        if(fetched.some(row=>queryMatchesListing(options.query!,row,market,'web',options.model,options.geography)))
          return {...md.value,stockUnconfirmed:true};
      }
      return html.value;
    }
  }
  if (md.status==='fulfilled') return { ...md.value, stockUnconfirmed: true };
  if (html.status==='fulfilled') return html.value;
  throw html.reason;
}
