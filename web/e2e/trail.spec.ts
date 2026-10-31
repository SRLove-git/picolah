import { expect, test } from '@playwright/test';

test('trail rows do not show mascot portraits', async ({ page }) => {
  await page.goto('/7hk9ho#messages');

  await expect(page.getByRole('region', { name: /足迹|Trail/ })).toBeVisible();
  await expect(page.locator('.pc-msg-row').first()).toBeVisible();
  await expect(page.locator('.pc-msg-avatar')).toHaveCount(0);
});
