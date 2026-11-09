import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('picolah.market', 'SG'));
});

for (const width of [1440, 390, 320]) test(`discovers, filters and compares products at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/7hk9ho#search');
  await expect(page.getByRole('region', { name: 'Discover', exact: true })).toBeVisible();
  await expect(page.locator('.discover-product')).toHaveCount(28);
  await expect(page).toHaveTitle('PICOLAH');
  await expect(page.locator('.discover-hero')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Brand', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Sort', exact: true })).toBeVisible();
  expect((await page.locator('.discover-product-image').first().boundingBox())?.y).toBeLessThan(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`discover-${width}.png`) });

  await page.getByRole('button', { name: 'Headphones', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Headphones', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const labels = await page.locator('.discover-product-bottom > span').allTextContents();
    return labels.length > 0 && labels.every(value => value === 'Headphones');
  }).toBe(true);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('.discover-product')).toHaveCount(28);

  const input = page.getByPlaceholder('Search products, brands or models');
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await input.fill('sony');
  await expect(page.locator('.discover-product')).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await input.fill('sony');
  await expect(page.locator('.discover-product')).toHaveCount(2);
  await page.getByRole('button', { name: /^Compare: Sony/ }).first().click();
  await expect(page.locator('.pc-chat textarea')).toBeVisible();
  await expect(page.locator('.pc-chat .message-user')).toContainText('Sony');
  await expect(page).toHaveTitle('PICOLAH');
});

test('Ask Pico submits the exact request and empty results can be cleared', async ({ page }) => {
  await page.goto('/7hk9ho#search');
  const input = page.getByPlaceholder('Search products, brands or models');
  await expect(page.getByRole('button', { name: 'Ask Pico', exact: true })).toHaveCount(0);
  await input.fill('a product that is not in the catalog');
  await expect(page.getByText('No matching products. Try another word or category.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(page.locator('.discover-product')).toHaveCount(28);
  const request = 'Compare Sony WH-1000XM5 in Singapore';
  await input.fill(request);
  await input.press('Enter');
  await expect(input).toHaveValue(request);
  await expect(page.getByRole('region', { name: 'Discover', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ask Pico', exact: true }).click();
  await expect(page.locator('.pc-chat .message-user')).toContainText(request);
});

test('failed catalog requests show a working retry instead of stale products', async ({ page }) => {
  let fail = true;
  await page.route('**/api/catalog**', route => fail
    ? route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } })
    : route.continue());
  await page.goto('/7hk9ho#search');
  await expect(page.getByRole('alert')).toContainText('The catalog could not load');
  await expect(page.locator('.discover-product')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.discover-product')).toHaveCount(28);
});

for (const locale of [
  { market: 'MY', lang: 'ms', brand: 'Jenama', sort: 'Isih', illustration: 'Ilustrasi' },
  { market: 'TH', lang: 'th', brand: 'แบรนด์', sort: 'เรียงตาม', illustration: 'ภาพประกอบ' },
  { market: 'ID', lang: 'id', brand: 'Merek', sort: 'Urutkan', illustration: 'Ilustrasi' },
  { market: 'VN', lang: 'vi', brand: 'Thương hiệu', sort: 'Sắp xếp', illustration: 'Hình minh họa' },
]) test(`${locale.market} shop filters remain localized on a narrow screen`, async ({ page }, info) => {
  await page.addInitScript(market => localStorage.setItem('picolah.market', market), locale.market);
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto('/7hk9ho#search');
  await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
  await expect(page.getByRole('combobox', { name: locale.brand, exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: locale.sort, exact: true })).toBeVisible();
  await expect(page.locator('.discover-product')).toHaveCount(28);
  await expect(page.locator('.discover-illustration').first()).toHaveText(locale.illustration);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.pc-search-page').innerText()).not.toContain('search.');
  await page.screenshot({ path: info.outputPath(`shop-${locale.lang}-320.png`) });
});

test('brand, category and sorting controls change the product results', async ({ page }) => {
  await page.goto('/7hk9ho#search');
  await expect(page.locator('.discover-product')).toHaveCount(28);
  const brands = page.getByRole('combobox', { name: 'Brand', exact: true });
  await brands.selectOption('Sony');
  await expect(page.locator('.discover-product')).toHaveCount(2);
  await expect(page.locator('.discover-product-brand')).toHaveText(['Sony', 'Sony']);
  // Keep other brands available so the filter can be changed directly.
  await expect(brands.locator('option[value="Apple"]')).toHaveCount(1);
  const names = page.locator('.discover-product h3');
  const ascending = await names.allTextContents();
  await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('name-desc');
  await expect(names).toHaveText([...ascending].reverse());
  await page.getByRole('button', { name: 'Remove filter: Sony', exact: true }).click();
  await expect(page.locator('.discover-product')).toHaveCount(28);
  await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('brand-asc');
  await expect.poll(async () => {
    const actual = await page.locator('.discover-product-brand').allTextContents();
    const sorted = [...actual].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
    return actual.length === 28 && JSON.stringify(actual) === JSON.stringify(sorted);
  }).toBe(true);
  await page.getByRole('button', { name: 'Headphones', exact: true }).click();
  await brands.selectOption('Sony');
  await expect(page.locator('.discover-product')).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(brands).toHaveValue('');
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.discover-product')).toHaveCount(28);
});

test('catalog pagination reaches later products and resets after a new search', async ({ page }) => {
  const catalog = Array.from({ length: 30 }, (_, index) => ({
    id: `pagination-product-${index + 1}`,
    name: `Pagination Product ${String(index + 1).padStart(2, '0')}`,
    brand: 'Pagination Brand',
    category: '耳机',
    visual: 'headphones',
    specs: `Model ${index + 1}`,
  }));
  await page.route('**/api/catalog**', async route => {
    const url = new URL(route.request().url());
    const requestedPage = Number(url.searchParams.get('page') || 1);
    const pageSize = Number(url.searchParams.get('pageSize') || 28);
    const totalPages = Math.ceil(catalog.length / pageSize);
    const currentPage = Math.min(requestedPage, totalPages);
    await route.fulfill({ json: {
      products: catalog.slice((currentPage - 1) * pageSize, currentPage * pageSize),
      categories: ['耳机'], brands: ['Pagination Brand'], total: catalog.length,
      page: currentPage, pageSize, totalPages,
    } });
  });

  await page.goto('/7hk9ho#search');
  await expect(page.locator('.discover-product')).toHaveCount(28);
  const pagination = page.getByRole('navigation', { name: 'Product pages' });
  await expect(pagination).toBeVisible();
  await pagination.getByRole('button', { name: 'Page 2' }).click();
  await expect(page.locator('.discover-product')).toHaveCount(2);
  await expect(page.locator('.discover-product h3')).toHaveText([
    'Pagination Product 29', 'Pagination Product 30',
  ]);
  await expect(pagination.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

  await page.getByPlaceholder('Search products, brands or models').fill('Pagination');
  await expect(page.locator('.discover-product')).toHaveCount(28);
  await expect(pagination.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
});

test('an older preview API still supports brand filtering and sorting', async ({ page }) => {
  await page.route('**/api/catalog**', async route => {
    const url = new URL(route.request().url());
    url.searchParams.delete('brand');
    url.searchParams.delete('sort');
    const response = await route.fetch({ url: url.toString() });
    const body = await response.json();
    delete body.brands;
    await route.fulfill({ response, json: body });
  });
  await page.goto('/7hk9ho#search');
  await expect(page.locator('.discover-product')).toHaveCount(28);
  await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption('Sony');
  await expect(page.locator('.discover-product')).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('2 products');
  const names = await page.locator('.discover-product h3').allTextContents();
  await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('name-desc');
  await expect(page.locator('.discover-product h3')).toHaveText([...names].reverse());
});
