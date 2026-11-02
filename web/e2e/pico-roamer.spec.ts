import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function open(page: Page, language = 'en') {
  await page.addInitScript(lang => localStorage.setItem('picolah.language', lang), language);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      '/api/auth/me': { user: null, required: false },
      '/api/config': { llmConfigured: true, markets: [], gateway: {} },
      '/api/conversations': { conversations: [] },
    };
    return route.fulfill({ json: data[path] ?? {} });
  });
  await page.goto('/7hk9ho#home');
  const pico = page.locator('.pc-pico-roamer');
  await expect(pico).toHaveAttribute('data-ready', 'true');
  return pico;
}

for (const width of [1440, 390, 320]) test(`Pico walks, runs and responds without controls at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET' && request.url().includes('/api/')) writes.push(request.url()); });
  const pico = await open(page, width === 390 ? 'zh' : 'en');
  const button = pico.getByRole('button', { name: 'Pico', exact: true });
  await expect(pico.getByRole('button')).toHaveCount(1);
  await expect(pico).toHaveText('');
  await expect(page.locator('.pc-companion-pause, .pc-companion-speech, .pc-companion-explore')).toHaveCount(0);
  const start = (await button.boundingBox())!;
  await expect(pico).toHaveAttribute('data-activity', 'walk');
  await expect.poll(async () => (await button.boundingBox())!.x - start.x).toBeGreaterThan(8);
  await expect(pico).toHaveAttribute('data-activity', 'run', { timeout: 12000 });
  const range = (await pico.boundingBox())!;
  for (let i = 0; i < 8; i++) {
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(range.x);
    expect(box.x + box.width).toBeLessThanOrEqual(range.x + range.width);
    await page.waitForTimeout(100);
  }
  await button.hover();
  const held = (await button.boundingBox())!;
  await page.waitForTimeout(200);
  expect((await button.boundingBox())!.x).toBeCloseTo(held.x, 1);
  await button.click();
  await expect(pico).toHaveAttribute('data-activity', 'wave');
  await button.click(); // Repeated taps keep the current response continuous.
  await expect(pico).toHaveAttribute('data-reaction', '1');
  await expect(pico).toHaveAttribute('data-activity', 'idle');
  await button.click();
  await expect(pico).toHaveAttribute('data-activity', 'hop');
  await expect(page).toHaveURL(/#home$/);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const wordmark = (await page.locator('.pc-hero-wordmark').boundingBox())!;
  expect(held.y + held.height).toBeLessThanOrEqual(wordmark.y);
  await page.screenshot({ path: info.outputPath(`pico-${width}.png`) });
});

test('reduced motion and keyboard clicks show a still response and recover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pico = await open(page), button = pico.getByRole('button', { name: 'Pico' });
  const initial = await button.boundingBox();
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(pico).toHaveAttribute('data-activity', 'wave');
  const frame = await pico.locator('canvas').getAttribute('data-frame');
  await page.waitForTimeout(400);
  expect(await pico.locator('canvas').getAttribute('data-frame')).toBe(frame);
  expect(await button.boundingBox()).toEqual(initial);
  await expect(pico).toHaveAttribute('data-activity', 'idle');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.keyboard.press('Tab');
  await expect(pico).toHaveAttribute('data-activity', 'walk');
  await button.click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pico).toHaveAttribute('data-activity', 'idle');
});

test('an unavailable animation keeps the original mascot visible', async ({ page }) => {
  await page.route('**/*shopping*.webp', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('picolah.language', 'en'));
  await page.goto('/7hk9ho#home');
  const poster = page.locator('.pc-pico-roamer-poster');
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pico', exact: true }).click();
  await expect(page).toHaveURL(/#home$/);
});
