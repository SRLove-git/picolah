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
    test.slow(); // Six saves, renders and reloads need a full workflow budget.
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
      await expect(room.locator('.pc-play-canvas')).toHaveAttribute('data-clothing', id);
      await expect(room.locator('.pc-play-canvas')).toHaveAttribute('data-ready', 'true');
      await expect(room.locator('.pc-play-canvas')).toHaveAttribute('data-source', new RegExp(id + '.*\\.webp'));
      // Capture the complete original outfit at a still, consistent pose.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await room.getByRole('button', { name: 'Pet the capybara', exact: true }).click();
      await expect(room.locator('.pc-capy-live')).toHaveCount(0);
      const screenshot = await room.locator('.pc-play-canvas').screenshot({ path: testInfo.outputPath(`${id}-${width}.png`) });
      pixels.add(screenshot.toString('base64'));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    expect(pixels.size).toBe(6);
    await page.reload();
    await expect(room.locator('.pc-play-canvas')).toHaveAttribute('data-clothing', 'sailor-shirt');
    await wardrobe(page);
    await expect(page.locator('[data-accessory="sailor-shirt"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-accessory="sailor-shirt"]').click();
    await expect(page.locator('[data-accessory="sailor-shirt"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-accessory="sailor-shirt"]')).toBeEnabled();
    await page.reload();
    await expect(room.locator('.pc-play-canvas')).toHaveAttribute('data-clothing', 'none');
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

test('Original outfit artwork survives pause, sleep and graphics context restoration', async ({ page }, info) => {
  test.slow(); // Restoring a software WebGL context recompiles the scene shaders.
  await setup(page); await wardrobe(page); await page.locator('[data-accessory="duck-raincoat"]').click();
  await expect(page.locator('[data-accessory="duck-raincoat"]')).toBeEnabled();
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click();
  const room = page.locator('.pc-companion.is-room'), canvas = room.locator('.pc-play-canvas');
  await expect(canvas).toHaveAttribute('data-clothing', 'duck-raincoat');
  await room.getByRole('button', { name: 'Pause motion', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-running', 'false');
  const still = await canvas.getAttribute('data-frames'); await page.waitForTimeout(350); await expect(canvas).toHaveAttribute('data-frames', still!);
  await room.getByRole('button', { name: 'Resume motion', exact: true }).click();
  await canvas.evaluate((c: HTMLCanvasElement) => { const ext = c.getContext('webgl2')!.getExtension('WEBGL_lose_context')!; ext.loseContext(); setTimeout(() => ext.restoreContext(), 500); });
  await expect(canvas).toHaveAttribute('data-ready', 'false'); await expect(room.locator('[data-art="fitted-character"]')).toBeVisible();
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 15000 }); await expect(room.locator('.pc-play-loading-character')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-clothing', 'duck-raincoat');
  await room.getByRole('button', { name: 'Nap time', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-action', 'rest'); await expect(canvas).toHaveAttribute('data-clothing', 'duck-raincoat');
  await room.screenshot({ path: info.outputPath('dressed-image-nap.png') });
  await room.getByRole('button', { name: 'Wake up', exact: true }).click(); await expect(canvas).toHaveAttribute('data-action', 'wake');
});

test('hoodie stays on the original image character through all four games', async ({ page }, info) => {
  test.slow(); // Four game renders plus an outfit reload on software-rendered CI.
  const headers = await setup(page);
  expect((await page.request.post('/api/capybara/outfit', { headers, data: { equipped: ['cream-hoodie'] } })).ok()).toBe(true);
  await page.reload(); const room = page.locator('.pc-companion.is-room'), canvas = room.locator('.pc-play-canvas');
  await expect(canvas).toHaveAttribute('data-clothing', 'cream-hoodie');
  for (const game of ['ball', 'bubbles', 'swing', 'dance']) {
    await page.locator('.pc-room-dock-button.is-play').click(); await page.locator(`[data-game-choice="${game}"]`).click();
    await expect(canvas).toHaveAttribute('data-mode', game); await expect(canvas).toHaveAttribute('data-clothing', 'cream-hoodie');
    await page.waitForTimeout(500); await room.screenshot({ path: info.outputPath(`hoodie-${game}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(canvas).toHaveAttribute('data-running', 'false');
  await expect(canvas).toHaveAttribute('data-clothing', 'cream-hoodie'); await expect(room.locator('.pc-capy-live')).toHaveCount(0);
});

test('unsupported WebGL keeps the complete dressed character, diary and wardrobe available', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return original.call(this, type as '2d', ...args);
    } as typeof original;
  });
  const headers = await setup(page);
  expect((await page.request.post('/api/capybara/outfit', { headers, data: { equipped: ['cream-hoodie'] } })).ok()).toBe(true);
  await page.reload(); const room = page.locator('.pc-companion.is-room');
  await expect(room).toHaveAttribute('data-renderer', 'fallback'); await expect(room.locator('[data-art="fitted-character"]')).toBeVisible();
  await expect(room.getByRole('status')).toContainText('could not open');
  await wardrobe(page); await expect(page.locator('[data-accessory="cream-hoodie"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click();
  await page.getByRole('button', { name: "Open Capy's diary", exact: true }).click(); await expect(page.getByRole('tabpanel', { name: 'Diary', exact: true })).toBeVisible();
});

test.describe('cached clothing on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('reload retains the outfit and touch interaction in the animated room', async ({ page }) => {
    const headers = await setup(page);
    expect((await page.request.post('/api/capybara/outfit', { headers, data: { equipped: ['strawberry-dress'] } })).ok()).toBe(true);
    const room = page.locator('.pc-companion.is-room'), canvas = room.locator('.pc-play-canvas');
    for (let i = 0; i < 3; i++) {
      await page.reload(); await expect(canvas).toHaveAttribute('data-ready', 'true'); await expect(canvas).toHaveAttribute('data-clothing', 'strawberry-dress');
      await page.emulateMedia({ reducedMotion: 'reduce' }); await room.getByRole('button', { name: 'Pet the capybara', exact: true }).tap();
      await expect(room).toHaveAttribute('data-expression', 'happy'); await expect(canvas).toHaveAttribute('data-running', 'false');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
  });
});
