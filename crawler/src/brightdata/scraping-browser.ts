import { chromium, type Browser, type Page } from 'playwright-core';
import { browserCredentials, config } from '../config.ts';
import { sanitizeBrightDataError } from './errors.ts';
import { BrightDataError } from './web-unlocker.ts';

export function scrapingBrowserEndpoint(): string {
  const { customerId, zone, password } = browserCredentials();
  return `wss://brd-customer-${customerId}-zone-${zone}:${password}@brd.superproxy.io:9222`;
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
 * Open a page in the Bright Data Scraping Browser and run a callback.
 * Playwright connects over CDP; no local browser binary is needed.
 */
export async function withBrowserPage<T>(run: (page: Page) => Promise<T>): Promise<T> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.connectOverCDP(scrapingBrowserEndpoint(), { timeout: 120_000 });
  } catch (error) {
    throw friendlyConnectError(error);
  }

  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  try {
    return await run(page);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
