import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Comparison, CountryCode, Product } from '../../shared/types.ts';
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
import { parseQuery } from '../query.ts';
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
  localProduct: Product | null,
  message: string,
  market: CountryCode,
): Comparison {
  const matchedProduct =
    understanding?.intent === 'compare' && understanding.matchedProductId
      ? getProduct(understanding.matchedProductId)
      : null;

  if (matchedProduct) {
    return buildComparison({ query: message, market, product: matchedProduct, kind: 'comparison' });
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
      return buildRecommendationComparison({ query: message, market, productIds });
    }
  }

  if (understanding?.intent === 'smalltalk' || understanding?.intent === 'offtopic') {
    return buildComparison({ query: message, market, product: null });
  }

  if (localProduct) {
    return buildComparison({ query: message, market, product: localProduct, kind: 'comparison' });
  }

  return buildComparison({ query: message, market, product: null });
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
  if (!conversation) {
    conversation = createConversation(title, query.market);
  }

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
      localProduct: query.product,
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

  const comparison = resolveComparison(understanding, query.product, message, query.market);
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
