import { config, webUnlockerCredentials } from '../config.ts';

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
  /** Two-letter country code; Bright Data exits from that country when supported. */
  country?: string;
  /** Ask Web Unlocker to execute JS before returning the HTML. */
  render?: boolean;
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function ipBlockHint(zone: string, customerId: string): string {
  const zoneUrl = customerId
    ? `https://brightdata.com/cp/zones/${zone}/access_params?id=${customerId}`
    : `https://brightdata.com/cp/zones/${zone}/access_params`;
  return [
    `Bright Data 拒绝了当前出口 IP（zone "${zone}" 的 Denylisted IPs / allowlist）。`,
    `在控制台移除被拉黑的 IP 段（或把本机出口 IP 加入 allowlist）：${zoneUrl}`,
  ].join(' ');
}

/**
 * Fetch a page through Bright Data Web Unlocker (REST, no proxy agent needed).
 * Bright Data reports auth/zone errors in headers with HTTP 200, so headers are
 * checked before the body.
 */
export async function fetchHtml(url: string, options: FetchHtmlOptions = {}): Promise<string> {
  const { token, zone } = webUnlockerCredentials();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch('https://api.brightdata.com/request', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zone,
          url,
          format: 'raw',
          ...(options.country ? { country: options.country.toLowerCase() } : {}),
          ...(options.render ? { render: true } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const brightDataError = response.headers.get('x-brd-error');
      const brightDataMessage = response.headers.get('x-brd-err-msg');
      if (brightDataError) {
        const code = response.headers.get('x-brd-err-code') || brightDataError;
        const blocked = /ip_blacklisted|blacklist|denylist/i.test(`${brightDataError} ${brightDataMessage}`);
        throw new BrightDataError(brightDataMessage || brightDataError, {
          code: blocked ? 'IP_BLOCKED' : code,
          status: Number(response.headers.get('x-brd-status-code')) || response.status,
          hint: blocked ? ipBlockHint(zone, config.brightData.customerId) : undefined,
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

      console.log(`[crawler] web-unlocker ${response.status} ${Date.now() - started}ms ${url.slice(0, 120)}`);
      return body;
    } catch (error) {
      lastError = error;
      if (error instanceof BrightDataError && error.code === 'IP_BLOCKED') throw error;
      const retryable =
        !(error instanceof BrightDataError) ||
        error.code === 'EMPTY_RESPONSE' ||
        (error.status !== undefined && error.status >= 500);
      if (!retryable || attempt === retries) break;
      const delay = 1_500 * (attempt + 1);
      console.warn(`[crawler] web-unlocker retry ${attempt + 1}/${retries} in ${delay}ms: ${errorMessage(error)}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
