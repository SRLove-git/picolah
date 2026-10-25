import type {
  AppConfig,
  ChatStreamMeta,
  Comparison,
  ConversationDetail,
  ConversationSummary,
  OfferClickEvent,
  ShoppingProfile,
} from '../../shared/types';
import { userHeaders } from './user';

/**
 * Offline demo mode: `?mock=1` (or a VITE_MOCK=1 build) serves the whole
 * workspace from shared/catalog.ts with no API process running.
 */
export function isMockMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (String(import.meta.env.VITE_MOCK) === '1') return true;
  try {
    return new URLSearchParams(window.location.search).get('mock') === '1';
  } catch {
    return false;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message || body.error || `请求失败（${response.status}）`;
  } catch {
    return `请求失败（${response.status}）`;
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json', ...userHeaders() },
  });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as T;
}

export async function getConfig(): Promise<AppConfig> {
  if (isMockMode()) return (await import('./mock-backend')).mockGetConfig();
  return getJson<AppConfig>('/api/config');
}

export async function getConversations(): Promise<ConversationSummary[]> {
  if (isMockMode()) return (await import('./mock-backend')).mockGetConversations();
  const data = await getJson<{ conversations: ConversationSummary[] }>('/api/conversations');
  return data.conversations;
}

export async function getConversation(id: string, signal?: AbortSignal): Promise<ConversationDetail> {
  if (isMockMode()) return (await import('./mock-backend')).mockGetConversation(id);
  const data = await getJson<{ conversation: ConversationDetail }>(
    `/api/conversations/${encodeURIComponent(id)}`,
    signal,
  );
  return data.conversation;
}

export async function removeConversation(id: string): Promise<void> {
  if (isMockMode()) return (await import('./mock-backend')).mockRemoveConversation(id);
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: userHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response));
}

export async function getProfile(): Promise<ShoppingProfile | null> {
  if (isMockMode()) return null;
  const data = await getJson<{ profile: ShoppingProfile }>('/api/profile');
  return data.profile;
}

export async function resetProfile(): Promise<void> {
  if (isMockMode()) return;
  const response = await fetch('/api/profile', {
    method: 'DELETE',
    headers: userHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response));
}

/**
 * Fire-and-forget. A failed analytics request must never block the outbound
 * store link the user just clicked.
 */
export async function recordOfferClick(event: OfferClickEvent): Promise<void> {
  if (isMockMode()) return;
  try {
    await fetch('/api/profile/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...userHeaders() },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Best effort only.
  }
}

export interface StreamHandlers {
  onMeta: (meta: ChatStreamMeta) => void;
  onStatus: (label: string) => void;
  onResults: (comparison: Comparison) => void;
  onDelta: (text: string) => void;
  onDone: (payload: { messageId: string; conversationId: string }) => void;
  onServerError: (message: string) => void;
}

export interface StreamChatInput {
  message: string;
  market: string;
  conversationId?: string | null;
  image?: string;
}

interface SseEvent {
  event: string;
  data: unknown;
}

function parseBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  const raw = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return null;
  }
}

export async function streamChat(
  input: StreamChatInput,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  if (isMockMode()) {
    return (await import('./mock-backend')).mockStreamChat(input, handlers, signal);
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) throw new Error(await parseError(response));
  if (!response.body) throw new Error('浏览器无法读取流式响应');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        const parsed = parseBlock(block);
        if (!parsed) continue;
        const payload = parsed.data as any;
        if (parsed.event === 'meta') handlers.onMeta(payload as ChatStreamMeta);
        else if (parsed.event === 'status') handlers.onStatus(String(payload.label || ''));
        else if (parsed.event === 'results') handlers.onResults(payload as Comparison);
        else if (parsed.event === 'delta') handlers.onDelta(String(payload.text || ''));
        else if (parsed.event === 'done') handlers.onDone(payload);
        else if (parsed.event === 'error') handlers.onServerError(String(payload.message || '生成失败'));
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
