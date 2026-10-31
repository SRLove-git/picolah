import { expect, test } from '@playwright/test';

test('trail rows do not show mascot portraits', async ({ page }) => {
  // A real visitor owns their trail; global seeded chats must never be exposed.
  const anonymous = `anon-trail-${Date.now()}`;
  await page.addInitScript((id) => localStorage.setItem('picolah.userId', id), anonymous);
  const response = await page.request.post('/api/chat', {
    headers: { 'x-picolah-user': anonymous },
    data: { message: 'Sony WH-1000XM5', market: 'SG' },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/7hk9ho#messages');

  await expect(page.getByRole('region', { name: /足迹|Trail/ })).toBeVisible();
  await expect(page.locator('.pc-msg-row').first()).toBeVisible();
  await expect(page.locator('.pc-msg-avatar')).toHaveCount(0);
});
