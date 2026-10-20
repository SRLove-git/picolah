import type { CountryCode, Product } from '../shared/types.ts';
import { MARKETS } from '../shared/types.ts';
import { formatMoney } from './format.ts';
import { findProduct } from './query.ts';
import { getOffers, listProducts } from './repo.ts';

export type Intent = 'compare' | 'recommend' | 'smalltalk' | 'offtopic';

export interface Recognition {
  name: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  confidence: number;
  keywords: string[];
  notes: string;
}

export interface Understanding {
  intent: Intent;
  matchedProductId: string | null;
  recognitionProductId: string | null;
  recommendedProductIds: string[];
  category: string | null;
  budget: number | null;
  recognition: Recognition | null;
  source: 'llm' | 'fallback';
}

interface CatalogItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  tagline: string;
  specs: string;
  lowestLandedPrice: string | null;
  platform: string | null;
  officialStore: boolean;
  offerCount: number;
}

const TEXT_SYSTEM_PROMPT = `你是 Picolah 的意图解析器，只输出 JSON，不要 markdown。

Picolah 是东南亚六国电商比价助手。把用户这句话解析成结构化意图，并从给定的 catalog 里选择商品。

规则：
1. intent=compare：用户在问某一款具体商品的价格、平台、是否值得买。matchedProductId 填 catalog 中最匹配的 id；没有就填 null。
2. intent=recommend：用户按品类、预算、用途、人群找商品（如“推荐一款手机”“500 以内的耳机”“送女朋友的礼物”），或者想比较两款以上。recommendedProductIds 从 catalog 里挑 1–4 个最合适的，按推荐优先级排序。
3. intent=smalltalk：打招呼、感谢、问你能做什么，没有具体商品需求。
4. intent=offtopic：与购物、价格、商品无关。
5. 用户提到预算时填 budget（数字）和 budgetCurrency（当前市场货币）；category 填品类，brand 填品牌。
6. 只能使用 catalog 中存在的 id，不要编造商品或价格。预算明显低于所有候选时，推荐最接近预算的，不要虚构更便宜的。
7. “推荐 / 类似 / 替代 / 预算 / 适合 / 哪个好”这类需求优先 recommend；只有明确只问一款具体商品时才用 compare。
8. 不确定时用 recommend，并挑最接近的 catalog 商品；catalog 里没有同品类就返回空数组。

输出 JSON 形状：
{"intent":"compare|recommend|smalltalk|offtopic","matchedProductId":null,"recommendedProductIds":[],"category":null,"budget":null,"budgetCurrency":null,"reason":"一句话"} `;

const VISION_SYSTEM_PROMPT = `你是 Picolah 的商品视觉识别器和导购路由器，只输出 JSON，不要 markdown。

看用户上传的图片，识别最显眼的商品，并结合用户文字和 catalog 做选择。

规则：
1. recognition 填写你看到的商品：name（必填，中文或原文）、brand、model、category、confidence（0–1）、keywords（最多 6 个）、notes（颜色/容量/关键特征，最多 80 字）。
2. 如果图片里的商品和 catalog 中某一款高度一致，intent=compare，matchedProductId 填该 id。
3. 如果只能看出品类、型号不确定、图片里的商品不在 catalog，或用户要求“找类似 / 替代 / 推荐”，intent=recommend；从 catalog 挑 1–4 个最接近的 recommendedProductIds。
4. catalog 没有同品类时，recommendedProductIds 返回空数组，不要硬推不相关的商品。
5. 用户文字里的预算、品牌、用途要一起考虑；预算明显不够时说明，但不要编造价格。
6. 如果图片不是商品（风景、截图、模糊图），recognition.confidence 低于 0.35，notes 说明原因，intent=recommend，recommendedProductIds 可为空。
7. 只能使用 catalog 中存在的 id，不能编造商品、价格、折扣或库存。

输出 JSON 形状：
{"intent":"compare|recommend","matchedProductId":null,"recommendedProductIds":[],"category":null,"budget":null,"budgetCurrency":null,"recognition":{"name":"","brand":null,"model":null,"category":null,"confidence":0.8,"keywords":[],"notes":""},"reason":"一句话"}`;

function buildCatalog(market: CountryCode): CatalogItem[] {
  return listProducts().map((product) => {
    const offers = getOffers(product.id, market);
    const best = offers[0] || null;
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      tagline: product.tagline,
      specs: product.specs,
      lowestLandedPrice: best ? formatMoney(best.finalPrice, market) : null,
      platform: best?.platform ?? null,
      officialStore: best?.isOfficial ?? false,
      offerCount: offers.length,
    };
  });
}

