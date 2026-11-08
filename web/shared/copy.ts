import type { CountryCode, Comparison, Offer } from './types.ts';
import { MARKETS, PLATFORMS } from './types.ts';
import { formatCurrency, formatMoney } from './format.ts';

function sortByFinal(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => a.finalPrice - b.finalPrice);
}

/** Shared deterministic coverage notice also appended after streamed LLM answers. */
export function liveSearchCoverageNote(comparison: Comparison): string {
  if (comparison.search?.status !== 'matched' || !comparison.search.failedPlatforms) return '';
  const web = comparison.search.scope === 'web';
  if (web && !comparison.search.failedSources?.length) return '\n\n部分页面暂未取得可核实的价格，以上不是完整的搜索结果。';
  const failedSources = comparison.search.failedSources?.length ? comparison.search.failedSources.join('、')
    : `${comparison.search.failedPlatforms} 个${web ? '来源' : '平台'}`;
  return `\n\n另有 ${failedSources}暂未完成${comparison.search.pageVerification ? '搜索或商品页核验' : '搜索'}，以上不是完整的${web ? '搜索结果' : '平台对比'}。`;
}

/** Deterministic answer used when the LLM is unavailable — and by the offline mock. */
function quotePrice(offer: Offer, market: CountryCode, global: boolean): string {
  const format = (n: number) => global ? formatCurrency(n, offer.currency) : formatMoney(n, market);
  const low = format(offer.itemPrice);
  return offer.priceQuote?.kind === 'range' ? `${low}–${format(offer.priceQuote.maxPrice!)}`
    : offer.priceQuote?.kind === 'from' ? `${low} 起` : low;
}

// Used when the model is unavailable and the user explicitly asks for a next step.
export function asksForQuoteNextStep(question: string): boolean {
  if (/(?:只要|只报|只给|只说|仅需).{0,4}(?:金额|价格|结果)|(?:不用|无需|别|不要).{0,4}(?:建议|办法|下一步)|(?:just|only) (?:the )?(?:price|result)|(?:no|without) (?:suggestions|advice)/i.test(question)) return false;
  return /下一步|接下来.*(?:怎么办|怎么找|怎么做|该怎么|可以怎么)|怎么办|怎么(?:继续找|再查找)|(?:怎么|如何)(?:再)?找|给.{0,6}(?:办法|建议)|what (?:can|should|could) I (?:try|do)|how (?:can|should) I (?:find|look)|(?:suggest|recommend) .{0,12}(?:step|way)|next steps?/i.test(question);
}

export function writeFallbackAnswer(comparison: Comparison): string {
  const { product, market } = comparison;
  const marketName = comparison.search?.geography === 'global' ? '全球' : MARKETS[market].nameZh;

  if (comparison.unsupportedPlatforms?.length) {
    const platforms = comparison.unsupportedPlatforms
      .map((id) => PLATFORMS[id]?.name || id)
      .join('、');
    return `${marketName}当前不支持 **${platforms}** 的报价。请切换到该平台支持的市场，或改看当前市场的其他平台。`;
  }

  if (comparison.search && comparison.search.status !== 'matched') {
    const search = comparison.search;
    const sites = search.scope === 'web' ? '' : search.platforms.map(id => PLATFORMS[id]?.name || id).join('、');
    const item = `${marketName}${sites ? '（' + sites + '）' : ''}的 **${search.query || search.model}**`;
    const wantsHelp = asksForQuoteNextStep(comparison.query);
    const nextStep = wantsHelp ? ` 可以在品牌官网选择对应国家或地区，或补充更多型号片段后重试。` : '';
    if (search.errorCode === 'PRODUCT_PAGE_UNVERIFIED') {
      return `已找到${item}的候选链接，但商品详情页未能确认对应规格的页面价，这不代表没有在售商品。${nextStep}`;
    }
    if (search.errorCode === 'SERP_NOT_CONFIGURED') {
      return `全网搜索接口尚未配置，这次未能搜索${item}的页面价。${nextStep}`;
    }
    if (search.errorCode === 'CRAWLER_QUEUE_FULL' || search.errorCode === 'CRAWLER_QUEUE_TIMEOUT') {
      const reason = search.errorCode === 'CRAWLER_QUEUE_FULL'
        ? `当前搜索请求较多，${item}尚未进入搜索队列。`
        : `${item}的搜索排队超时，尚未开始抓取商品。`;
      return reason + (wantsHelp ? '请稍后重试。' : '');
    }
    if (search.status === 'failed') return `${item}搜索暂时未完成，本次未能确认页面价。${nextStep}`;
    if (search.status === 'unavailable') return `查价服务暂不可用，这次未能取得${item}的页面价。${nextStep}`;
    return `这次没有找到${item}的匹配页面价。${nextStep}`;
  }

  if (comparison.search?.status === 'matched') {
    const web = comparison.search.scope === 'web';
    const partialNote = liveSearchCoverageNote(comparison);
    if (comparison.search.geography === 'global') {
      const rows = comparison.product ? comparison.offers.map((offer) => ({ product: comparison.product!, offer })) : comparison.alternatives;
      const choices = rows.filter((row) => row.offer).slice(0, 3).map(({ product, offer }) =>
        `**${product.name}**（${offer!.platform}，商品价 **${quotePrice(offer!, market, true)}**）`).join('；');
      return `本次全球跨网站搜索找到：${choices}。\n\n以上保留原币种和规格，未换汇或跨型号排名；运费、税费及配送范围尚未确认。` + partialNote;
    }
    if (product && comparison.offers.length) {
      const feesUnknown = comparison.offers.some((offer) => offer.shippingKnown === false || offer.discountKnown === false);
      const sorted = [...comparison.offers].sort((a, b) => feesUnknown ? a.itemPrice - b.itemPrice : a.finalPrice - b.finalPrice);
      const best = sorted[0];
      return `本次${web ? '全网' : '实时'}搜索找到 **${product.name}** 的 ${sorted.length} 条${sorted.every((offer) => offer.verification) ? '商品页已核验' : ''}报价，来自 ${comparison.sourceCount} 个${web ? '网站' : '平台'}。当前返回结果中，**${best.platform}${best.seller ? ` · ${best.seller}` : ''}** 的${feesUnknown ? '商品价' : '到手价'}最低，为 **${formatMoney(feesUnknown ? best.itemPrice : best.finalPrice, market)}**。` +
        (feesUnknown ? '\n\n部分运费和优惠尚未确认，暂按商品价比较，最终应付金额以平台为准。' : '\n\n以上仅比较本次搜索结果，未使用历史价格。') + partialNote;
    }
    const choices = comparison.alternatives.slice(0, 3).map(({ product: item, offer }) =>
      `**${item.name}**${offer ? `（${offer.platform}，商品价 ${quotePrice(offer, market, false)}）` : ''}`).join('；');
    return `本次在${marketName}相关站点找到：${choices}。\n\n这些结果可能包含不同型号或规格，请确认具体版本后再比价；未使用本地价格库。` + partialNote;
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
