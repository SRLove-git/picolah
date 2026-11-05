import type { Comparison, CountryCode, Offer, Product } from '../../shared/types.ts';
import { MARKETS, PLATFORMS } from '../../shared/types.ts';
import type { LiveSearchInput, LiveSearchResult, LiveListing } from './tools/model-search.ts';

export function emptyLiveComparison(message: string, market: CountryCode, query: string, platforms: string[], unsupported: string[] = []): Comparison {
  return { kind: 'empty', query: message, market, product: null, offers: [], alternatives: [],
    totalOffers: 0, updatedAt: new Date().toISOString(), sourceCount: 0,
    platformFilter: platforms.length ? platforms : undefined, unsupportedPlatforms: unsupported,
    search: { query, model: query, platforms, status: 'unavailable' } };
}
function product(id: string, name: string): Product {
  return { id, name, brand: '', category: '', tagline: '', specs: '', visual: 'headphones', aliases: [] };
}
function offer(listing: LiveListing, productId: string, stamp: string): Offer {
  const finalPrice = listing.price + (listing.shippingFee ?? 0) - (listing.discount ?? 0);
  const source = listing.platform === 'web' ? listing.sourceHost! : listing.platform;
  return {
    id: `live-${listing.market}-${source}-${listing.itemId}`, productId,
    source: 'live', platformId: listing.platform === 'web' ? `web:${source}` : source,
    productTitle: listing.title,
    ...(listing.productDetails ? { productDetails: listing.productDetails } : {}),
    ...(listing.verification ? { verification: listing.verification } : {}),
    ...(listing.imageUrl ? { imageUrl: listing.imageUrl } : {}),
    platform: listing.platform === 'web' ? source : PLATFORMS[source]?.name ?? source,
    seller: listing.seller || '', country: listing.market, currency: listing.currency,
    itemPrice: listing.price, shippingFee: listing.shippingFee ?? 0, discount: listing.discount ?? 0,
    shippingKnown: listing.shippingFee !== undefined, discountKnown: listing.discount !== undefined,
    ratingKnown: listing.rating !== undefined, reviewsKnown: listing.reviews !== undefined,
    landedPriceConfidence: listing.shippingFee !== undefined && listing.discount !== undefined ? 'exact' : 'estimated',
    finalPrice, url: listing.url, rating: listing.rating ?? 0, reviews: listing.reviews ?? 0,
    inStock: true, isOfficial: listing.platform === 'web' ? false : listing.isOfficial ?? false,
    lastSeen: listing.verification?.checkedAt ?? stamp,
    low30d: finalPrice, history: [],
  };
}
/** Pure mapping: the response is the only source of products and prices. */
export function liveComparison(message: string, input: LiveSearchInput, result: LiveSearchResult): Comparison {
  const comparison = emptyLiveComparison(message, input.market, input.query, input.platforms);
  comparison.search!.scope = input.scope ?? 'platforms';
  if (input.geography) comparison.search!.geography = input.geography;
  if (input.geography && input.maxPrice !== undefined) comparison.search!.budgetCurrency = MARKETS[input.market].currency;
  if (input.excludedPlatforms?.length) comparison.search!.excludedPlatforms = input.excludedPlatforms;
  comparison.search!.status = result.listings.length ? 'matched' : result.summary.failed ? 'failed' : 'not_found';
  comparison.search!.model = input.model || input.query;
  if (result.summary.failed) comparison.search!.failedPlatforms = result.summary.failed;
  if (result.summary.failedPlatforms?.length) {
    comparison.search!.failedSources = result.summary.failedPlatforms.map((id) => PLATFORMS[id]?.name ?? id);
  }
  if (input.scope === 'web' && result.summary.failureCodes?.includes('SERP_NOT_CONFIGURED')) {
    comparison.search!.errorCode = 'SERP_NOT_CONFIGURED';
  }
  if (result.summary.pagesChecked !== undefined) {
    comparison.search!.pageVerification = { discovered: result.summary.discovered ?? 0,
      checked: result.summary.pagesChecked, verified: result.summary.pagesVerified ?? 0 };
    if (!result.listings.length && result.summary.failed && result.summary.pagesChecked > 0) {
      comparison.search!.errorCode = 'PRODUCT_PAGE_UNVERIFIED';
    }
  }
  if (input.maxPrice !== undefined) comparison.search!.maxPrice = input.maxPrice;
  comparison.totalOffers = result.listings.length;
  comparison.sourceCount = new Set(result.listings.map((listing) => new URL(listing.url).hostname.replace(/^www\./, ''))).size;
  if (!result.listings.length) return comparison;
  // Global cards retain original currencies and page-specific variants. Do not
  // feed mixed currencies into the local-market cheapest-price ranking UI.
  if (input.model && input.geography !== 'global') {
    comparison.kind = 'comparison';
    comparison.product = product(`live-${input.model.toLowerCase().replace(/[^a-z0-9]/g, '')}`, input.query);
    comparison.offers = result.listings.map((listing) => offer(listing, comparison.product!.id, comparison.updatedAt));
  } else {
    comparison.kind = 'recommendation';
    comparison.alternatives = result.listings.map((listing) => {
      const item = product(`live-${listing.platform === 'web' ? listing.sourceHost : listing.platform}-${listing.itemId}`, listing.title);
      return { product: item, market: input.market, offer: offer(listing, item.id, comparison.updatedAt) };
    });
  }
  return comparison;
}
