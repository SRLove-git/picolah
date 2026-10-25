import { config } from '../config.ts';
import type { MarketCode } from '../markets.ts';
import { safeWebUrl } from '../safe-web-url.ts';
import { BrightDataError } from './web-unlocker.ts';

export interface WebSearchCandidate {
  url: string;
  title: string;
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 45_000;
const MAX_ORGANIC_RESULTS = 30;
const MAX_CANDIDATES = 12;
const MAX_PER_HOST = 2;
const NON_PRODUCT_PATH = /\/(?:support|help|community|forums?|blogs?|news|press|reviews?|watch|videos?|privacy|terms|login|signin|cart|checkout)(?:\/|$)/i;
const TRACKING_PARAMETER = /^(?:utm_.+|gclid|dclid|fbclid|msclkid|srsltid|spm|scm|aff_.+|affiliate_id)$/i;

function serpError(code: string, message: string, status?: number): BrightDataError {
  return new BrightDataError(message, { code, status });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Request structured organic results, scoped to the selected market rather than one shop. */
export function buildWebSearchUrl(query: string, market: MarketCode): string {
  const cleaned = query.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 300 || !['SG', 'MY', 'TH', 'ID', 'PH', 'VN'].includes(market)) {
    throw serpError('SERP_INVALID_QUERY', '全网搜索参数无效');
  }
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', cleaned);
  url.searchParams.set('gl', market.toLowerCase());
  url.searchParams.set('hl', 'en');
  url.searchParams.set('brd_json', '1');
  return url.href;
}

function excludedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  if (/^(?:[^.]+\.)*(?:google\.[a-z.]+|bing\.com|youtube\.com|youtu\.be|facebook\.com|instagram\.com|reddit\.com|pinterest\.[a-z.]+|x\.com|twitter\.com)$/.test(host)) return true;
  return /(?:^|\.)tiktok\.com$/.test(host) && host !== 'shop.tiktok.com';
}

function normalizedCandidate(value: unknown): WebSearchCandidate | null {
  if (!record(value) || typeof value.link !== 'string' || typeof value.title !== 'string') return null;
  const title = value.title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title || title.length > 1000 || value.link.length > 4096) return null;
  const url = safeWebUrl(value.link);
  if (!url || excludedHost(url.hostname) || NON_PRODUCT_PATH.test(url.pathname)) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  url.searchParams.sort();
  return { url: url.href, title };
}

function parsedBody(body: unknown): Record<string, unknown> {
  let value = body;
  for (let depth = 0; depth < 4; depth++) {
    if (typeof value === 'string') {
      if (Buffer.byteLength(value, 'utf8') > MAX_RESPONSE_BYTES) {
        throw serpError('SERP_RESPONSE_TOO_LARGE', '全网搜索响应超过大小限制');
      }
      try { value = JSON.parse(value); } catch {
        throw serpError('SERP_PARSE_FAILED', '全网搜索未返回可解析的结构化结果');
      }
    }
    if (!record(value)) break;
    // A provider error/challenge cannot masquerade as a successful empty organic array.
    if (value.error || value.errors || value.captcha || value.challenge || Number(value.status_code) >= 400) {
      throw serpError('SERP_SOURCE_FAILED', '全网搜索服务未完成搜索');
    }
    if (Object.hasOwn(value, 'organic')) return value;
    if (Object.hasOwn(value, 'body')) {
      value = value.body;
      continue;
    }
    break;
  }
  throw serpError('SERP_PARSE_FAILED', '全网搜索响应缺少 organic 结果');
}

/** Parse only search candidates: snippets and rich-result prices are never offers. */
export function parseSearchCandidates(body: unknown): WebSearchCandidate[] {
  const data = parsedBody(body);
  if (!Array.isArray(data.organic)) {
    throw serpError('SERP_PARSE_FAILED', '全网搜索 organic 结果格式无效');
  }
  if (!data.organic.length) return [];
  const groups = new Map<string, WebSearchCandidate[]>();
  const seen = new Set<string>();
  let structurallyValid = false;
  for (const item of data.organic.slice(0, MAX_ORGANIC_RESULTS)) {
    if (record(item) && typeof item.link === 'string' && item.link.trim() && typeof item.title === 'string' && item.title.trim()) {
      structurallyValid = true;
    }
    const candidate = normalizedCandidate(item);
    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    const host = new URL(candidate.url).hostname.replace(/^www\./, '');
    const entries = groups.get(host) || [];
    if (entries.length < MAX_PER_HOST) entries.push(candidate);
    groups.set(host, entries);
  }
  if (!structurallyValid) {
    throw serpError('SERP_PARSE_FAILED', '全网搜索结果缺少有效的标题和链接');
  }
  // Prefer source diversity: every host's first hit comes before any second hit.
  const candidates: WebSearchCandidate[] = [];
  for (let index = 0; index < MAX_PER_HOST; index++) {
    for (const entries of groups.values()) {
      if (entries[index]) candidates.push(entries[index]);
      if (candidates.length === MAX_CANDIDATES) return candidates;
    }
  }
  return candidates;
}

async function boundedResponseText(response: Response): Promise<string> {
  const declaredBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw serpError('SERP_RESPONSE_TOO_LARGE', '全网搜索响应超过大小限制');
  }
  if (!response.body) throw serpError('SERP_PARSE_FAILED', '全网搜索返回空响应');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw serpError('SERP_RESPONSE_TOO_LARGE', '全网搜索响应超过大小限制');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** One bounded paid SERP request. A Web Unlocker zone is not a substitute for a SERP zone. */
export async function searchWebCandidates(
  query: string,
  market: MarketCode,
  options: { zone?: string; token?: string; fetchImpl?: typeof fetch } = {},
): Promise<WebSearchCandidate[]> {
  const zone = (options.zone ?? config.brightData.serpZone).trim();
  const token = (options.token ?? config.brightData.apiToken).trim();
  if (!zone || !token) {
    throw serpError('SERP_NOT_CONFIGURED', '请配置专用 BRIGHTDATA_SERP_ZONE 和 API token 后使用全网搜索');
  }
  const url = buildWebSearchUrl(query, market);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone, url, format: 'raw' }),
      redirect: 'error',
      signal,
    });
    if (!response.ok || response.headers.get('x-brd-error') || response.headers.get('x-brd-err-code')) {
      await response.body?.cancel().catch(() => {});
      const code = [401, 403, 407].includes(response.status) ? 'SERP_AUTH_FAILED' : 'SERP_HTTP_ERROR';
      throw serpError(code, '全网搜索服务请求失败，请检查 SERP zone 状态与授权', response.status);
    }
    return parseSearchCandidates(await boundedResponseText(response));
  } catch (error) {
    if (error instanceof BrightDataError) throw error;
    if (signal.aborted || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) {
      throw serpError('SERP_TIMEOUT', '全网搜索请求超时');
    }
    // Fetch errors can include request URLs, provider messages or credentials: never relay them.
    throw serpError('SERP_NETWORK_ERROR', '全网搜索网络请求失败');
  }
}
