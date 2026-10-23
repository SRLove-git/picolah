import type { Comparison } from '../shared/types.ts';
import { MARKETS } from '../shared/types.ts';
import type { Recognition, Understanding } from './understanding.ts';
import { formatMoney } from './format.ts';

const SYSTEM_PROMPT = `你是 Picolah，一个只做东南亚六国电商比价的中文购物助手，语气克制、具体，像熟悉当地电商的朋友。

规则：
1. 只能依据 <price_data> 里的报价回答，绝对不能发明商品、平台、卖家、价格、折扣或库存。
2. 用简体中文回答，2–3 段，每段 1–2 句，全文不超过 220 字。不要表格、标题、项目符号或编号列表。
3. 第一段直接给结论：最低到手价的平台、卖家和金额。金额使用 price_data 中已格式化好的金额，不要自己换汇。
4. 第二段说明与第二低价相差多少，或是否接近近 30 天低点；如果最低价不是官方店，再给出官方店的价格与取舍建议。
5. 可以用 **加粗** 强调平台和关键价格。不要说“根据数据”“作为 AI”等套话，不要重复完整报价列表。
6. 到手价 = 商品价 + 运费 − 优惠，直接引用 landedPrice。结尾用一句自然的话提醒用户下单前核对券后价。`;

const GENERAL_SYSTEM_PROMPT = `你是 Picolah，一个只做东南亚六国电商比价的中文购物助手，语气克制、具体，像熟悉当地电商的朋友。

你会收到 <shop_context>，里面有当前市场、模型对用户意图的判断、图片识别结果、已匹配的商品和价格库候选商品。规则：
1. 你能帮用户：确认商品型号和容量、比较 Shopee、Lazada、TikTok Shop 等平台的到手价、解释运费和优惠、判断官方店是否值得买。与购物、价格、商品无关的话题，用一句话礼貌拉回比价。
2. 绝对不能编造商品、平台、卖家、价格、折扣或库存。只能引用 <shop_context> 中出现的商品和价格；lowestLandedPrice 为 null 表示该商品在当前市场没有在售报价。
3. 如果用户只是打招呼、道谢，或没有说清想比什么：用 1–2 句自然回应，说明你能帮什么，并追问具体商品型号/容量和想看的市场。不要输出价格清单，也不要说“价格库里没有找到”。
4. 如果 intent 是 recommend：先看 catalog 里有没有图片识别出的商品（recognizedProduct）。有价格就先说明它当前的最低到手价，再从 catalog 里挑 1–3 个更符合需求、预算和用途的商品做推荐或替代；catalog 为空或没有同品类时，直说价格库暂未覆盖，请用户补充型号。最多比较 2 个价格。
5. 如果 recognition 不为 null：先用半句说明你从图片里看到的商品；confidence 低于 0.7 时用“看起来像”并提醒用户确认型号，不要假装确定。recognizedProduct 有 lowestLandedPrice 时，直接引用这个价格，不要声称“没有报价”。
6. 如果 matchedProduct 存在但 matchedProductOfferCount 为 0：直接说明这个市场目前没有在售报价，建议换一个市场或稍后再看；不要猜价格。
7. 如果用户想比价的商品没有匹配到（matchedProduct 为 null 且 intent 不是 recommend）：说明没找到完全对应的型号，请对方补充品牌 + 型号 + 容量；可以从 catalog 里挑最多 2 个名字相关的商品举例。
8. 用简体中文，2–3 段，每段 1–2 句，全文不超过 220 字。不要表格、标题、项目符号或编号列表。可以用 **加粗** 强调商品名或平台名，但不要堆砌。
9. 不要说“根据数据”“作为 AI”“价格库显示”等套话，直接给结论和下一步。`;

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
) {
  const recognitionBlock = recognition
    ? `\n\n<recognition>\n用户上传了商品图片，视觉识别结果：${recognition.name}${recognition.brand ? `（${recognition.brand}）` : ''}，置信度 ${recognition.confidence.toFixed(2)}${recognition.notes ? `，备注：${recognition.notes}` : ''}。如果与 price_data 中的商品一致，开头用半句说“从图片看是 …”；置信度低于 0.7 时用“看起来像”，不要展开识别过程。\n</recognition>`
    : '';
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `用户问题：${query}\n\n<price_data>\n${buildLlmPayload(comparison)}\n</price_data>${recognitionBlock}\n\n请按规则写出比价建议。`,
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
) {
  return [
    { role: 'system' as const, content: GENERAL_SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `用户问题：${query}\n\n<shop_context>\n${buildGeneralPayload(comparison, understanding)}\n</shop_context>\n\n请按规则回答。`,
    },
  ];
}

interface StreamDelta {
  choices?: Array<{ delta?: { content?: string | null }; message?: { content?: string | null } }>;
  error?: { message?: string };
}

async function* readSse(response: Response): AsyncGenerator<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = (await response.json()) as StreamDelta;
    const content = body.choices?.[0]?.message?.content;
    if (content) yield content;
    return;
  }

  if (!response.body) throw new Error('LLM response had no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const event of events) {
        const dataLines = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim());
        if (!dataLines.length) continue;
        const raw = dataLines.join('\n');
        if (raw === '[DONE]') {
          finished = true;
          break;
        }
        let parsed: StreamDelta;
        try {
          parsed = JSON.parse(raw) as StreamDelta;
        } catch {
          continue;
        }
        if (parsed.error?.message) throw new Error(parsed.error.message);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function* streamLlmAnswer(
  comparison: Comparison,
  query: string,
  understanding?: Understanding | null,
): AsyncGenerator<string> {
  const apiKey = process.env.LLM_API_KEY || '';
  if (!apiKey) throw new Error('LLM_API_KEY is not configured');

  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'deepseek-chat';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const hasPriceData = Boolean(comparison.product && comparison.offers.length > 0);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: hasPriceData
          ? buildLlmMessages(comparison, query, understanding?.recognition)
          : buildGeneralMessages(comparison, query, understanding),
        stream: true,
        temperature: hasPriceData ? 0.35 : 0.45,
        max_tokens: hasPriceData ? 520 : 420,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`LLM request failed (${response.status}): ${detail}`);
    }

    let emitted = false;
    for await (const delta of readSse(response)) {
      emitted = true;
      yield delta;
    }
    if (!emitted) throw new Error('LLM returned an empty response');
  } finally {
    clearTimeout(timeout);
  }
}
