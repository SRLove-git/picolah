import { config } from './config.ts';
import { fetchDeepSeekPage, type MarkdownPage } from './deepseek/fetch.ts';
import { fetchWebProductPage } from './brightdata/web-page.ts';
import { inspectMarkdownProduct } from './platforms/markdown-product.ts';
import { parseWebProduct } from './platforms/web-product.ts';
import { BrightDataError } from './brightdata/web-unlocker.ts';
import type { WebListing } from './types.ts';
import type { MarketCode } from './markets.ts';
import { queryMatchesListing } from './discovery-match.ts';

export type ProductPageContent = string | MarkdownPage;
export type PageReaderEvent = { provider: 'deepseek' | 'brightdata'; outcome: 'request' | 'parsed' | 'verified' | 'unverified' | 'fetched' | 'error' | 'conflict'; code?: string; status?: number };
const errorCode = (error: unknown) => error && typeof error === 'object' && 'code' in error ? String(error.code) : 'WEB_PAGE_NETWORK_ERROR';
const errorStatus = (error: unknown): { status?: number } => {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {};
};
const SECURITY_ERRORS = ['UNSAFE_WEB_URL', 'WEB_DNS_FAILED', 'WEB_DNS_TIMEOUT', 'WEB_PAGE_REDIRECT_REJECTED'];

function variantConflict(a: string, b: string): boolean {
  const colors = (s: string) => new Set(s.toLowerCase().match(/\b(?:black|white|silver|blue|pink|green|red|purple|gold)\b/g) ?? []);
  const left = colors(a), right = colors(b);
  if (left.size && right.size && ![...left].some(color => right.has(color))) return true;
  // RAM alone must not be compared with storage. Compare explicit storage-size
  // candidates only, preserving a variant conflict even when RAM is identical.
  const storage = (s: string) => Math.max(0, ...[...s.matchAll(/(\d+)\s*(GB|TB)\b/gi)].map(m => Number(m[1]) * (/tb/i.test(m[2]) ? 1024 : 1)).filter(n => n >= 64));
  return !!storage(a) && !!storage(b) && storage(a) !== storage(b);
}

/** Fetch first, then at most one HTML corroboration/fallback. Conflicts never
 * select a lower price or combine price and stock from different responses. */
export async function readProductPage(url: string, market: MarketCode, options: {
  geography?: 'global'; query?: string; model?: string; provider?: 'deepseek' | 'brightdata'; fallback?: boolean;
  fetchMarkdown?: typeof fetchDeepSeekPage; fetchHtml?: typeof fetchWebProductPage;
  /** Shared discovery budget: at most one short retry of this page's transport. */
  consumeRetry?: () => boolean;
  onEvent?: (event: PageReaderEvent) => void;
} = {}): Promise<ProductPageContent> {
  const provider = options.provider ?? config.pageFetch.provider;
  let markdown: MarkdownPage | undefined;
  let markdownOffer: WebListing | undefined;
  const matches = (listing: WebListing) => !options.query || queryMatchesListing(options.query, listing, market, 'web', options.model, options.geography);
  if (provider === 'deepseek') {
    const fallback = options.fallback ?? config.pageFetch.fallback;
    try {
      options.onEvent?.({ provider: 'deepseek', outcome: 'request' });
      markdown = await (options.fetchMarkdown ?? fetchDeepSeekPage)(url, { timeoutMs: 12_000 });
      const inspection = inspectMarkdownProduct(markdown, url, market, options.geography);
      markdownOffer = inspection.listings.find(matches);
      options.onEvent?.({ provider: 'deepseek', outcome: markdownOffer ? 'parsed' : 'unverified',
        ...(!markdownOffer ? { code: inspection.reason || 'PRODUCT_IDENTITY_MISMATCH' } : {}) });
      if (!fallback) return markdown;
    } catch (error) {
      const code = errorCode(error);
      options.onEvent?.({ provider: 'deepseek', outcome: 'error', code, ...errorStatus(error) });
      if (!fallback || SECURITY_ERRORS.includes(code)) throw error;
    }
  }
  try {
    options.onEvent?.({ provider: 'brightdata', outcome: 'request' });
    const fetchHtml = options.fetchHtml ?? fetchWebProductPage;
    let html: string;
    try {
      html = await fetchHtml(url, market, { timeoutMs: provider === 'deepseek' ? 18_000 : 25_000, geography: options.geography });
    } catch (error) {
      const code = errorCode(error);
      if (!['WEB_PAGE_TIMEOUT', 'WEB_PAGE_NETWORK_ERROR'].includes(code) || !options.consumeRetry?.()) throw error;
      options.onEvent?.({ provider: 'brightdata', outcome: 'error', code, ...errorStatus(error) });
      options.onEvent?.({ provider: 'brightdata', outcome: 'request' });
      html = await fetchHtml(url, market, { timeoutMs: 8_000, geography: options.geography });
    }
    options.onEvent?.({ provider: 'brightdata', outcome: 'fetched' });
    if (markdownOffer) {
      const offers = parseWebProduct(html, url, market, options.geography);
      const htmlOffer = offers.find(matches);
      let conflict: string | undefined;
      if (offers.length && (!htmlOffer || variantConflict(markdownOffer.title, htmlOffer.title))) conflict = 'PRODUCT_PAGE_IDENTITY_CONFLICT';
      else if (htmlOffer && (htmlOffer.currency !== markdownOffer.currency || htmlOffer.price !== markdownOffer.price)) conflict = 'PRODUCT_PAGE_PRICE_CONFLICT';
      if (conflict) {
        options.onEvent?.({ provider: 'deepseek', outcome: 'conflict', code: conflict });
        throw new BrightDataError('同一商品页面的报价或规格不一致，未采纳该报价', { code: conflict });
      }
      options.onEvent?.({ provider: 'deepseek', outcome: htmlOffer ? 'verified' : 'unverified',
        ...(!htmlOffer ? { code: 'HTML_CORROBORATION_UNVERIFIED' } : {}) });
    }
    return html;
  } catch (error) {
    const code = errorCode(error);
    if (code.startsWith('PRODUCT_PAGE_') && code.endsWith('_CONFLICT')) throw error;
    options.onEvent?.({ provider: 'brightdata', outcome: 'error', code, ...errorStatus(error) });
    if (SECURITY_ERRORS.includes(code)) throw error;
    // Preserve safe same-site directory links from Fetch when HTML is blocked.
    // When corroboration is enabled, a timeout must not resurrect an unchecked
    // Markdown price either. Only incomplete content may survive for links.
    if (markdown && !markdownOffer) return markdown;
    throw error;
  }
}
