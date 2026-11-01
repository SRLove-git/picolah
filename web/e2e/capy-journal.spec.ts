import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function setup(page: Page, language = 'en') {
  const owner = `journal-e2e-${randomUUID()}`;
  await page.addInitScript(({ owner, language }) => {
    localStorage.setItem('picolah.userId', owner);
    localStorage.setItem('picolah.language', language);
  }, { owner, language });
  await page.goto('/7hk9ho#capybara');
  return { 'X-Picolah-User': owner };
}
async function open(page: Page) {
  await page.getByRole('button', { name: "Open Capy's diary", exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Diary', exact: true })).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
}
async function write(page: Page, title: string, content: string) {
  await page.getByRole('button', { name: 'Write an entry', exact: true }).click();
  await page.getByLabel('Title (optional)', { exact: true }).fill(title);
  await page.getByLabel('Today’s story', { exact: true }).fill(content);
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}

for (const width of [1440, 390, 320]) {
  test(`diary creates, edits, reloads and deletes actual persisted entries at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    const headers = await setup(page);
    await open(page);
    const original = 'A happy little day\n<img data-journal-test src=x onerror=alert(1)>';
    await write(page, 'First memory', original);
    await expect(page.locator('.pc-journal-entry')).toHaveCount(1);
    await expect(page.locator('.pc-journal-entry')).toContainText(original);
    await expect(page.locator('img[data-journal-test]')).toHaveCount(0);
    await page.reload();
    await open(page);
    await page.getByRole('button', { name: 'Edit entry First memory', exact: true }).click();
    await expect(page.getByLabel('Today’s story', { exact: true })).toHaveValue(original);
    await page.getByLabel('Date', { exact: true }).fill('2026-10-30');
    await page.getByLabel('Title (optional)', { exact: true }).fill('A revised memory');
    await page.getByLabel('Today’s story', { exact: true }).fill('A quiet day with Capy.\nRemembered and saved.');
    await page.screenshot({ path: testInfo.outputPath(`diary-editor-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Save entry', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.reload();
    await open(page);
    const card = page.locator('.pc-journal-entry');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Remembered and saved.');
    await expect(card.locator('time')).toHaveAttribute('datetime', '2026-10-30');
    await page.getByRole('button', { name: 'Delete entry A revised memory', exact: true }).click();
    await page.getByRole('button', { name: 'Keep it', exact: true }).click();
    await expect(card).toHaveCount(1);
    await page.getByRole('button', { name: 'Delete entry A revised memory', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.reload(); await open(page);
    await expect(page.getByText('A fresh page awaits', { exact: true })).toBeVisible();
    expect(await (await page.request.get('/api/capybara/journal', { headers })).json()).toEqual({ entries: [], total: 0 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('a lost save response keeps the draft, protects closing and retries without duplicate entries', async ({ page }) => {
  const headers = await setup(page);
  let fail = true;
  await page.route('**/api/capybara/journal', async (route) => {
    if (route.request().method() === 'POST' && fail) {
      fail = false;
      await route.fetch();
      await route.fulfill({ status: 503, json: { error: 'REQUEST_FAILED' } });
    } else await route.continue();
  });
  await open(page);
  await page.getByRole('button', { name: 'Write an entry', exact: true }).click();
  await page.getByLabel('Today’s story', { exact: true }).fill('Keep this draft safe.');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your text is still here');
  await expect(page.getByLabel('Today’s story', { exact: true })).toHaveValue('Keep this draft safe.');
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click();
  await expect(page.getByText('Your entry has unsaved changes.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click();
  await expect(page.getByLabel('Today’s story', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.locator('.pc-journal-entry')).toHaveCount(1);
  expect((await (await page.request.get('/api/capybara/journal', { headers })).json()).total).toBe(1);
});

test('discarding an unsaved entry closes the journal without creating a record', async ({ page }) => {
  const headers = await setup(page);
  await open(page);
  await page.getByRole('button', { name: 'Write an entry', exact: true }).click();
  await page.getByLabel('Today’s story', { exact: true }).fill('Not for saving.');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard and close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Open Capy's diary", exact: true })).toBeFocused();
  expect((await (await page.request.get('/api/capybara/journal', { headers })).json()).total).toBe(0);
  await open(page);
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('an edit conflict preserves both versions and can be saved as a separate entry', async ({ page }) => {
  const headers = await setup(page);
  await open(page); await write(page, 'Original', 'First text');
  const { entries } = await (await page.request.get('/api/capybara/journal', { headers })).json();
  await page.getByRole('button', { name: 'Edit entry Original', exact: true }).click();
  await page.getByLabel('Today’s story', { exact: true }).fill('My unsaved revision');
  const other = await page.request.patch(`/api/capybara/journal/${entries[0].id}`, { headers, data: {
    date: entries[0].date, title: 'Other device', content: 'Newer server revision', revision: entries[0].revision,
  } });
  expect(other.status()).toBe(200);
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This entry changed elsewhere');
  await expect(page.getByLabel('Today’s story', { exact: true })).toHaveValue('My unsaved revision');
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect(page.locator('.pc-journal-entry')).toHaveCount(2);
  await page.reload(); await open(page);
  await expect(page.locator('.pc-journal-entry')).toHaveCount(2);
  await expect(page.locator('.pc-journal-list')).toContainText('Newer server revision');
  await expect(page.locator('.pc-journal-list')).toContainText('My unsaved revision');
});

test('a load error offers a retry instead of pretending the journal is empty', async ({ page }) => {
  await setup(page);
  let fail = true;
  await page.route('**/api/capybara/journal?*', async (route) => {
    if (fail) await route.fulfill({ status: 503, json: { error: 'REQUEST_FAILED' } });
    else await route.continue();
  });
  await open(page);
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  await expect(page.getByRole('button', { name: 'Write an entry', exact: true })).toBeDisabled();
  await expect(page.getByText('A fresh page awaits', { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Write an entry', exact: true })).toBeEnabled();
});

test('switching tabs keeps the draft and saving clears an earlier close warning', async ({ page }) => {
  await setup(page); await open(page);
  await page.getByRole('button', { name: 'Write an entry', exact: true }).click();
  await page.getByLabel('Today’s story', { exact: true }).fill('A moment to keep.');
  await page.getByRole('tab', { name: 'Wardrobe', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Your entry has unsaved changes.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Today’s story', { exact: true })).toHaveValue('A moment to keep.');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByText('Your entry has unsaved changes.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Edit entry / }).click();
  await page.getByLabel('Today’s story', { exact: true }).fill('An unsaved edit.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click();
  await expect(page.getByLabel('Today’s story', { exact: true })).toHaveValue('An unsaved edit.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.locator('.pc-journal-entry')).toContainText('A moment to keep.');
  await page.getByRole('button', { name: 'Back to Capy', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('older entries load on demand and can still be edited', async ({ page }) => {
  const headers = await setup(page);
  for (let index = 0; index < 21; index++) {
    const response = await page.request.post('/api/capybara/journal', { headers, data: {
      id: randomUUID(), date: `2026-10-${String(index + 1).padStart(2, '0')}`, title: `Memory ${index}`, content: `Day ${index}`,
    } });
    expect(response.status()).toBe(201);
  }
  await open(page);
  await expect(page.locator('.pc-journal-entry')).toHaveCount(20);
  await page.getByRole('button', { name: 'More memories', exact: true }).click();
  await expect(page.locator('.pc-journal-entry')).toHaveCount(21);
  await page.getByRole('button', { name: 'Edit entry Memory 0', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Today’s story', { exact: true }).fill('An older memory, revised');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.locator('.pc-journal-entry').first()).toContainText('An older memory, revised');
});
