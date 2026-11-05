import { expect, test, type Page } from '@playwright/test';
import { COUNTRY_LIST } from '../shared/types';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  const payloads: Record<string, unknown> = {
    '/api/auth/me': { user: null, required: false },
    '/api/config': { llmConfigured: false, markets: COUNTRY_LIST, gateway: {} },
    '/api/conversations': { conversations: [] },
    '/api/catalog': { products: [], categories: [], total: 0 },
    '/api/capybara': { capybara: null },
    '/api/profile': { profile: { recent: [] } },
  };
  await page.route('**/api/**', route => route.fulfill({ json: payloads[new URL(route.request().url()).pathname] ?? {} }));
  await page.addInitScript(() => {
    Object.assign(window, { SpeechRecognition: class {
      lang = '';
      start() { Object.assign(window, { spokenLocale: this.lang }); }
      stop() {}
      abort() {}
    } });
  });
});

async function openNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) <= 820) {
    if (!(await page.locator('.pc-sidebar').getAttribute('class'))?.includes('is-open')) {
      await page.locator('.pc-mobile-menu:visible').first().click();
    }
  } else await page.locator('.pc-sidebar').hover();
}

const languages = [
  { code: 'zh', short: '中文', home: '首页', placeholder: '想买什么？', voice: 'zh-CN' },
  { code: 'en', short: 'EN', home: 'Home', placeholder: 'What do you want to buy?', voice: 'en-SG' },
];

for (const width of [1440, 390, 320]) test(`one click changes language independently of country at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
  await page.goto('/7hk9ho#home');
  const flag = page.locator('.pc-side-market .pc-picker-trigger');
  const toggle = page.locator('.pc-language-toggle');
  for (const item of languages) {
    await openNavigation(page);
    const marketBefore = await flag.getAttribute('data-market');
    await toggle.click();
    await expect(toggle).toHaveText(item.short);
    await expect(flag).toHaveAttribute('data-market', marketBefore!);
    for (const { code } of COUNTRY_LIST) {
      await flag.click();
      await page.locator(`.pc-market-menu [data-market="${code}"]`).click();
      await expect(flag).toHaveText('');
      await expect(flag).toHaveAttribute('data-market', code);
      await expect(page.locator('html')).toHaveAttribute('lang', item.code);
      await expect(page.locator('.pc-nav-item').first()).toHaveText(item.home);
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', item.code);
    await expect(page.locator('.pc-home textarea')).toHaveAttribute('placeholder', item.placeholder);
    await expect(flag).toHaveAttribute('data-market', 'VN');
    await page.locator('.pc-home .pc-mic').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as {spokenLocale: string}).spokenLocale)).toBe(item.voice);
    await page.locator('.pc-home .pc-mic').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('a saved language takes priority over browser language and country', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('picolah.market', 'TH');
    localStorage.setItem('picolah.language', 'zh');
  });
  await page.goto('/7hk9ho#search');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(page.locator('.pc-search-page h1')).toHaveText('发现');
  await expect(page.locator('.pc-side-market .pc-picker-trigger')).toHaveAttribute('data-market', 'TH');
});
