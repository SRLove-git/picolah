import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWebSearchUrl, parseSearchCandidates, searchWebCandidates } from './serp.ts';

const hit = (link: string, title = 'Sony WF-1000XM6 Wireless Earbuds') => ({ link, title });
const errorCode = (code: string) => (error: Error & { code?: string }) => error.code === code;
const credentials = { zone: 'test_serp_zone', token: 'test_secret_token' };
const responseFetch = (body: unknown, options?: ResponseInit): typeof fetch => async () => new Response(JSON.stringify(body), options);

test('SERP search URL scopes to market and asks for structured JSON without restricting a shop', () => {
  for (const market of ['SG', 'MY', 'TH', 'ID', 'PH', 'VN'] as const) {
    const url = new URL(buildWebSearchUrl('  Sony   WF-1000XM6  ', market));
    assert.equal(url.origin + url.pathname, 'https://www.google.com/search');
    assert.equal(url.searchParams.get('q'), 'Sony WF-1000XM6');
    assert.equal(url.searchParams.get('gl'), market.toLowerCase());
    assert.equal(url.searchParams.get('hl'), 'en');
    assert.equal(url.searchParams.get('brd_json'), '1');
  }
  assert.throws(() => buildWebSearchUrl(' ', 'SG'), errorCode('SERP_INVALID_QUERY'));
  assert.throws(() => buildWebSearchUrl('a'.repeat(301), 'SG'), errorCode('SERP_INVALID_QUERY'));
});

test('SERP accepts structured JSON and REST body wrappers, preserving only title and safe URL', () => {
  const organic = [{ ...hit('https://store.example.com/products/sony?utm_source=google&variant=black#reviews'), price: '$1', snippet: 'Unverified offer' }];
  const expected = [{ title: 'Sony WF-1000XM6 Wireless Earbuds', url: 'https://store.example.com/products/sony?variant=black' }];
  assert.deepEqual(parseSearchCandidates({ organic }), expected);
  assert.deepEqual(parseSearchCandidates(JSON.stringify({ organic })), expected);
  assert.deepEqual(parseSearchCandidates({ body: JSON.stringify({ organic }) }), expected);
  assert.deepEqual(parseSearchCandidates({ body: { organic } }), expected);
  assert.deepEqual(parseSearchCandidates({ organic: [] }), []);
});

test('SERP rejects missing schemas, malformed records, provider errors and challenges rather than claiming no results', () => {
  for (const body of ['', '<html>verify you are human</html>', {}, [], { organic: {} }, { organic: [null, {}, { title: 'No link' }] }, { body: '<html>captcha</html>' }, { no_results: true }, { body: JSON.stringify({ noResults: true }) }]) {
    assert.throws(() => parseSearchCandidates(body), errorCode('SERP_PARSE_FAILED'));
  }
  for (const body of [{ organic: [], error: 'secret' }, { organic: [], captcha: true }, { no_results: true, challenge: true }, { body: { organic: [], status_code: 503 } }]) {
    assert.throws(() => parseSearchCandidates(body), errorCode('SERP_SOURCE_FAILED'));
  }
  assert.throws(() => parseSearchCandidates(' '.repeat(2 * 1024 * 1024 + 1)), errorCode('SERP_RESPONSE_TOO_LARGE'));
});

test('SERP normalizes tracking and fragments, deduplicates and prefers distinct source hosts', () => {
  const results = parseSearchCandidates({ organic: [
    hit('https://a.example.com/product/1?utm_campaign=x#x'),
    hit('https://a.example.com/product/1?utm_campaign=y'),
    hit('https://a.example.com/product/2?gclid=x'),
    hit('https://a.example.com/product/3'),
    hit('https://b.example.com/product/1?color=black&fbclid=x'),
    hit('https://c.example.com/product/1?srsltid=x'),
  ] });
  assert.deepEqual(results.map((item) => item.url), [
    'https://a.example.com/product/1',
    'https://b.example.com/product/1?color=black',
    'https://c.example.com/product/1',
    'https://a.example.com/product/2',
  ]);
});

