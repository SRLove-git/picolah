import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { ChatMessage, Comparison } from '../../shared/types.ts';
import { COUNTRY_CODES, MARKETS } from '../../shared/types.ts';
import { detectMarket, resolvePlatformDirective } from '../../shared/query.ts';
import { config, crawlerToolConfigured, llmConfigured } from '../config.ts';
import { addMessage, createConversation, getConversation } from '../repo.ts';
import { writeFallbackAnswer } from '../copy.ts';
import { liveSearchCoverageNote } from '../../shared/copy.ts';
import { streamLlmAnswer } from '../llm.ts';
import { recordComparisonEvent, requestUserId } from '../profile.ts';
import { supportedRealCrawlerPlatforms } from '../agent/tools/real-crawler.ts';
import { ModelSearchError, modelSearchTool, type LiveSearchInput } from '../agent/tools/model-search.ts';
import { liveSearchQuery, visualSearchQuery } from '../agent/live-query.ts';
import { emptyLiveComparison, liveComparison } from '../agent/live-comparison.ts';

export const chatRouter = Router();
const chatSchema = z.object({
  message: z.string().trim().max(1200).default(''),
  conversationId: z.string().trim().min(1).max(100).optional().nullable(),
  market: z.enum(COUNTRY_CODES).default('SG'),
  image: z.string().trim().max(4_500_000).optional().nullable(),
}).refine((data) => data.message.length > 0 || Boolean(data.image), { message: '请输入想比价的商品' });

