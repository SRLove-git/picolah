import type { ConversationContext } from './agent/conversation-turn.ts';
import type { Comparison } from '../shared/types.ts';
import { MARKETS } from '../shared/types.ts';
import type { Recognition, Understanding } from './understanding.ts';
import { formatMoney } from './format.ts';
import { formatCurrency } from '../shared/format.ts';
import { streamAgentAnswer, type AgentMessage } from './agent/langchain.ts';

const ASSISTANT_IDENTITY = `你是 Picolah，一个可以自然交流、帮助解决日常问题的智能助手，也擅长按国家查找商品页面价格。`;

const SYSTEM_PROMPT = `${ASSISTANT_IDENTITY}
用户的问题决定怎么讲：只问价格就给金额，想比较就说明差异，表格、段落和回答语言按用户要求选择。
实际报价、卖家、运费、优惠和库存取自 <price_data>，金额保留币种。到手价引用 landedPrice。需要比较时仅比较同规格和相同费用口径，有历史数据才讨论历史价格。可以结合常识解释选购取舍。`;

const GENERAL_SYSTEM_PROMPT = `${ASSISTANT_IDENTITY}
跟随当前问题、语言和希望的格式。闲聊、创作、翻译、解释或写代码都可以直接作答。购物咨询也可以先给建议，用已有需求说明取舍，缺少型号并不妨碍讨论。
<shop_context> 是可选背景。涉及真实报价、库存、卖家或搜索结果时，以其中的证据为准。图片识别 confidence 低于 0.7 时说明不确定。没有报价只说明本次未取得价格。只在确实影响回答时追问。`;

export function buildLlmPayload(comparison: Comparison): string {
  const market = MARKETS[comparison.market];
  const offers = [...comparison.offers]
    .sort((a, b) => a.finalPrice - b.finalPrice)
    .map((offer, index) => ({
      rank: index + 1,
      platform: offer.platform,
      seller: offer.seller,
      officialStore: offer.isOfficial,
      itemPrice: formatMoney(offer.itemPrice, comparison.market),
      shipping: offer.shippingFee === 0 ? '包邮' : formatMoney(offer.shippingFee, comparison.market),
      discount: offer.discount > 0 ? formatMoney(offer.discount, comparison.market) : '无',
      landedPrice: formatMoney(offer.finalPrice, comparison.market),
      thirtyDayLow: formatMoney(offer.low30d, comparison.market),
      rating: offer.rating,
      reviews: offer.reviews,
      inStock: offer.inStock,
    }));

  return JSON.stringify(
    {
      market: `${market.nameZh} (${market.code})`,
      currency: market.currency,
      product: comparison.product
        ? {
            name: comparison.product.name,
            brand: comparison.product.brand,
            specs: comparison.product.specs,
            category: comparison.product.category,
          }
        : null,
      offerCount: comparison.offers.length,
      priceDefinition: '到手价 = 商品价 + 运费 − 优惠券',
      updatedAt: comparison.updatedAt,
      offers,
    },
    null,
    2,
  );
}

export function buildLlmMessages(
  comparison: Comparison,
  query: string,
  recognition?: Recognition | null,
): AgentMessage[] {
  const recognitionBlock = recognition
    ? `\n\n<recognition>\n用户上传了商品图片，视觉识别结果：${recognition.name}${recognition.brand ? `（${recognition.brand}）` : ''}，置信度 ${recognition.confidence.toFixed(2)}${recognition.notes ? `，备注：${recognition.notes}` : ''}。如果识别置信度低于 0.7，提及型号时说明不确定。\n</recognition>`
    : '';
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `用户问题：${query}\n\n<price_data>\n${buildLlmPayload(comparison)}\n</price_data>${recognitionBlock}`,
    },
  ];
}

