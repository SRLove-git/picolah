export type Relationship = 'none' | 'requested' | 'incoming' | 'friend';

export interface SharedPreference {
  zh: string;
  en: string;
}

export interface RadarSelf {
  hasData: boolean;
  personaZh: string;
  personaEn: string;
  taglineZh: string;
  taglineEn: string;
  categories: SharedPreference[];
  brands: SharedPreference[];
  platforms: SharedPreference[];
  budget: { min: number; max: number; median: number; currency: string } | null;
  comparisons: number;
  clicks: number;
}

export interface RadarCandidate {
  id: string;
  displayName: string;
  avatar: string;
  similarity: number;
  shared: SharedPreference[];
  relationship: Relationship;
}

export interface FriendRequestView {
  id: string;
  userId: string;
  displayName: string;
  avatar: string;
  createdAt: string;
}

export interface FriendView {
  id: string;
  displayName: string;
  avatar: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface SocialMessage {
  id: string;
  fromUser: string;
  toUser: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface RadarData {
  self: RadarSelf;
  candidates: RadarCandidate[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  friends: FriendView[];
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message || body.error || `请求失败（${response.status}）`;
  } catch {
    return `请求失败（${response.status}）`;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as T;
}

export async function getRadar(): Promise<RadarData> {
  return request<RadarData>('/api/social/radar');
}

export async function sendFriendRequest(toUserId: string): Promise<{ status: 'pending' | 'accepted' }> {
  return request<{ status: 'pending' | 'accepted' }>('/api/social/requests', {
    method: 'POST',
    body: JSON.stringify({ toUserId }),
  });
}

export async function respondFriendRequest(
  requestId: string,
  accept: boolean,
): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/social/requests/${encodeURIComponent(requestId)}/${accept ? 'accept' : 'decline'}`,
    { method: 'POST' },
  );
}

export async function getMessages(userId: string, after = ''): Promise<SocialMessage[]> {
  const query = after ? `?after=${encodeURIComponent(after)}` : '';
  const data = await request<{ messages: SocialMessage[] }>(
    `/api/social/messages/${encodeURIComponent(userId)}${query}`,
  );
  return data.messages;
}

export async function postMessage(toUserId: string, body: string): Promise<SocialMessage> {
  const data = await request<{ message: SocialMessage }>('/api/social/messages', {
    method: 'POST',
    body: JSON.stringify({ toUserId, body }),
  });
  return data.message;
}
