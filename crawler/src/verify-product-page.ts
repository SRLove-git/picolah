import { isDirectoryPath } from './product-page-links.ts';
import { fetchWebProductPage } from './brightdata/web-page.ts';
import { BrightDataError } from './brightdata/web-unlocker.ts';
import { queryMatchesListing } from './discovery-match.ts';
import { MARKETS, type MarketCode } from './markets.ts';
import { parseWebProduct } from './platforms/web-product.ts';
import type { PriceQuote, WebListing } from './types.ts';
import type { ProductPageContent } from './product-page-reader.ts';
import { parseMarkdownProduct } from './platforms/markdown-product.ts';

export type FetchProductPage = (url: string, market: MarketCode) => Promise<ProductPageContent>;

// A classified ad can quote the right model and price while selling a used
// item. Read the seller's condition field, not wording from related ads.
function classifiedCondition(content: ProductPageContent): PriceQuote['condition'] {
  const body = typeof content === 'string'
    ? content.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, '\n')
    : content.content;
  const primary = body.split(/(?:浏览卖家页面|瀏覽賣家頁面|Meet the seller|Similar listings|你可能还喜欢)/i)[0];
  const value = primary.match(/(?:^|\n)\s*(?:商品[状狀][况況]|物品[状狀][况況]|condition)\s*[:：]?\s*([^\n]{1,60})/i)?.[1]?.trim();
  if (!value) return;
  if (/^(?:refurbished|翻新|整新)$/i.test(value)) return 'refurbished';
  if (/^(?:like new|(?:lightly|well|heavily) used|[状狀][况況](?:良好|尚可|欠佳)|近乎全新|[几幾]乎全新|二手|[轻輕]微使用)$/i.test(value)) return 'used';
  if (/^(?:brand new|new|全新)$/i.test(value)) return 'new';
}

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
  if (/(?:^|\.)carousell\.(?:sg|com\.my|com\.hk|ph|com\.ph)$/i.test(new URL(url).hostname)) {
    const condition = classifiedCondition(html);
    for (const listing of listings) {
      const quote = listing.priceQuote ??= { kind:'exact', availability:listing.inStock?'in-stock':'unknown',
        source:typeof html==='string'?'html':'fetch' };
      if (condition && (!quote.condition || quote.condition === 'new')) quote.condition = condition;
      if (!quote.condition) quote.note = ['卖家刊登，成色未核实',quote.note].filter(Boolean).join('；').slice(0,200);
    }
  }
  const checkedAt = new Date().toISOString();
  return listings
    .filter((listing) => queryMatchesListing(options.query, listing, options.market, 'web', options.model, options.geography))
    // A foreign amount cannot be compared numerically to a budget without FX evidence.
    .filter((listing) => options.maxPrice === undefined || (options.geography === 'global' && listing.currency !== MARKETS[options.market].currency) || listing.price <= options.maxPrice)
    .map((listing) => ({ ...listing, verification: { source: 'product-page' as const, checkedAt } }));
}
