import { searchWebCandidates, type WebSearchCandidate } from './brightdata/serp.ts';
import { fetchWebProductPage } from './brightdata/web-page.ts';
import { queryMatchesListing } from './discovery-match.ts';
import type { DiscoveryOptions, DiscoveryResult } from './discovery.ts';
import { MARKETS, type MarketCode, type PlatformId } from './markets.ts';
import { parseWebProduct } from './platforms/web-product.ts';
import { safeWebUrl } from './safe-web-url.ts';
import type { WebListing } from './types.ts';

export interface WebDiscoveryDependencies {
  search?: (query: string, market: MarketCode) => Promise<WebSearchCandidate[]>;
  fetchPage?: (url: string, market: MarketCode) => Promise<string>;
}

export const DISCOVERY_PLATFORMS: PlatformId[] = ['shopee', 'lazada', 'tiktok', 'amazon-sg', 'tokopedia', 'tiki'];
const MAX_PAGES = 8;
const MAX_PER_HOST = 2;
const CONCURRENCY = 3;
const FAILURE_CODES = new Set([
  'SERP_NOT_CONFIGURED', 'SERP_AUTH_FAILED', 'SERP_HTTP_ERROR', 'SERP_TIMEOUT',
  'SERP_NETWORK_ERROR', 'SERP_PARSE_FAILED', 'SERP_SOURCE_FAILED', 'SERP_RESPONSE_TOO_LARGE',
  'WEB_UNLOCKER_NOT_CONFIGURED', 'WEB_PAGE_AUTH_FAILED', 'WEB_PAGE_HTTP_ERROR', 'WEB_PAGE_TIMEOUT',
  'WEB_PAGE_NETWORK_ERROR', 'WEB_PAGE_PARSE_FAILED', 'WEB_PAGE_RESPONSE_TOO_LARGE', 'WEB_PAGE_REDIRECT_REJECTED', 'WEB_PAGE_SOURCE_FAILED',
  'WEB_DNS_FAILED', 'WEB_DNS_TIMEOUT', 'UNSAFE_WEB_URL',
]);
const ALIASES: Record<PlatformId, string[]> = {
  shopee: ['shopee.com', 'shopee.com.br', 'shopee.com.mx', 'shopee.tw', 'shopee.cl', 'shopee.com.co', 'shp.ee', 'shope.ee'],
  lazada: ['lazada.com', 'lazmall.com'],
  tiktok: ['tiktok.com', 'tiktokshop.com', 'tiktokglobalshop.com', 'shop-tokopedia.com'],
  'amazon-sg': ['amazon.com', 'amazon.co.uk', 'amazon.co.jp', 'amazon.de', 'amazon.in', 'amazon.com.au',
    'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.ca', 'amazon.com.br', 'amazon.com.mx', 'amazon.ae',
    'amazon.sa', 'amazon.nl', 'amazon.pl', 'amazon.se', 'amazon.com.be', 'amazon.com.tr', 'amazon.eg', 'amazon.co.za',
    'amzn.to', 'amzn.asia', 'amzn.eu', 'amzn.in', 'a.co'],
  tokopedia: ['tokopedia.com', 'tokopedia.link', 'shop-tokopedia.com'],
  tiki: ['tiki.vn'],
};
function domainMatches(host: string, domain: string): boolean {
  const normalized = domain.replace(/^www\./, '');
  return host === normalized || host.endsWith(`.${normalized}`);
}

/** Arbitrary retailers are allowed; known marketplace exclusions and market boundaries still apply. */
export function webSourceAllowed(url: URL, market: MarketCode, excluded: PlatformId[]): boolean {
  for (const platform of DISCOVERY_PLATFORMS) {
    const domains = [...new Set(Object.values(MARKETS).flatMap((item) => item.domains[platform] ? [item.domains[platform]!] : []))];
    const known = [...domains, ...ALIASES[platform]].some((domain) => domainMatches(url.hostname, domain));
    if (!known) continue;
    if (excluded.includes(platform)) return false;
    const current = MARKETS[market].domains[platform];
    if (!current || !domainMatches(url.hostname, current)) return false;
  }
  return true;
}

function selectPages(candidates: WebSearchCandidate[], market: MarketCode, excluded: PlatformId[]): WebSearchCandidate[] {
  const groups = new Map<string, WebSearchCandidate[]>();
  const seen = new Set<string>();
  for (const candidate of candidates.slice(0, 100)) {
    const url = safeWebUrl(candidate?.url);
    if (!url || !webSourceAllowed(url, market, excluded) || seen.has(url.href)) continue;
    seen.add(url.href);
    const host = url.hostname.replace(/^www\./, '');
    const group = groups.get(host) ?? [];
    if (group.length < MAX_PER_HOST) group.push({ ...candidate, url: url.href });
    groups.set(host, group);
  }
  const pages: WebSearchCandidate[] = [];
  for (let round = 0; round < MAX_PER_HOST; round++) {
    for (const group of groups.values()) {
      if (group[round]) pages.push(group[round]);
      if (pages.length >= MAX_PAGES) return pages;
    }
  }
  return pages;
}

/** Optional cross-web path: one SERP discovery, then bounded live product-page verification. */
export async function discoverWebProducts(options: DiscoveryOptions, dependencies: WebDiscoveryDependencies = {}): Promise<DiscoveryResult> {
  const excluded = [...new Set(options.excludedPlatforms ?? [])];
  if (excluded.some((platform) => !DISCOVERY_PLATFORMS.includes(platform))) throw new Error('商品搜索排除平台无效');
  const summary: DiscoveryResult['summary'] = { requests: 0, matched: 0, skipped: 0, failed: 0 };
  const failureCodes = new Set<string>();
  const failed = (error: unknown) => {
    summary.failed++;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    failureCodes.add(FAILURE_CODES.has(code) ? code : 'SOURCE_REQUEST_FAILED');
  };
  const result = (listings: WebListing[] = []): DiscoveryResult => ({
    ok: true, scope: 'web', market: options.market, platforms: [], query: options.query,
    ...(options.model ? { model: options.model } : {}),
    ...(options.maxPrice !== undefined ? { maxPrice: options.maxPrice } : {}),
    ...(excluded.length ? { excludedPlatforms: excluded } : {}),
    listings, summary: { ...summary, ...(failureCodes.size ? { failureCodes: [...failureCodes].sort() } : {}) },
  });
  let candidates: WebSearchCandidate[];
  summary.requests++;
  try { candidates = await (dependencies.search ?? searchWebCandidates)(options.query, options.market); }
  catch (error) { failed(error); return result(); }

  const pages = selectPages(candidates, options.market, excluded);
  const collected: WebListing[][] = pages.map(() => []);
  let next = 0;
  const fetchPage = dependencies.fetchPage ?? fetchWebProductPage;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages.length) }, async () => {
    while (next < pages.length) {
      const index = next++;
      const page = pages[index];
      summary.requests++;
      try {
        // The production fetcher performs bounded public-DNS validation and only calls the fixed provider API.
        const html = await fetchPage(page.url, options.market);
        const matches = parseWebProduct(html, page.url, options.market)
          .filter((listing) => queryMatchesListing(options.query, listing, options.market, 'web', options.model))
          .filter((listing) => options.maxPrice === undefined || listing.price <= options.maxPrice);
        if (!matches.length) summary.skipped++;
        collected[index] = matches;
      } catch (error) { failed(error); }
    }
  }));
  const seen = new Set<string>();
  const listings = collected.flat().filter((listing) => {
    const key = `${listing.sourceHost}:${listing.itemId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
  summary.matched = listings.length;
  return result(listings);
}
