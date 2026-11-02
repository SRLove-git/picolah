import type { Comparison, CountryCode, Offer, Product } from '../../shared/types.ts';
import { MARKETS } from '../../shared/types.ts';
import { findProducts, resolvePlatformDirective } from '../../shared/query.ts';
import { normalizeSearchLanguage } from '../../shared/search-language.ts';
import { formatMoney } from '../format.ts';
import { db } from '../db.ts';
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
  const allowed = [...MARKETS[market].platformIds, 'official'];
  const filters = directive.platformIds;
  const unsupported = [...new Set([...directive.unsupported, ...filters.filter((id) => !allowed.includes(id))])];
  const products = target ? candidates(target, await listProducts()) : [];
  const eligibleRows = await db.all<{ id: string }>(
    "SELECT id FROM offers WHERE country = ? AND source NOT IN ('seed', 'picolah-mock')",
    [market],
  );
  const eligible = new Set(eligibleRows.map((row) => row.id));
  const entries = await Promise.all(products.map(async (product) => ({
    product,
    offers: unsupported.length ? [] : (await getOffers(product.id, market)).filter((offer) =>
      eligible.has(offer.id) && allowed.includes(offer.platformId) &&
      (!filters.length || filters.includes(offer.platformId)) &&
      offer.currency === MARKETS[market].currency && Number.isFinite(offer.finalPrice) && offer.finalPrice > 0 &&
      (target?.maxPrice === undefined || offer.finalPrice <= target.maxPrice)).map((offer) => ({
        ...offer,
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
  if (!target) return '请告诉我商品名称或完整型号，我会从商品库中查找。';
  if (comparison.unsupportedPlatforms?.length) return '当前市场的商品库不支持所选平台，请切换市场或平台后查询。';
  const quotes = catalogQuotes(comparison);
  if (!comparison.product && !comparison.alternatives.length) {
    return `商品库暂未收录与「${target.query}」匹配的型号。可以补充品牌、完整型号或容量；这不代表商家没有在售商品。`;
  }
  if (!quotes.length) {
    const names = comparison.product?.name || comparison.alternatives.map((item) => item.product.name).join('、');
    return `商品库已找到 **${names}**，但${MARKETS[comparison.market].nameZh}${target.maxPrice !== undefined ? '在当前预算和筛选条件下' : '在当前筛选条件下'}暂无有效报价。过期和演示报价不会用于比价，当前不会自动发起实时抓取。`;
  }
  if (comparison.product) {
    const best = [...quotes].sort((a, b) => a.finalPrice - b.finalPrice)[0];
    return `商品库已找到 **${comparison.product.name}** 的 ${quotes.length} 条报价。**${best.platform} · ${best.seller}** 的已入库${best.landedPriceConfidence === 'exact' ? '到手价' : '预估到手价'}最低，为 **${formatMoney(best.finalPrice, comparison.market)}**。`;
  }
  return '商品库中的匹配商品：' + comparison.alternatives.map(({ product, offer }) =>
    `**${product.name}**${offer ? `（${offer.platform}，${formatMoney(offer.finalPrice, comparison.market)}）` : '（暂无有效报价）'}`).join('；') + '。';
}

export function catalogQuoteNote(comparison: Comparison): string {
  return catalogQuotes(comparison).length
    ? `\n\n以上为已入库报价，最近采集时间：${comparison.updatedAt}；本次未实时抓取，下单前请核对商家页面。`
    : '';
}
