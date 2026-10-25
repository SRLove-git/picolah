import { normalizeDiscoveryModel, normalizeSearchQuery, queryMatchesListing } from './discovery-match.ts';
import { isPlatformSupported, MARKETS, type MarketCode, type PlatformId } from './markets.ts';
import { getAdapter } from './platforms/index.ts';
import type { RawListing } from './types.ts';

export interface DiscoveryOptions {
  market: MarketCode;
  platforms: PlatformId[];
  query: string;
  model?: string;
  maxPrice?: number;
}

export interface DiscoveryResult extends DiscoveryOptions {
  ok: true;
  listings: RawListing[];
  summary: { requests: number; matched: number; skipped: number; failed: number };
}

export interface DiscoveryDependencies {
  search?: (platform: PlatformId, market: MarketCode, query: string) => Promise<RawListing[]>;
}

/** Chat search is live-only: no catalog reads, product registration, or offer ingestion. */
export async function discoverProduct(options: DiscoveryOptions, dependencies: DiscoveryDependencies = {}): Promise<DiscoveryResult> {
  const query = normalizeSearchQuery(options.query);
  const model = options.model === undefined ? undefined : normalizeDiscoveryModel(options.model);
  if (options.maxPrice !== undefined && (!Number.isFinite(options.maxPrice) || options.maxPrice <= 0 || options.maxPrice > 1e12)) throw new Error('预算必须是有效正数');
  const platforms = [...new Set(options.platforms)];
  if (!Object.hasOwn(MARKETS, options.market) || !platforms.length || platforms.length > 3) throw new Error('商品搜索范围无效');
  for (const platform of platforms) {
    if (!isPlatformSupported(MARKETS[options.market], platform)) throw new Error('商品搜索平台与市场不匹配');
  }
  const search = dependencies.search ?? ((platform, market, text) => getAdapter(platform).search(market, text));
  const summary = { requests: 0, matched: 0, skipped: 0, failed: 0 };
  const listings: RawListing[] = [];
  for (const platform of platforms) {
    summary.requests += 1;
    try {
      const candidates = await search(platform, options.market, query);
      const seen = new Set<string>();
      const matches = candidates.slice(0, 100)
        .filter((listing) => queryMatchesListing(query, listing, options.market, platform, model))
        .filter((listing) => options.maxPrice === undefined || listing.price <= options.maxPrice)
        .sort((a, b) => a.price - b.price)
        .filter((listing) => {
          if (seen.has(listing.itemId)) return false;
          seen.add(listing.itemId);
          return true;
        }).slice(0, 3);
      if (!matches.length) { summary.skipped += 1; continue; }
      listings.push(...matches);
      summary.matched += matches.length;
    } catch (error) {
      summary.failed += 1;
      // Keep provider credentials, response bodies and proxy URLs out of logs.
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      console.warn(`[crawler-search] ${platform} ${options.market} failed: ${/^[A-Z0-9_]{1,80}$/.test(code) ? code : 'SOURCE_REQUEST_FAILED'}`);
    }
  }
  return { ok: true, market: options.market, platforms, query, ...(model ? { model } : {}), summary, listings };
}
