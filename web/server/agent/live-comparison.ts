import type { Comparison, CountryCode, Offer, Product } from '../../shared/types.ts';
import { PLATFORMS } from '../../shared/types.ts';
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
  return {
    id: `live-${listing.market}-${listing.platform}-${listing.itemId}`, productId,
    source: 'live', platformId: listing.platform, platform: PLATFORMS[listing.platform]?.name ?? listing.platform,
    seller: listing.seller || '', country: listing.market, currency: listing.currency,
    itemPrice: listing.price, shippingFee: listing.shippingFee ?? 0, discount: listing.discount ?? 0,
    shippingKnown: listing.shippingFee !== undefined, discountKnown: listing.discount !== undefined,
    ratingKnown: listing.rating !== undefined, reviewsKnown: listing.reviews !== undefined,
    landedPriceConfidence: listing.shippingFee !== undefined && listing.discount !== undefined ? 'exact' : 'estimated',
    finalPrice, url: listing.url, rating: listing.rating ?? 0, reviews: listing.reviews ?? 0,
    inStock: true, isOfficial: listing.isOfficial ?? false, lastSeen: stamp,
    low30d: finalPrice, history: [],
  };
}
/** Pure mapping: the response is the only source of products and prices. */
export function liveComparison(message: string, input: LiveSearchInput, result: LiveSearchResult): Comparison {
  const comparison = emptyLiveComparison(message, input.market, input.query, input.platforms);
  comparison.search!.status = result.listings.length ? 'matched' : result.summary.failed ? 'failed' : 'not_found';
  comparison.search!.model = input.model || input.query;
  if (result.summary.failed) comparison.search!.failedPlatforms = result.summary.failed;
  if (input.maxPrice !== undefined) comparison.search!.maxPrice = input.maxPrice;
  comparison.totalOffers = result.listings.length;
  comparison.sourceCount = new Set(result.listings.map((listing) => listing.platform)).size;
  if (!result.listings.length) return comparison;
  if (input.model) {
    comparison.kind = 'comparison';
    comparison.product = product(`live-${input.model.toLowerCase().replace(/[^a-z0-9]/g, '')}`, input.query);
    comparison.offers = result.listings.map((listing) => offer(listing, comparison.product!.id, comparison.updatedAt));
  } else {
    comparison.kind = 'recommendation';
    comparison.alternatives = result.listings.map((listing) => {
      const item = product(`live-${listing.platform}-${listing.itemId}`, listing.title);
      return { product: item, market: input.market, offer: offer(listing, item.id, comparison.updatedAt) };
    });
  }
  return comparison;
}
