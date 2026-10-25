import type {
  AppConfig,
  ChatStreamMeta,
  Comparison,
  ConversationDetail,
  ConversationSummary,
  OfferClickEvent,
  ProductVisual,
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

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

export interface SessionState {
  user: SessionUser | null;
  required: boolean;
}

export async function getSession(): Promise<SessionState> {
  return getJson<SessionState>('/api/auth/me');
}

export async function login(email: string, password: string): Promise<SessionState> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as SessionState;
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<SessionState> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify({ email, password, displayName }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as SessionState;
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: userHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response));
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

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  visual: ProductVisual;
  specs: string;
}

export interface CatalogResponse {
  products: CatalogProduct[];
  categories: string[];
  total: number;
}

export async function searchCatalog(query = '', category = ''): Promise<CatalogResponse> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (category) params.set('category', category);
  const suffix = params.toString() ? `?${params}` : '';
  return getJson<CatalogResponse>(`/api/catalog${suffix}`);
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

export async function getWatchlist(market?: string): Promise<{ items: import('../../shared/types').WatchlistItem[]; unread: number }> {
  if (isMockMode()) return { items: [], unread: 0 };
  return getJson(`/api/watchlist${market ? `?market=${encodeURIComponent(market)}` : ''}`);
}

export async function addWatchlist(
  productId: string,
  market: string,
  targetPrice?: number,
): Promise<import('../../shared/types').WatchlistItem> {
  const response = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify({ productId, market, targetPrice: targetPrice ?? null }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const data = (await response.json()) as { item: import('../../shared/types').WatchlistItem };
  return data.item;
}

export async function removeWatchlist(id: string): Promise<void> {
  const response = await fetch(`/api/watchlist/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: userHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response));
}

export async function getAlerts(): Promise<{ alerts: import('../../shared/types').PriceAlert[]; unread: number }> {
  if (isMockMode()) return { alerts: [], unread: 0 };
  return getJson('/api/alerts');
}

export async function markAlertRead(id: string): Promise<void> {
  await fetch(`/api/alerts/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    headers: userHeaders(),
  });
}

export async function markAllAlertsRead(): Promise<void> {
  await fetch('/api/alerts/read-all', { method: 'POST', headers: userHeaders() });
}

export function outboundUrl(offer: { id: string; url: string; source?: 'live' }): string {
  if (offer.source === 'live') {
    // Live listings have not been registered in the local offers table.
    try {
      const url = new URL(offer.url);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch {
      return '';
    }
  }
  return isMockMode() ? offer.url : `/go/${encodeURIComponent(offer.id)}`;
}

export async function deleteAccount(password: string): Promise<void> {
  const response = await fetch('/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error(await parseError(response));
}
