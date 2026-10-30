import { expect, test } from '@playwright/test';

test('finds a product and starts a comparison', async ({ page }) => {
  await page.goto('/7hk9ho');
  await expect(page.locator('.pc-sidebar')).toBeVisible();

  await page.getByRole('button', { name: /发现|Discover/ }).click();
  await expect(page.getByRole('region', { name: /发现|Discover/ })).toBeVisible();
  await expect(page.locator('.pc-catalog-row')).toHaveCount(28);

  await page.getByPlaceholder(/搜索商品、品牌或型号|Search products, brands or models/).fill('sony');
  await expect(page.locator('.pc-catalog-row')).toHaveCount(2);

  await page.getByRole('button', { name: /去比价|Compare/ }).first().click();
  await expect(page.locator('textarea')).toBeVisible();
});
