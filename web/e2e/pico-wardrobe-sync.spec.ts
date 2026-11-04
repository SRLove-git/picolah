import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { CAPY_CLOTHING_IDS } from '../shared/capybara';

test.use({ serviceWorkers: 'block' });

async function setup(page: Page) {
  const identity = `home-outfit-${randomUUID()}`;
  await page.addInitScript(id => {
    localStorage.setItem('picolah.userId', id);
    localStorage.setItem('picolah.language', 'en');
  }, identity);
  await page.goto('/7hk9ho#home');
  return { 'X-Picolah-User': identity };
}

async function navigate(page: Page, name: 'Home' | 'Growth') {
  const menu = page.locator('.pc-mobile-menu:visible');
  if (await menu.count()) await menu.first().click();
  await page.locator('.pc-nav').getByRole('button', { name, exact: true }).click();
}

async function dress(page: Page, id: string) {
  await page.getByRole('button', { name: 'Dress up Capy', exact: true }).click();
  const button = page.locator(`[data-accessory="${id}"]`);
  await button.click();
  await expect(button).toBeEnabled();
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click();
}

for (const width of [1440, 390, 320]) {
  test(`wardrobe changes reach the moving home mascot and survive refresh at ${width}px`, async ({ page }, info) => {
    test.slow();
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    const headers = await setup(page);
    const home = page.locator('.pc-pico-roamer');
    const pixels = new Set<string>();
    for (const id of CAPY_CLOTHING_IDS) {
      await navigate(page, 'Growth');
      await dress(page, id);
      await navigate(page, 'Home');
      await expect(home).toHaveAttribute('data-clothing', id);
      await expect(home).toHaveAttribute('data-ready', 'true');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      pixels.add((await home.screenshot({ path: info.outputPath(`${id}-${width}.png`) })).toString('base64'));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    expect(pixels.size).toBe(6);
    await page.reload();
    // A mouse left over Pico after narrow-screen navigation holds it still.
    await page.mouse.move(0, 0);
    await expect(home).toHaveAttribute('data-clothing', 'sailor-shirt');
    await expect(home).toHaveAttribute('data-activity', 'walk');
    await expect(home).toHaveAttribute('data-activity', 'run', { timeout: 15000 });
    await home.getByRole('button', { name: 'Pico', exact: true }).click();
    await expect(home).toHaveAttribute('data-activity', 'wave');
    await expect(home).toHaveAttribute('data-clothing', 'sailor-shirt');
    await expect(home.getByRole('button')).toHaveCount(1);
    await expect(home).toHaveText('');
    await navigate(page, 'Growth');
    await dress(page, 'sailor-shirt');
    await navigate(page, 'Home');
    await expect(home).toHaveAttribute('data-clothing', 'none');
    await page.reload();
    await expect(home).toHaveAttribute('data-clothing', 'none');
    expect((await (await page.request.get('/api/capybara', { headers })).json()).capybara.equipped).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('home keeps the saved outfit when WebGL is unavailable and after a failed save', async ({ page }, info) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl') return null;
      return original.call(this, type as '2d', ...args);
    } as typeof original;
  });
  await setup(page);
  await navigate(page, 'Growth');
  await dress(page, 'mint-overalls');
  await navigate(page, 'Home');
  const home = page.locator('.pc-pico-roamer'), poster = home.locator('.pc-pico-roamer-poster');
  await expect(home).toHaveAttribute('data-ready', 'false');
  await expect(poster).toBeVisible();
  await expect(poster).toHaveAttribute('src', /mint-overalls/);
  await home.getByRole('button', { name: 'Pico', exact: true }).click();
  await expect(home).toHaveAttribute('data-activity', 'wave');
  await expect(poster).toHaveAttribute('src', /mint-overalls/);
  await home.screenshot({ path: info.outputPath('home-fallback-outfit.png') });
  await navigate(page, 'Growth');
  await page.route('**/api/capybara/outfit', route => route.fulfill({ status: 503, json: { error: 'TEST_FAILURE' } }));
  await dress(page, 'cream-hoodie');
  await navigate(page, 'Home');
  await expect(home).toHaveAttribute('data-clothing', 'mint-overalls');
  await page.reload();
  await expect(poster).toHaveAttribute('src', /mint-overalls/);
});
