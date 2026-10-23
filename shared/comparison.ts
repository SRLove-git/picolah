import type {
  Comparison,
  ComparisonAlternative,
  CountryCode,
  Offer,
  Product,
} from './types.ts';
import type { GeneratedOffer } from './catalog.ts';
import { PLATFORM_NAMES } from './catalog.ts';

/** Convert a generated catalog row into the API `Offer` shape. */
export function generatedToOffer(source: GeneratedOffer): Offer {
  const prices = source.history.map((point) => point.price);
  return {
    id: source.id,
    productId: source.productId,
    platformId: source.platformId,
    platform: PLATFORM_NAMES[source.platformId] || source.platformId,
    seller: source.seller,
    country: source.country,
    currency: source.currency,
    itemPrice: source.itemPrice,
    shippingFee: source.shippingFee,
    discount: source.discount,
    finalPrice: source.finalPrice,
    url: source.url,
    rating: source.rating,
    reviews: source.reviews,
    inStock: source.inStock,
    isOfficial: source.isOfficial,
    lastSeen: source.lastSeen,
    low30d: prices.length ? Math.min(...prices, source.finalPrice) : source.finalPrice,
    history: prices,
  };
}

function bestOffer(
  offers: GeneratedOffer[],
  market: CountryCode,
  productId: string,
): Offer | null {
  const candidates = offers
    .filter((offer) => offer.productId === productId && offer.country === market && offer.inStock)
    .map(generatedToOffer)
    .sort((a, b) => a.finalPrice - b.finalPrice);
  return candidates[0] || null;
}

function pickAlternatives(
  offers: GeneratedOffer[],
  products: Product[],
  market: CountryCode,
  product: Product | null,
): ComparisonAlternative[] {
  const pool = products.filter((candidate) => candidate.id !== product?.id);
  const sameCategory = product
    ? pool.filter((candidate) => candidate.category === product.category)
    : [];
  const rest = pool.filter((candidate) => !sameCategory.includes(candidate));
  return [...sameCategory, ...rest].slice(0, 3).map((candidate) => ({
    product: candidate,
    offer: bestOffer(offers, market, candidate.id),
    market,
  }));
}

const SUGGESTION_ORDER = [
  'sony-wh1000xm5',
  'iphone-15-128',
  'skii-facial-essence-230',
  'airpods-pro-2',
  'nike-air-force-1',
  'nespresso-vertuo-pop',
];

export function buildCatalogSuggestions(options: {
  query: string;
  market: CountryCode;
  products: Product[];
  offers: GeneratedOffer[];
}): Comparison {
  const ordered = [
    ...SUGGESTION_ORDER.map((id) => options.products.find((product) => product.id === id)).filter(
      (product): product is Product => Boolean(product),
    ),
    ...options.products.filter((product) => !SUGGESTION_ORDER.includes(product.id)),
  ].slice(0, 4);

  const alternatives: ComparisonAlternative[] = ordered.map((product) => ({
    product,
    offer: bestOffer(options.offers, options.market, product.id),
    market: options.market,
  }));

  const lastSeen = alternatives.reduce(
    (max, item) => (item.offer && item.offer.lastSeen > max ? item.offer.lastSeen : max),
    '',
  );

  return {
    kind: 'suggestions',
    query: options.query,
    market: options.market,
    product: null,
    offers: [],
    alternatives,
    totalOffers: options.offers.filter((offer) => offer.inStock).length,
    updatedAt: lastSeen || new Date().toISOString(),
    sourceCount: new Set(alternatives.flatMap((item) => (item.offer ? [item.offer.platformId] : [])))
      .size,
  };
}

export function buildCatalogRecommendation(options: {
  query: string;
  market: CountryCode;
  productIds: string[];
  products: Product[];
  offers: GeneratedOffer[];
}): Comparison {
  const chosen: Product[] = [];
  for (const id of options.productIds) {
    if (chosen.length >= 4) break;
    const product = options.products.find((candidate) => candidate.id === id);
    if (product && !chosen.some((item) => item.id === product.id)) chosen.push(product);
  }

  const alternatives: ComparisonAlternative[] = (
    chosen.length
      ? chosen
      : options.products.filter((product) => SUGGESTION_ORDER.includes(product.id)).slice(0, 4)
  ).map((product) => ({
    product,
    offer: bestOffer(options.offers, options.market, product.id),
    market: options.market,
  }));

  const lastSeen = alternatives.reduce(
    (max, item) => (item.offer && item.offer.lastSeen > max ? item.offer.lastSeen : max),
    '',
  );

  return {
    kind: chosen.length ? 'recommendation' : 'suggestions',
    query: options.query,
    market: options.market,
    product: null,
    offers: [],
    alternatives,
    totalOffers: options.offers.filter((offer) => offer.inStock).length,
    updatedAt: lastSeen || new Date().toISOString(),
    sourceCount: new Set(alternatives.flatMap((item) => (item.offer ? [item.offer.platformId] : [])))
      .size,
  };
}

/** Build the same `Comparison` payload the API returns, from in-memory catalog data. */
export function buildCatalogComparison(options: {
  query: string;
  market: CountryCode;
  product: Product | null;
  products: Product[];
  offers: GeneratedOffer[];
  kind?: Comparison['kind'];
}): Comparison {
  const { query, market, product } = options;

  if (!product) {
    return buildCatalogSuggestions({
      query,
      market,
      products: options.products,
      offers: options.offers,
    });
  }

  const offers = options.offers
    .filter(
      (offer) =>
        offer.productId === product.id && offer.country === market && offer.inStock,
    )
    .map(generatedToOffer)
    .sort((a, b) => a.finalPrice - b.finalPrice);

  const alternatives = pickAlternatives(options.offers, options.products, market, product);
  const latest = offers.reduce((max, offer) => (offer.lastSeen > max ? offer.lastSeen : max), '');
  const regional = options.offers.filter(
    (offer) => offer.productId === product.id && offer.inStock,
  ).length;

  return {
    kind: options.kind || 'comparison',
    query,
    market,
    product,
    offers,
    alternatives,
    totalOffers: regional,
    updatedAt: latest || new Date().toISOString(),
    sourceCount: new Set(offers.map((offer) => offer.platformId)).size,
  };
}
