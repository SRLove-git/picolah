/**
 * One-time Shopee login capture.
 *
 *   npm --prefix crawler run shopee:login -- --market SG
 *
 * Opens a real Chrome window through the ISP proxy, lets you log in, then saves
 * the cookies to crawler/.shopee-state.<market>.json. The crawler reuses that
 * state for search pages (Shopee requires a logged-in session from flagged IPs).
 *
 *   --check   only verify Chrome/proxy connectivity (headless, no login)
 *   --proxy   route the login window through the Bright Data ISP proxy
 *             (default is a direct connection, which is more reliable for login)
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findChromePath, localProxy } from '../src/brightdata/scraping-browser.ts';
import { MARKETS, type MarketCode } from '../src/markets.ts';
import { shopeeStatePath } from '../src/platforms/shopee.ts';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Shopee 一次性登录

用法：
  npm --prefix crawler run shopee:login -- --market=SG [--proxy] [--check]

参数：
  --market=SG|MY|TH|ID|PH|VN  要登录的市场，默认 SG
  --proxy                     登录窗口走 Bright Data ISP 代理（默认直连）
  --check                     只检查 Chrome / 代理连通性，不登录
  --help                      显示帮助
`);
  process.exit(0);
}

function argValue(name: string): string | undefined {
  const withEquals = args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  if (withEquals) return withEquals;
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const marketArg = argValue('market') || 'SG';
const market = marketArg.toUpperCase() as MarketCode;
const checkOnly = args.includes('--check');
const useProxy = args.includes('--proxy');

if (!(market in MARKETS)) {
  console.error(`未知市场：${market}`);
  process.exit(1);
}

const marketConfig = MARKETS[market];
const domain = marketConfig.domains.shopee;
if (!domain) {
  console.error(`没有 ${market} 的 Shopee 域名`);
  process.exit(1);
}

const executablePath = findChromePath();
if (!executablePath) {
  console.error('找不到本地 Chrome / Edge。安装 Chrome 或设置 CHROME_PATH 后重试。');
  process.exit(1);
}

const profileDir = fileURLToPath(new URL('../.chrome-shopee-profile', import.meta.url));
const statePath = shopeeStatePath(market);
const proxy = useProxy ? localProxy(market) : undefined;

console.log(`[shopee-login] market=${market} domain=${domain}`);
console.log(`[shopee-login] chrome=${executablePath}`);
console.log(`[shopee-login] proxy=${proxy ? proxy.server : 'direct'}`);
console.log(`[shopee-login] state=${statePath}`);
if (existsSync(statePath)) console.log('[shopee-login] 已有登录状态，本次会覆盖。');

const context = await chromium.launchPersistentContext(profileDir, {
  executablePath,
  headless: checkOnly,
  ...(proxy ? { proxy } : {}),
  locale: marketConfig.locale,
  timezoneId: marketConfig.timezone,
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled', '--disable-quic'],
  ignoreDefaultArgs: ['--enable-automation'],
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

const page = context.pages()[0] ?? (await context.newPage());

try {
  await page.goto(`https://${domain}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  console.log(`[shopee-login] 打开：${page.url()}`);
  console.log('[shopee-login] 页面标题：', await page.title());

  if (checkOnly) {
    const cookies = await context.cookies(`https://${domain}`);
    console.log(`[shopee-login] check OK，cookies=${cookies.length}，已登录=${hasSession(cookies)}`);
    process.exitCode = 0;
  } else {
    console.log('\n请在打开的 Chrome 窗口里登录 Shopee（扫码或账号密码）。');
    console.log('登录成功后脚本会自动保存 cookie；最多等待 10 分钟。\n');

    const deadline = Date.now() + 10 * 60 * 1000;
    let loggedIn = false;
    let waited = 0;
    while (Date.now() < deadline) {
      await page.waitForTimeout(3_000);
      waited += 3;
      const cookies = await context.cookies(`https://${domain}`);
      if (hasSession(cookies)) {
        loggedIn = true;
        break;
      }
      if (waited % 30 === 0) {
        const current = await page.title().catch(() => '');
        console.log(`[shopee-login] 等待登录… 当前页面：${current || page.url()}`);
      }
    }

    if (!loggedIn) {
      console.error('[shopee-login] 10 分钟内未检测到登录 cookie（SPC_U / SPC_ST）。');
      process.exitCode = 1;
    } else {
      await context.storageState({ path: statePath });
      console.log(`[shopee-login] 已保存登录状态：${statePath}`);
      process.exitCode = 0;
    }
  }
} catch (error) {
  console.error('[shopee-login] 失败：', error instanceof Error ? error.message.split('\n')[0] : error);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
}

function hasSession(cookies: { name: string; value: string }[]): boolean {
  return cookies.some(
    (cookie) =>
      (cookie.name.toUpperCase() === 'SPC_U' || cookie.name.toUpperCase() === 'SPC_ST')
      && Boolean(cookie.value)
      && cookie.value !== '0',
  );
}
