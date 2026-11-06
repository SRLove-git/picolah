import { config } from '../config.ts';
import { assertPublicWebUrl, safeWebUrl } from '../safe-web-url.ts';
import { BrightDataError } from '../brightdata/web-unlocker.ts';

const ENDPOINT = 'https://api.deepseek.com/v1/tools/fetch';
const MAX_BYTES = 2 * 1024 * 1024;
export interface MarkdownPage { format: 'markdown'; title: string; content: string; stockUnconfirmed?: boolean }
const failure = (code: string, status?: number) => new BrightDataError('网页抓取未能取得可用内容', { code, status });

function httpFailure(status: number): BrightDataError {
  const codes: Record<number, string> = {
    401: 'WEB_PAGE_AUTH_FAILED', 402: 'WEB_PAGE_PAYMENT_REQUIRED',
    403: 'WEB_PAGE_POLICY_REJECTED', 404: 'WEB_PAGE_SOURCE_FAILED',
    408: 'WEB_PAGE_TIMEOUT', 429: 'WEB_PAGE_RATE_LIMITED', 504: 'WEB_PAGE_TIMEOUT',
  };
  return failure(codes[status] ?? (status >= 500 ? 'WEB_PAGE_PROVIDER_ERROR' : 'WEB_PAGE_HTTP_ERROR'), status);
}

function bounded<T>(pending: Promise<T>, signal: AbortSignal, code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(failure(code));
    if (signal.aborted) { pending.catch(() => {}); aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

/** Fixed provider endpoint; page text is untrusted data, never model instructions. */
export async function fetchDeepSeekPage(value: string, options: {
  apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number; validateUrl?: (url: string) => Promise<unknown>;
} = {}): Promise<MarkdownPage> {
  const url = safeWebUrl(value);
  if (!url) throw failure('UNSAFE_WEB_URL');
  const apiKey = options.apiKey ?? config.webSearch.apiKey;
  if (!apiKey) throw failure('DEEPSEEK_FETCH_NOT_CONFIGURED');
  try {
    await bounded((options.validateUrl ?? assertPublicWebUrl)(url.href), AbortSignal.timeout(10_000), 'WEB_DNS_TIMEOUT');
  } catch (error) {
    if (error instanceof BrightDataError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'UNSAFE_WEB_URL') throw failure('UNSAFE_WEB_URL');
    throw failure('WEB_DNS_FAILED');
  }
  const signal = AbortSignal.timeout(options.timeoutMs ?? 12_000);
  try {
    const response = await bounded((options.fetchImpl ?? fetch)(ENDPOINT, {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.href }),
    }).then((received) => {
      if (signal.aborted) { void received.body?.cancel().catch(() => {}); throw failure('WEB_PAGE_TIMEOUT'); }
      return received;
    }), signal, 'WEB_PAGE_TIMEOUT');
    if (response.redirected || (response.url && response.url !== ENDPOINT) || (response.status >= 300 && response.status < 400)
      || response.headers.has('location') || response.headers.has('refresh')) {
      void response.body?.cancel().catch(() => {}); throw failure('WEB_PAGE_REDIRECT_REJECTED');
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw httpFailure(response.status);
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      void response.body?.cancel().catch(() => {}); throw failure('WEB_PAGE_RESPONSE_TOO_LARGE');
    }
    if (!response.body) throw failure('WEB_PAGE_PARSE_FAILED');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        const part = await bounded(reader.read(), signal, 'WEB_PAGE_TIMEOUT');
        if (signal.aborted) throw failure('WEB_PAGE_TIMEOUT');
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_BYTES) { cancel(); throw failure('WEB_PAGE_RESPONSE_TOO_LARGE'); }
        chunks.push(part.value);
      }
    } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error || data.errors
      || typeof data.title !== 'string' || typeof data.content !== 'string' || !data.content.trim()
      || data.title.length > 1000) throw failure('WEB_PAGE_PARSE_FAILED');
    if (/server busy|access denied|robot check|are you a robot|captcha|just a moment|verify.*human|service unavailable|页面不存在|安全验证|sei un robot|bist du ein roboter|êtes.vous un robot|eres un robot/i.test(data.title)
      || (data.content.length < 500 && /server busy|access denied|captcha|verify.*human|service unavailable/i.test(data.content))) {
      throw failure('WEB_PAGE_SOURCE_FAILED');
    }
    return { format: 'markdown', title: data.title, content: data.content };
  } catch (error) {
    if (error instanceof BrightDataError) throw error;
    if (signal.aborted || (error instanceof Error && /^(?:TimeoutError|AbortError)$/.test(error.name))) throw failure('WEB_PAGE_TIMEOUT');
    throw failure(error instanceof SyntaxError ? 'WEB_PAGE_PARSE_FAILED' : 'WEB_PAGE_NETWORK_ERROR');
  }
}
