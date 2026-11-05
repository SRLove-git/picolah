import type { Comparison, CountryCode, Offer, Product } from '../../shared/types.ts';
import { catalogPlatforms } from '../catalog-retailers.ts';
import { MARKETS } from '../../shared/types.ts';
import { findProducts, resolvePlatformDirective } from '../../shared/query.ts';
import { normalizeSearchLanguage } from '../../shared/search-language.ts';
import { formatMoney } from '../format.ts';
import { getOffers, listProducts } from '../repo.ts';

type Target = { query: string; model?: string; maxPrice?: number };

function candidates(target: Target, products: Product[]): Product[] {
  const matches = findProducts(target.query, products, 4).map((match) => match.product!);
  if (matches.length || target.model || /\d/.test(target.query)) return matches;
  const words = normalizeSearchLanguage(target.query).toLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]+/g) ?? [];
  if (!words.length) return [];
  return products.filter((product) => {
    const text = normalizeSearchLanguage([product.name, product.brand, product.category, ...product.aliases].join(' ')).toLowerCase();
    return words.every((word) => /^[a-z0-9]+$/.test(word)
      ? new RegExp(`(?:^|[^a-z0-9])${word}(?:s)?(?:$|[^a-z0-9])`).test(text)
      : text.includes(word));
  }).slice(0, 4);
}

/** Read stored products and eligible quotes only. No provider or crawler calls. */
export async function searchCatalog(options: {
  message: string; market: CountryCode; target: Target | null; previous: Comparison | null;
}): Promise<Comparison> {
  const { message, market, target, previous } = options;
  const directive = resolvePlatformDirective(message, market, previous?.platformFilter ?? []);
  const allowed = [...catalogPlatforms(market), 'official'];
  const filters = directive.platformIds;
  const unsupported = [...new Set([...directive.unsupported, ...filters.filter((id) => !allowed.includes(id))])];
  const catalog = target ? await listProducts() : [];
  // A catalog title is already an unambiguous identity. The generic model
  // parser can misread suffixes such as "Pro 256GB" or "Balance 530".
  const titleKey = (text: string) => normalizeSearchLanguage(text).normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '');
  const exactTitles = catalog.filter((product) => titleKey(product.name) === titleKey(message));
  const products = exactTitles.length ? exactTitles : target ? candidates(target, catalog) : [];
  const entries = await Promise.all(products.map(async (product) => ({
    product,
    offers: unsupported.length ? [] : (await getOffers(product.id, market)).filter((offer) =>
      allowed.includes(offer.platformId) &&
      (!filters.length || filters.includes(offer.platformId)) &&
      offer.currency === MARKETS[market].currency && Number.isFinite(offer.finalPrice) && offer.finalPrice > 0 &&
      (target?.maxPrice === undefined || offer.finalPrice <= target.maxPrice)).map((offer) => ({
        ...offer,
        source: 'catalog' as const,
        // Legacy ingestion uses zero for missing fees/ratings. Keep those
        // placeholders from being presented as free delivery or a zero rating.
        shippingKnown: offer.shippingFee > 0 || offer.landedPriceConfidence === 'exact',
        discountKnown: offer.discount > 0 || offer.landedPriceConfidence === 'exact',
        ratingKnown: offer.rating > 0,
        reviewsKnown: offer.reviews > 0,
      })),
  })));
  const exact = entries.length === 1 ? entries[0] : null;
  const offers = exact?.offers ?? [];
  const alternatives = exact ? [] : entries.map(({ product, offers: quotes }) => ({ product, market, offer: quotes[0] ?? null }));
  const quotes = exact ? offers : alternatives.flatMap((item) => item.offer ? [item.offer] : []);
  return {
    kind: exact ? 'comparison' : entries.length ? 'recommendation' : 'empty',
    query: message, market, product: exact?.product ?? null, offers, alternatives,
    totalOffers: quotes.length, sourceCount: new Set(quotes.map((offer) => offer.platformId)).size,
    updatedAt: quotes.reduce((latest, offer) => offer.lastSeen > latest ? offer.lastSeen : latest, '') || new Date().toISOString(),
    platformFilter: filters.length ? filters : undefined,
    unsupportedPlatforms: unsupported.length ? unsupported : undefined,
  };
}

export function catalogQuotes(comparison: Comparison): Offer[] {
  return [...comparison.offers, ...comparison.alternatives.flatMap((item) => item.offer ? [item.offer] : [])];
}

export function catalogAnswer(comparison: Comparison, target: Target | null): string {
  if (!target) return '想买什么？告诉我商品名称或完整型号，我来帮你比价。';
  if (comparison.unsupportedPlatforms?.length) return '当前市场暂不支持所选平台，请切换市场或平台后查询。';
  const quotes = catalogQuotes(comparison);
  if (!comparison.product && !comparison.alternatives.length) {
    return `暂未找到与「${target.query}」匹配的商品。可以补充品牌、完整型号或容量再试。`;
  }
  if (!quotes.length) {
    const names = comparison.product?.name || comparison.alternatives.map((item) => item.product.name).join('、');
    return `**${names}** 在${MARKETS[comparison.market].nameZh}${target.maxPrice !== undefined ? '的当前预算和筛选条件下' : '的当前筛选条件下'}暂无有效报价。可以调整筛选条件再试。`;
  }
  if (comparison.product) {
    const best = [...quotes].sort((a, b) => a.finalPrice - b.finalPrice)[0];
    const shipping = best.shippingKnown === false || (best.shippingFee === 0 && best.landedPriceConfidence !== 'exact')
      ? '运费待确认' : `运费 ${formatMoney(best.shippingFee, comparison.market)}`;
    const discount = best.discount > 0 ? `，优惠 ${formatMoney(best.discount, comparison.market)}` : '';
    return `找到 **${comparison.product.name}** 的 ${quotes.length} 条报价。**${best.platform} · ${best.seller}**：商品价 **${formatMoney(best.itemPrice, comparison.market)}**，${shipping}${discount}，${best.landedPriceConfidence === 'exact' ? '合计' : '预估合计'} **${formatMoney(best.finalPrice, comparison.market)}**。最终运费和优惠以商家结算页为准。`;
  }
  return '找到这些商品：' + comparison.alternatives.map(({ product, offer }) =>
    `**${product.name}**${offer ? `（${offer.platform}，${formatMoney(offer.finalPrice, comparison.market)}）` : '（暂无有效报价）'}`).join('；') + '。';
}