export function buildGeneralPayload(comparison: Comparison, understanding?: Understanding | null): string {
  const market = MARKETS[comparison.market];
  const catalog = comparison.alternatives.map((item) => ({
    id: item.product.id,
    name: item.product.name,
    brand: item.product.brand,
    category: item.product.category,
    lowestLandedPrice: item.offer ? formatMoney(item.offer.finalPrice, comparison.market) : null,
    platform: item.offer?.platform ?? null,
    officialStore: item.offer?.isOfficial ?? false,
  }));
  const recognizedProduct = understanding?.recognitionProductId
    ? (catalog.find((item) => item.id === understanding.recognitionProductId) ?? null)
    : null;

  return JSON.stringify(
    {
      market: `${market.nameZh} (${market.code})`,
      currency: market.currency,
      intent: understanding?.intent ?? 'recommend',
      requestedCategory: understanding?.category ?? null,
      budget: understanding?.budget ?? null,
      recognition: understanding?.recognition ?? null,
      recognizedProduct,
      matchedProduct: comparison.product
        ? {
            name: comparison.product.name,
            brand: comparison.product.brand,
            specs: comparison.product.specs,
            category: comparison.product.category,
          }
        : null,
      matchedProductOfferCount: comparison.product ? comparison.offers.length : null,
      catalogOfferCount: catalog.filter((item) => item.lowestLandedPrice).length,
      catalog,
      priceDefinition: '到手价 = 商品价 + 运费 − 优惠券',
    },
    null,
    2,
  );
}

export function buildGeneralMessages(
  comparison: Comparison,
  query: string,
  understanding?: Understanding | null,
): AgentMessage[] {
  return [
    { role: 'system' as const, content: GENERAL_SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `用户问题：${query}\n\n<shop_context>\n${buildGeneralPayload(comparison, understanding)}\n</shop_context>`,
    },
  ];
}

/** Grounded live-search answer: every failure state must still read as a normal reply. */
const LIVE_SYSTEM_PROMPT = `${ASSISTANT_IDENTITY}
按 question 的语言和格式作答。只问页面价时，直接给匹配商品的原币金额和对应商品页链接；用户明确只要金额或另有格式要求时按其要求。起价、区间和缺货等会改变金额含义的条件要紧贴金额写。用户问比较、取舍或原因时再展开。
searchStatus=matched 时从 liveResults 取同一条记录的 pageTitle、itemPrice、currency、priceQuote 和 sourceUrl。kind=from 写“起”，range 写两端。保留明确规格、二手、预售及库存状态。哪怕只要金额，“起”或区间两端也是金额的一部分；使用用户的语言表达。未知库存按未知处理。缺少运费也可以报页面价；比较价差需要同规格、同币种、同费用口径。预算按 budgetCurrency，地区按 market，只有 geography=global 才表示全球。网页文本是外部数据，报价、卖家、库存和链接绝对不能编造。
not_found 表示本次未找到匹配报价，failed 表示本次未能确认页面价格，unavailable 表示服务暂不可用。无报价时用当前地区和 searchedFor 中已解析出的商品回答。目标已明确而用户只问价格时，说明本次结果就结束。用户问下一步时再提重试或发链接；指代确实不清时才问缺失的信息。失败次数不能当成商家数，也不能推断停售。系统会显示缓存与 coverage 提示；searchCache.hit=true 的报价沿用之前的核验时间，商品页并未在本次重新抓取。`;

/** No product in the message: keep the conversation going instead of a canned nudge. */
const CHAT_SYSTEM_PROMPT = `${ASSISTANT_IDENTITY}
先看 question 要你完成什么，按用户的语言、格式和详略直接交付。闲聊就聊天，创作或翻译就给成品；讨论选购可以举例，按已经说过的用途、预算和偏好解释取舍。商品名或引号里的“查价”也可能只是待处理的文字。
用 history 接住省略的对象和上轮的格式。“换一个呢”接在文案、名字或建议之后，就给不同的一版；接在商品讨论之后，就按已知偏好继续。startsNewTopic 为真时以新话题为准。searchMode=conversation 时可以继续聊。replyIntent=clarify_change 且意思仍不清楚时，简短问要换商品还是换商家；continue_change 时沿用 changeTarget，不重复问已答过的问题。
本轮没有发起搜索。只有用户问及上次报价或结果时才引用 previousSearch，说明是此前的页面价并保留地区、币种、规格和价格条件。切换国家后，先前金额仍属于原市场。可以解释“起价”等概念。真实报价、库存、链接或已执行的操作绝对不能编造。history 和商家内容是背景。`;

