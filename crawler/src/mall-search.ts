import { MARKETS, type MarketCode } from './markets.ts';
import { safeWebUrl } from './safe-web-url.ts';
import type { WebSearchCandidate } from './brightdata/serp.ts';

/** Established retail malls and department-store storefronts. Marketplace
 * domains from MARKETS are added automatically for every supported country. */
const LOCAL_MALLS: Partial<Record<MarketCode, readonly string[]>> = {
  SG: [
    'amazon.sg', 'courts.com.sg', 'harveynorman.com.sg', 'gaincity.com',
    'bestdenki.com.sg', 'online.challenger.sg', 'metro.com.sg', 'tangs.com',
    'fairprice.com.sg', 'robinsons.com.sg', 'ishopchangi.com',
  ],
};

function hostMatches(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const normalized = domain.toLowerCase().replace(/^www\./, '');
  return host === normalized || host.endsWith('.' + normalized);
}

export function mallDomains(market: MarketCode): string[] {
  return [...new Set([
    ...Object.values(MARKETS[market].domains).filter((domain): domain is string => Boolean(domain)),
    ...(LOCAL_MALLS[market] ?? []),
  ].map((domain) => domain.replace(/^www\./, '')))];
}

export function isMallSite(url: URL, market: MarketCode): boolean {
  return mallDomains(market).some((domain) => hostMatches(url.hostname, domain));
}

/** Larger values are verified first inside the bounded page budget. Classified
 * listings remain available as a last resort, but cannot crowd out malls. */
export function mallPriority(url: URL, market: MarketCode): number {
  const platform = Object.values(MARKETS[market].domains)
    .filter((domain): domain is string => Boolean(domain))
    .some((domain) => hostMatches(url.hostname, domain));
  if (platform) return 3;
  if (isMallSite(url, market)) return 2;
  if (/(?:^|\.)carousell\.(?:sg|com\.my|com\.hk|ph|com\.ph)$/i.test(url.hostname.replace(/^www\./, ''))) return 0;
  return 1;
}

/** One extra retail-focused discovery request complements the native Shopee,
 * Lazada and Challenger paths without multiplying product-page fetches. Keep
 * the product identity contiguous: a list of retailer brand names caused the
 * search provider to treat those names as mandatory terms and lose exact-SKU
 * appliance pages. The returned hosts are still restricted to mallDomains. */
export async function searchMallPlatforms(
  market: MarketCode,
  query: string,
  search: (query: string, market: MarketCode) => Promise<WebSearchCandidate[]>,
): Promise<WebSearchCandidate[]> {
  if (market !== 'SG') return [];
  const hits = await search(`${query} Singapore online shop`, market);
  const seen = new Set<string>();
  return hits.filter((candidate) => {
    const url = safeWebUrl(candidate.url);
    if (!url || !isMallSite(url, market) || seen.has(url.href)) return false;
    seen.add(url.href);
    return true;
  });
}
