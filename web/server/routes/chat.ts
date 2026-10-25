import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { ChatMessage, Comparison, CountryCode, Product } from '../../shared/types.ts';
import { COUNTRY_CODES, MARKETS } from '../../shared/types.ts';
import { llmConfigured } from '../config.ts';
import {
  buildComparison,
  buildRecommendationComparison,
  addMessage,
  createConversation,
  getConversation,
  getProduct,
  updateConversationTitle,
} from '../repo.ts';
import {
  findProducts,
  isContextualFollowUp,
  parseQuery,
  resolvePlatformDirective,
} from '../query.ts';
import { writeFallbackAnswer } from '../copy.ts';
import { streamLlmAnswer } from '../llm.ts';
import { understandQuery, type Understanding } from '../understanding.ts';

export const chatRouter = Router();

const chatSchema = z
  .object({
    message: z.string().trim().max(1200).default(''),
    conversationId: z.string().trim().min(1).max(100).optional().nullable(),
    market: z.enum(COUNTRY_CODES).default('SG'),
    image: z.string().trim().max(4_500_000).optional().nullable(),
  })
  .refine((data) => data.message.length > 0 || Boolean(data.image), {
    message: '请输入想比价的商品',
  });

function validateImage(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(value)) {
    throw new Error('图片格式不支持，请上传 JPG、PNG 或 WebP 图片。');
  }
  const base64 = value.slice(value.indexOf(',') + 1);
  if (Buffer.byteLength(base64, 'base64') > 3 * 1024 * 1024) {
    throw new Error('图片过大，请压缩到 3MB 以内再上传。');
  }
  return value;
}

function resolveComparison(
  understanding: Understanding | null,
  localProducts: Product[],
  message: string,
  market: CountryCode,
  platformIds: string[],
  unsupportedPlatforms: string[],
): Comparison {
  // A platform-only follow-up (for example, "只看 Lazada") is a deterministic
  // filter command, not a new product query. Keep the inherited product even
  // if an external intent model classifies the short sentence differently.
  if (platformIds.length && localProducts.length) {
    if (localProducts.length > 1) {
      return buildRecommendationComparison({
        query: message,
        market,
        productIds: localProducts.map((product) => product.id),
        platformIds,
        unsupportedPlatforms,
      });
    }
    return buildComparison({
      query: message,
      market,
      product: localProducts[0],
      kind: 'comparison',
      platformIds,
      unsupportedPlatforms,
    });
  }

  const matchedProduct =
    understanding?.intent === 'compare' && understanding.matchedProductId
      ? getProduct(understanding.matchedProductId)
      : null;

  if (matchedProduct) {
    return buildComparison({
      query: message,
      market,
      product: matchedProduct,
      kind: 'comparison',
      platformIds,
      unsupportedPlatforms,
    });
  }

  if (understanding?.intent === 'recommend') {
    const productIds = [...understanding.recommendedProductIds];
    if (
      understanding.recognitionProductId &&
      !productIds.includes(understanding.recognitionProductId)
    ) {
      productIds.unshift(understanding.recognitionProductId);
    }
    if (productIds.length > 0) {
      return buildRecommendationComparison({
        query: message,
        market,
        productIds,
        platformIds,
        unsupportedPlatforms,
      });
    }
  }

  if (understanding?.intent === 'smalltalk' || understanding?.intent === 'offtopic') {
    return buildComparison({
      query: message,
      market,
      product: null,
      platformIds,
      unsupportedPlatforms,
    });
  }

  if (localProducts.length > 1) {
    return buildRecommendationComparison({
      query: message,
      market,
      productIds: localProducts.map((product) => product.id),
      platformIds,
      unsupportedPlatforms,
    });
  }

  if (localProducts[0]) {
    return buildComparison({
      query: message,
      market,
      product: localProducts[0],
      kind: 'comparison',
      platformIds,
      unsupportedPlatforms,
    });
  }

  return buildComparison({
    query: message,
    market,
    product: null,
    platformIds,
    unsupportedPlatforms,
  });
}

