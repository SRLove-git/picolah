import { isDirectoryPath } from './product-page-links.ts';
import { fetchWebProductPage } from './brightdata/web-page.ts';
import { BrightDataError } from './brightdata/web-unlocker.ts';
import { queryMatchesListing } from './discovery-match.ts';
import { MARKETS, type MarketCode } from './markets.ts';
import { parseWebProduct } from './platforms/web-product.ts';
import type { WebListing } from './types.ts';
import type { ProductPageContent } from './product-page-reader.ts';
import { parseMarkdownProduct } from './platforms/markdown-product.ts';

export type FetchProductPage = (url: string, market: MarketCode) => Promise<ProductPageContent>;

/** The only price source is the fetched page. A search result is just a URL. */
export async function verifyProductPage(
  url: string,
  options: { market: MarketCode; query: string; model?: string; maxPrice?: number; geography?: 'global' },
  fetchPage: FetchProductPage = fetchWebProductPage,
): Promise<WebListing[]> {
  const html = await fetchPage(url, options.market);
  // Directory pages may reveal a direct product link, but their own prices
  // (including the lowest offer across multiple models) cannot be quoted.
  if (isDirectoryPath(new URL(url).pathname)) return [];
  const listings = typeof html === 'string' ? parseWebProduct(html, url, options.market, options.geography)
    : parseMarkdownProduct(html, url, options.market, options.geography);
  if (!listings.length) {
    // Missing/ambiguous structured data or a challenge is not proof of no stock.
    throw new BrightDataError('商品详情页未提供可核验的单品报价', { code: 'PRODUCT_PAGE_UNVERIFIED' });
  }
  const checkedAt = new Date().toISOString();
  return listings
    .filter((listing) => queryMatchesListing(options.query, listing, options.market, 'web', options.model, options.geography))
    // A foreign amount cannot be compared numerically to a budget without FX evidence.
    .filter((listing) => options.maxPrice === undefined || (options.geography === 'global' && listing.currency !== MARKETS[options.market].currency) || listing.price <= options.maxPrice)
    .map((listing) => ({ ...listing, verification: { source: 'product-page' as const, checkedAt } }));
}
