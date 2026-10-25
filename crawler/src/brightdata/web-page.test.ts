import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWebProductPage } from './web-page.ts';

const url = 'https://store.example.com/products/wf-1000xm6';
const credentials = { token: 'test_secret_token', zone: 'test_web_unlocker' };
const validated = { ...credentials, validateUrl: async () => {} };
const body = '<html><h1>Sony WF-1000XM6</h1></html>';
const wrapper = { status_code: 200, body, url };
const responseFetch = (data: unknown, options?: ResponseInit): typeof fetch => async () => new Response(JSON.stringify(data), options);
const code = (expected: string) => (error: Error & { code?: string }) => {
  assert.equal(error.code, expected);
  assert.ok(!error.message.includes(credentials.token));
  assert.ok(!error.message.includes(url));
  return true;
};

test('product pages use one fixed-endpoint JSON Web Unlocker REST request after URL validation', async () => {
  let calls = 0;
  let validatedFirst = false;
  const html = await fetchWebProductPage(`${url}#details`, 'SG', {
    ...credentials,
    validateUrl: async (value) => { assert.equal(value, url); validatedFirst = true; },
    fetchImpl: async (input, init) => {
      calls++;
      assert.equal(validatedFirst, true);
      assert.equal(input, 'https://api.brightdata.com/request');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      assert.deepEqual(JSON.parse(String(init?.body)), { zone: credentials.zone, url, format: 'json', country: 'sg' });
      assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${credentials.token}`);
      assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
      assert.ok(init?.signal instanceof AbortSignal);
      assert.equal(init?.signal?.aborted, false);
      return new Response(JSON.stringify(wrapper));
    },
  });
  assert.equal(html, body); assert.equal(calls, 1);
  assert.equal(await fetchWebProductPage(url, 'MY', { ...validated, fetchImpl: responseFetch({ status_code: '200', body }) }), body);
});

test('missing configuration and unsafe target inputs fail before DNS or provider requests', async () => {
  const unexpected = async () => { throw new Error('must not run'); };
  for (const override of [{ token: '' }, { zone: '' }]) {
    await assert.rejects(fetchWebProductPage(url, 'SG', { ...credentials, ...override, fetchImpl: unexpected, validateUrl: unexpected }), code('WEB_UNLOCKER_NOT_CONFIGURED'));
  }
  for (const target of ['https://127.0.0.1/product', 'http://store.example.com/product', 'https://user:secret@store.example.com/product', `${url}?api_key=secret`]) {
    await assert.rejects(fetchWebProductPage(target, 'SG', { ...credentials, fetchImpl: unexpected, validateUrl: unexpected }), code('UNSAFE_WEB_URL'));
  }
});

test('DNS failure/private addresses are sanitized and never trigger provider fetch', async () => {
  let calls = 0;
  for (const error of [new Error(credentials.token), Object.assign(new Error(credentials.token), { code: 'UNSAFE_WEB_URL' })]) {
    await assert.rejects(fetchWebProductPage(url, 'SG', { ...credentials,
      validateUrl: async () => { throw error; }, fetchImpl: async () => { calls++; return new Response(); },
    }), code('code' in error ? 'UNSAFE_WEB_URL' : 'WEB_DNS_FAILED'));
  }
  assert.equal(calls, 0);
});

test('separate 10-second DNS and 60-second provider limits also bound non-cooperative promises', async (context) => {
  const original = AbortSignal.timeout;
  const durations: number[] = [];
  context.mock.method(AbortSignal, 'timeout', (ms: number) => { durations.push(ms); return original.call(AbortSignal, ms); });
  await fetchWebProductPage(url, 'SG', { ...validated, fetchImpl: responseFetch(wrapper) });
  assert.deepEqual(durations, [10_000, 60_000]);
  context.mock.restoreAll();
  context.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort());
  await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, validateUrl: () => new Promise(() => {}), fetchImpl: responseFetch(wrapper) }), code('WEB_DNS_TIMEOUT'));
  context.mock.restoreAll();
  context.mock.method(AbortSignal, 'timeout', (ms: number) => ms === 60_000 ? AbortSignal.abort() : original.call(AbortSignal, ms));
  await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl: () => new Promise(() => {}) }), code('WEB_PAGE_TIMEOUT'));
});

test('HTTP, provider-header, timeout and network failures are sanitized and never retried', async () => {
  for (const entry of [
    { fetchImpl: responseFetch({ error: credentials.token }, { status: 403 }), expected: 'WEB_PAGE_AUTH_FAILED' },
    { fetchImpl: responseFetch({ error: credentials.token }, { status: 502 }), expected: 'WEB_PAGE_HTTP_ERROR' },
    { fetchImpl: responseFetch(wrapper, { headers: { 'x-brd-err-code': credentials.token } }), expected: 'WEB_PAGE_HTTP_ERROR' },
    { fetchImpl: async () => { throw new DOMException(credentials.token, 'TimeoutError'); }, expected: 'WEB_PAGE_TIMEOUT' },
    { fetchImpl: async () => { throw new TypeError(credentials.token); }, expected: 'WEB_PAGE_NETWORK_ERROR' },
  ]) {
    let calls = 0;
    await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl: async (...args) => { calls++; return entry.fetchImpl(...args); } }), code(entry.expected));
    assert.equal(calls, 1);
  }
});

test('explicit API and source redirects are rejected without following Location', async () => {
  for (const fetchImpl of [
    responseFetch(wrapper, { status: 302 }), responseFetch(wrapper, { headers: { Location: 'https://evil.example.com/' } }),
    responseFetch({ ...wrapper, status_code: 301 }),
    responseFetch({ ...wrapper, headers: { Location: 'https://evil.example.com/' } }),
    responseFetch({ ...wrapper, headers: [['location', 'https://evil.example.com/']] }),
    responseFetch({ ...wrapper, response_headers: [{ name: 'Location', value: 'https://evil.example.com/' }] }),
    responseFetch({ ...wrapper, headers: 'Content-Type: text/html\r\nLocation: https://evil.example.com/' }),
    responseFetch({ ...wrapper, location: 'https://evil.example.com/' }),
    responseFetch({ ...wrapper, headers: { Refresh: '0;url=https://evil.example.com/' } }),
  ]) await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl }), code('WEB_PAGE_REDIRECT_REJECTED'));
  for (const finalUrl of ['https://evil.example.com/products/wf-1000xm6', 'https://store.example.com/other-product',
    `${url}?variant=other`, 'https://127.0.0.1/product', `${url}?token=secret`, '/products/wf-1000xm6', null]) {
    await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl: responseFetch({ ...wrapper, url: finalUrl }) }), code('WEB_PAGE_REDIRECT_REJECTED'));
  }
  const redirectProperties: PropertyDescriptorMap[] = [{ redirected: { value: true } }, { url: { value: 'https://evil.example.com/request' } }];
  for (const properties of redirectProperties) {
    await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl: async () => {
      const response = new Response(JSON.stringify(wrapper));
      Object.defineProperties(response, properties);
      return response;
    } }), code('WEB_PAGE_REDIRECT_REJECTED'));
  }
});

test('invalid envelopes, non-success source statuses and missing HTML do not become source content', async () => {
  for (const data of [null, [], {}, { body }, { status_code: 200, body: {} }, { status_code: 200, body: '' },
    { status_code: 200, body: '  ' }, { status_code: '200junk', body }]) {
    await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl: responseFetch(data) }), code('WEB_PAGE_PARSE_FAILED'));
  }
  for (const data of [{ ...wrapper, status_code: 404 }, { ...wrapper, status_code: 503 }, { ...wrapper, error: credentials.token }]) {
    await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl: responseFetch(data) }), code('WEB_PAGE_SOURCE_FAILED'));
  }
  await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl: async () => new Response(body) }), code('WEB_PAGE_PARSE_FAILED'));
});

test('response size is bounded from both Content-Length and streamed bytes', async () => {
  for (const fetchImpl of [
    responseFetch(wrapper, { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }),
    (async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(8 * 1024 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close();
    } }))) as typeof fetch,
  ]) await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl }), code('WEB_PAGE_RESPONSE_TOO_LARGE'));
});

test('streaming timeout cancels a stalled body and remains sanitized', async (context) => {
  const original = AbortSignal.timeout;
  const controller = new AbortController();
  let cancelled = false;
  context.mock.method(AbortSignal, 'timeout', (ms: number) => ms === 60_000 ? controller.signal : original.call(AbortSignal, ms));
  await assert.rejects(fetchWebProductPage(url, 'SG', { ...validated, fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
    pull() { controller.abort(credentials.token); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 })) }), code('WEB_PAGE_TIMEOUT'));
  assert.equal(cancelled, true);
});
