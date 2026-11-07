import { normalizeDiscoveryModel, normalizeSearchQuery, queryMatchesTitle } from './discovery-match.ts';
import { config } from './config.ts';
import { marketplaces, marketplacePage, searchMarketplace } from './marketplace-search.ts';
import { searchDeepSeekCandidates } from './deepseek/search.ts';
import { searchWebCandidates } from './brightdata/serp.ts';
import { readProductPage } from './product-page-reader.ts';
import { selectedMerchantHtml } from './merchant-search.ts';
import { parseWebProduct } from './platforms/web-product.ts';
import { fetchWebProductPage } from './brightdata/web-page.ts';
import { isPlatformSupported, MARKETS, type MarketCode, type PlatformId } from './markets.ts';
import { getAdapter } from './platforms/index.ts';
import type { DiscoveryListing, RawListing } from './types.ts';
import { discoverWebProducts, type WebDiscoveryDependencies } from './web-discovery.ts';
import { safeWebUrl } from './safe-web-url.ts';
import { verifyProductPage, type FetchProductPage } from './verify-product-page.ts';

export interface DiscoveryOptions {
  market: MarketCode;
  platforms: PlatformId[];
  query: string;
  model?: string;
  maxPrice?: number;
  scope?: 'web' | 'platforms';
  geography?: 'global';
  excludedPlatforms?: PlatformId[];
}

export interface DiscoveryResult extends DiscoveryOptions {
  ok: true;
  listings: DiscoveryListing[];
  summary: { requests: number; matched: number; skipped: number; failed: number; failureCodes?: string[]; failedPlatforms?: PlatformId[];
    discovered?: number; pagesChecked?: number; pagesVerified?: number };
}

export interface DiscoveryDependencies {
  search?: (platform: PlatformId, market: MarketCode, query: string) => Promise<RawListing[]>;
  fetchPage?: FetchProductPage;
  web?: WebDiscoveryDependencies;
  /** Test/diagnostic override; live requests default to the configured fast path. */
  maxCandidatesPerPlatform?: number;
}

