import { expect, test, type Page } from '@playwright/test';
import { capyXpForLevel, emptyCapyPayload } from '../shared/capybara';
test.use({ serviceWorkers: 'block' });
async function setup(page: Page, language = 'en') {
  const payload = { ...emptyCapyPayload(), xp: capyXpForLevel(8), createdAt: new Date().toISOString() };
  await page.addInitScript(l => localStorage.setItem('picolah.language', l), language);
  await page.route('**/api/auth/me', r => r.fulfill({ json: { user: null, required: false } }));
  await page.route('**/api/capybara', r => r.fulfill({ json: { capybara: payload } }));
  return payload;
}
async function room(page: Page) {
  await page.goto('/7hk9ho#capybara', { waitUntil: 'domcontentloaded' }); const room = page.locator('.pc-companion.is-room');
  // The first frame sheet is decoded lazily.
  await expect(room).toHaveAttribute('data-renderer', 'frames', { timeout: 15000 }); return room;
}
async function play(page: Page, game: string) {
  await page.locator('.pc-room-dock-button.is-play').click(); await page.locator(`[data-game-choice="${game}"]`).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.pc-play-canvas')).toHaveAttribute('data-mode', game);
}

test('bag-free artwork follows meals, petting, toys and a persistent nap', async ({ page }, info) => {
  test.slow(); // Five full action transitions.
  await setup(page); const companion = await room(page), canvas = companion.locator('canvas');
  await expect(canvas).toHaveAttribute('data-art-state', 'idle');
  const idle = await canvas.getAttribute('data-source');
  for (const [name, variant] of [['Little snack', 'snack'], ['Pet the capybara', 'wave'], ['Nap time', 'sleep']]) {
    await companion.getByRole('button', { name, exact: true }).click();
    await expect(canvas).toHaveAttribute('data-art-state', variant);
    expect(await canvas.getAttribute('data-source')).not.toBe(idle);
    await page.waitForTimeout(250); await companion.screenshot({ path: info.outputPath(`${variant}.png`) });
  }
  await page.waitForTimeout(4500); await expect(canvas).toHaveAttribute('data-art-state', 'sleep');
  await companion.getByRole('button', { name: 'Wake up', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-art-state', 'wave');
  await play(page, 'bubbles'); await expect(canvas).toHaveAttribute('data-art-state', 'reach');
  await play(page, 'dance'); await expect(canvas).toHaveAttribute('data-art-state', 'wave');
  await companion.getByRole('button', { name: 'Put the toy away', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-source', idle!);
});

test('a delayed earlier pose cannot replace a later action', async ({ page }) => {
  test.slow();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/reach-*.webp', async route => { await held; await route.continue(); });
  try {
    await setup(page); const companion = await room(page), canvas = companion.locator('canvas');
    await play(page, 'bubbles');
    await companion.getByRole('button', { name: 'Nap time', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-art-state', 'sleep');
    release(); await page.waitForTimeout(500);
    await expect(canvas).toHaveAttribute('data-art-state', 'sleep');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
  } finally { release(); }
});

test('petting, meals and a persistent nap animate without changing shopping progress', async ({ page }) => {
  test.slow(); // Several complete animated interactions.
  await setup(page); const writes: string[] = [];
  page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/api/')) writes.push(r.url()); });
  const companion = await room(page), canvas = companion.locator('canvas');
  const xp = await companion.getByRole('progressbar').getAttribute('aria-valuenow');
  for (const [name, action] of [['Pet the capybara', 'pet'], ['Little snack', 'feed'], ['Nap time', 'rest']]) {
    await companion.getByRole('button', { name, exact: true }).click(); await expect(canvas).toHaveAttribute('data-action', action);
    const before = await canvas.screenshot(); await page.waitForTimeout(400); expect((await canvas.screenshot()).equals(before)).toBe(false);
  }
  await page.waitForTimeout(4500); await expect(companion).toHaveAttribute('data-action', 'rest');
  await companion.getByRole('button', { name: 'Wake the capybara', exact: true }).click();
  await expect(companion).toHaveAttribute('data-action', 'wake'); await expect(companion).toHaveAttribute('data-night', 'false');
  await expect(companion.getByRole('progressbar')).toHaveAttribute('aria-valuenow', xp!); expect(writes.every(url => url.endsWith('/api/capybara/room'))).toBe(true);
});

for (const width of [1440, 390, 320]) test(`home and four physical toys work at ${width}px`, async ({ page }, info) => {
  test.slow(); // Four physical games and screenshots share this test's budget.
  await page.setViewportSize({ width, height: width === 320 ? 568 : 900 }); await setup(page, width === 390 ? 'zh' : 'en');
  await page.goto('/7hk9ho#home'); const home = page.locator('.pc-companion');
  await home.locator('.pc-companion-touch').click(); await expect(home.locator('.pc-capy-expressions')).toHaveAttribute('data-visible-expression', 'happy');
  await home.locator('.pc-companion-explore').click(); const companion = page.locator('.pc-companion.is-room'), canvas = companion.locator('canvas');
  await expect(companion).toHaveAttribute('data-renderer', 'frames', { timeout: 15000 }); await expect(companion.locator('.pc-capy-live')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-character', 'original-image');
  await expect(canvas).toHaveAttribute('data-art-state', 'idle');
  await expect(canvas).toHaveAttribute('data-engine', 'canvas2d-sequence');
  expect(await canvas.evaluate(c => (c as HTMLCanvasElement).getContext('webgl2'))).toBeNull();
  for (const mode of ['ball', 'bubbles', 'swing', 'dance']) {
    await play(page, mode); const before = await canvas.screenshot(); await page.waitForTimeout(450); expect((await canvas.screenshot()).equals(before)).toBe(false);
    if (mode === 'ball' || mode === 'bubbles') await expect.poll(async () => Number(await canvas.getAttribute('data-contacts')), { timeout: 12000 }).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dock = (await companion.locator('.pc-room-dock').boundingBox())!, scene = (await canvas.boundingBox())!;
    expect(scene.y + scene.height).toBeLessThanOrEqual(dock.y + 1); await companion.screenshot({ path: info.outputPath(`${mode}-${width}.png`) });
  }
  expect(Number(await canvas.getAttribute('data-cache-size'))).toBeLessThanOrEqual(3);
});

test('switching toys, feeding and putting toys away interrupt the previous activity', async ({ page }) => {
  await setup(page); const companion = await room(page), canvas = companion.locator('canvas'); await play(page, 'ball');
  await expect.poll(async () => Number(await canvas.getAttribute('data-contacts')), { timeout: 10000 }).toBeGreaterThan(0);
  await play(page, 'swing'); await expect(canvas).toHaveAttribute('data-contacts', '0');
  await companion.locator('.pc-play-controls').getByRole('button', { name: 'Give a push', exact: true }).click();
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-swing-angle'))), { timeout: 10000 }).toBeGreaterThan(0.03);
  await companion.getByRole('button', { name: 'Little snack', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-mode', 'idle'); await expect(canvas).toHaveAttribute('data-action', 'feed'); await expect(companion.locator('.pc-play-controls')).toHaveCount(0);
  await play(page, 'bubbles'); await companion.getByRole('button', { name: 'Put the toy away', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-mode', 'idle'); await expect(canvas).toHaveAttribute('data-contacts', '0');
});

test('pause, reduced motion, background tabs and dialogs stop canvas draws', async ({ page }) => {
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage; (window as any).capyDraws = 0;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) { (window as any).capyDraws++; return draw.apply(this, args); };
  });
  await setup(page); const companion = await room(page);
  const draws = () => page.evaluate(() => (window as any).capyDraws as number);
  const stopped = async () => { await page.waitForTimeout(150); const n = await draws(); await page.waitForTimeout(350); expect(await draws()).toBe(n); };
  await play(page, 'ball'); await companion.getByRole('button', { name: 'Pause motion', exact: true }).click(); await stopped();
  await expect(companion.locator('.pc-play-canvas-button')).toBeDisabled(); await companion.getByRole('button', { name: 'Resume motion', exact: true }).click();
  const n = await draws(); await expect.poll(draws).toBeGreaterThan(n);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await stopped(); await play(page, 'bubbles'); await stopped();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }); await stopped();
  await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: "Open Capy's diary", exact: true }).click(); await stopped(); await page.keyboard.press('Escape');
  await page.locator('.pc-room-dock-button.is-play').click(); await stopped(); await page.keyboard.press('Escape');
  const resumed = await draws(); await expect.poll(draws).toBeGreaterThan(resumed);
});

test('keyboard toy selection traps and restores focus with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await setup(page); await room(page);
  const trigger = page.locator('.pc-room-dock-button.is-play'); await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog'); expect(await dialog.evaluate(e => parseFloat(getComputedStyle(e).transitionDuration))).toBeLessThan(0.001); await expect(page.locator('[data-game-choice]')).toHaveCount(4);
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); await expect.poll(() => dialog.evaluate(e => e.contains(document.activeElement))).toBe(true); }
  await page.locator('[data-game-choice="ball"]').focus(); await page.keyboard.press('Enter'); await expect(trigger).toBeFocused();
  const canvas = page.locator('.pc-play-canvas'); await expect(canvas).toHaveAttribute('data-loading', 'false'); const before = await canvas.getAttribute('data-frames'); await page.waitForTimeout(350); expect(await canvas.getAttribute('data-frames')).toBe(before);
  await page.locator('.pc-play-controls').getByRole('button', { name: 'Toss again', exact: true }).focus(); await page.keyboard.press('Enter');
  expect(Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(Number(before)); await expect(canvas).toHaveAttribute('data-running', 'false');
});

test('outfit saves react and failed saves roll back the worn accessory', async ({ page }) => {
  const payload = await setup(page); let fail = false;
  await page.route('**/api/capybara/outfit', async r => { if (fail) return r.fulfill({ status: 503, json: { message: 'Unavailable' } }); payload.equipped = r.request().postDataJSON().equipped; await r.fulfill({ json: { capybara: payload } }); });
  const companion = await room(page);
  await page.getByRole('button', { name: 'Dress up Capy', exact: true }).click(); await page.getByRole('button', { name: 'Accessories', exact: true }).click();
  const scarf = page.locator('.pc-capy-item').filter({ hasText: 'Striped scarf' }); await scarf.click(); await expect(scarf).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click(); await expect(companion.locator('canvas')).toHaveAttribute('data-worn', 'scarf'); await expect(companion.getByRole('status')).toContainText('New outfit');
  fail = true; await page.getByRole('button', { name: 'Dress up Capy', exact: true }).click(); await page.getByRole('button', { name: 'Accessories', exact: true }).click();
  await scarf.click(); await expect(scarf).toBeEnabled(); await expect(scarf).toHaveAttribute('aria-pressed', 'true'); await expect(companion.locator('canvas')).toHaveAttribute('data-worn', 'scarf');
});

test.describe('touch interaction', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('tap feeds, sleeps, wakes and plays without hover transforms', async ({ page }) => {
    await setup(page); const companion = await room(page);
    for (const [name, action] of [['Little snack', 'feed'], ['Nap time', 'rest'], ['Wake the capybara', 'wake']]) { await companion.getByRole('button', { name, exact: true }).tap(); await expect(companion).toHaveAttribute('data-action', action); }
    await play(page, 'ball'); await companion.locator('.pc-play-canvas-button').tap(); await expect.poll(async () => Number(await companion.locator('canvas').getAttribute('data-contacts')), { timeout: 10000 }).toBeGreaterThan(0);
    expect(await companion.locator('.pc-play-canvas-button').evaluate(e => getComputedStyle(e).transform)).toBe('none');
  });
});

test('furniture and lights interrupt play, feed and wake the character', async ({ page }) => {
  await setup(page); const companion = await room(page); await play(page, 'ball');
  await companion.getByRole('button', { name: 'Feed Capy at the snack table', exact: true }).click(); await expect(companion).toHaveAttribute('data-action', 'feed');
  await companion.getByRole('button', { name: 'Switch to evening', exact: true }).click(); await expect(companion).toHaveAttribute('data-night', 'true');
  await companion.getByRole('button', { name: 'Turn on daylight', exact: true }).click(); await expect(companion).toHaveAttribute('data-night', 'false');
  await companion.getByRole('button', { name: 'Rest at the little bed', exact: true }).click(); await expect(companion).toHaveAttribute('data-night', 'true');
  await companion.getByRole('button', { name: 'Turn on daylight', exact: true }).click(); await expect(companion).toHaveAttribute('data-night', 'false'); await expect(companion).toHaveAttribute('data-action', 'wake');
});

test('wardrobe tabs support arrows, home and end and restore furniture focus', async ({ page }) => {
  await setup(page); await room(page); await page.getByRole('button', { name: 'Open the wardrobe', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Wardrobe', exact: true })).toBeFocused(); await page.keyboard.press('ArrowRight'); await expect(page.getByRole('tabpanel', { name: 'Growing up', exact: true })).toBeVisible();
  await page.keyboard.press('End'); await expect(page.getByRole('tabpanel', { name: 'Keepsakes', exact: true })).toBeVisible(); await page.keyboard.press('Home'); await expect(page.getByRole('tabpanel', { name: 'Wardrobe', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click(); await expect(page.getByRole('button', { name: 'Open the wardrobe', exact: true })).toBeFocused();
});

test('a missing portrait background falls back while play stays available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page); await page.route('**/*room-mobile*.webp', r => r.abort()); await room(page);
  await expect.poll(() => page.locator('.pc-room-background img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1536);
  await play(page, 'ball'); await expect(page.locator('.pc-play-canvas')).toHaveAttribute('data-ready', 'true');
});

for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) test(`five room icons contain dialogs and restore focus at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await setup(page); await room(page); const dock = page.locator('.pc-room-dock'); await expect(dock.getByRole('button')).toHaveCount(5);
  const box = (await dock.boundingBox())!; expect(box.y + box.height).toBeLessThanOrEqual(height);
  for (const b of await dock.getByRole('button').all()) { const bounds = (await b.boundingBox())!; expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44); }
  const growth = page.getByRole('button', { name: "See Capy's growth, level 8", exact: true }); await growth.click(); await expect(page.getByRole('tabpanel', { name: 'Growing up', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await expect(growth).toBeFocused();
  const wardrobe = page.getByRole('button', { name: 'Dress up Capy', exact: true }); await wardrobe.focus(); await page.keyboard.press('Enter'); const dialog = page.getByRole('dialog'); await expect(dialog).toHaveCSS('transition-duration', '0s');
  for (let i = 0; i < 12; i++) { await page.keyboard.press(i % 3 === 0 ? 'Shift+Tab' : 'Tab'); await expect.poll(() => dialog.evaluate(e => e.contains(document.activeElement))).toBe(true); }
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click(); await expect(wardrobe).toBeFocused();
  const journal = page.getByRole('button', { name: "Open Capy's diary", exact: true }); await journal.click(); await expect(page.getByRole('tabpanel', { name: 'Diary', exact: true })).toBeVisible(); await page.mouse.click(3, 3); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(journal).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('wardrobe and toy box scroll with a reachable close button on short landscape screens', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await setup(page); await room(page);
  await page.getByRole('button', { name: 'Dress up Capy', exact: true }).click(); await page.locator('.pc-capy-item').last().scrollIntoViewIfNeeded(); await expect(page.locator('.pc-capy-item').last()).toBeInViewport();
  const close = page.getByRole('button', { name: 'Back to Capy', exact: true }); await expect(close).toBeInViewport(); await close.click();
  await page.locator('.pc-room-dock-button.is-play').click(); await page.locator('[data-game-choice="dance"]').scrollIntoViewIfNeeded(); await expect(page.locator('[data-game-choice="dance"]')).toBeInViewport(); await expect(close).toBeInViewport(); await close.click(); await expect(page.getByRole('dialog')).toHaveCount(0);
});
