import { expect, test, type Page } from '@playwright/test';

const user = { id: 'a'.repeat(32), email: 'member@example.com', displayName: 'Picolah Member', avatar: '' };
const now = new Date().toISOString();
const activity = {
  recent: [
    { id: 'comparison-phone', type: 'comparison', titleZh: 'Apple iPhone 18 Pro 等 3 款', titleEn: 'Apple iPhone 18 Pro and 2 more', market: 'SG', createdAt: now },
    { id: 'merchant-headphones', type: 'offer_click', titleZh: 'Shopee · Sony WH-CH720N', titleEn: 'Shopee · Sony WH-CH720N', market: 'MY', createdAt: now },
    { id: 'long-title', type: 'comparison', titleZh: '商品'.repeat(40), titleEn: 'VeryLongProductNameWithoutAnySpaces'.repeat(4), market: 'SG', createdAt: now },
  ],
};

async function setup(page: Page, signedIn = true) {
  await page.addInitScript(() => localStorage.setItem('picolah.language', 'en'));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: signedIn ? user : null, required: false } }));
  await page.route('**/api/profile', (route) => route.fulfill({ json: { profile: activity } }));
}

for (const width of [1440, 390, 320]) {
  test(`account activity is readable without mascot placeholders at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page);
    await page.goto('/7hk9ho#account');
    const account = page.getByRole('region', { name: 'Your space' });
    await expect(account.locator('.account-post')).toHaveCount(3);
    await expect(account.locator('.pc-capy')).toHaveCount(0);
    await expect(account.getByText('A little Pico', { exact: true })).toHaveCount(0);
    await expect(account.locator('.account-post').nth(1)).toContainText('Merchant visit');
    await expect(account.locator('.account-post').nth(1)).toContainText('Malaysia');
    await expect(account.locator('.account-post').first()).toContainText('Singapore');
    await expect(account.locator('.account-avatar-default')).toBeVisible();
    expect(await account.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`account-${width}.png`), fullPage: true });
    const history = account.getByRole('tab', { name: 'History' });
    await history.focus();
    await page.keyboard.press('ArrowRight');
    await expect(account.getByRole('tab', { name: 'Settings' })).toBeFocused();
    await expect(account.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
  });
}

test('guest avatar upload opens sign-in instead of an unusable file picker', async ({ page }) => {
  await setup(page, false);
  await page.goto('/7hk9ho#account');
  await page.getByRole('button', { name: 'Upload avatar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.account-avatar-input')).toBeDisabled();
});

test('failed history fetch can be retried and empty history stays honest', async ({ page }) => {
  await setup(page);
  let fail = true;
  await page.route('**/api/profile', (route) => fail
    ? route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    : route.fulfill({ json: { profile: { recent: [] } } }));
  await page.goto('/7hk9ho#account');
  await expect(page.getByText('Activity is unavailable')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('No recent activity here')).toBeVisible();
  await expect(page.locator('.account-post')).toHaveCount(0);
});

test('custom avatar upload and restore update the profile and sidebar', async ({ page }) => {
  await setup(page);
  let avatar = '';
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: { ...user, avatar }, required: false } }));
  await page.route('**/api/account/avatar', async (route) => {
    avatar = (route.request().postDataJSON() as { avatar: string }).avatar;
    await route.fulfill({ json: { avatar } });
  });
  await page.goto('/7hk9ho#account');
  await expect(page.getByRole('heading', { name: 'Picolah Member' })).toBeVisible();
  await page.locator('.account-avatar-input').setInputFiles({
    name: 'avatar.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.locator('.account-avatar > img')).toBeVisible();
  await expect(page.locator('.pc-account-avatar > img')).toBeVisible();
  expect(avatar).toMatch(/^data:image\/(webp|jpeg|png);base64,/);
  await page.getByRole('button', { name: 'Restore default', exact: true }).click();
  await expect(page.locator('.account-avatar-default')).toBeVisible();
  await expect(page.locator('.pc-account-avatar > img')).toHaveCount(0);
});

test('sign-out removes the previous account conversation cache', async ({ page }) => {
  await setup(page);
  let signedIn = true;
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: signedIn ? user : null, required: false } }));
  await page.route('**/api/auth/logout', (route) => {
    signedIn = false;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/conversations', (route) => route.fulfill({ json: { conversations: signedIn
    ? [{ id: 'private-chat', title: 'Private account conversation', market: 'SG', preview: 'Private content', createdAt: now, updatedAt: now }]
    : [] } }));
  await page.goto('/7hk9ho#messages');
  await expect(page.getByText('Private account conversation', { exact: true })).toBeVisible();
  await page.locator('.pc-account-card').click();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.locator('.pc-profile-account summary').click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guest', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trail', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Trail' })).toBeVisible();
  await expect(page.getByText('Private account conversation', { exact: true })).toHaveCount(0);
  await expect(page.locator('.pc-msg-row')).toHaveCount(0);
});

test('guests keep a private chat identity when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await page.goto('/7hk9ho');
  const reply = page.waitForResponse((response) => response.url().endsWith('/api/chat') && response.request().method() === 'POST');
  await page.locator('textarea').fill('Sony WH-1000XM5');
  await page.locator('textarea').press('Enter');
  const response = await reply;
  expect(response.ok()).toBe(true);
  await response.finished();
  await page.getByRole('button', { name: /足迹|Trail/, exact: true }).click();
  await expect(page.locator('.pc-msg-row')).toHaveCount(1);
  await expect(page.locator('.pc-msg-row')).toContainText('Sony WH-1000XM5');
});

test('a delayed avatar session refresh cannot restore an account after logout', async ({ page }) => {
  await setup(page);
  let refreshStarted!: () => void;
  let releaseRefresh!: () => void;
  const started = new Promise<void>((resolve) => { refreshStarted = resolve; });
  const gate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  let delayRefresh = false;
  await page.route('**/api/auth/me', async (route) => {
    if (delayRefresh) {
      refreshStarted();
      await gate;
    }
    await route.fulfill({ json: { user, required: false } });
  });
  await page.route('**/api/account/avatar', (route) => {
    delayRefresh = true;
    return route.fulfill({ json: { avatar: '' } });
  });
  await page.route('**/api/auth/logout', (route) => route.fulfill({ json: { ok: true } }));
  await page.goto('/7hk9ho#account');
  await expect(page.getByRole('heading', { name: 'Picolah Member' })).toBeVisible();
  await page.locator('.account-avatar-input').setInputFiles({
    name: 'avatar.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await started;
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.locator('.pc-profile-account summary').click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guest', exact: true })).toBeVisible();
  const staleResponse = page.waitForResponse('**/api/auth/me');
  releaseRefresh();
  await (await staleResponse).finished();
  // Let both the fetch continuation and React's render commit before checking.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole('heading', { name: 'Guest', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Picolah Member' })).toHaveCount(0);
});
