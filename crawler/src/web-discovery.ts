import { sourceCountry } from './source-country.ts';
import { nonRetailPriceSource } from './product-page-prices.ts';
import { config } from './config.ts';
import { searchDeepSeekCandidates } from './deepseek/search.ts';
import { searchWebCandidates, type WebSearchCandidate } from './brightdata/serp.ts';
import type { DiscoveryOptions, DiscoveryResult } from './discovery.ts';
import { MARKETS, type MarketCode, type PlatformId } from './markets.ts';
import { readProductPage, type ProductPageContent } from './product-page-reader.ts';
import { linkedMarkdownProducts } from './platforms/markdown-product.ts';
import { verifyProductPage } from './verify-product-page.ts';
import { safeWebUrl } from './safe-web-url.ts';
import { linkedProductPages, productPageUrl, type LinkedProductPage } from './product-page-links.ts';
import { queryMatchesTitle } from './discovery-match.ts';
import { parseWebProduct } from './platforms/web-product.ts';
import type { WebListing } from './types.ts';
import { MerchantLinks } from './merchant-links.ts';
import { searchMerchant, singaporeShops, selectedMerchantHtml } from './merchant-search.ts';

export interface WebDiscoveryDependencies {
  links?: Pick<MerchantLinks, 'find' | 'remember'>;
  merchantSearch?: typeof searchMerchant;
  search?: (query: string, market: MarketCode) => Promise<WebSearchCandidate[]>;
  fetchPage?: (url: string, market: MarketCode) => Promise<ProductPageContent>;
}

