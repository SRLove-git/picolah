import { expect, test, type Page } from '@playwright/test';
import { COUNTRY_LIST } from '../shared/types';

test.use({ serviceWorkers: 'block' });
const cases = [
  { country: 'SG', language: 'en', home: 'Home', placeholder: 'What do you want to buy?', voice: 'en-SG' },
  { country: 'MY', language: 'ms', home: 'Utama', placeholder: 'Apa yang anda mahu beli?', voice: 'ms-MY' },
  { country: 'TH', language: 'th', home: 'หน้าหลัก', placeholder: 'อยากซื้ออะไร?', voice: 'th-TH' },
  { country: 'ID', language: 'id', home: 'Beranda', placeholder: 'Apa yang ingin Anda beli?', voice: 'id-ID' },
  { country: 'PH', language: 'en', home: 'Home', placeholder: 'What do you want to buy?', voice: 'en-PH' },
  { country: 'VN', language: 'vi', home: 'Trang chủ', placeholder: 'Bạn muốn mua gì?', voice: 'vi-VN' },
];

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
    localStorage.setItem('picolah.language', 'zh'); // Old preferences must not override the country.
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

for (const width of [1440, 390]) test(`country selects language, voice and persistent flag at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/7hk9ho#home');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  for (const item of cases) {
    await openNavigation(page);
    const flag = page.locator('.pc-side-market .pc-picker-trigger');
    await flag.click();
    await page.locator(`.pc-market-menu [data-market="${item.country}"]`).click();
    await expect(flag).toHaveText('');
    await expect(flag.locator('svg')).toHaveCount(1);
    await expect(flag).toHaveAttribute('data-market', item.country);
    await expect(page.locator('.pc-language-toggle')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', item.language);
    await expect(page.locator('.pc-nav-item').first()).toHaveText(item.home);
    expect(await page.evaluate(() => localStorage.getItem('picolah.market'))).toBe(item.country);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', item.language);
    await expect(flag).toHaveAttribute('data-market', item.country);
    const input = page.locator('.pc-home textarea');
    await expect(input).toHaveAttribute('placeholder', item.placeholder);
    expect(await page.evaluate(() => localStorage.getItem('picolah.language'))).toBeNull();
    await page.locator('.pc-home .pc-mic').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as {spokenLocale: string}).spokenLocale)).toBe(item.voice);
    await page.locator('.pc-home .pc-mic').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Capture the settled entrance, not the first translucent animation frame.
    await page.locator('.pc-home').evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true }).filter(animation =>
        animation.effect?.getComputedTiming().iterations !== Infinity,
      ).map(animation => animation.finished.catch(() => {})));
    });
    await page.screenshot({ path: info.outputPath(`${item.country}-${width}.png`) });
  }
});

for (const item of cases.filter(item => item.language !== 'en')) test(`${item.country} localizes Discover, login and Growth`, async ({ page }) => {
  await page.addInitScript(country => localStorage.setItem('picolah.market', country), item.country);
  await page.goto('/7hk9ho#search');
  await expect(page.locator('html')).toHaveAttribute('lang', item.language);
  await expect(page.locator('.pc-search-page h1')).not.toHaveText('Discover');
  await page.locator('.pc-account-card').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.pc-auth-card h1')).not.toHaveText('Sign in');
  expect(await page.getByRole('dialog').innerText()).not.toMatch(/[\u3400-\u9fff]/);
  await page.keyboard.press('Escape');
  await page.locator('.pc-nav-item').last().click();
  await expect(page.locator('.pc-capy-home-page h1')).not.toHaveText("Capy's little home");
  expect(await page.locator('.pc-capy-home-page').innerText()).not.toMatch(/[\u3400-\u9fff]/);
});
