import { expect, test, type Page } from '@playwright/test';
import { capyXpForLevel, emptyCapyPayload } from '../shared/capybara';

// Asset failure fixtures must reach Playwright instead of the asset-cache worker.
test.use({ serviceWorkers: 'block' });

async function setup(page: Page, language = 'en') {
  const payload = { ...emptyCapyPayload(), xp: capyXpForLevel(8), createdAt: new Date().toISOString() };
  await page.addInitScript((language) => localStorage.setItem('picolah.language', language), language);
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: null, required: false } }));
  await page.route('**/api/capybara', (route) => route.fulfill({ json: { capybara: payload } }));
  return payload;
}

test('each interaction changes the artwork and response without changing shopping progress', async ({ page }) => {
  await setup(page);
  const writes: string[] = [];
  page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/api/')) writes.push(request.url()); });
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  const progress = page.getByRole('progressbar');
  const xp = await progress.getAttribute('aria-valuenow');
  for (const [name, expression] of [['Head pat', 'happy'], ['Little snack', 'snack'], ['Play', 'playful'], ['Nap time', 'sleepy']]) {
    await companion.getByRole('button', { name, exact: true }).click();
    await expect(companion).toHaveAttribute('data-expression', expression);
    await expect(companion.locator('.pc-capy-expressions')).toHaveAttribute('data-visible-expression', expression);
    await expect(companion.locator('img.is-visible')).toHaveCount(1);
    expect(await companion.locator('img.is-visible').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
  await expect(progress).toHaveAttribute('aria-valuenow', xp!);
  expect(writes).toEqual([]);
});

test('a newer reaction cancels old timers and a nap lasts until the user wakes Capy', async ({ page }) => {
  await page.clock.install();
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  await companion.getByRole('button', { name: 'Head pat', exact: true }).click();
  const first = await companion.getByRole('status').textContent();
  await companion.getByRole('button', { name: 'Head pat', exact: true }).click();
  expect(await companion.getByRole('status').textContent()).not.toBe(first);
  await page.clock.fastForward(3000);
  await companion.getByRole('button', { name: 'Nap time', exact: true }).click();
  await page.clock.fastForward(10000);
  await expect(companion).toHaveAttribute('data-expression', 'sleepy');
  await companion.getByRole('button', { name: 'Wake the capybara', exact: true }).click();
  await expect(companion).toHaveAttribute('data-expression', 'happy');
  await page.clock.fastForward(4300);
  await expect(companion).toHaveAttribute('data-expression', 'idle');
});

for (const width of [1440, 390, 320]) {
  test(`companion and home stay usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page, width === 390 ? 'zh' : 'en');
    await page.goto('/7hk9ho#home');
    const home = page.locator('.pc-companion');
    await home.locator('.pc-companion-touch').click();
    await expect(home).toHaveAttribute('data-expression', 'happy');
    await expect(home.locator('.pc-capy-expressions')).toHaveAttribute('data-visible-expression', 'happy');
    await expect(home.locator('img.is-visible')).toHaveCSS('opacity', '1');
    await expect(home.locator('img.is-visible')).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await home.locator('.pc-companion-explore').click();
    await expect(page).toHaveURL(/#capybara$/);
    const companion = page.locator('.pc-companion');
    await companion.locator('.pc-companion-actions button').nth(2).click();
    await expect(companion.locator('.pc-capy-expressions')).toHaveAttribute('data-visible-expression', 'playful');
    expect(await companion.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(companion.locator('img.is-visible')).toHaveCSS('opacity', '1');
    await expect(companion.locator('img.is-visible')).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`capybara-${width}.png`), fullPage: true });
  });
}

test('keyboard and reduced-motion users can interact with a still character', async ({ page }) => {
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  await companion.getByRole('button', { name: 'Play', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(companion).toHaveAttribute('data-expression', 'playful');
  await expect(companion).toHaveAttribute('data-still', 'true');
  expect(await companion.locator('.pc-capy').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await companion.getByRole('button', { name: 'Little snack', exact: true }).click();
  expect(await companion.locator('.pc-companion-pose').evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  expect(await companion.locator('.pc-capy').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await expect(companion).toHaveAttribute('data-expression', 'snack');
  await expect(companion.locator('img.is-visible')).toHaveCSS('opacity', '1');
  await expect(companion.locator('img.is-visible')).toBeInViewport();
  await companion.getByRole('button', { name: 'Pause motion', exact: true }).click();
  await companion.getByRole('button', { name: 'Head pat', exact: true }).click();
  await expect(companion).toHaveAttribute('data-still', 'true');
});

test('successful outfit changes react and keep accessories on the character', async ({ page }) => {
  const payload = await setup(page);
  await page.route('**/api/capybara/outfit', async (route) => {
    payload.equipped = route.request().postDataJSON().equipped;
    await route.fulfill({ json: { capybara: payload } });
  });
  await page.goto('/7hk9ho#capybara');
  const scarf = page.locator('.pc-capy-item').filter({ hasText: 'Striped scarf' });
  await scarf.click();
  await expect(scarf).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pc-companion')).toHaveAttribute('data-expression', 'playful');
  await expect(page.locator('.pc-capy-worn')).toBeVisible();
  await expect(page.locator('.pc-companion').getByRole('status')).toContainText('New outfit');
});

test('a failed outfit change does not celebrate or leave an unearned accessory equipped', async ({ page }) => {
  await setup(page);
  await page.route('**/api/capybara/outfit', (route) => route.fulfill({ status: 503, json: { message: 'Unavailable' } }));
  await page.goto('/7hk9ho#capybara');
  const scarf = page.locator('.pc-capy-item').filter({ hasText: 'Striped scarf' });
  await scarf.click();
  await expect(scarf).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.pc-companion')).toHaveAttribute('data-expression', 'idle');
  await expect(page.locator('.pc-capy-worn')).toHaveCount(0);
});

test('an unavailable expression image keeps the original character visible', async ({ page }) => {
  await setup(page);
  await page.route('**/*snack*.webp', (route) => route.abort());
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  await companion.getByRole('button', { name: 'Little snack', exact: true }).click();
  await expect(companion).toHaveAttribute('data-expression', 'snack');
  await expect(companion.locator('.pc-capy-expressions')).toHaveAttribute('data-visible-expression', 'idle');
  await expect(companion.getByRole('status')).toContainText('Crunch');
  expect(await companion.locator('img.is-visible').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('the largest growth stage keeps its head and feet inside the interaction area on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const payload = await setup(page);
  payload.xp = capyXpForLevel(30);
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  await expect(companion).toHaveAttribute('data-stage', 'legend');
  await companion.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(companion.locator('.pc-capy-expressions')).toHaveAttribute('data-visible-expression', 'playful');
  const image = (await companion.locator('img.is-visible').boundingBox())!;
  const scene = (await companion.locator('.pc-companion-scene').boundingBox())!;
  const actions = (await companion.locator('.pc-companion-actions').boundingBox())!;
  expect(image.y).toBeGreaterThanOrEqual(scene.y);
  expect(image.y + image.height).toBeLessThanOrEqual(actions.y);
  expect(await companion.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test.describe('touch interaction', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('tap can feed, put to sleep and wake Capy without hover movement', async ({ page }) => {
    await setup(page);
    await page.goto('/7hk9ho#capybara');
    const companion = page.locator('.pc-companion');
    await companion.getByRole('button', { name: 'Little snack', exact: true }).tap();
    await expect(companion).toHaveAttribute('data-expression', 'snack');
    await companion.getByRole('button', { name: 'Nap time', exact: true }).tap();
    await expect(companion).toHaveAttribute('data-expression', 'sleepy');
    await companion.getByRole('button', { name: 'Wake the capybara', exact: true }).tap();
    await expect(companion).toHaveAttribute('data-expression', 'happy');
    expect(await companion.locator('.pc-companion-follow').evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  });
});

async function motionFrame(page: Page) {
  return page.locator('.pc-companion canvas').evaluate((canvas: HTMLCanvasElement) => new Promise<{ hash: number; pixels: number; top: number; bottom: number }>((resolve) => {
    requestAnimationFrame(() => {
      const gl = canvas.getContext('webgl')!;
      const bytes = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      let hash = 2166136261, pixels = 0, top = canvas.height, bottom = 0;
      for (let index = 0; index < bytes.length; index += 4) {
        if (bytes[index + 3] > 64) {
          pixels++;
          const row = canvas.height - 1 - Math.floor(index / 4 / canvas.width);
          top = Math.min(top, row); bottom = Math.max(bottom, row);
        }
        hash = Math.imul(hash ^ bytes[index], 16777619) >>> 0;
      }
      resolve({ hash, pixels, top, bottom });
    });
  }));
}

test('the rig renders changing frames for each action, including breathing during a nap', async ({ page }) => {
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  await expect(companion.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
  for (const name of ['Head pat', 'Little snack', 'Play', 'Nap time', 'Wake up']) {
    await companion.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(400);
    const first = await motionFrame(page);
    await page.waitForTimeout(300);
    const second = await motionFrame(page);
    expect(first.pixels).toBeGreaterThan(100_000);
    expect(second.pixels).toBeGreaterThan(100_000);
    expect(first.hash).not.toBe(second.hash);
    expect(second.top).toBeGreaterThan(0);
    expect(second.bottom).toBeLessThan(964);
  }
});

test('pause, reduced motion, background tabs and offscreen characters stop GPU draws', async ({ page }) => {
  await page.addInitScript(() => {
    const draw = WebGLRenderingContext.prototype.drawElements;
    (window as any).capyDraws = 0;
    WebGLRenderingContext.prototype.drawElements = function (...args) {
      (window as any).capyDraws++;
      return draw.apply(this, args);
    };
  });
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  const draws = () => page.evaluate(() => (window as any).capyDraws as number);
  const stopped = async () => {
    await page.waitForTimeout(100);
    const count = await draws();
    await page.waitForTimeout(250);
    expect(await draws()).toBe(count);
  };
  await expect(companion.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
  await companion.getByRole('button', { name: 'Pause motion', exact: true }).click();
  await stopped();
  await expect(companion.locator('.pc-capy-expressions')).toHaveCSS('opacity', '1');
  await companion.getByRole('button', { name: 'Resume motion', exact: true }).click();
  const count = await draws();
  await expect.poll(draws).toBeGreaterThan(count);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stopped();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await stopped();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  const before = await draws();
  await expect.poll(draws).toBeGreaterThan(before);
  await page.locator('.pc-capy-item').last().scrollIntoViewIfNeeded();
  await stopped();
  await companion.scrollIntoViewIfNeeded();
  const scrolled = await draws();
  await expect.poll(draws).toBeGreaterThan(scrolled);
});

test('a lost graphics context falls back to the image and resumes after restoration', async ({ page }) => {
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const art = page.locator('.pc-capy-motion');
  await expect(art).toHaveAttribute('data-ready', 'true');
  await art.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const extension = canvas.getContext('webgl')!.getExtension('WEBGL_lose_context')!;
    (window as any).restoreCapy = () => extension.restoreContext();
    extension.loseContext();
  });
  await expect(art).toHaveAttribute('data-ready', 'false');
  await expect(art.locator('.pc-capy-expressions')).toHaveCSS('opacity', '1');
  await page.waitForTimeout(150);
  await page.evaluate(() => (window as any).restoreCapy());
  await expect(art).toHaveAttribute('data-ready', 'true');
  expect((await motionFrame(page)).pixels).toBeGreaterThan(100_000);
});

test('an unsupported graphics device keeps the interactive static artwork', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
      return type === 'webgl' ? null : getContext.call(this, type as any, ...args);
    } as typeof getContext;
  });
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  await companion.getByRole('button', { name: 'Little snack', exact: true }).click();
  await expect(companion.locator('.pc-capy-expressions')).toHaveAttribute('data-visible-expression', 'snack');
  await expect(companion.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'false');
  await expect(companion.locator('.pc-capy-expressions')).toHaveCSS('opacity', '1');
});

test('animated outfits share the rig and the static outfit returns when paused', async ({ page }) => {
  const payload = await setup(page);
  payload.equipped = ['scarf'];
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  await expect(companion.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
  await expect(companion.locator('.pc-capy-worn')).toHaveCSS('visibility', 'hidden');
  expect((await motionFrame(page)).pixels).toBeGreaterThan(100_000);
  await companion.getByRole('button', { name: 'Pause motion', exact: true }).click();
  await expect(companion.locator('.pc-capy-worn')).toHaveCSS('visibility', 'visible');
  await expect(companion.locator('.pc-capy-worn image')).toHaveCount(1);
});

test('a fully grown animated Capy has room to hop on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  const payload = await setup(page);
  payload.xp = capyXpForLevel(30);
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  await expect(companion.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
  await companion.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(550);
  const pixels = await motionFrame(page);
  const canvas = (await companion.locator('canvas').boundingBox())!;
  const scene = (await companion.locator('.pc-companion-scene').boundingBox())!;
  const actions = (await companion.locator('.pc-companion-actions').boundingBox())!;
  expect(canvas.y + pixels.top / 965 * canvas.height).toBeGreaterThanOrEqual(scene.y);
  expect(canvas.y + pixels.bottom / 965 * canvas.height).toBeLessThan(actions.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