/** Chat search is live-only: no catalog reads, product registration, or offer ingestion. */
export async function discoverProduct(options: DiscoveryOptions, dependencies: DiscoveryDependencies = {}): Promise<DiscoveryResult> {
  const query = normalizeSearchQuery(options.query);
  const model = options.model === undefined ? undefined : normalizeDiscoveryModel(options.model);
  if (options.maxPrice !== undefined && (!Number.isFinite(options.maxPrice) || options.maxPrice <= 0 || options.maxPrice > 1e12)) throw new Error('预算必须是有效正数');
  const platforms = [...new Set(options.platforms)];
  if (options.scope !== undefined && !['web', 'platforms'].includes(options.scope)) throw new Error('商品搜索范围无效');
  if (options.geography !== undefined && (options.geography !== 'global' || options.scope !== 'web')) throw new Error('全球范围仅支持全网搜索');
  if (options.scope === 'web') {
    if (!Object.hasOwn(MARKETS, options.market) || platforms.length) throw new Error('全网搜索不能附带平台包含筛选');
    return discoverWebProducts({ ...options, query, model, platforms }, dependencies.web);
  }
  if (!Object.hasOwn(MARKETS, options.market) || !platforms.length || platforms.length > 3) throw new Error('商品搜索范围无效');
  for (const platform of platforms) {
    if (!isPlatformSupported(MARKETS[options.market], platform)) throw new Error('商品搜索平台与市场不匹配');
  }
  const search = dependencies.search ?? ((platform, market, text) => getAdapter(platform).search(market, text, {
    timeoutMs: config.liveSearchTimeoutMs,
    renderRetry: false,
  }));
  const fetchPage: FetchProductPage = dependencies.fetchPage ?? (async (url, market) => {
    if (marketplaces.some(platform => marketplacePage(url, market, platform))) {
      const html = await selectedMerchantHtml(url, market).catch(() => undefined);
      if (html && parseWebProduct(html, url, market).length) return html;
      return readProductPage(url, market, { query, model });
    }
    return fetchWebProductPage(url, market, { timeoutMs: config.livePageTimeoutMs });
  });
  const maxCandidatesPerPlatform = dependencies.maxCandidatesPerPlatform
    ?? config.liveCandidatesPerPlatform;
  const summary: DiscoveryResult['summary'] = { requests: platforms.length, matched: 0, skipped: 0, failed: 0,
    discovered: 0, pagesChecked: 0, pagesVerified: 0 };
  const failedPlatforms = new Set<PlatformId>();
  const failureCodes = new Set<string>();
  const fail = (platform: PlatformId, code: string) => {
    summary.failed++;
    failedPlatforms.add(platform);
    failureCodes.add(code);
  };
  // Independent platform failures must not prevent the other marketplaces from returning.
  // Preserve input order even when a faster platform completes first.
  const results = await Promise.all(platforms.map(async (platform) => {
    try {
      let candidates: {url:string; title:string; platform:PlatformId; market:MarketCode}[];
      if (!dependencies.search && (platform === 'shopee' || platform === 'lazada')) {
        const index = config.webSearch.provider === 'deepseek' ? searchDeepSeekCandidates : searchWebCandidates;
        const pages = await searchMarketplace(platform, options.market, query, index).catch(() => []);
        candidates = pages.filter(p => queryMatchesTitle(query,p.title,model)).map(page => ({ ...page, platform, market:options.market }));
        if (!candidates.length) {
          summary.requests++;
          candidates = await search(platform, options.market, query);
        }
      } else candidates = await search(platform, options.market, query);
      const seen = new Set<string>();
      const matches = candidates.slice(0, 100)
        .filter((listing) => {
          const url = safeWebUrl(listing.url);
          const domain = MARKETS[options.market].domains[platform]?.replace(/^www\./, '');
          return listing.platform === platform && listing.market === options.market && url && domain
            && (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
            && queryMatchesTitle(query, listing.title, model);
        })
        .filter((listing) => {
          const url = safeWebUrl(listing.url)!.href;
          if (seen.has(url)) return false;
          seen.add(url);
          return true;
        }).slice(0, maxCandidatesPerPlatform)
        // Deliberately discard all price, stock, seller and rating hints.
        .map((listing) => ({ platform, url: safeWebUrl(listing.url)!.href }));
      if (!matches.length) summary.skipped += 1;
      return matches;
    } catch (error) {
      fail(platform, 'SOURCE_SEARCH_FAILED');
      // Keep provider credentials, response bodies and proxy URLs out of logs.
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      console.warn(`[crawler-search] ${platform} ${options.market} failed: ${/^[A-Z0-9_]{1,80}$/.test(code) ? code : 'SOURCE_REQUEST_FAILED'}`);
      return [];
    }
  }));
  const pages = results.flat();
  summary.discovered = pages.length;
  const verified: RawListing[][] = pages.map(() => []);
  let next = 0;
  // At most nine pages and three active page requests across all marketplaces.
  await Promise.all(Array.from({ length: Math.min(3, pages.length) }, async () => {
    while (next < pages.length) {
      const index = next++;
      const page = pages[index];
      summary.requests++;
      summary.pagesChecked!++;
      try {
        const listings = await verifyProductPage(page.url, { ...options, query, model }, fetchPage);
        verified[index] = listings.map(({ sourceHost: _host, ...listing }) => ({ ...listing, platform: page.platform }));
        if (!listings.length) summary.skipped++;
        else summary.pagesVerified!++;
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
        fail(page.platform, code === 'PRODUCT_PAGE_UNVERIFIED' ? code : 'PRODUCT_PAGE_FETCH_FAILED');
      }
    }
  }));
  const seenListings = new Set<string>();
  const listings = verified.flat().filter((listing) => {
    const key = `${listing.platform}:${listing.itemId}`;
    if (seenListings.has(key)) return false;
    seenListings.add(key);
    return true;
  }).sort((a, b) => a.price - b.price);
  summary.matched = listings.length;
  if (failedPlatforms.size) summary.failedPlatforms = platforms.filter((platform) => failedPlatforms.has(platform));
  if (failureCodes.size) summary.failureCodes = [...failureCodes].sort();
  return { ok: true, market: options.market, platforms, query, ...(options.scope ? { scope: options.scope } : {}),
    ...(model ? { model } : {}), ...(options.maxPrice !== undefined ? { maxPrice: options.maxPrice } : {}),
    summary, listings };
}