export const DISCOVERY_PLATFORMS: PlatformId[] = ['shopee', 'lazada', 'tiktok', 'amazon-sg', 'tokopedia', 'tiki'];
const MAX_PAGES = 12;
const MAX_PER_HOST = 3;
const CONCURRENCY = 4;
const FAILURE_CODES = new Set([
  'SERP_NOT_CONFIGURED', 'SERP_AUTH_FAILED', 'SERP_HTTP_ERROR', 'SERP_TIMEOUT',
  'SERP_NETWORK_ERROR', 'SERP_PARSE_FAILED', 'SERP_SOURCE_FAILED', 'SERP_RESPONSE_TOO_LARGE',
  'WEB_UNLOCKER_NOT_CONFIGURED', 'WEB_PAGE_AUTH_FAILED', 'WEB_PAGE_HTTP_ERROR', 'WEB_PAGE_TIMEOUT',
  'WEB_PAGE_NETWORK_ERROR', 'WEB_PAGE_PARSE_FAILED', 'WEB_PAGE_RESPONSE_TOO_LARGE', 'WEB_PAGE_REDIRECT_REJECTED', 'WEB_PAGE_SOURCE_FAILED',
  'WEB_PAGE_PAYMENT_REQUIRED', 'WEB_PAGE_POLICY_REJECTED', 'WEB_PAGE_RATE_LIMITED', 'WEB_PAGE_PROVIDER_ERROR',
  'WEB_DNS_FAILED', 'WEB_DNS_TIMEOUT', 'UNSAFE_WEB_URL',
  'DEEPSEEK_FETCH_NOT_CONFIGURED',
  'PRODUCT_PAGE_UNVERIFIED',
  'PRODUCT_PAGE_PRICE_CONFLICT', 'PRODUCT_PAGE_IDENTITY_CONFLICT',
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

function candidateUrl(value: string, followup = false): URL | null {
  const url = productPageUrl(value, followup);
  if (!url) return null;
  const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1];
  if (asin && /^(?:www\.)?amazon\.(?:com|sg)$/.test(url.hostname)) {
    // The ASIN selects the product. Old referral and language paths can return
    // a different storefront or repeatedly consume the same page budget.
    return new URL(`https://www.${url.hostname.replace(/^www\./, '')}/dp/${asin.toUpperCase()}`);
  }
  return url;
}

/** Arbitrary retailers are allowed; known marketplace exclusions and market boundaries still apply. */
export function webSourceAllowed(url: URL, market: MarketCode, excluded: PlatformId[], geography?: 'global'): boolean {
  if (nonRetailPriceSource(url.hostname) || (geography !== 'global' && sourceCountry(url, market) !== 'local')) return false;
  for (const platform of DISCOVERY_PLATFORMS) {
    const domains = [...new Set(Object.values(MARKETS).flatMap((item) => item.domains[platform] ? [item.domains[platform]!] : []))];
    const known = [...domains, ...ALIASES[platform]].some((domain) => domainMatches(url.hostname, domain));
    if (!known) continue;
    if (excluded.includes(platform)) return false;
    const current = MARKETS[market].domains[platform];
    if (geography !== 'global' && (!current || !domainMatches(url.hostname, current))) return false;
  }
  return true;
}

function selectPages(candidates: WebSearchCandidate[], market: MarketCode, excluded: PlatformId[], geography?: 'global', query = '', model?: string, visited?: ReadonlySet<string>, visits?: ReadonlyMap<string, number>): WebSearchCandidate[] {
  const groups = new Map<string, WebSearchCandidate[]>();
  const seen = new Set<string>();
  const relevance = (candidate: WebSearchCandidate) => {
    const url = safeWebUrl(candidate.url);
    const productPath = /\/(?:products?|p|dp|itm|buy)(?:\/|$)/i.test(url?.pathname || '');
    const editorialTitle = candidate.title.replace(/\b(?:customer|user|buyer|verified buyer)\s+reviews?\b/gi, '');
    // /product/ is also used by editorial and price-history sites. A path
    // hint must never exempt a review/aggregator or an explicitly used item.
    if (/\b(?:refurb(?:ished|ed)|renewed|used|pre[- ]?owned|second[- ]?hand|open[- ]box)\b|二手|翻新/i.test(candidate.title)
      || /\breview\b|\bprice\s*(?:&|and)\s*specs\b|\bprice history\b|\b(?:price\s+)?comparison\b|\bcompare prices\b|\b(?:launch(?:es|ed)?|leaks?|vs\.?|news)\b|发布|评测|对比|爆料|价格和规格/i.test(editorialTitle)
      || (!productPath && /\breviews\b/i.test(editorialTitle))
      || /\/(?:bytes|compare-mobile-phones|guides)\/|\/\d{4}\/\d{2}\//i.test(url?.pathname || '')) return -2;
    if (!queryMatchesTitle(query, candidate.title, model)) return productPath ? -2 : -1;
    const path = url?.pathname.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
    const brand = query.match(/^[a-z]+\b/i)?.[0].toLowerCase();
    const manufacturer = !!brand && !!url?.hostname.split('.').includes(brand);
    const identity = (model || query).toLowerCase().replace(/[^a-z0-9]/g, '');
    // An exact product slug also occurs on .html merchant URLs. Do not let a
    // generic /p/ or /dp/ path crowd those stores out of the bounded page pool.
    return 1 + 4 * Number(!!identity && path.includes(identity)) + Number(manufacturer) + 2 * Number(productPath);
  };
  for (const candidate of candidates.slice(0, 100).sort((a, b) => relevance(b) - relevance(a))) {
    if (relevance(candidate) === -2) continue;
    const url = candidateUrl(candidate?.url);
    if (!url || !webSourceAllowed(url, market, excluded, geography) || seen.has(url.href) || visited?.has(url.href)) continue;
    seen.add(url.href);
    const host = url.hostname.replace(/^www\./, '');
    const group = groups.get(host) ?? [];
    if (group.length + (visits?.get(host) ?? 0) < MAX_PER_HOST) group.push({ ...candidate, url: url.href });
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

// Give each fallback search a chance to contribute a new local merchant. The
// two searches share the original twelve-page and per-host limits.
function interleavePages(groups: WebSearchCandidate[][], visits: ReadonlyMap<string,number>): WebSearchCandidate[] {
  const result: WebSearchCandidate[] = [], seen = new Set<string>(), counts = new Map(visits);
  for (let i=0; i<MAX_PAGES; i++) {
    for (const group of groups) {
      const page=group[i];
      if (!page || seen.has(page.url)) continue;
      const host=new URL(page.url).hostname.replace(/^www\./,'');
      const count=counts.get(host) ?? 0;
      if (count>=MAX_PER_HOST) continue;
      seen.add(page.url); counts.set(host,count+1); result.push(page);
      if (result.length===MAX_PAGES) return result;
    }
  }
  return result;
}

const productionSources = { links: new MerchantLinks(process.env.MERCHANT_LINKS_DB || ':memory:'), merchantSearch: searchMerchant };

/** Optional cross-web path: one SERP discovery, then bounded live product-page verification. */
export async function discoverWebProducts(options: DiscoveryOptions, dependencies: WebDiscoveryDependencies = productionSources): Promise<DiscoveryResult> {
  const excluded = [...new Set(options.excludedPlatforms ?? [])];
  if (excluded.some((platform) => !DISCOVERY_PLATFORMS.includes(platform))) throw new Error('商品搜索排除平台无效');
  const summary: DiscoveryResult['summary'] = { requests: 0, matched: 0, skipped: 0, failed: 0,
    discovered: 0, pagesChecked: 0, pagesVerified: 0 };
  const failureCodes = new Set<string>();
  const failed = (error: unknown) => {
    summary.failed++;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    failureCodes.add(FAILURE_CODES.has(code) ? code : 'SOURCE_REQUEST_FAILED');
  };
  const result = (listings: WebListing[] = []): DiscoveryResult => ({
    ok: true, scope: 'web', ...(options.geography ? { geography: options.geography } : {}), market: options.market, platforms: [], query: options.query,
    ...(options.model ? { model: options.model } : {}),
    ...(options.maxPrice !== undefined ? { maxPrice: options.maxPrice } : {}),
    ...(excluded.length ? { excludedPlatforms: excluded } : {}),
    listings, summary: { ...summary, ...(failureCodes.size ? { failureCodes: [...failureCodes].sort() } : {}) },
  });
  const search = dependencies.search ?? ((query: string, market: MarketCode) => (config.webSearch.provider === 'deepseek' ? searchDeepSeekCandidates : searchWebCandidates)(query, market, { geography: options.geography }));
  const saved = options.geography === 'global' ? [] : dependencies.links?.find(options) ?? [];
  const shops = dependencies.merchantSearch && options.geography !== 'global' ? singaporeShops(options.query, options.market) : [];
  let candidates: WebSearchCandidate[] = [];
  summary.requests++;
  // Short product names otherwise retrieve launch prices and reviews. Express
  // purchase intent without adding a country or changing the matched identity.
  const category = /\b(?:xiaomi|iphone|pixel|oneplus)\s*\d{1,2}[a-z]?\b/i.test(options.query) ? ' smartphone' : '';
  const discoveryQuery = !options.model
    ? `${options.query}${category} online store` : options.query;
  // A retailer can return the exact SKU even when a web search restricted to its domain cannot.
  const native = Promise.all(shops.map(async shop => {
    summary.requests++;
    try {
      const hits = await dependencies.merchantSearch!(shop, options.query);
      return selectPages(hits, options.market, excluded, options.geography, options.query, options.model);
    } catch { return []; }
  }));
  try { candidates = await search(discoveryQuery, options.market); }
  catch (error) { failed(error); if (!saved.length && !shops.length) return result(); }

  const generalPages = selectPages(candidates, options.market, excluded, options.geography, options.query, options.model);
  const savedPages = selectPages(saved, options.market, excluded, options.geography, options.query, options.model);
  const nativePages = await native;
  const pages = savedPages.length || nativePages.some(group=>group.length)
    ? interleavePages([savedPages, ...nativePages, generalPages],new Map()) : generalPages;
  summary.discovered = pages.length;
  const collected: WebListing[][] = [];
  const followed = new Set<string>();
  const hostVisits = new Map<string, number>();
  const discovered = new Set(pages.map(page => page.url));
  // Share two short transport retries across the whole search, including its
  // fallback search. Conflicts, unavailable products and parse failures do not retry.
  let transportRetries = 2;
  const fetchPage = dependencies.fetchPage ?? (async (url: string, market: MarketCode) => {
    const local = await selectedMerchantHtml(url,market).catch(()=>undefined);
    if (local && parseWebProduct(local,url,market,options.geography).length) {
      summary.requests++;
      return local;
    }
    return readProductPage(url, market, {
    geography: options.geography, query: options.query, model: options.model,
    consumeRetry: () => transportRetries > 0 && --transportRetries >= 0,
    onEvent: (event) => {
      if (event.outcome === 'request') summary.requests++;
      console.log('[product-page] ' + JSON.stringify({ host: new URL(url).hostname, ...event }));
    },
    });
  });
  // Keep workers busy across the initial/linked-page boundary. Follow-up pages
  // use only links already discovered, never recurse, and share the same budget.
  const checkBatch = async (batch: WebSearchCandidate[], trailing: WebSearchCandidate[], limit: number) => {
    let next = 0;
    let activeInitial = 0;
    const waiting = new Set<() => void>();
    const wake = () => { for (const resolve of waiting) resolve(); waiting.clear(); };
    const linked: LinkedProductPage[] = [];
    const followup = () => {
      const links = linked.slice().sort((a, b) => Number(b.relation === 'variant') - Number(a.relation === 'variant'));
      // Keep the reserved slots available for links from slow initial pages.
      // Already discovered links can overlap that work; ordinary trailing
      // candidates start only after all initial pages have revealed their links.
      for (const page of [...links, ...(activeInitial ? [] : trailing)]) {
        const url = candidateUrl(page.url, true);
        if (!url || followed.has(url.href) || !webSourceAllowed(url, options.market, excluded, options.geography)) continue;
        if ((hostVisits.get(url.hostname.replace(/^www\./, '')) ?? 0) >= MAX_PER_HOST) continue;
        return { ...page, url: url.href };
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
      while (summary.pagesChecked! < limit) {
        const discoverLinks = next < batch.length;
        const page = discoverLinks ? batch[next++] : followup();
        if (!page) {
          if (!activeInitial) return;
          await new Promise<void>(resolve => waiting.add(resolve));
          continue;
        }
        const host = new URL(page.url).hostname.replace(/^www\./, '');
        if (followed.has(page.url) || (hostVisits.get(host) ?? 0) >= MAX_PER_HOST) continue;
        followed.add(page.url);
        discovered.add(page.url);
        hostVisits.set(host, (hostVisits.get(host) ?? 0) + 1);
        if (dependencies.fetchPage) summary.requests++;
        summary.pagesChecked!++;
        const index = collected.length;
        collected.push([]);
        if (discoverLinks) activeInitial++;
        try {
          // The same bounded public-DNS/provider checks apply to directory and product pages.
          const html = await fetchPage(page.url, options.market);
          if (discoverLinks) linked.push(...(typeof html === 'string' ? linkedProductPages(html, page.url, options.query, options.model)
            : linkedMarkdownProducts(html, page.url, options.query, options.model)));
          const matches = await verifyProductPage(page.url, options, async () => html);
          if (!matches.length) summary.skipped++;
          else summary.pagesVerified!++;
          collected[index] = matches;
        } catch (error) { failed(error); }
        finally { if (discoverLinks) activeInitial--; wake(); }
      }
    }));
  };
  // Reserve two of the initial twelve page requests for direct product links found on
  // brand/category pages. One hop only; the total and per-host budgets stay fixed.
  const first = pages.slice(0, MAX_PAGES - 2);
  await checkBatch(first, pages.slice(first.length), MAX_PAGES);
  // Retry discovery once when no page price survives. The same market reaches
  // both providers and every linked/fallback page retains country filtering.
  // Never widen a country search to global sources when local prices are absent.
  if (!collected.some(rows => rows.length > 0)) {
    // A second near-identical query often rediscovers the same international pages.
    // Change the discovery strategy, not the requested product or verification rules.
    let query = options.geography === 'global' ? `${options.query} online shop`
      : `site:.${options.market.toLowerCase()} ${options.query}`;
    // With a country suffix, keep eligible merchants: an already visited store may
    // have another detail URL. The page/host budgets below still apply.
    if (options.geography === 'global') for (const [host] of [...hostVisits].sort((a, b) => b[1] - a[1])) {
      const next = `${query} -site:${host}`;
      if (next.length <= 110) query = next;
    }
    const queries = [query];
    if (options.geography !== 'global') {
      const symbol = {SG:'S$', MY:'RM', TH:'฿', ID:'Rp', PH:'₱', VN:'₫'}[options.market];
      const exact = `"${options.query.replace(/"/g,' ')}" "${symbol}"`;
      // Keep enough space for the search provider's market and currency suffix.
      if (Array.from(exact).length <= 95) queries.push(exact);
    }
    const generalGroups = queries.map(async fallbackQuery => {
      summary.requests++;
      try {
        const hits = await search(fallbackQuery, options.market);
        return selectPages(hits, options.market, excluded, options.geography, options.query, options.model, followed, hostVisits);
      } catch (error) { failed(error); return []; }
    });
    const groups = await Promise.all(generalGroups);
    const fallback = interleavePages(groups, hostVisits);
    for (const page of fallback) discovered.add(page.url);
    await checkBatch(fallback.slice(0, 10), fallback.slice(10), Math.min(MAX_PAGES + 12, summary.pagesChecked! + 12));
  }
  const seen = new Set<string>();
  const listings = collected.flat().filter((listing) => {
    const key = `${listing.sourceHost}:${listing.itemId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 40);
  summary.discovered = discovered.size;
  summary.matched = listings.length;
  dependencies.links?.remember(options, listings.flatMap(row => row.verification?.source === 'product-page'
    ? [{url:row.url,title:row.title,checkedAt:row.verification.checkedAt}] : []));
  return result(listings);
}
