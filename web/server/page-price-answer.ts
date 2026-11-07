import { MARKETS, type Comparison } from '../shared/types.ts';
import { formatCurrency, formatMoney } from '../shared/format.ts';

const amountRequest = /(?:只(?:要|需(?:要)?|想|用)?|仅(?:需|要)?)\s*(?:看|显示|返回|展示|给(?:我)?|告诉我|报)?\s*(?:商品|页面|实际)?(?:价格|金额|价钱|售价)|(?:price|amount|prices) only|(?:only|just) (?:show (?:me )?|give (?:me )?|the )*(?:prices?|amounts?)\b/i;

export function wantsPagePriceOnly(question: string, compact: boolean): boolean {
  const request=question.replace(/(?:不要|不用|无需|不需要|别)(?:再)?(?:显示|给我|附|加)?(?:商品页)?(?:链接|库存|说明|详情)|(?:without|no) (?:links?|details?|explanations?)/gi,'');
  // Explicit requests for evidence, comparisons, purchase advice or a specific format keep the detailed reply.
  const details=/链接|网址|库存|有货|缺货|配送|运费|优惠|(?:卖家|商家)(?:名称|名字|链接|列表)|(?:和|及|加上)(?:卖家|商家)|怎么买|哪里买|哪里.*购买|为什么|原因|怎么办|下一步|推荐|比较|对比|区别|参数|规格.{0,4}(?:对照|列出)|建议|值得|表格|来源|\b(?:links?|urls?|sources?|stock|availability|shipping|delivery|sellers?|compare|comparison|recommend|table|why|advice)\b|where (?:can I |to )?buy/i;
  return (compact || amountRequest.test(request)) && !details.test(request);
}

export function isPriceRestatement(question: string): boolean {
  return /^(?:请|那|我)?(?:只(?:要|需(?:要)?|用)?|仅(?:需|要)?)\s*(?:显示|展示|返回|给我|告诉我|看|报)?\s*(?:页面|商品)?(?:价格|金额|价钱|售价)(?:就(?:可以|行)|即可|就好)?[。！!？?\s]*$|^(?:please[, ]*)?(?:(?:the )?(?:price|amount|prices) only|(?:only|just) (?:show (?:me )?|give (?:me )?|the )*(?:prices?|amounts?))[.!?\s]*$/i.test(question.trim());
}

/** One line per distinct verified page amount. A starting price or range is part of the amount. */
export function pagePriceAnswer(comparison: Comparison, question: string): string {
  const english=/请用(?:英文|英语)|用(?:英文|英语)回答/i.test(question) || (!/[\u3400-\u9fff]/.test(question) && /\b(?:price|cost|how much|show|only|under|find|check)\b/i.test(question));
  const offers=[...comparison.offers,...comparison.alternatives.flatMap(a=>a.offer?[a.offer]:[])]
    .filter(o=>o.source==='live' && o.verification?.source==='product-page' && Number.isFinite(o.itemPrice) && o.itemPrice>0 &&
      (o.priceQuote?.kind!=='range' || (Number.isFinite(o.priceQuote.maxPrice) && o.priceQuote.maxPrice!>=o.itemPrice)));
  // In an amount-only reply the shopper cannot distinguish a kit or a different formula from the named item.
  // When a merchant explicitly names the requested product, prefer its prices.
  const identity=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  const query=identity(comparison.search?.query || comparison.search?.model || '');
  const exact=query ? offers.filter(o=>identity((o.productTitle || '').replace(/（[^（）]*(?:缺货|库存未明确|预售|二手|翻新|起|价格区间)[^（）]*）$/u,''))===query) : [];
  const prices=new Set<string>();
  for (const o of exact.length ? exact : offers) {
    const currency=o.currency || MARKETS[comparison.market].currency;
    const money=(amount:number)=>(currency===MARKETS[comparison.market].currency ? formatMoney(amount,comparison.market) : formatCurrency(amount,currency)).replace(/([.,])00(?=\s*[^\d]*$)/,'');
    const q=o.priceQuote;let text=money(o.itemPrice);
    if (q?.kind==='range') {
      if (q.maxPrice===undefined || !Number.isFinite(q.maxPrice) || q.maxPrice<o.itemPrice) continue;
      text+='–'+money(q.maxPrice);
    } else if (q?.kind==='from') text=english?'From '+text:text+' 起';
    prices.add(text);
  }
  return prices.size ? [...prices].join('\n\n') : english?'No page price available':'暂无页面价';
}
