import type { MarketCode, PlatformId } from './markets.ts';

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  category?: string;
  visual?: string;
  specs?: string;
}

export interface RawListing {
  platform: PlatformId;
  market: MarketCode;
  /** Platform-native item id (used for the stable idempotency key). */
  itemId: string;
  title: string;
  url: string;
  price: number;
  currency: string;
  /** Known shipping amount; undefined means the source did not expose it. */
  shippingFee?: number;
  /** Known fixed discount/voucher amount; undefined means unknown. */
  discount?: number;
  rating?: number;
  reviews?: number;
  seller?: string;
  location?: string;
  isOfficial?: boolean;
  inStock: boolean;
}

/** Verified public product-page result, used only by live search, never ingestion. */
export type WebListing = Omit<RawListing, 'platform'> & {
  platform: 'web';
  sourceHost: string;
};

export type DiscoveryListing = RawListing | WebListing;

/** Matches POST /api/v1/ingest/offers. */
export interface Offer {
  externalId: string;
  productId: string;
  platformId: PlatformId;
  seller: string;
  currency?: string;
  itemPrice: number;
  shippingFee: number;
  discount: number;
  /** 'exact' only when the source exposed shipping and discount. */
  landedPriceConfidence?: 'exact' | 'estimated';
  url: string;
  rating: number;
  reviews: number;
  inStock: boolean;
  isOfficial: boolean;
  capturedAt: string;
}

/** An Offer plus the market it belongs to (the market is a batch-level field). */
export interface MarketOffer extends Offer {
  market: MarketCode;
}

export interface IngestResponse {
  ok?: boolean;
  runId?: string;
  received?: number;
  created?: number;
  updated?: number;
  productsUpserted?: number;
  error?: string;
  message?: string;
  issues?: unknown[];
}
