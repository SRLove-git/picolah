import type { Comparison, Offer } from './types.ts';
import { MARKETS, PLATFORMS } from './types.ts';
import { formatMoney } from './format.ts';

function sortByFinal(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => a.finalPrice - b.finalPrice);
}

/** Deterministic answer used when the LLM is unavailable — and by the offline mock. */
export function writeFallbackAnswer(comparison: Comparison): string {
  const { product, market } = comparison;
  const marketName = MARKETS[market].nameZh;

  if (comparison.unsupportedPlatforms?.length) {
    const platforms = comparison.unsupportedPlatforms
      .map((id) => PLATFORMS[id]?.name || id)
      .join('、');
    return `${marketName}当前不支持 **${platforms}** 的报价。请切换到该平台支持的市场，或改看当前市场的其他平台。`;
  }

  if (comparison.search && comparison.search.status !== 'matched') {
    const { model, status } = comparison.search;
    const platforms = comparison.search.platforms.map((id) => PLATFORMS[id]?.name || id).join('、');
    if (status === 'failed') {
      return `**${model}** 的商品信息搜索暂时未完成，平台连接或数据读取失败。请稍后重试；这不代表该型号没有在售商品。`;
    }
    if (status === 'unavailable') {
      return `已识别你要查找的商品 **${model}**，但当前市场或所选平台的实时搜索暂不可用，尚未取得商品信息。请切换平台或稍后重试。`;
    }
    return `已搜索${marketName}${platforms ? `的 ${platforms}` : ''}，暂未找到 **${model}** 的匹配在售商品。你可以换个平台再试，或补充品牌和完整型号。`;
  }

  if (comparison.search?.status === 'matched') {
    const partialNote = comparison.search.failedPlatforms
      ? `\n\n另有 ${comparison.search.failedPlatforms} 个平台暂未完成搜索，以上不是完整的平台对比。` : '';
    if (product && comparison.offers.length) {
      const feesUnknown = comparison.offers.some((offer) => offer.shippingKnown === false || offer.discountKnown === false);
      const sorted = [...comparison.offers].sort((a, b) => feesUnknown ? a.itemPrice - b.itemPrice : a.finalPrice - b.finalPrice);
      const best = sorted[0];
      return `本次实时搜索找到 **${product.name}** 的 ${sorted.length} 条报价，来自 ${comparison.sourceCount} 个平台。当前返回结果中，**${best.platform}${best.seller ? ` · ${best.seller}` : ''}** 的${feesUnknown ? '商品价' : '到手价'}最低，为 **${formatMoney(feesUnknown ? best.itemPrice : best.finalPrice, market)}**。` +
        (feesUnknown ? '\n\n部分运费和优惠尚未确认，暂按商品价比较，最终应付金额以平台为准。' : '\n\n以上仅比较本次搜索结果，未使用历史价格。') + partialNote;
    }
    const choices = comparison.alternatives.slice(0, 3).map(({ product: item, offer }) =>
      `**${item.name}**${offer ? `（${offer.platform}，商品价 ${formatMoney(offer.itemPrice, market)}）` : ''}`).join('；');
    return `本次实时搜索找到：${choices}。\n\n这些结果可能包含不同型号或规格，请确认具体版本后再比价；未使用本地价格库。` + partialNote;
  }

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
    if (comparison.platformFilter?.length) {
      const platforms = comparison.platformFilter
        .map((id) => PLATFORMS[id]?.name || id)
        .join('、');
      return `已切换为只看 **${platforms}**。请先告诉我具体商品或型号，我再按这个平台帮你查价。`;
    }
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
    `我查了**${marketName} ${comparison.sourceCount} 个平台的 ${comparison.offers.length} 条报价**：${product.name} 在 **${best.platform} · ${best.seller}** 的到手价最低，**${bestPrice}**${feeNote}${discountNote}。`,
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
