import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { browserCredentials, config } from '../config.ts';
import { sanitizeBrightDataError } from './errors.ts';
import { BrightDataError } from './web-unlocker.ts';

export interface BrowserPageOptions {
  country?: string;
  locale?: string;
  timezoneId?: string;
  mode?: 'auto' | 'local' | 'brightdata';
  storageState?: string;
  headless?: boolean;
}

export function scrapingBrowserEndpoint(country?: string): string {
  const { customerId, zone, password, host, port } = browserCredentials();
  const cleanHost = host.replace(/^wss?:\/\//i, '').replace(/:\d+$/, '');
  const countryFlag = country && /^[a-z]{2}$/i.test(country) ? `-country-${country.toLowerCase()}` : '';
  return `wss://brd-customer-${customerId}-zone-${zone}${countryFlag}:${encodeURIComponent(password)}@${cleanHost}:${port}`;
}

/** Restore the local-browser helpers used by the one-time Shopee login command. */
export function findChromePath(pathExists: (path: string) => boolean = existsSync): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find(pathExists);
}

export function localProxy(country?: string): { server: string; username: string; password: string } | undefined {
  const bd = config.brightData;
  if (!config.localProxyEnabled || !bd.customerId || !bd.proxyZone || !bd.proxyPassword) return undefined;
  const countryFlag = country && /^[a-z]{2}$/i.test(country) ? `-country-${country.toLowerCase()}` : '';
  return {
    server: bd.proxyHost,
    username: `brd-customer-${bd.customerId}-zone-${bd.proxyZone}${countryFlag}`,
    password: bd.proxyPassword,
  };
}

function friendlyConnectError(error: unknown): BrightDataError {
  const message = sanitizeBrightDataError(error instanceof Error ? error.message : String(error));
  if (/ip_blacklisted|blacklist|denylist|407/i.test(message)) {
    const { zone } = browserCredentials();
    const zoneUrl = config.brightData.browserCustomerId
      ? `https://brightdata.com/cp/zones/${zone}/access_params?id=${config.brightData.browserCustomerId}`
      : `https://brightdata.com/cp/zones/${zone}/access_params`;
    return new BrightDataError(
      `Scraping Browser 连接被拒绝：当前出口 IP 在该 zone 的黑名单 / 白名单之外。${message.split('\n')[0]}`,
      {
        code: 'IP_BLOCKED',
        hint: `在 Bright Data 控制台移除黑名单 IP 段，或把本机出口 IP 加入 allowlist：${zoneUrl}`,
      },
    );
  }
  return new BrightDataError(`Scraping Browser 连接失败：${message.split('\n')[0]}`, { code: 'BROWSER_ERROR' });
}

/**
 * Open local Chrome/Edge in auto/local mode or the remote Scraping Browser.
 * Explicit options are applied to a new context, never silently discarded.
 * The default remote context remains usable when no context options are requested.
 */
export async function withBrowserPage<T>(run: (page: Page) => Promise<T>, options: BrowserPageOptions = {}): Promise<T> {
  const executablePath = findChromePath();
  const mode = options.mode && options.mode !== 'auto' ? options.mode : executablePath ? 'local' : 'brightdata';
  if (mode === 'local' && !executablePath) {
    throw new BrightDataError('找不到本地 Chrome / Edge。安装浏览器或设置 CHROME_PATH 后重试。', { code: 'NO_LOCAL_BROWSER' });
  }
  let browser: Browser | undefined;
  try {
    if (mode === 'local') {
      const proxy = localProxy(options.country);
      browser = await chromium.launch({ executablePath, headless: options.headless ?? true, ...(proxy ? { proxy } : {}) });
    } else {
      browser = await chromium.connectOverCDP(scrapingBrowserEndpoint(options.country), { timeout: 120_000 });
    }
  } catch (error) {
    if (mode === 'brightdata') throw friendlyConnectError(error);
    throw new BrightDataError('本地浏览器启动失败，请检查 Chrome / Edge 安装和代理配置。', { code: 'LOCAL_BROWSER_ERROR' });
  }
  try {
    const hasContextOptions = Boolean(options.storageState || options.locale || options.timezoneId);
    const context = mode === 'brightdata' && !hasContextOptions && browser.contexts()[0]
      ? browser.contexts()[0]
      : await browser.newContext({
        ...(options.storageState ? { storageState: options.storageState } : {}),
        ...(options.locale ? { locale: options.locale } : {}),
        ...(options.timezoneId ? { timezoneId: options.timezoneId } : {}),
        viewport: { width: 1440, height: 1000 },
      }).catch(() => {
        throw new BrightDataError('浏览器无法应用登录状态或市场设置，请检查状态文件与浏览器支持。', { code: 'BROWSER_CONTEXT_FAILED' });
      });
    const page = await context.newPage();
    try { return await run(page); } finally { await page.close().catch(() => {}); }
  } finally {
    await browser.close().catch(() => {});
  }
}
