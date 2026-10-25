import { config } from '../config.ts';
import { MARKETS, type MarketCode } from '../markets.ts';
import { assertPublicWebUrl, safeWebUrl } from '../safe-web-url.ts';
import { BrightDataError } from './web-unlocker.ts';

const API_ENDPOINT = 'https://api.brightdata.com/request';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DNS_TIMEOUT_MS = 10_000;
const PAGE_TIMEOUT_MS = 60_000;

class WebPageError extends BrightDataError {}

function failure(code: string, message: string, status?: number): WebPageError {
  return new WebPageError(message, { code, status });
}

function withAbort<T>(pending: Promise<T>, signal: AbortSignal, code: string, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(failure(code, message));
    if (signal.aborted) { pending.catch(() => {}); aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

async function responseText(response: Response, signal: AbortSignal): Promise<string> {
  if (signal.aborted) {
    void response.body?.cancel().catch(() => {});
    throw failure('WEB_PAGE_TIMEOUT', '商品页面请求超时');
  }
  const declaredBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw failure('WEB_PAGE_RESPONSE_TOO_LARGE', '商品页面响应超过大小限制');
  }
  if (!response.body) throw failure('WEB_PAGE_PARSE_FAILED', '商品页面服务返回空响应');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const next = await withAbort(reader.read(), signal, 'WEB_PAGE_TIMEOUT', '商品页面请求超时');
      if (signal.aborted) throw failure('WEB_PAGE_TIMEOUT', '商品页面请求超时');
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        cancel();
        throw failure('WEB_PAGE_RESPONSE_TOO_LARGE', '商品页面响应超过大小限制');
      }
      chunks.push(next.value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function redirectHeaders(value: unknown): boolean {
  if (typeof value === 'string') return /(?:^|[\r\n])\s*(?:location|refresh)\s*:/i.test(value);
  if (Array.isArray(value)) return value.some((entry) => {
    if (Array.isArray(entry)) return typeof entry[0] === 'string' && /^(?:location|refresh)$/i.test(entry[0]);
    if (record(entry) && typeof entry.name === 'string' && /^(?:location|refresh)$/i.test(entry.name)) return true;
    return redirectHeaders(entry);
  });
  return record(value) && Object.keys(value).some((key) => /^(?:location|refresh)$/i.test(key));
}

function parsedPage(raw: string, requestedUrl: URL): string {
  let wrapper: unknown;
  try { wrapper = JSON.parse(raw); } catch { throw failure('WEB_PAGE_PARSE_FAILED', '商品页面响应不是有效的 JSON'); }
  if (!record(wrapper)) throw failure('WEB_PAGE_PARSE_FAILED', '商品页面响应缺少结构化状态');
  const status = typeof wrapper.status_code === 'number' ? wrapper.status_code
    : typeof wrapper.status_code === 'string' && /^\d{3}$/.test(wrapper.status_code) ? Number(wrapper.status_code) : NaN;
  if (!Number.isInteger(status)) throw failure('WEB_PAGE_PARSE_FAILED', '商品页面响应缺少有效状态码');
  if ((status >= 300 && status < 400) || redirectHeaders(wrapper.headers) || redirectHeaders(wrapper.response_headers)
    || Object.keys(wrapper).some((key) => /^(?:location|refresh)$/i.test(key))) {
    throw failure('WEB_PAGE_REDIRECT_REJECTED', '商品页面返回了重定向，已停止抓取', status);
  }
  if (status < 200 || status >= 300 || wrapper.error || wrapper.errors) {
    throw failure('WEB_PAGE_SOURCE_FAILED', '商品来源未成功返回页面', status);
  }
  if (wrapper.url !== undefined) {
    const finalUrl = typeof wrapper.url === 'string' ? safeWebUrl(wrapper.url) : null;
    if (!finalUrl || finalUrl.href !== requestedUrl.href) {
      throw failure('WEB_PAGE_REDIRECT_REJECTED', '商品页面最终地址与请求不一致，已停止抓取');
    }
  }
  if (typeof wrapper.body !== 'string' || !wrapper.body.trim()) throw failure('WEB_PAGE_PARSE_FAILED', '商品页面响应缺少 HTML 内容');
  return wrapper.body;
}

export interface FetchWebProductPageOptions {
  token?: string;
  zone?: string;
  fetchImpl?: typeof fetch;
  /** Test seam for DNS validation; never used to rewrite the requested URL. */
  validateUrl?: (url: string) => Promise<unknown>;
}

/**
 * One bounded Web Unlocker REST request; never direct-fetch or proxy a target URL.
 * Explicit API/source redirects and reported final URL changes are rejected.
 * The provider resolves/fetches targets itself: its internal redirect handling
 * and DNS cannot be independently pinned by this client. Do not claim otherwise.
 */
export async function fetchWebProductPage(
  value: string,
  market: MarketCode,
  options: FetchWebProductPageOptions = {},
): Promise<string> {
  const token = (options.token ?? config.brightData.apiToken).trim();
  const zone = (options.zone ?? config.brightData.zone).trim();
  if (!token || !zone) throw failure('WEB_UNLOCKER_NOT_CONFIGURED', '请配置 Bright Data Web Unlocker zone 和 API token');
  if (!Object.hasOwn(MARKETS, market)) throw failure('WEB_PAGE_INVALID_MARKET', '商品页面市场参数无效');
  const url = safeWebUrl(value);
  if (!url) throw failure('UNSAFE_WEB_URL', '商品页面地址不安全');
  try {
    await withAbort((options.validateUrl ?? assertPublicWebUrl)(url.href), AbortSignal.timeout(DNS_TIMEOUT_MS),
      'WEB_DNS_TIMEOUT', '商品页面域名解析超时');
  } catch (error) {
    if (error instanceof WebPageError) throw error;
    if (record(error) && error.code === 'UNSAFE_WEB_URL') throw failure('UNSAFE_WEB_URL', '商品页面域名解析到非公共地址');
    throw failure('WEB_DNS_FAILED', '商品页面域名验证失败');
  }

  const signal = AbortSignal.timeout(PAGE_TIMEOUT_MS);
  try {
    const response = await withAbort((options.fetchImpl ?? fetch)(API_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone, url: url.href, format: 'json', country: market.toLowerCase() }),
      redirect: 'error',
      signal,
    }).then((received) => {
      if (signal.aborted) {
        void received.body?.cancel().catch(() => {});
        throw failure('WEB_PAGE_TIMEOUT', '商品页面请求超时');
      }
      return received;
    }), signal, 'WEB_PAGE_TIMEOUT', '商品页面请求超时');
    if (response.redirected || (response.url && response.url !== API_ENDPOINT)
      || (response.status >= 300 && response.status < 400) || response.headers.has('location') || response.headers.has('refresh')) {
      void response.body?.cancel().catch(() => {});
      throw failure('WEB_PAGE_REDIRECT_REJECTED', '商品页面服务返回了重定向，已停止抓取');
    }
    if (!response.ok || response.headers.get('x-brd-error') || response.headers.get('x-brd-err-code')) {
      void response.body?.cancel().catch(() => {});
      throw failure([401, 403, 407].includes(response.status) ? 'WEB_PAGE_AUTH_FAILED' : 'WEB_PAGE_HTTP_ERROR',
        '商品页面服务请求失败，请检查 Web Unlocker 状态与授权', response.status);
    }
    return parsedPage(await responseText(response, signal), url);
  } catch (error) {
    if (error instanceof WebPageError) throw error;
    if (signal.aborted || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) {
      throw failure('WEB_PAGE_TIMEOUT', '商品页面请求超时');
    }
    throw failure('WEB_PAGE_NETWORK_ERROR', '商品页面网络请求失败');
  }
}