function extractJson(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('LLM did not return a JSON object');
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function requestJson(
  messages: unknown[],
  model: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<unknown> {
  const apiKey = process.env.LLM_API_KEY || '';
  if (!apiKey) throw new Error('LLM_API_KEY is not configured');
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`LLM understanding failed (${response.status}): ${detail}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      error?: { message?: string };
    };
    if (body.error?.message) throw new Error(body.error.message);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM understanding returned no content');
    return extractJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

function asString(value: unknown, maxLength = 80): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRecognition(
  value: unknown,
  catalog: CatalogItem[],
  matchedProductId: string | null,
): Recognition | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const matched = matchedProductId ? catalog.find((item) => item.id === matchedProductId) : null;
  const name = asString(raw.name, 120) || matched?.name || null;
  if (!name) return null;
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.map((item) => asString(item, 30)).filter((item): item is string => Boolean(item)).slice(0, 6)
    : [];
  const confidenceValue = Number(raw.confidence);
  return {
    name,
    brand: asString(raw.brand, 40) || matched?.brand || null,
    model: asString(raw.model, 60),
    category: asString(raw.category, 30) || matched?.category || null,
    confidence: Number.isFinite(confidenceValue)
      ? Math.min(1, Math.max(0, confidenceValue))
      : 0.5,
    keywords,
    notes: asString(raw.notes, 120) || '',
  };
}

function normalizeIds(value: unknown, catalog: CatalogItem[]): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，\s]+/)
      : [];
  const valid = new Set(catalog.map((item) => item.id));
  const result: string[] = [];
  for (const item of values) {
    const id = typeof item === 'string' ? item.trim() : '';
    if (!id || !valid.has(id) || result.includes(id)) continue;
    result.push(id);
    if (result.length >= 4) break;
  }
  return result;
}

function normalizeUnderstanding(
  value: unknown,
  catalog: CatalogItem[],
  image: boolean,
): Understanding {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const intents: Intent[] = ['compare', 'recommend', 'smalltalk', 'offtopic'];
  let intent: Intent = intents.includes(raw.intent as Intent)
    ? (raw.intent as Intent)
    : 'recommend';
  let matchedProductId =
    typeof raw.matchedProductId === 'string' &&
    catalog.some((item) => item.id === raw.matchedProductId)
      ? raw.matchedProductId
      : null;
  let recommendedProductIds = normalizeIds(raw.recommendedProductIds, catalog);

  if (intent === 'compare' && !matchedProductId) {
    intent = 'recommend';
  }
  if (intent === 'recommend' && !recommendedProductIds.length && matchedProductId) {
    recommendedProductIds = [matchedProductId];
    matchedProductId = null;
  }
  if (intent === 'smalltalk' || intent === 'offtopic') {
    matchedProductId = null;
    recommendedProductIds = [];
  }

  const recognition = image ? normalizeRecognition(raw.recognition, catalog, matchedProductId) : null;
  let recognitionProductId: string | null = null;
  if (recognition) {
    const recognitionText = [
      recognition.name,
      recognition.brand,
      recognition.model,
      ...recognition.keywords,
    ]
      .filter(Boolean)
      .join(' ');
    recognitionProductId = findProduct(recognitionText).product?.id || matchedProductId;
  }

  return {
    intent,
    matchedProductId,
    recognitionProductId,
    recommendedProductIds,
    category: asString(raw.category, 30),
    budget: asNumber(raw.budget),
    recognition,
    source: 'llm',
  };
}

export interface UnderstandingResult {
  understanding: Understanding | null;
  error?: string;
}

export async function understandQuery(options: {
  query: string;
  market: CountryCode;
  image?: string;
  localProduct: Product | null;
}): Promise<UnderstandingResult> {
  const { query, market, image, localProduct } = options;
  if (!process.env.LLM_API_KEY) return { understanding: null, error: 'LLM_API_KEY is not configured' };

  const catalog = buildCatalog(market);
  const marketInfo = MARKETS[market];
  const localMatch = localProduct
    ? { id: localProduct.id, name: localProduct.name, brand: localProduct.brand }
    : null;
  const text = query.trim() || '帮我看看这张图里的商品，推荐一下';
  const context = `当前市场：${marketInfo.nameZh}（${marketInfo.code}），货币 ${marketInfo.currency}。
用户问题：${text}
本地关键词匹配：${JSON.stringify(localMatch)}
<catalog>
${JSON.stringify(catalog, null, 2)}
</catalog>`;

  try {
    if (image) {
      const value = await requestJson(
        [
          { role: 'system', content: VISION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: `${context}\n\n请识别图片里的商品，并按规则选择 catalog 商品。` },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
        process.env.LLM_VISION_MODEL || 'deepseek-flash',
        900,
        45_000,
      );
      return { understanding: normalizeUnderstanding(value, catalog, true) };
    }

    const value = await requestJson(
      [
        { role: 'system', content: TEXT_SYSTEM_PROMPT },
        { role: 'user', content: `${context}\n\n请按规则输出 JSON。` },
      ],
      process.env.LLM_INTENT_MODEL || process.env.LLM_MODEL || 'deepseek-chat',
      700,
      20_000,
    );
    return { understanding: normalizeUnderstanding(value, catalog, false) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[understanding] falling back to local parser:', message);
    return { understanding: null, error: message };
  }
}
