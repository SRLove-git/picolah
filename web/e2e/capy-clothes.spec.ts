import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { CAPY_CLOTHING_IDS } from '../shared/capybara';

test.use({ serviceWorkers: 'block' });

async function setup(page: Page) {
  const identity = `clothes-e2e-${randomUUID()}`;
  await page.addInitScript((identity) => {
    localStorage.setItem('picolah.userId', identity);
    localStorage.setItem('picolah.language', 'en');
  }, identity);
  await page.goto('/7hk9ho#capybara');
  return { 'X-Picolah-User': identity };
}
async function wardrobe(page: Page) {
  await page.getByRole('button', { name: 'Dress up Capy', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
}

for (const width of [1440, 390, 320]) {
  test(`six outfits can be worn, switched, reloaded and taken off at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    const headers = await setup(page);
    const before = (await (await page.request.get('/api/capybara', { headers })).json()).capybara;
    const room = page.locator('.pc-companion.is-room');
    const pixels = new Set<string>();
    for (const id of CAPY_CLOTHING_IDS) {
      await wardrobe(page);
      await expect(page.getByRole('button', { name: 'Clothes', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.is-clothes .pc-capy-item')).toHaveCount(6);
      const outfit = page.locator(`[data-accessory="${id}"]`);
      await expect(outfit).toBeEnabled();
      await outfit.click();
      await expect(outfit).toHaveAttribute('aria-pressed', 'true');
      await expect(outfit).toBeEnabled();
      await expect(page.locator('.pc-wardrobe-model .pc-capy-live')).toHaveAttribute('data-clothing', id);
      const actual = (await (await page.request.get('/api/capybara', { headers })).json()).capybara;
      expect(actual.equipped).toEqual([id]);
      expect(actual.xp).toBe(before.xp);
      expect(actual.purchases).toEqual(before.purchases);
      await page.getByRole('button', { name: 'Back to Capy', exact: true }).click();
      await expect(room.locator('.pc-capy-live')).toHaveAttribute('data-clothing', id);
      await expect(room.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
      // Freeze in a consistent expression; inspect a visible torso patch in the rendered canvas.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await room.getByRole('button', { name: 'Pet the capybara', exact: true }).click();
      await expect(room.locator('.pc-capy-worn')).toBeVisible();
      const image = room.locator(`[data-wearable="${id}"] image`);
      expect(await image.getAttribute('href')).toMatch(new RegExp(id));
      const screenshot = await room.locator('.pc-capy-live').screenshot({ path: testInfo.outputPath(`${id}-${width}.png`) });
      pixels.add(screenshot.toString('base64'));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    expect(pixels.size).toBe(6);
    await page.reload();
    await expect(room.locator('.pc-capy-live')).toHaveAttribute('data-clothing', 'sailor-shirt');
    await wardrobe(page);
    await expect(page.locator('[data-accessory="sailor-shirt"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-accessory="sailor-shirt"]').click();
    await expect(page.locator('[data-accessory="sailor-shirt"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-accessory="sailor-shirt"]')).toBeEnabled();
    await page.reload();
    await expect(room.locator('.pc-capy-live')).toHaveAttribute('data-clothing', 'none');
    expect((await (await page.request.get('/api/capybara', { headers })).json()).capybara.equipped).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('an outfit save failure rolls back the model and the selected clothing', async ({ page }) => {
  const headers = await setup(page);
  await page.route('**/api/capybara/outfit', (route) => route.fulfill({ status: 503, json: { error: 'TEST_FAILURE' } }));
  await wardrobe(page);
  await page.locator('[data-accessory="mint-overalls"]').click();
  await expect(page.locator('[data-accessory="mint-overalls"]')).toBeEnabled();
  await expect(page.locator('[data-accessory="mint-overalls"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.pc-wardrobe-model .pc-capy-live')).toHaveAttribute('data-clothing', 'none');
  expect((await (await page.request.get('/api/capybara', { headers })).json()).capybara.equipped).toEqual([]);
});

test('clothing is composited into the moving character and survives pause and context restoration', async ({ page }) => {
  await setup(page); await wardrobe(page);
  await page.locator('[data-accessory="duck-raincoat"]').click();
  await expect(page.locator('[data-accessory="duck-raincoat"]')).toBeEnabled();
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click();
  const room = page.locator('.pc-companion.is-room');
  await room.getByRole('button', { name: 'Little snack', exact: true }).click();
  await expect(room.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
  const counts = await room.locator('canvas').evaluate((canvas: HTMLCanvasElement) => new Promise<number>((resolve) => requestAnimationFrame(() => {
    const gl = canvas.getContext('webgl')!;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let yellow = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200 && pixels[i] > 180 && pixels[i + 1] > 170 && pixels[i + 1] > pixels[i + 2] * 1.35) yellow++;
    resolve(yellow);
  })));
  expect(counts).toBeGreaterThan(15000);
  await room.getByRole('button', { name: 'Pause motion', exact: true }).click();
  await expect(room.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'false');
  await expect(room.locator('[data-wearable="duck-raincoat"]')).toBeVisible();
  await room.getByRole('button', { name: 'Resume motion', exact: true }).click();
  await expect(room.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
  await room.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const extension = canvas.getContext('webgl')?.getExtension('WEBGL_lose_context');
    extension?.loseContext();
    setTimeout(() => extension?.restoreContext(), 300);
  });
  await expect(room.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'false');
  await expect(room.locator('[data-wearable="duck-raincoat"]')).toBeVisible();
  await expect(room.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
  await room.getByRole('button', { name: 'Nap time', exact: true }).click();
  await expect(room).toHaveAttribute('data-dressed-nap', 'true');
  await expect(room.locator('.pc-companion-follow')).toHaveAttribute('data-nap-hidden', 'false');
  await expect(room.locator('.pc-capy-live')).toHaveAttribute('data-clothing', 'duck-raincoat');
  await room.getByRole('button', { name: 'Wake up', exact: true }).click();
  await expect(room).toHaveAttribute('data-dressed-nap', 'false');
});
