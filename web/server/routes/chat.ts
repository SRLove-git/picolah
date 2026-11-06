import { randomUUID } from 'node:crypto';
import { startSseHeartbeat } from '../sse-heartbeat.ts';
import { Router } from 'express';
import { z } from 'zod';
import type { ChatMessage, Comparison } from '../../shared/types.ts';
import { COUNTRY_CODES, MARKETS } from '../../shared/types.ts';
import { detectMarket, resolvePlatformDirective } from '../../shared/query.ts';
import { config, crawlerToolConfigured, llmConfigured } from '../config.ts';
import { addAssistantReply, addMessage, createConversation, getConversation } from '../repo.ts';
import { writeFallbackAnswer } from '../copy.ts';
import { liveSearchCoverageNote } from '../../shared/copy.ts';
import { streamChatAnswer, streamLlmAnswer } from '../llm.ts';
import { recordConversationComparison, requestUserId } from '../profile.ts';
import { supportedRealCrawlerPlatforms } from '../agent/tools/real-crawler.ts';
import { ModelSearchError, modelSearchTool, type LiveSearchInput } from '../agent/tools/model-search.ts';
import { liveSearchQuery, visualSearchQuery } from '../agent/live-query.ts';
import { emptyLiveComparison, liveComparison } from '../agent/live-comparison.ts';
import { catalogAnswer, catalogQuotes, searchCatalog } from '../agent/catalog-search.ts';
import { streamCatalogAnswer } from '../agent/catalog-answer.ts';