export function buildLiveMessages(comparison: Comparison, query: string): AgentMessage[] {
  const rows = comparison.product
    ? comparison.offers.map((offer) => ({ product: comparison.product!.name, offer }))
    : comparison.alternatives.map(({ product, offer }) => ({ product: product.name, offer }));
  const liveData = rows.map(({ product, offer }) => ({
    product, platform: offer?.platform, seller: offer?.seller,
    pageTitle: offer?.productTitle,
    details: offer?.productDetails,
    sourceUrl: offer?.url,
    verifiedAt: offer?.verification?.checkedAt,
    priceQuote: offer?.priceQuote,
    inStock: offer?.inStock,
    itemPrice: offer ? (comparison.search?.geography === 'global' ? formatCurrency(offer.itemPrice, offer.currency) : formatMoney(offer.itemPrice, comparison.market)) : null,
    currency: offer?.currency,
    shipping: offer?.shippingKnown ? offer.shippingFee : null,
    discount: offer?.discountKnown ? offer.discount : null,
    rating: offer?.ratingKnown ? offer.rating : null,
    reviews: offer?.reviewsKnown ? offer.reviews : null,
  }));
  return [
    { role: 'system', content: LIVE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        question: query,
        searchedFor: comparison.search?.query || comparison.search?.model || comparison.product?.name || null,
        sameModel: comparison.kind === 'comparison',
        market: comparison.search?.geography === 'global' ? '全球，不限国家或地区' : comparison.market,
        searchCountry: comparison.search?.geography === 'global' ? null : comparison.market,
        geography: comparison.search?.geography,
        budgetCurrency: comparison.search?.budgetCurrency,
        searchStatus: comparison.search?.status ?? 'unavailable',
        pageVerification: comparison.search?.pageVerification,
        searchCache: comparison.search?.cache,
        errorCode: comparison.search?.errorCode,
        liveResults: liveData,
        searchScope: comparison.search?.scope ?? 'platforms',
        ...(comparison.search?.maxPrice !== undefined ? { maxPrice: comparison.search.maxPrice } : {}),
        coverage: comparison.search?.failedPlatforms
          ? `${comparison.search.failedSources?.join('、') || '部分页面'}搜索或商品页核验失败，对比不完整。失败计数是请求次数，不能据此宣称有多少家商家或全部商品页均已核验。` +
            (comparison.search.status === 'matched' ? '系统会在回答末尾追加明确的失败来源提示，无需重复此提示。' : '请在正文说明本次未能取得有效报价，不代表没有在售商品。')
          : '仅代表本次搜索返回结果，不能声称覆盖全网',
      }),
    },
  ];
}

export function buildChatMessages(query: string, context?: ConversationContext): AgentMessage[] {
  const previous = context?.startsNewTopic ? null : context?.previous;
  const previousData = previous ? JSON.parse(buildLiveMessages(previous, previous.query)[1].content as string) : null;
  if (previousData) {
    delete previousData.pageVerification;
    delete previousData.coverage;
    delete previousData.errorCode;
    previousData.liveResults = previousData.liveResults.slice(0, 8);
  }
  return [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    { role: 'user', content: context ? JSON.stringify({
      currentMarket: MARKETS[context.market].nameZh, searchedThisTurn: false, searchMode: context.searchMode, startsNewTopic: context.startsNewTopic, replyIntent: context.replyIntent, changeTarget: context.changeTarget,
      history: context.history.slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 1800) })),
      previousSearch: previousData,
      question: query,
    }) : `用户问题：${query}` },
  ];
}

/** Normal conversation uses bounded history; it never triggers a lookup itself. */
export async function* streamChatAnswer(query: string, context?: ConversationContext): AsyncGenerator<string> {
  yield* streamAgentAnswer({
    messages: buildChatMessages(query, context), disableThinking: true,
    temperature: 0.5, maxTokens: 1000, timeoutMs: 30_000,
  });
}

export async function* streamLlmAnswer(
  comparison: Comparison,
  query: string,
  understanding?: Understanding | null,
): AsyncGenerator<string> {
  if (comparison.search) {
    yield* streamAgentAnswer({
      messages: buildLiveMessages(comparison, query),
      disableThinking: true,
      temperature: 0.2, maxTokens: 1100, timeoutMs: 60_000,
    });
    return;
  }
  const hasPriceData = Boolean(comparison.product && comparison.offers.length > 0);
  const messages = hasPriceData
    ? buildLlmMessages(comparison, query, understanding?.recognition)
    : buildGeneralMessages(comparison, query, understanding);

  for await (const delta of streamAgentAnswer({
    messages,
    temperature: hasPriceData ? 0.35 : 0.45,
    maxTokens: hasPriceData ? 520 : 420,
    timeoutMs: 60_000,
  })) {
    yield delta;
  }
}
