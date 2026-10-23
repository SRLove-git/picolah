import type {
  AppConfig,
  ChatMessage,
  Comparison,
  ConversationDetail,
  ConversationSummary,
  CountryCode,
  GatewayStats,
  IngestRun,
} from '../../shared/types';
import { COUNTRY_LIST } from '../../shared/types';
import { catalogProducts, generateOffers } from '../../shared/catalog';
import { parseQuery } from '../../shared/query';
import { buildCatalogComparison } from '../../shared/comparison';
import { writeFallbackAnswer } from '../../shared/copy';
import { DEMO_CONVERSATIONS } from '../../shared/demo-conversations';
import type { StreamChatInput, StreamHandlers } from './api';

/**
 * Offline mock backend.
 *
 * Enabled by `?mock=1` or `VITE_MOCK=1`. It implements the same functions as
 * lib/api.ts on top of the shared demo catalog, so the whole workspace —
 * history, comparisons, streaming answers, gateway panel — runs with no API
 * process at all. Everything is in-memory and resets on reload.
 */

const products = catalogProducts();
const offers = generateOffers();
const conversations = new Map<string, ConversationDetail>();
let seeded = false;

function uid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) return cryptoApi.randomUUID();
  return `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildComparison(query: string, market: CountryCode, productId: string | null): Comparison {
  const product = productId ? products.find((item) => item.id === productId) || null : null;
  return buildCatalogComparison({ query, market, product, products, offers });
}

function seedConversations(): void {
  if (seeded) return;
  seeded = true;
  for (const demo of DEMO_CONVERSATIONS) {
    const parsed = parseQuery(demo.message, demo.market, products);
    const comparison = buildComparison(demo.message, parsed.market, parsed.product?.id || null);
    const answer = writeFallbackAnswer(comparison);
    const createdAt = new Date(Date.now() - demo.hoursAgo * 60 * 60 * 1000).toISOString();
    const messages: ChatMessage[] = [
      {
        id: uid(),
        role: 'user',
        content: demo.message,
        createdAt,
      },
      {
        id: uid(),
        role: 'assistant',
        content: answer,
        createdAt: new Date(Date.parse(createdAt) + 20_000).toISOString(),
        comparison,
      },
    ];
    conversations.set(demo.id, {
      id: demo.id,
      title: parsed.title,
      market: parsed.market,
      preview: answer.slice(0, 120),
      createdAt,
      updatedAt: messages[1].createdAt,
      messages,
    });
  }
}

function summaries(): ConversationSummary[] {
  seedConversations();
  return [...conversations.values()]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map(({ id, title, market, preview, createdAt, updatedAt }) => ({
      id,
      title,
      market,
      preview,
      createdAt,
      updatedAt,
    }));
}

function buildRuns(): IngestRun[] {
  const now = Date.now();
  const sources = ['mock-crawler-sg', 'mock-crawler-th', 'mock-crawler-my', 'mock-crawler-id', 'mock-crawler-vn'];
  return sources.map((source, index) => ({
    id: `mock-run-${index}`,
    source,
    country: (['SG', 'TH', 'MY', 'ID', 'VN'] as CountryCode[])[index],
    received: 8,
    upserted: 8,
    status: 'ok',
    message: '接收 8 条，新增 0 条，更新 8 条',
    createdAt: new Date(now - (index * 9 + 3) * 60 * 1000).toISOString(),
  }));
}

function buildGateway(): GatewayStats {
  const inStock = offers.filter((offer) => offer.inStock);
  const runs = buildRuns();
  return {
    offers: inStock.length,
    products: products.length,
    markets: COUNTRY_LIST.length,
    todayOffers: inStock.length,
    lastRun: runs[0] || null,
    runs,
    endpoint: '/api/v1/ingest/offers',
    ingestConfigured: true,
  };
}

export async function mockGetConfig(): Promise<AppConfig> {
  return {
    llmConfigured: true,
    llmProvider: 'Picolah 演示',
    llmModel: '离线数据',
    markets: COUNTRY_LIST,
    gateway: buildGateway(),
  };
}

export async function mockGetConversations(): Promise<ConversationSummary[]> {
  return summaries();
}

export async function mockGetConversation(id: string): Promise<ConversationDetail> {
  seedConversations();
  const conversation = conversations.get(id);
  if (!conversation) throw new Error('对话不存在');
  return { ...conversation, messages: [...conversation.messages] };
}

export async function mockRemoveConversation(id: string): Promise<void> {
  seedConversations();
  conversations.delete(id);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function mockStreamChat(
  input: StreamChatInput,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  seedConversations();
  const message = input.message.trim();
  const parsed = parseQuery(message, input.market as CountryCode, products);

  let conversation = input.conversationId ? conversations.get(input.conversationId) : undefined;
  const userMessageId = uid();

  if (!conversation) {
    const id = input.conversationId || uid();
    const now = new Date().toISOString();
    conversation = {
      id,
      title: parsed.title,
      market: parsed.market,
      preview: '',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    conversations.set(id, conversation);
  }

  conversation.messages.push({
    id: userMessageId,
    role: 'user',
    content: message || '帮我看看这张图里的商品，推荐一下',
    createdAt: new Date().toISOString(),
    image: input.image,
  });
  conversation.market = parsed.market;
  conversation.updatedAt = new Date().toISOString();

  handlers.onMeta({
    conversationId: conversation.id,
    title: conversation.title,
    market: parsed.market,
    userMessageId,
  });

  await delay(220, signal);
  handlers.onStatus(input.image ? '正在识别图片里的商品…' : '正在理解你的需求…');

  await delay(380, signal);
  handlers.onStatus('正在核对价格库…');

  await delay(320, signal);
  const comparison = buildComparison(message, parsed.market, parsed.product?.id || null);
  handlers.onResults(comparison);

  const answer = writeFallbackAnswer(comparison);
  const imageNote = input.image
    ? '\n\n（离线 mock 模式不会真的调用视觉模型：这里按文字匹配到的最接近商品给出比价，图片仅作占位。）'
    : '';
  const text = answer + imageNote;

  const sizes = [4, 7, 5, 9, 6, 8];
  let cursor = 0;
  let index = 0;
  while (cursor < text.length) {
    const size = sizes[index % sizes.length];
    handlers.onDelta(text.slice(cursor, cursor + size));
    cursor += size;
    index += 1;
    await delay(14, signal);
  }

  const assistantId = uid();
  conversation.messages.push({
    id: assistantId,
    role: 'assistant',
    content: text,
    createdAt: new Date().toISOString(),
    comparison,
  });
  conversation.preview = text.slice(0, 120);
  conversation.updatedAt = new Date().toISOString();

  handlers.onDone({ messageId: assistantId, conversationId: conversation.id });
}
