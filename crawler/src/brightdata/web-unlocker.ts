import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { config, webUnlockerCredentials, type BrightDataTransport } from '../config.ts';

export class BrightDataError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly hint?: string;

  constructor(message: string, options: { code?: string; status?: number; hint?: string } = {}) {
    super(message);
    this.name = 'BrightDataError';
    this.code = options.code || 'BRIGHTDATA_ERROR';
    this.status = options.status;
    this.hint = options.hint;
  }
}

export interface FetchHtmlOptions {
  /** Override BRIGHTDATA_TRANSPORT for this request. */
  transport?: BrightDataTransport;
  /** Two-letter country code; proxy mode appends it to the proxy username. */
  country?: string;
  /** Ask Web Unlocker to execute JS (API mode only). */
  render?: boolean;
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function ipBlockHint(zone: string, customerId: string): string {
  const zoneUrl = customerId
    ? `https://brightdata.com/cp/zones/${zone}/access_params?id=${customerId}`
    : `https://brightdata.com/cp/zones/${zone}/access_params`;
  return [
    `Bright Data 拒绝了当前出口 IP（zone "${zone}" 的 Denylisted IPs / allowlist）。`,
    `在控制台移除被拉黑的 IP 段（或把本机出口 IP 加入 allowlist）：${zoneUrl}`,
  ].join(' ');
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function requestViaApi(url: string, options: FetchHtmlOptions): Promise<string> {
  const credentials = webUnlockerCredentials('api');
  if (credentials.mode !== 'api') throw new Error('requestViaApi called in proxy mode');

  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      zone: credentials.zone,
      url,
      format: 'raw',
      ...(options.country ? { country: options.country.toLowerCase() } : {}),
      ...(options.render ? { render: true } : {}),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  const brightDataError = response.headers.get('x-brd-error');
  const brightDataMessage = response.headers.get('x-brd-err-msg');
  if (brightDataError) {
    const code = response.headers.get('x-brd-err-code') || brightDataError;
    const blocked = /ip_blacklisted|blacklist|denylist/i.test(`${brightDataError} ${brightDataMessage}`);
    throw new BrightDataError(brightDataMessage || brightDataError, {
      code: blocked ? 'IP_BLOCKED' : code,
      status: Number(response.headers.get('x-brd-status-code')) || response.status,
      hint: blocked ? ipBlockHint(credentials.zone, config.brightData.customerId) : undefined,
    });
  }

  const body = await response.text();
  if (!response.ok) {
    throw new BrightDataError(`Bright Data ${response.status} ${response.statusText}`, {
      code: 'HTTP_ERROR',
      status: response.status,
    });
  }
  if (!body.trim()) {
    throw new BrightDataError('Bright Data 返回了空响应', { code: 'EMPTY_RESPONSE', status: response.status });
  }
  return body;
}

async function requestViaProxy(url: string, options: FetchHtmlOptions): Promise<string> {
  const credentials = webUnlockerCredentials('proxy');
  if (credentials.mode !== 'proxy') throw new Error('requestViaProxy called in api mode');

  const username = [
    `brd-customer-${credentials.customerId}`,
    `zone-${credentials.zone}`,
    options.country ? `country-${options.country.toLowerCase()}` : '',
  ]
    .filter(Boolean)
    .join('-');

  const dispatcher = new ProxyAgent({
    uri: credentials.host,
    token: basicAuth(username, credentials.password),
  });

  try {
    const response = await undiciFetch(url, {
      dispatcher,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    const body = await response.text();
    if (response.status === 407) {
      throw new BrightDataError('Bright Data 代理认证失败（407），请检查 proxy zone / 密码 / customer id', {
        code: 'PROXY_AUTH_FAILED',
        status: 407,
        hint: `控制台：https://brightdata.com/cp/zones/${credentials.zone}/access_params`,
      });
    }
    if (!response.ok) {
      throw new BrightDataError(`代理请求失败 HTTP ${response.status}`, {
        code: 'HTTP_ERROR',
        status: response.status,
      });
    }
    if (!body.trim()) {
      throw new BrightDataError('代理返回了空响应（目标站点可能拦截了该 IP）', {
        code: 'EMPTY_RESPONSE',
        status: response.status,
      });
    }
    return body;
  } finally {
    await dispatcher.close().catch(() => {});
  }
}

/**
 * Fetch a page through Bright Data.
 *
 * BRIGHTDATA_TRANSPORT=api   -> Web Unlocker REST API (unlocking + JS render)
 * BRIGHTDATA_TRANSPORT=proxy -> ISP proxy (clean IP, no unlocking)
 */
export async function fetchHtml(url: string, options: FetchHtmlOptions = {}): Promise<string> {
  const transport = options.transport ?? config.brightData.transport;
  const retries = options.retries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const body = await (transport === 'proxy'
        ? requestViaProxy(url, options)
        : requestViaApi(url, options));
      console.log(
        `[crawler] brightdata(${transport}) ${Date.now() - started}ms ${body.length}B ${url.slice(0, 120)}`,
      );
      return body;
    } catch (error) {
      lastError = error;
      if (error instanceof BrightDataError && (error.code === 'IP_BLOCKED' || error.code === 'PROXY_AUTH_FAILED')) {
        throw error;
      }
      const retryable =
        !(error instanceof BrightDataError) ||
        error.code === 'EMPTY_RESPONSE' ||
        (error.status !== undefined && error.status >= 500);
      if (!retryable || attempt === retries) break;
      const delay = 1_500 * (attempt + 1);
      console.warn(`[crawler] brightdata retry ${attempt + 1}/${retries} in ${delay}ms: ${errorMessage(error)}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
