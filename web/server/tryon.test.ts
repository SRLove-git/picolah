import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'false';
process.env.PICOLAH_DB_PATH = ':memory:';
process.env.PICOLAH_MEDIA_DIR = '.tmp/media-tryon-test';
process.env.IMAGE_PROVIDER = 'dashscope';
process.env.DASHSCOPE_API_KEY = 'test-key';
process.env.IMAGE_RATE_PER_HOUR = '2';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const realFetch = globalThis.fetch;
let generationCalls = 0;

/** Pretends to be the product CDN, DashScope and the generated image host. */
function installFetchMock(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('dashscope.aliyuncs.com')) {
      generationCalls += 1;
      return new Response(JSON.stringify({
        output: { choices: [{ message: { content: [{ image: 'https://cdn.example.com/tryon.png' }] } }] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('cdn.example.com')) {
      return new Response(TINY_PNG, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    // Everything else is the test client talking to the local API server.
    return realFetch(input, init);
  }) as typeof fetch;
}

before(() => {
  installFetchMock();
});

after(() => {
  globalThis.fetch = realFetch;
  rmSync('.tmp/media-tryon-test', { recursive: true, force: true });
});

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

async function waitForDone(id: string): Promise<{ status: string; url?: string; error?: string }> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/capybara/tryon/${id}`);
    const body = (await response.json()) as { tryon?: { status: string; url?: string; error?: string } };
    if (body.tryon && body.tryon.status !== 'pending' && body.tryon.status !== 'running') {
      return body.tryon;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('timed out waiting for try-on');
}

test('try-on config reports the configured provider', async () => {
  const response = await fetch(`${baseUrl}/api/capybara/tryon/config`);
  const body = (await response.json()) as { enabled: boolean; provider: string | null };
  assert.equal(response.status, 200);
  assert.equal(body.enabled, true);
  assert.equal(body.provider, 'dashscope');
});

test('generates, caches and serves a try-on image', async () => {
  const payload = {
    productId: 'sony-wh1000xm5',
    name: 'Sony WH-1000XM5',
    brand: 'Sony',
    category: 'headphones',
    imageUrl: 'https://cdn.example.com/product.jpg',
  };
  const created = await fetch(`${baseUrl}/api/capybara/tryon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(created.status, 202);
  const { tryon } = (await created.json()) as { tryon: { id: string } };

  const done = await waitForDone(tryon.id);
  assert.equal(done.status, 'done');
  assert.ok(done.url && done.url.startsWith('/media/tryon/'));
  assert.equal(generationCalls, 1);

  const image = await fetch(`${baseUrl}${done.url}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.ok((await image.arrayBuffer()).byteLength > 0);

  const cached = await fetch(`${baseUrl}/api/capybara/tryon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(cached.status, 200);
  const cachedBody = (await cached.json()) as { cached: boolean };
  assert.equal(cachedBody.cached, true);
  assert.equal(generationCalls, 1);
});

test('recent gallery lists finished try-ons', async () => {
  const response = await fetch(`${baseUrl}/api/capybara/tryon/recent`);
  const body = (await response.json()) as { tryons: Array<{ status: string }> };
  assert.equal(response.status, 200);
  assert.ok(body.tryons.length >= 1);
  assert.equal(body.tryons[0].status, 'done');
});

test('rate limits new generations but never cached ones', async () => {
  const make = (body: Record<string, unknown>) => fetch(`${baseUrl}/api/capybara/tryon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const second = await make({ name: 'iPhone 16 Pro', imageUrl: 'https://cdn.example.com/product.jpg' });
  assert.equal(second.status, 202);
  empty(await second.json());
  const cached = await make({
    productId: 'sony-wh1000xm5',
    name: 'Sony WH-1000XM5',
    brand: 'Sony',
    category: 'headphones',
    imageUrl: 'https://cdn.example.com/product.jpg',
  });
  assert.equal(cached.status, 200);
  const third = await make({ name: 'SK-II Facial Essence', imageUrl: 'https://cdn.example.com/product.jpg' });
  assert.equal(third.status, 429);
});

function empty(_body: unknown): void {
  // Drain the response body so the socket is reusable.
}
