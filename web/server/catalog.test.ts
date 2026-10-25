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
  products: Array<{ id: string; name: string; category: string }>;
  categories: string[];
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