function validateImage(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(value)) throw new Error('图片格式不支持，请上传 JPG、PNG 或 WebP 图片。');
  if (Buffer.byteLength(value.slice(value.indexOf(',') + 1), 'base64') > 3 * 1024 * 1024) {
    throw new Error('图片过大，请压缩到 3MB 以内再上传。');
  }
  return value;
}
function previousComparison(messages: ChatMessage[]): Comparison | null {
  return [...messages].reverse().find((message) => message.role === 'assistant' && message.comparison)?.comparison ?? null;
}
function sse(res: import('express').Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
async function streamLocal(res: import('express').Response, text: string): Promise<string> {
  for (const chunk of text.match(/.{1,10}/gs) || [text]) {
    if (res.destroyed) break;
    sse(res, 'delta', { text: chunk });
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return text;
}

chatRouter.post('/', async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_REQUEST', message: '请输入想比价的商品' });
  const { message: rawMessage, conversationId, market: selectedMarket } = parsed.data;
  let image: string | undefined;
  try { image = validateImage(parsed.data.image); }
  catch (error) { return res.status(400).json({ error: 'INVALID_IMAGE', message: error instanceof Error ? error.message : '图片无法读取' }); }

  const message = rawMessage || '帮我看看这张图里的商品';
  const market = detectMarket(message, selectedMarket);
  const stored = conversationId ? await getConversation(conversationId) : null;
  if (conversationId && !stored) return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: '对话不存在' });
  const priorMessages: ChatMessage[] = stored?.messages ?? [];
  const previous = previousComparison(priorMessages);
  const conversation = stored ?? await createConversation(`${message.slice(0, 34)} · ${MARKETS[market].nameZh}`, market);
  const directive = resolvePlatformDirective(message, market,
    previous?.search?.scope === 'web' ? [] : previous?.platformFilter ?? []);
  const platformRestriction = directive.mode === 'include' ||
    (directive.mode === 'none' && directive.platformIds.length > 0);
  const scope = platformRestriction ? 'platforms' : config.crawlerTool.searchScope;
  const exclusionIds = ['lazada', 'shopee', 'amazon-sg', 'tiktok', 'tokopedia', 'tiki'] as const;
  const exclusions = directive.mode === 'exclude'
    ? [...new Set([...(previous?.search?.excludedPlatforms ?? []), ...directive.mentioned])]
    : directive.mode === 'none' && !platformRestriction ? previous?.search?.excludedPlatforms ?? [] : [];
  const excludedPlatforms = exclusions.filter((id): id is typeof exclusionIds[number] =>
    exclusionIds.includes(id as typeof exclusionIds[number]));
  const platforms = platformRestriction
    ? supportedRealCrawlerPlatforms(MARKETS[market].platformIds, directive.platformIds, [])
    : scope === 'platforms'
      ? supportedRealCrawlerPlatforms(MARKETS[market].platformIds, [], ['shopee', 'lazada', 'amazon-sg'])
        .filter((platform) => !excludedPlatforms.includes(platform)) : [];
  // An unsupported exclusion (e.g. "not official stores") must not silently be ignored.
  const unsupported = [...new Set([...directive.unsupported,
    ...(platformRestriction ? directive.platformIds.filter((id) => !platforms.includes(id as typeof platforms[number])) : []),
    ...exclusions.filter((id) => !excludedPlatforms.includes(id as typeof exclusionIds[number]))])];
  const userMessageId = randomUUID();
  await addMessage({ id: userMessageId, conversationId: conversation.id, role: 'user', content: message, metadata: image ? { image } : undefined });

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  sse(res, 'meta', { conversationId: conversation.id, title: conversation.title, market, userMessageId });
  sse(res, 'status', { label: image ? '正在识别图片里的商品…' : '正在搜索商品信息' });

  let target = liveSearchQuery(rawMessage, previous);
  if (image) {
    const recognized = await visualSearchQuery(image, rawMessage);
    if (recognized) target = liveSearchQuery(recognized, null);
  }
  let comparison = emptyLiveComparison(message, market, target?.query || '', platforms, unsupported);
  comparison.search!.scope = scope;
  if (excludedPlatforms.length) comparison.search!.excludedPlatforms = excludedPlatforms;
  comparison.search!.model = target?.model || target?.query || '';
  if (target?.maxPrice !== undefined) comparison.search!.maxPrice = target.maxPrice;
  // Conversation history supplies only the previous query/filter, never cached prices.
  comparison.platformFilter = platformRestriction ? directive.platformIds : undefined;
  let clarification: string | undefined;
  if (!target) {
    clarification = image
      ? '暂时无法确定图片里的具体商品，请补充品牌、型号或商品名称，我会直接搜索实时商品信息。'
      : '请告诉我商品名称或具体型号，我会直接搜索实时商品信息。';
  } else if (crawlerToolConfigured && (scope === 'web' || platforms.length) && !unsupported.length) {
    sse(res, 'status', { label: '正在搜索商品信息' });
    try {
      const input: LiveSearchInput = { market, scope, platforms, ...target,
        ...(scope === 'web' && excludedPlatforms.length ? { excludedPlatforms } : {}) };
      const result = await modelSearchTool.invoke(input);
      comparison = liveComparison(message, input, result);
      comparison.platformFilter = platformRestriction ? directive.platformIds : undefined;
      if (excludedPlatforms.length) comparison.search!.excludedPlatforms = excludedPlatforms;
    } catch (error) {
      console.warn('[chat] live product search failed:', error instanceof Error ? error.message : 'unknown error');
      comparison.search!.status = 'failed';
      if (error instanceof ModelSearchError) comparison.search!.errorCode = error.code;
    }
  }

  const profileUserId = requestUserId(req);
  if (profileUserId) {
    try { await recordComparisonEvent(profileUserId, comparison, conversation.id); }
    catch { console.warn('[profile] failed to record live comparison'); }
  }
  sse(res, 'results', comparison);
  sse(res, 'status', { label: '正在整理搜索结果…' });
  let answer = '';
  let usedLlm = false;
  // Error and empty results are deterministic: an LLM cannot invent a successful search.
  if (llmConfigured && comparison.search?.status === 'matched') {
    try {
      for await (const delta of streamLlmAnswer(comparison, message)) {
        usedLlm = true;
        answer += delta;
        sse(res, 'delta', { text: delta });
      }
    } catch {
      if (answer.trim()) {
        const note = '\n\n（回答连接中断，可以重试。）';
        answer += note;
        sse(res, 'delta', { text: note });
      }
    }
  }
  if (!answer.trim()) answer = await streamLocal(res, clarification || writeFallbackAnswer(comparison));
  else if (usedLlm) {
    const notice = liveSearchCoverageNote(comparison);
    if (notice) { answer += notice; sse(res, 'delta', { text: notice }); }
  }
  const assistantMessageId = await addMessage({
    conversationId: conversation.id, role: 'assistant', content: answer,
    metadata: { comparison, usedLlm, source: 'live-tools' },
  });
  sse(res, 'done', { messageId: assistantMessageId, conversationId: conversation.id });
  res.end();
});