function previousComparison(messages: ChatMessage[]): Comparison | null {
  return [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.comparison)?.comparison ?? null;
}

function previousComparedProducts(messages: ChatMessage[]): Product[] {
  const previous = previousComparison(messages);
  if (!previous || previous.kind === 'suggestions' || previous.kind === 'empty') return [];
  const ids = previous.product
    ? [previous.product.id]
    : previous.alternatives.map((item) => item.product.id);
  return ids.map((id) => getProduct(id)).filter((product): product is Product => Boolean(product));
}

function contextualProducts(message: string, previous: Product[]): Product[] {
  if (!previous.length || !isContextualFollowUp(message)) return [];
  const ordinal = message.match(/第\s*([一二三四1234])\s*(?:个|款)?/);
  if (ordinal) {
    const index = ({ 一: 0, 二: 1, 三: 2, 四: 3, '1': 0, '2': 1, '3': 2, '4': 3 } as const)[
      ordinal[1] as '一' | '二' | '三' | '四' | '1' | '2' | '3' | '4'
    ];
    return previous[index] ? [previous[index]] : [];
  }
  return previous.length === 1 || /它们|这些|哪个|对比|比较/.test(message) ? previous : [];
}

function sse(res: import('express').Response, event: string, data: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamLocal(
  res: import('express').Response,
  text: string,
): Promise<string> {
  let emitted = '';
  let cursor = 0;
  const sizes = [5, 8, 6, 10, 7, 9];
  let index = 0;
  while (cursor < text.length) {
    const size = sizes[index % sizes.length];
    const chunk = text.slice(cursor, cursor + size);
    cursor += size;
    index += 1;
    emitted += chunk;
    sse(res, 'delta', { text: chunk });
    await sleep(10);
  }
  return emitted;
}

chatRouter.post('/', async (req, res) => {
  const parsedBody = chatSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      message: parsedBody.error.issues[0]?.message || '请求参数有误',
    });
  }

  const { message: rawMessage, market, conversationId } = parsedBody.data;
  let image: string | undefined;
  try {
    image = validateImage(parsedBody.data.image);
  } catch (error) {
    return res.status(400).json({
      error: 'INVALID_IMAGE',
      message: error instanceof Error ? error.message : '图片无法读取',
    });
  }
  const message = rawMessage || '帮我看看这张图里的商品，推荐一下';

  let conversation = null;
  if (conversationId) {
    conversation = getConversation(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: '对话不存在' });
    }
  }

  const query = parseQuery(message, market);
  const title = image ? `图片找货 · ${MARKETS[query.market].nameZh}` : query.title;
  let priorMessages: ChatMessage[] = [];
  if (!conversation) {
    conversation = createConversation(title, query.market);
  } else if ('messages' in conversation) {
    priorMessages = conversation.messages;
  }

  const explicitProducts = findProducts(message)
    .map((match) => match.product)
    .filter((product): product is Product => Boolean(product));
  const inheritedProducts = explicitProducts.length
    ? []
    : contextualProducts(message, previousComparedProducts(priorMessages));
  const localProducts = explicitProducts.length ? explicitProducts : inheritedProducts;
  const localProduct = localProducts[0] || query.product;
  const previousFilter = previousComparison(priorMessages)?.platformFilter ?? [];
  const platformDirective = resolvePlatformDirective(message, query.market, previousFilter);
  const requestedPlatforms = platformDirective.platformIds;

  const userId = randomUUID();
  addMessage({
    id: userId,
    conversationId: conversation.id,
    role: 'user',
    content: message,
    metadata: image ? { image } : undefined,
  });

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sse(res, 'meta', {
    conversationId: conversation.id,
    title: conversation.title,
    market: query.market,
    userMessageId: userId,
  });
  sse(res, 'status', {
    label: llmConfigured
      ? image
        ? '正在识别图片里的商品…'
        : '正在理解你的需求…'
      : '正在检索价格库…',
  });

  let understanding: Understanding | null = null;
  let understandingError: string | undefined;
  if (llmConfigured) {
    const result = await understandQuery({
      query: message,
      market: query.market,
      image,
      localProduct,
      history: priorMessages.slice(-6).map(({ role, content }) => ({ role, content })),
    });
    understanding = result.understanding;
    understandingError = result.error;
  }

  if (!image && understanding?.intent === 'recommend') {
    const marketName = MARKETS[query.market].nameZh;
    const nextTitle = understanding.category
      ? `${understanding.category}推荐 · ${marketName}`
      : `${query.cleaned.replace(/\s+/g, ' ').slice(0, 24)} · ${marketName}`;
    if (nextTitle !== conversation.title) {
      updateConversationTitle(conversation.id, nextTitle);
      conversation.title = nextTitle;
      sse(res, 'meta', {
        conversationId: conversation.id,
        title: nextTitle,
        market: query.market,
        userMessageId: userId,
      });
    }
  }

  if (llmConfigured) {
    if (understandingError) {
      sse(res, 'status', {
        label: image ? '图片识别失败，先按文字帮你找…' : '正在按本地关键词查找…',
      });
    } else if (understanding?.recognition) {
      const name = understanding.recognition.name;
      sse(res, 'status', {
        label: `识别到 ${name.length > 22 ? `${name.slice(0, 22)}…` : name}，正在核对价格…`,
      });
    } else {
      sse(res, 'status', { label: image ? '正在按品类找同类…' : '正在核对价格库…' });
    }
  }

  const comparison = resolveComparison(
    understanding,
    localProducts,
    message,
    query.market,
    requestedPlatforms,
    platformDirective.unsupported,
  );
  const hasOffers = Boolean(comparison.product && comparison.offers.length > 0);
  const isConversational =
    understanding?.intent === 'smalltalk' || understanding?.intent === 'offtopic';

  sse(res, 'results', comparison);
  sse(res, 'status', {
    label: hasOffers
      ? `正在核对 ${comparison.offers.length} 条在售报价…`
      : comparison.kind === 'recommendation'
        ? '正在整理符合需求的商品…'
        : comparison.product
          ? '正在确认该市场的在售情况…'
          : isConversational
            ? '正在生成回答…'
            : '正在整理可推荐的商品…',
  });

  let answer = '';
  let usedLlm = false;

  try {
    if (llmConfigured) {
      if (!isConversational) {
        sse(res, 'status', {
          label: hasOffers
            ? '正在整理比价建议…'
            : comparison.kind === 'recommendation'
              ? '正在整理推荐…'
              : '正在生成回答…',
        });
      }
      usedLlm = true;
      try {
        for await (const delta of streamLlmAnswer(comparison, message, understanding)) {
          answer += delta;
          sse(res, 'delta', { text: delta });
        }
      } catch (error) {
        console.warn(
          '[chat] LLM unavailable, using local writer:',
          error instanceof Error ? error.message : error,
        );
        if (answer.trim()) {
          const note = '\n\n（模型连接中断，以上是已生成的部分建议；可以重试。）';
          answer += note;
          sse(res, 'delta', { text: note });
        } else {
          usedLlm = false;
        }
      }
    }

    if (!answer.trim()) {
      const localAnswer = writeFallbackAnswer(comparison);
      answer = await streamLocal(res, localAnswer);
    }
  } catch (error) {
    console.error('[chat] stream failure:', error);
    sse(res, 'error', { message: '生成回答时出了点问题，请重试。' });
    res.end();
    return;
  }

  if (!answer.trim()) {
    answer = writeFallbackAnswer(comparison);
    sse(res, 'delta', { text: answer });
  }

  const assistantMessageId = addMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: answer,
    metadata: {
      comparison,
      usedLlm,
      intent: understanding?.intent,
      recognition: understanding?.recognition ?? undefined,
    },
  });

  sse(res, 'done', { messageId: assistantMessageId, conversationId: conversation.id });
  res.end();
});
