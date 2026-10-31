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
  await expect(page.locator('.pc-capy-worn')).toHaveCount(1);
  await expect(page.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
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

test('awake actions render changing frames and the curled sleeping pose breathes', async ({ page }) => {
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const companion = page.locator('.pc-companion');
  await expect(companion.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
  for (const name of ['Head pat', 'Little snack', 'Play']) {
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
  await companion.getByRole('button', { name: 'Nap time', exact: true }).click();
  await expect(companion).toHaveAttribute('data-napping', 'true');
  const nap = companion.locator('.pc-room-nap img');
  const before = (await nap.boundingBox())!.height;
  await page.waitForTimeout(450);
  expect(Math.abs((await nap.boundingBox())!.height - before)).toBeGreaterThan(0.01);
  await expect(companion.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'false');
  await companion.getByRole('button', { name: 'Wake up', exact: true }).click();
  await expect(companion).toHaveAttribute('data-napping', 'false');
  await expect(companion.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
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
  await page.setViewportSize({ width: 390, height: 700 });
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

test('room furniture triggers meals, play, bedtime and waking without granting XP', async ({ page }) => {
  await setup(page);
  const writes: string[] = [];
  page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/api/')) writes.push(request.url()); });
  await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room');
  const xp = await room.getByRole('progressbar').getAttribute('aria-valuenow');
  await room.getByRole('button', { name: 'Feed Capy at the snack table', exact: true }).click();
  await expect(room).toHaveAttribute('data-action', 'feed');
  await room.getByRole('button', { name: 'Play with the ball', exact: true }).click();
  await expect(room).toHaveAttribute('data-action', 'play');
  await expect(room.locator('.pc-room-ball')).toHaveCSS('animation-name', 'pc-room-ball-hop');
  await room.getByRole('button', { name: 'Rest at the little bed', exact: true }).click();
  await expect(room).toHaveAttribute('data-night', 'true');
  await expect(room).toHaveAttribute('data-napping', 'true');
  await expect(room.locator('.pc-room-nap img')).toBeVisible();
  await expect(room.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'false');
  await room.getByRole('button', { name: 'Wake Capy at the bed', exact: true }).click();
  await expect(room).toHaveAttribute('data-night', 'false');
  await expect(room).toHaveAttribute('data-napping', 'false');
  await expect(room).toHaveAttribute('data-action', 'wake');
  await expect(room.getByRole('progressbar')).toHaveAttribute('aria-valuenow', xp!);
  expect(writes).toEqual([]);
});

test('the room light can be changed independently and daylight wakes a sleeping Capy', async ({ page }) => {
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room');
  await room.getByRole('button', { name: 'Switch to evening', exact: true }).click();
  await expect(room).toHaveAttribute('data-night', 'true');
  await expect(room).toHaveAttribute('data-action', 'idle');
  await room.getByRole('button', { name: 'Turn on daylight', exact: true }).click();
  await expect(room).toHaveAttribute('data-night', 'false');
  await room.getByRole('button', { name: 'Rest at the little bed', exact: true }).click();
  await room.getByRole('button', { name: 'Turn on daylight', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(room).toHaveAttribute('data-night', 'false');
  await expect(room).toHaveAttribute('data-action', 'wake');
  await expect(room).toHaveAttribute('data-still', 'true');
});

test('the wardrobe furniture and journal tabs support focus, arrows, home and end', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  await page.getByRole('button', { name: 'Open the wardrobe', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Wardrobe', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Growing up', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Growing up', exact: true })).toBeVisible();
  await expect(page.locator('#capy-panel-wardrobe')).toBeHidden();
  await page.keyboard.press('End');
  await expect(page.getByRole('tabpanel', { name: 'Keepsakes', exact: true })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tabpanel', { name: 'Wardrobe', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click();
  await expect(page.locator('.pc-capy-room-stage')).toBeFocused();
  await expect(page.locator('.pc-companion-touch')).toBeInViewport();
});

test('mobile uses the portrait room and the character retains its square canvas layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room');
  await expect(room.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
  const background = await room.locator('.pc-room-background img').evaluate((img: HTMLImageElement) => ({ width: img.naturalWidth, height: img.naturalHeight }));
  expect(background).toEqual({ width: 1024, height: 1536 });
  const avatar = (await room.locator('.pc-capy-live').boundingBox())!;
  const scene = (await room.locator('.pc-companion-scene').boundingBox())!;
  expect(Math.abs(avatar.width - avatar.height)).toBeLessThan(1);
  expect(avatar.y + avatar.height).toBeLessThan(scene.y + scene.height);
  for (const name of ['Feed Capy at the snack table', 'Rest at the little bed', 'Open the wardrobe', 'Play with the ball']) {
    const button = room.getByRole('button', { name, exact: true });
    await expect(button).toBeInViewport();
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
});

test('a missing portrait plate falls back to the landscape room', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.route('**/*room-mobile*.webp', (route) => route.abort());
  await page.goto('/7hk9ho#capybara');
  const background = page.locator('.pc-room-background img');
  await expect.poll(() => background.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1536);
  await expect(background).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Feed Capy at the snack table', exact: true }).click();
  await expect(page.locator('.pc-companion')).toHaveAttribute('data-action', 'feed');
});

test('a missing resting pose keeps the original sleepy character visible', async ({ page }) => {
  await setup(page);
  await page.route('**/*capy-nap*.webp', (route) => route.abort());
  await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room');
  await room.getByRole('button', { name: 'Rest at the little bed', exact: true }).click();
  await expect(room).toHaveAttribute('data-night', 'true');
  await expect(room).toHaveAttribute('data-napping', 'false');
  await expect(room.locator('.pc-companion-follow')).toHaveCSS('opacity', '1');
  await expect(room.locator('.pc-capy-expressions')).toHaveAttribute('data-visible-expression', 'sleepy');
  await expect(room.locator('.pc-capy-motion')).toHaveAttribute('data-ready', 'true');
});

test('reduced motion keeps furniture and character hit targets in their layout positions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room');
  const bed = room.getByRole('button', { name: 'Rest at the little bed', exact: true });
  const before = (await bed.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  const pressed = (await bed.boundingBox())!;
  expect(pressed.x).toBeCloseTo(before.x, 1);
  expect(pressed.y).toBeCloseTo(before.y, 1);
  await page.mouse.up();
  await expect(room).toHaveAttribute('data-napping', 'true');
  await room.getByRole('button', { name: 'Wake the capybara', exact: true }).click();
  await expect(room).toHaveAttribute('data-napping', 'false');
  await room.getByRole('button', { name: 'Feed Capy at the snack table', exact: true }).click();
  await expect(room).toHaveAttribute('data-action', 'feed');
  await room.getByRole('button', { name: 'Play with the ball', exact: true }).click();
  await expect(room).toHaveAttribute('data-action', 'play');
  await room.getByRole('button', { name: 'Open the wardrobe', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Wardrobe', exact: true })).toBeFocused();
});