import { webSearchReady, webSearchTools } from '../agent/web-search.ts';
import { conversationTools, fallbackConversationAnswer } from '../agent/conversation-turn.ts';

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
  const profileUserId = requestUserId(req);
  if (!profileUserId) return res.status(400).json({ error: 'INVALID_USER_ID', message: '无法识别当前访客，请刷新页面后重试。' });
  const stored = conversationId ? await getConversation(conversationId, profileUserId) : null;
  if (conversationId && !stored) return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: '对话不存在' });
  const priorMessages: ChatMessage[] = stored?.messages ?? [];
  // A web answer can change the subject. Never attach a later ambiguous price
  // request to a product from before that answer.
  let previousTopicIndex = -1;
  for (let index = priorMessages.length - 1; index >= 0; index--) {
    const entry = priorMessages[index];
    if (entry.role === 'assistant' && !entry.comparison && !entry.continuesProductContext) {
      previousTopicIndex = index;
      break;
    }
  }
  const comparisonMessages = priorMessages.slice(previousTopicIndex + 1);
  const previous = previousComparison(comparisonMessages);
  const directive = resolvePlatformDirective(message, market,
    previous?.search?.scope === 'web' ? [] : previous?.platformFilter ?? []);
  const platformRestriction = directive.mode === 'include' ||
    (directive.mode === 'none' && directive.platformIds.length > 0);
  const scope = platformRestriction ? 'platforms' : config.crawlerTool.searchScope;
  const conversation = stored ?? await createConversation(`${message.slice(0, 34)} · ${MARKETS[market].nameZh}`, market, profileUserId);
  const exclusionIds = ['lazada', 'shopee', 'amazon-sg', 'tiktok', 'tokopedia', 'tiki'] as const;
  const exclusions = directive.mode === 'exclude'
    ? [...new Set([...(previous?.search?.excludedPlatforms ?? []), ...directive.mentioned])]
    : directive.mode === 'none' && !platformRestriction ? previous?.search?.excludedPlatforms ?? [] : [];
  const excludedPlatforms = exclusions.filter((id): id is typeof exclusionIds[number] =>
    exclusionIds.includes(id as typeof exclusionIds[number]));
  const platforms = platformRestriction
    ? supportedRealCrawlerPlatforms(MARKETS[market].platformIds, directive.platformIds, [])
    : scope === 'platforms'
      ? supportedRealCrawlerPlatforms(MARKETS[market].platformIds, [], ['lazada', 'amazon-sg'])
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
  startSseHeartbeat(res);
  sse(res, 'meta', { conversationId: conversation.id, title: conversation.title, market, userMessageId });
  const conversationContext = { market, previous, history: priorMessages };
  if (!image) sse(res, 'status', { label: '正在理解问题…' });
  const turn = image ? null : await conversationTools.plan(message, conversationContext);
  if (res.destroyed) return;
  if (turn?.action === 'reply' || (turn?.action === 'web_search' && !webSearchReady())) {
    sse(res, 'status', { label: '正在回复…' });
    let answer = '';
    let usedLlm = false;
    if (llmConfigured) {
      try {
        for await (const delta of streamChatAnswer(message, conversationContext)) {
          if (res.destroyed) return;
          answer += delta;
          usedLlm = true;
          sse(res, 'delta', { text: delta });
        }
      } catch {
        if (answer) { const note = '\n\n（回答连接中断，请重试。）'; answer += note; sse(res, 'delta', { text: note }); }
      }
    }
    if (!answer) answer = await streamLocal(res, fallbackConversationAnswer(message, conversationContext));
    const assistantMessageId = await addAssistantReply(conversation.id, answer,
      { usedLlm, source: 'conversation', continuesProductContext: turn.continuesProductContext });
    if (!assistantMessageId) {
      sse(res, 'error', { message: '对话已删除，请开始新的对话。' });
      return res.end();
    }
    sse(res, 'done', { messageId: assistantMessageId, conversationId: conversation.id });
    return res.end();
  }
  if (turn?.action === 'web_search' && webSearchReady()) {
    const query = turn.query;
    if (query) {
      sse(res, 'status', { label: '正在联网搜索…' });
      let answer: string;
      let evidence;
      let usedLlm = false;
      try {
        evidence = await webSearchTools.search(query);
        if (res.destroyed) return;
        sse(res, 'status', { label: '正在核对搜索来源…' });
        answer = await webSearchTools.answer(message, evidence);
        usedLlm = evidence.sources.length > 0;
      } catch {
        answer = '这次联网搜索或回答服务暂时连接失败，未能完成核实，请稍后重试。';
      }
      if (res.destroyed) return;
      const assistantMessageId = await addAssistantReply(conversation.id, answer,
        { usedLlm, source: 'web-search', webSearch: evidence });
      if (!assistantMessageId) {
        sse(res, 'error', { message: '对话已删除，请开始新的对话。' });
        return res.end();
      }
      await streamLocal(res, answer);
      sse(res, 'done', { messageId: assistantMessageId, conversationId: conversation.id });
      return res.end();
    }
  }
  sse(res, 'status', { label: image ? '正在识别图片里的商品…' : '正在搜索商品信息' });

  const catalogMode = config.productSearchSource === 'catalog' && config.chatPriceSearchSource !== 'web';
  // Reconstruct query constraints, never historical prices, across catalog turns.
  let context = previous;
  if (catalogMode) {
    let queryContext: Comparison | null = null;
    for (const entry of comparisonMessages) {
      if (entry.role !== 'assistant' || !entry.comparison) continue;
      const saved = entry.comparison;
      const queryTarget = liveSearchQuery(saved.query, queryContext, 'catalog');
      queryContext = queryTarget
        ? { ...saved, search: { ...queryTarget, model: queryTarget.model || queryTarget.query, platforms: [], status: 'matched' } }
        : saved;
    }
    context = queryContext ?? previous;
  }
  const queryMode = catalogMode ? 'catalog' : 'live';
  const rawTarget = liveSearchQuery(rawMessage, context, queryMode);
  let target = turn?.action === 'product_search' && turn.query
    ? liveSearchQuery(turn.query, context, queryMode) : rawTarget;
  // Intent inference resolves conversational references, but must not erase a
  // parsed budget or the active budget on an otherwise identical product.
  if (target && rawTarget?.maxPrice !== undefined) target.maxPrice = rawTarget.maxPrice;
  const previousTarget = context?.search?.query ? liveSearchQuery(context.search.query, null, queryMode) : null;
  if (target && target.maxPrice === undefined && context?.search?.maxPrice !== undefined && previousTarget
    && target.query.replace(/\s+/g, '').toLowerCase() === previousTarget.query.replace(/\s+/g, '').toLowerCase()) {
    target.maxPrice = context.search.maxPrice;
  }
  if (image) {
    const recognized = await visualSearchQuery(image, rawMessage);
    if (recognized) target = liveSearchQuery(recognized, null, queryMode);
  }
  let comparison = emptyLiveComparison(message, market, target?.query || '', platforms, unsupported);
  comparison.search!.scope = scope;
  if (excludedPlatforms.length) comparison.search!.excludedPlatforms = excludedPlatforms;
  comparison.search!.model = target?.model || target?.query || '';
  if (target?.maxPrice !== undefined) comparison.search!.maxPrice = target.maxPrice;
  // Conversation history supplies only the previous query/filter, never cached prices.
  comparison.platformFilter = platformRestriction ? directive.platformIds : undefined;
  let clarification: string | undefined;
  if (catalogMode) {
    sse(res, 'status', { label: '正在查找商品报价…' });
    comparison = await searchCatalog({ message, market, target, previous });
    clarification = catalogAnswer(comparison, target);
  } else if (!target) {
    clarification = image
      ? '暂时无法确定图片里的具体商品，请补充品牌、型号或商品名称，我会直接搜索实时商品信息。'
      : '请告诉我商品名称或具体型号，我会直接搜索实时商品信息。';
  } else if (crawlerToolConfigured && (scope === 'web' || platforms.length) && !unsupported.length) {
    sse(res, 'status', { label: '正在搜索商品并核对商品页价格…' });
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

  try {
    if (!(await recordConversationComparison(conversation.id, comparison))) {
      sse(res, 'error', { message: '对话已删除，请开始新的比价。' });
      return res.end();
    }
  } catch {
    console.warn('[profile] failed to record live comparison');
  }
  sse(res, 'results', comparison);
  sse(res, 'status', { label: '正在整理搜索结果…' });
  let answer = '';
  let usedLlm = false;
  const priceRows = [...comparison.offers, ...comparison.alternatives.flatMap(row => row.offer ? [row.offer] : [])];
  if (priceRows.some(row => row.priceQuote && (row.priceQuote.kind !== 'exact' || row.priceQuote.availability !== 'in-stock' || row.priceQuote.note || row.priceQuote.condition))) {
    const notice = '部分结果包含起价、区间价、库存未明确或缺货标价，请按各项标注确认规格、库存和价格条件。\n\n';
    answer += notice; sse(res, 'delta', { text: notice });
  }
  const cacheInfo = comparison.search?.cache;
  if (cacheInfo?.hit) {
    const checked = new Date(cacheInfo.checkedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const notice = `本次使用近期缓存报价（核验时间：${checked}，北京时间），下单前请在商品页确认。\n\n`;
    answer += notice;
    sse(res, 'delta', { text: notice });
  }
  // The LLM writes every reply, but its guard-railed payload only ever sees the real
  // search outcome, so a failed or empty search is described instead of invented.
  // Platform/market conflicts stay deterministic, and an unrecognised image keeps the
  // explicit "补充型号" clarification.
  const chatOnly = !target && !image;
  const canAnswer = !comparison.unsupportedPlatforms?.length && (Boolean(target) || chatOnly);
  if (llmConfigured && canAnswer && (!catalogMode || catalogQuotes(comparison).length > 0)) {
    try {
      const stream = catalogMode ? streamCatalogAnswer(comparison, message)
        : target ? streamLlmAnswer(comparison, message) : streamChatAnswer(message);
      for await (const delta of stream) {
        usedLlm = true;
        answer += delta;
        sse(res, 'delta', { text: delta });
      }
    } catch {
      if (usedLlm && answer.trim()) {
        const note = '\n\n（回答连接中断，可以重试。）';
        answer += note;
        sse(res, 'delta', { text: note });
      }
    }
  }
  if (!usedLlm) answer += await streamLocal(res, clarification || writeFallbackAnswer(comparison));
  else if (usedLlm) {
    const notice = liveSearchCoverageNote(comparison);
    if (notice) { answer += notice; sse(res, 'delta', { text: notice }); }
  }
  const assistantMessageId = await addAssistantReply(conversation.id, answer, { comparison, usedLlm, source: catalogMode ? 'catalog' : 'live-tools' });
  if (!assistantMessageId) {
    sse(res, 'error', { message: '对话已删除，请开始新的比价。' });
    return res.end();
  }
  sse(res, 'done', { messageId: assistantMessageId, conversationId: conversation.id });
  res.end();
});
