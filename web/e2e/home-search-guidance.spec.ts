import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('picolah.market', 'SG');
    localStorage.setItem('picolah.language', 'en');
  });
});

for (const width of [1440, 390, 320]) {
  test(`search guidance teaches condition-based queries at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/7hk9ho#home');

    const guide = page.getByRole('region', { name: 'Search examples' });
    await expect(guide).toBeVisible();
    await expect(guide.getByText('Product or model + budget + shipping origin + warranty')).toBeVisible();
    await expect(guide.getByRole('button')).toHaveCount(4);

    const query = 'Find this product with at least a 2-year warranty and local shipping';
    await guide.getByRole('button', { name: query }).click();
    const composer = page.getByRole('textbox', { name: 'Enter a price comparison question' });
    await expect(composer).toBeFocused();
    await expect(composer).toHaveValue(query);
    await expect(page.locator('.pc-chat .message-user')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
