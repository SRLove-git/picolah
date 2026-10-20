import type { Comparison, Offer } from '../shared/types.ts';
import { MARKETS } from '../shared/types.ts';
import { formatMoney } from './format.ts';

function sortByFinal(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => a.finalPrice - b.finalPrice);
}

export function writeFallbackAnswer(comparison: Comparison): string {
  const { product, market } = comparison;
  const marketName = MARKETS[market].nameZh;

  if (comparison.kind === 'recommendation' && comparison.alternatives.length) {
    const examples = comparison.alternatives
      .slice(0, 3)
      .map((item) => {
        const price = item.offer
          ? `，${formatMoney(item.offer.finalPrice, market)} 起`
          : '，这个市场暂无报价';
        return `**${item.product.name}**${price}`;
      })
      .join('；');
    return [
      `按你的需求，我先从价格库里挑出：${examples}。`,
      `你可以再补一句预算、品牌或用途，我帮你缩小范围；下单前记得核对券后价。`,
    ].join('\n\n');
  }

  if (!product) {
    const examples = comparison.alternatives
      .slice(0, 2)
      .map((item) => `**${item.product.name}**`)
      .join('、');
    return [
      `我还没有在价格库里找到与「${comparison.query}」完全对应的型号。为了避免拿错版本或容量，我先不猜价格。`,
      examples
        ? `你可以补一句具体型号或容量；也可以先从下面的 ${marketName} 热门选择看起：${examples}。`
        : `你可以补一句具体型号或容量，我再替你逐平台核对。`,
    ].join('\n\n');
  }

  if (!comparison.offers.length) {
    return [
      `**${product.name}** 目前在${marketName}的价格库里还没有在售报价。`,
      `可以切换到其他市场，或等下一次爬虫同步后再看。下面先放几个${marketName}的热门选择。`,
    ].join('\n\n');
  }

  const sorted = sortByFinal(comparison.offers);
  const best = sorted[0];
  const second = sorted[1];
  const bestPrice = formatMoney(best.finalPrice, market);

  const feeNote =
    best.shippingFee > 0 ? `，已含 ${formatMoney(best.shippingFee, market)} 运费` : '，包邮';
  const discountNote =
    best.discount > 0 ? `，并叠加了 ${formatMoney(best.discount, market)} 的券后优惠` : '';

  const paragraphs = [
    `我查了**${marketName} ${comparison.offers.length} 个平台**的 ${product.name}：**${best.platform} · ${best.seller}** 的到手价最低，**${bestPrice}**${feeNote}${discountNote}。`,
  ];

  if (second) {
    const gap = second.finalPrice - best.finalPrice;
    const lowNote =
      best.low30d >= best.finalPrice - 0.01
        ? '这个价格同时是近 30 天的最低点'
        : `近 30 天曾低至 ${formatMoney(best.low30d, market)}`;
    paragraphs.push(
      gap > 0
        ? `第二低是 ${second.platform} 的 ${formatMoney(second.finalPrice, market)}，最低价还能再省 **${formatMoney(gap, market)}**。${lowNote}。`
        : `第二名 ${second.platform} 与它同价，${lowNote}。`,
    );
  } else {
    paragraphs.push('目前这个市场只有一条在售报价，选择不多，建议下单前再确认库存和保修。');
  }

  const official = sortByFinal(comparison.offers.filter((offer) => offer.isOfficial))[0];
  if (official && !best.isOfficial) {
    const premium = official.finalPrice - best.finalPrice;
    if (premium <= best.finalPrice * 0.035) {
      paragraphs.push(
        `最低价来自第三方店铺；${official.platform} 的官方店只贵 **${formatMoney(premium, market)}**，售后和保修更稳，我会优先选官方店。`,
      );
    } else {
      paragraphs.push(
        `如果更在意官方保修，${official.platform} 的官方店到手 ${formatMoney(official.finalPrice, market)}，比最低价高 ${formatMoney(premium, market)}，可以按自己对售后的在意程度取舍。`,
      );
    }
  } else if (best.isOfficial) {
    paragraphs.push('最低价本身就来自官方 / 商城渠道，价格和售后都比较稳，可以优先考虑。');
  } else {
    paragraphs.push('这个市场暂时没有官方店在售，下单前建议确认店铺评分和保修方式。');
  }

  paragraphs.push('价格会随优惠券和库存变化，去平台前记得再核对一次券后价。');
  return paragraphs.join('\n\n');
}
