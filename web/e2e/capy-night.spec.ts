import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { capyXpForLevel, emptyCapyPayload } from '../shared/capybara';
import { EMPTY_CAPY_ROOM } from '../shared/capy-room';

test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Shanghai' });

async function setup(page: Page, hour = 12, dressed = false) {
  await page.clock.setFixedTime(new Date(`2026-11-02T${String(hour).padStart(2, '0')}:00:00+08:00`));
  await page.addInitScript(id => { localStorage.setItem('picolah.userId', id); localStorage.setItem('picolah.language', 'en'); }, `night-e2e-${randomUUID()}`);
  const payload = { ...emptyCapyPayload(), xp: capyXpForLevel(8), equipped: dressed ? ['star-pajamas'] : [] };
  await page.route('**/api/auth/me', r => r.fulfill({ json: { user: null, required: false } }));
  await page.route('**/api/capybara', r => r.fulfill({ json: { capybara: payload } }));
  let saved = { ...EMPTY_CAPY_ROOM };
  await page.route('**/api/capybara/room', async r => {
    if (r.request().method() === 'PATCH') saved = { ...saved, ...r.request().postDataJSON().changes, revision: saved.revision + 1, updatedAt: await page.evaluate(() => new Date().toISOString()) };
    await r.fulfill({ json: { room: saved } });
  });
  return () => saved;
}
async function clock(page: Page, time: string) {
  await page.clock.setFixedTime(new Date(time));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test('night sleep and manual wake survive navigation, midnight and reload; the next night resets', async ({ page }) => {
  const saved = await setup(page, 23);
  await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room');
  await expect(room).toHaveAttribute('data-action', 'rest');
  await expect.poll(() => saved().sleeping).toBe(true);
  await room.getByRole('button', { name: 'Wake the capybara', exact: true }).click();
  await expect.poll(() => saved().sleeping).toBe(false);
  await page.locator('.pc-nav').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('.pc-nav').getByRole('button', { name: 'Growth', exact: true }).click();
  await expect(room).toHaveAttribute('data-action', 'idle');
  await clock(page, '2026-11-03T00:30:00+08:00');
  await page.reload(); await expect(room).toHaveAttribute('data-action', 'idle');
  await clock(page, '2026-11-03T22:00:00+08:00');
  await expect(room).toHaveAttribute('data-action', 'rest');
  await expect.poll(() => saved().sleeping).toBe(true);
});

test('an open page follows device time at bedtime and in the morning', async ({ page }) => {
  await setup(page, 21); await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room');
  await expect(room).toHaveAttribute('data-action', 'idle');
  await clock(page, '2026-11-02T22:00:00+08:00');
  await expect(room).toHaveAttribute('data-action', 'rest');
  await expect(room).toHaveAttribute('data-sync', 'saved');
  await clock(page, '2026-11-03T07:00:00+08:00');
  await expect(room).toHaveAttribute('data-action', 'wake');
  await expect(room).toHaveAttribute('data-night', 'false');
});

test('an early interaction wins over night sleep while the session is still loading', async ({ page }) => {
  await setup(page, 23);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/me', async r => { await held; await r.fulfill({ json: { user: null, required: false } }); });
  try {
    await page.goto('/7hk9ho#capybara');
    const room = page.locator('.pc-companion.is-room');
    await room.getByRole('button', { name: 'Pet the capybara', exact: true }).click();
    const loaded = page.waitForResponse('**/api/capybara/room'); release(); await loaded;
    await page.waitForTimeout(100); await expect(room).toHaveAttribute('data-action', 'pet');
    await page.waitForTimeout(4300); await expect(room).toHaveAttribute('data-action', 'idle');
  } finally { release(); }
});

for (const width of [1440, 390]) test(`clothed hands and expressions follow every action at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await setup(page, 12, true);
  await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room'), canvas = room.locator('canvas');
  await expect(canvas).toHaveAttribute('data-clip', 'dressed-star-pajamas');
  for (const [button, clip, face] of [['Pet the capybara', 'pet', 'happy'], ['Little snack', 'feed', 'snack'], ['Nap time', 'rest', 'sleepy'], ['Wake up', 'wake', 'happy']]) {
    await room.getByRole('button', { name: button, exact: true }).click();
    await expect(canvas).toHaveAttribute('data-clip', `dressed-star-pajamas-${clip}`);
    await expect(room).toHaveAttribute('data-expression', face);
    await expect(canvas).toHaveAttribute('data-animation', 'sequence');
    await expect(canvas).toHaveAttribute('data-clothing', 'star-pajamas');
    await page.waitForTimeout(300); await room.screenshot({ path: info.outputPath(`${clip}-${width}.png`) });
  }
  await room.getByRole('button', { name: 'Nap time', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-clip', 'dressed-star-pajamas-rest');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(canvas).toHaveAttribute('data-running', 'false');
  const frames = await canvas.getAttribute('data-frames'); await page.waitForTimeout(250);
  expect(await canvas.getAttribute('data-frames')).toBe(frames);
  expect(Number(await canvas.getAttribute('data-cache-size'))).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a slow wake atlas does not consume the gesture before it can be seen', async ({ page }) => {
  await setup(page, 23, true);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/dressed-star-pajamas-wake-*.webp', async r => { await held; await r.continue(); });
  try {
    await page.goto('/7hk9ho#capybara');
    const room = page.locator('.pc-companion.is-room'), canvas = room.locator('canvas');
    await expect(canvas).toHaveAttribute('data-clip', 'dressed-star-pajamas-rest');
    await room.getByRole('button', { name: 'Wake up', exact: true }).click();
    await page.waitForTimeout(4500);
    await expect(room).toHaveAttribute('data-action', 'wake');
    release(); await expect(canvas).toHaveAttribute('data-clip', 'dressed-star-pajamas-wake');
    await page.waitForTimeout(500); await expect(room).toHaveAttribute('data-action', 'wake');
  } finally { release(); }
});

test('a missing clothed sleep sequence keeps its sleeping face and can still wake', async ({ page }, info) => {
  await setup(page, 23, true);
  await page.route('**/assets/dressed-star-pajamas-rest-*.webp', r => r.abort());
  await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room'), canvas = room.locator('canvas');
  await expect(canvas).toHaveAttribute('data-clip', 'poster:dressed-star-pajamas-rest');
  await expect(canvas).toHaveAttribute('data-animation', 'poster');
  await expect(room).toHaveAttribute('data-expression', 'sleepy');
  await room.screenshot({ path: info.outputPath('sleep-fallback.png') });
  await room.getByRole('button', { name: 'Wake up', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-clip', 'dressed-star-pajamas-wake');
});
