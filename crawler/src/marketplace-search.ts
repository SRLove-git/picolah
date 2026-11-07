import { MARKETS, type MarketCode } from './markets.ts';
import { safeWebUrl } from './safe-web-url.ts';
import { lazadaProductUrl } from './platforms/lazada-structured.ts';
import type { WebSearchCandidate } from './brightdata/serp.ts';

export const marketplaces = ['shopee', 'lazada'] as const;
export type Marketplace = typeof marketplaces[number];

export function marketplacePage(value: string, market: MarketCode, platform: Marketplace): URL | undefined {
  const url = safeWebUrl(value);
  const domain = MARKETS[market].domains[platform]?.replace(/^www\./, '');
  if (!url || url.protocol !== 'https:' || url.port || url.hostname.replace(/^www\./, '') !== domain) return;
  if (platform === 'shopee' && !/^\/(?:product\/\d+\/\d+|[^/]+-i\.\d+\.\d+)\/?$/i.test(url.pathname)) return;
  if (platform === 'lazada' && !lazadaProductUrl(url.href, market)) return;
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:priceCompare|pvid|search|searchRedirection|clickTrackInfo|tradePath|spm|scm|exlaz|xptdk|sp_atk|uls_trackid|trafficFrom|from|source|utm_.+|aff_.+)$/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return url;
}

export async function searchMarketplace(platform: Marketplace, market: MarketCode, query: string,
  search: (query: string, market: MarketCode) => Promise<WebSearchCandidate[]>): Promise<WebSearchCandidate[]> {
  const domain = MARKETS[market].domains[platform]!.replace(/^www\./, '');
  const hits = await search('site:' + domain + ' ' + query, market);
  const pages = new Map<string, WebSearchCandidate>();
  for (const hit of hits) {
    const url = marketplacePage(hit.url, market, platform);
    if (url && !pages.has(url.href)) pages.set(url.href, { url:url.href, title:hit.title });
  }
  console.info('[marketplace-search] ' + JSON.stringify({platform, market, candidates:pages.size}));
  return [...pages.values()];
}