test('SERP excludes unsafe destinations, search engines, social pages and obvious non-product pages', () => {
  const rejected = [
    'file:///etc/passwd', 'http://127.0.0.1/product', 'https://localhost/product', 'http://169.254.169.254/latest',
    'https://10.0.0.1/product', 'https://[::1]/product', 'https://user:pass@store.example.com/product',
    'https://www.google.com/search?q=sony', 'https://www.google.com.sg/url?q=sony', 'https://www.bing.com/search?q=sony',
    'https://www.youtube.com/watch?v=1', 'https://youtu.be/1', 'https://www.instagram.com/p/1',
    'https://www.facebook.com/product/1', 'https://www.reddit.com/r/sony', 'https://www.tiktok.com/@user/video/1',
    'https://store.example.com/support/wf-1000xm6', 'https://store.example.com/blog/sony',
    'https://store.example.com/reviews/wf-1000xm6', 'https://store.example.com/cart',
  ];
  assert.deepEqual(parseSearchCandidates({ organic: rejected.map((url) => hit(url)) }), []);
  assert.equal(parseSearchCandidates({ organic: [hit('https://shop.tiktok.com/product/123')] }).length, 1);
});

test('SERP inspects at most 30 organic hits and returns at most 12 candidates, two per host', () => {
  const results = parseSearchCandidates({ organic: Array.from({ length: 50 }, (_, index) => hit(`https://store${index}.example.com/product/1`)) });
  assert.equal(results.length, 12);
  assert.equal(new Set(results.map((item) => new URL(item.url).hostname)).size, 12);
  const trailing = parseSearchCandidates({ organic: [...Array.from({ length: 30 }, () => hit('https://www.youtube.com/watch?v=1')), hit('https://store.example.com/product/31')] });
  assert.deepEqual(trailing, []);
});

test('SERP uses a dedicated zone, one authenticated fixed-endpoint request and a bounded timeout', async () => {
  let calls = 0;
  const candidates = await searchWebCandidates('Sony WF-1000XM6', 'SG', {
    ...credentials,
    fetchImpl: async (input, init) => {
      calls++;
      assert.equal(input, 'https://api.brightdata.com/request');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Authorization'), `Bearer ${credentials.token}`);
      assert.equal(headers.get('Content-Type'), 'application/json');
      assert.ok(init?.signal instanceof AbortSignal);
      assert.equal(init?.signal?.aborted, false);
      assert.deepEqual(JSON.parse(String(init?.body)), { zone: credentials.zone, url: buildWebSearchUrl('Sony WF-1000XM6', 'SG'), format: 'raw' });
      return new Response(JSON.stringify({ organic: [hit('https://store.example.com/product/1')] }));
    },
  });
  assert.equal(calls, 1);
  assert.equal(candidates.length, 1);
  for (const override of [{ zone: '' }, { token: '' }]) {
    await assert.rejects(searchWebCandidates('Sony', 'SG', { ...credentials, ...override, fetchImpl: async () => { throw new Error('must not fetch'); } }), errorCode('SERP_NOT_CONFIGURED'));
  }
});

test('SERP never retries HTTP, provider, timeout or network failures, and never exposes response secrets', async () => {
  const cases: Array<{ fetchImpl: typeof fetch; code: string }> = [
    { fetchImpl: responseFetch({ error: credentials.token }, { status: 403 }), code: 'SERP_AUTH_FAILED' },
    { fetchImpl: responseFetch({ error: credentials.token }, { status: 502 }), code: 'SERP_HTTP_ERROR' },
    { fetchImpl: responseFetch({ organic: [] }, { headers: { 'x-brd-error': credentials.token } }), code: 'SERP_HTTP_ERROR' },
    { fetchImpl: async () => { throw new DOMException(credentials.token, 'TimeoutError'); }, code: 'SERP_TIMEOUT' },
    { fetchImpl: async () => { throw new TypeError(credentials.token); }, code: 'SERP_NETWORK_ERROR' },
  ];
  for (const entry of cases) {
    let calls = 0;
    await assert.rejects(searchWebCandidates('Sony', 'SG', { ...credentials, fetchImpl: async (...args) => { calls++; return entry.fetchImpl(...args); } }), (error: Error & { code?: string }) => {
      assert.equal(error.code, entry.code);
      assert.ok(!error.message.includes(credentials.token));
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('SERP bounds response bytes both from Content-Length and streamed content', async () => {
  for (const fetchImpl of [
    responseFetch({ organic: [] }, { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }),
    (async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close(); } }))) as typeof fetch,
  ]) {
    await assert.rejects(searchWebCandidates('Sony', 'SG', { ...credentials, fetchImpl }), errorCode('SERP_RESPONSE_TOO_LARGE'));
  }
});
