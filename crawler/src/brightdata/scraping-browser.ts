import { existsSync, readFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { browserCredentials, config } from '../config.ts';
import { sanitizeBrightDataError } from './errors.ts';
import { BrightDataError } from './web-unlocker.ts';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

export interface BrowserPageOptions {
  country?: string;
  locale?: string;
  timezoneId?: string;
  /** auto: local Chrome if installed, otherwise Bright Data Scraping Browser. */
  mode?: 'auto' | 'local' | 'brightdata';
  /** Playwright storage state JSON (Shopee login cookies). */
  storageState?: string;
  headless?: boolean;
}

export function scrapingBrowserEndpoint(country?: string): string {
  const { customerId, zone, password, host, port } = browserCredentials();
  const cleanHost = host.replace(/^wss?:\/\//i, '').replace(/:\d+$/, '');
  const countryFlag = country ? `-country-${country.toLowerCase()}` : '';
  return `wss://brd-customer-${customerId}-zone-${zone}${countryFlag}:${password}@${cleanHost}:${port}`;
}

export function findChromePath(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate));
}

export function localProxy(country?: string): { server: string; username: string; password: string } | undefined {
  if (!config.localProxyEnabled) return undefined;
  const bd = config.brightData;
  if (!bd.customerId || !bd.proxyZone || !bd.proxyPassword) return undefined;
  const countryFlag = country ? `-country-${country.toLowerCase()}` : '';
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

async function injectCookies(context: BrowserContext, storageStatePath: string): Promise<void> {
  if (!existsSync(storageStatePath)) return;
  const state = JSON.parse(readFileSync(storageStatePath, 'utf8')) as { cookies?: Parameters<BrowserContext['addCookies']>[0] };
  if (Array.isArray(state.cookies) && state.cookies.length) {
    await context.addCookies(state.cookies);
    console.log(`[crawler] 已注入 ${state.cookies.length} 个登录 cookie（${storageStatePath}）`);
  }
}

async function withLocalPage<T>(run: (page: Page) => Promise<T>, options: BrowserPageOptions): Promise<T> {
  const executablePath = findChromePath();
  if (!executablePath) {
    throw new BrightDataError(
      '找不到本地 Chrome / Edge。安装 Chrome，或设置 CHROME_PATH；也可以设置 CRAWLER_BROWSER=brightdata 使用 Scraping Browser。',
      { code: 'NO_LOCAL_BROWSER' },
    );
  }

  const proxy = localProxy(options.country);
  const browser = await chromium.launch({
    executablePath,
    headless: options.headless ?? true,
    ...(proxy ? { proxy } : {}),
    args: ['--disable-blink-features=AutomationControlled', '--disable-quic'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const context = await browser.newContext({
      storageState: options.storageState,
      locale: options.locale || 'en-SG',
      timezoneId: options.timezoneId || 'Asia/Singapore',
      viewport: { width: 1440, height: 1000 },
      userAgent: USER_AGENT,
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();
    try {
      return await run(page);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

async function withBrightDataPage<T>(run: (page: Page) => Promise<T>, options: BrowserPageOptions): Promise<T> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.connectOverCDP(scrapingBrowserEndpoint(options.country), { timeout: 120_000 });
  } catch (error) {
    throw friendlyConnectError(error);
  }

  const context = browser.contexts()[0] ?? (await browser.newContext());
  if (options.storageState) await injectCookies(context, options.storageState);
  const page = await context.newPage();
  try {
    return await run(page);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/**
 * Open a page in a browser session.
 *
 * - auto (default): local Chrome/Edge if installed, otherwise Bright Data Scraping Browser.
 * - local: local Chrome + Bright Data ISP proxy (needs a login state for Shopee).
 * - brightdata: remote Scraping Browser over CDP.
 */
export async function withBrowserPage<T>(
  run: (page: Page) => Promise<T>,
  options: BrowserPageOptions = {},
): Promise<T> {
  const mode = options.mode && options.mode !== 'auto' ? options.mode : findChromePath() ? 'local' : 'brightdata';
  return mode === 'local' ? withLocalPage(run, options) : withBrightDataPage(run, options);
}
