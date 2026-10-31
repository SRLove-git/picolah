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
