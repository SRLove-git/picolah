import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'false';
process.env.PICOLAH_DB_PATH = ':memory:';

const { app } = await import('./index.ts');
const server = await new Promise<import('node:http').Server>((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server did not bind a TCP port');
const baseUrl = `http://127.0.0.1:${address.port}`;

after(
  () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
);

type CatalogBody = {
  products: Array<{ id: string; name: string; brand: string; category: string }>;
  categories: string[];
  brands: string[];
  total: number;
};

test('lists products and categories', async () => {
  const response = await fetch(`${baseUrl}/api/catalog`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as CatalogBody;
  assert.ok(body.products.length >= 20);
  assert.ok(body.categories.length >= 3);
  assert.equal(body.total, body.products.length);
});

test('filters by query and category without losing categories', async () => {
  const all = (await (await fetch(`${baseUrl}/api/catalog`)).json()) as CatalogBody;
  const category = all.products[0]?.category;
  assert.ok(category);

  const categoryOnly = (await (
    await fetch(`${baseUrl}/api/catalog?category=${encodeURIComponent(category)}`)
  ).json()) as CatalogBody;
  assert.ok(categoryOnly.products.length > 0);
  assert.ok(categoryOnly.products.every((product) => product.category === category));
  assert.deepEqual(categoryOnly.categories, all.categories);

  const sony = (await (await fetch(`${baseUrl}/api/catalog?q=sony`)).json()) as CatalogBody;
  assert.ok(sony.products.some((product) => /Sony/i.test(product.name)));
});

test('returns an empty result for an unknown query', async () => {
  const body = (await (
    await fetch(`${baseUrl}/api/catalog?q=definitely-not-a-product`)
  ).json()) as CatalogBody;
  assert.equal(body.total, 0);
  assert.deepEqual(body.products, []);
});


test('filters by exact brand while retaining available brand facets', async () => {
  const all = (await (await fetch(`${baseUrl}/api/catalog`)).json()) as CatalogBody;
  const sony = (await (await fetch(`${baseUrl}/api/catalog?brand=Sony`)).json()) as CatalogBody;
  assert.equal(sony.total, 2);
  assert.ok(sony.products.every(product => product.brand === 'Sony'));
  assert.deepEqual(sony.brands, all.brands);
  assert.ok(sony.brands.includes('Apple'));
  const unknown = (await (await fetch(`${baseUrl}/api/catalog?brand=Unknown`)).json()) as CatalogBody;
  assert.equal(unknown.total, 0);
  assert.deepEqual(unknown.brands, all.brands);
});

test('combines query, category and brand without dropping category navigation', async () => {
  const all = (await (await fetch(`${baseUrl}/api/catalog`)).json()) as CatalogBody;
  const params = new URLSearchParams({ q: 'WH-1000XM5', category: '耳机', brand: 'Sony' });
  const body = (await (await fetch(`${baseUrl}/api/catalog?${params}`)).json()) as CatalogBody;
  assert.equal(body.total, 1);
  assert.equal(body.products[0].name, 'Sony WH-1000XM5 无线降噪耳机');
  assert.deepEqual(body.brands, ['Sony']);
  assert.deepEqual(body.categories, all.categories);
});

test('sorts by name in either direction or groups by brand', async () => {
  const get = async (sort: string) => (await (await fetch(`${baseUrl}/api/catalog?sort=${sort}`)).json()) as CatalogBody;
  const asc = await get('name-asc');
  const desc = await get('name-desc');
  assert.deepEqual(desc.products.map(p => p.id), asc.products.map(p => p.id).reverse());
  const compare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
  const grouped = await get('brand-asc');
  assert.deepEqual(grouped.products.map(p => p.id), [...asc.products]
    .sort((a, b) => compare(a.brand, b.brand) || compare(a.name, b.name) || compare(a.id, b.id)).map(p => p.id));
  assert.deepEqual((await get('unknown')).products, asc.products);
});
