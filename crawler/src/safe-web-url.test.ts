import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicWebUrl, safeWebUrl, type WebDnsLookup } from './safe-web-url.ts';

test('safe web URLs retain public HTTPS product paths and discard fragments', () => {
  assert.equal(safeWebUrl('https://www.sony.com.sg/products/wf-1000xm6?color=black#details')?.href,
    'https://www.sony.com.sg/products/wf-1000xm6?color=black');
  assert.equal(safeWebUrl('https://shop.example.com/product?utm_source=google')?.hostname, 'shop.example.com');
});

test('URL validation rejects protocols, credentials, all explicit ports and IP literal disguises', () => {
  for (const value of [
    'http://shop.example.com/product', 'file:///etc/passwd', 'javascript:alert(1)', '/product',
    'https://user:password@shop.example.com/product', 'https://user@shop.example.com/product',
    'https://shop.example.com:443/product', 'https://shop.example.com:8443/product',
    'https://127.0.0.1/product', 'https://2130706433/product', 'https://0x7f000001/product',
    'https://0177.0.0.1/product', 'https://8.8.8.8/product', 'https://[::1]/product',
    'https://[::ffff:127.0.0.1]/product', 'https://[2606:4700:4700::1111]/product',
    ' https://shop.example.com/product', 'https://shop.example.com/\nproduct',
    'https://shop.example.com\\@localhost/product', 'https://shop.example.com./product',
  ]) assert.equal(safeWebUrl(value), null, value);
});

test('local/internal hostnames and authentication-bearing query parameters are never sent out', () => {
  for (const host of ['localhost', 'local', 'intranet', 'metadata.google.internal', 'shop.local', 'shop.localhost',
    'shop.internal', 'shop.lan', 'shop.home', 'shop.corp', 'shop.private', 'shop.test', 'shop.invalid', 'shop.onion',
    'a..com', '-bad.example.com', 'bad-.example.com']) assert.equal(safeWebUrl(`https://${host}/product`), null, host);
  for (const key of ['token', 'api_key', 'access-token', 'password', 'session_id', 'authorization', 'cookie',
    'X-Amz-Signature', 'x-goog-credential', 'jwt', 'code', 'key', 'credentials', 'signa%74ure']) {
    assert.equal(safeWebUrl(`https://shop.example.com/product?${key}=secret`), null, key);
  }
});

test('DNS validation checks every IPv4/IPv6 result and permits ordinary public addresses', async () => {
  const lookup: WebDnsLookup = async (host, options) => {
    assert.equal(host, 'shop.example.com');
    assert.deepEqual(options, { all: true, verbatim: true });
    return [{ address: '93.184.216.34', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }];
  };
  assert.equal((await assertPublicWebUrl('https://shop.example.com/product', lookup)).pathname, '/product');
});

test('private, special, mixed and rebinding DNS answers are rejected without leaking input', async () => {
  const addresses = [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.0.1',
    '192.0.0.1', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:8.8.8.8', '64:ff9b::a00:1',
    'fd12::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2001::1', '2002:7f00:1::', '3fff::1',
  ];
  for (const address of addresses) {
    const lookup: WebDnsLookup = async () => [{ address: '93.184.216.34', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }];
    await assert.rejects(() => assertPublicWebUrl('https://shop.example.com/product', lookup), { code: 'UNSAFE_WEB_URL' }, address);
  }
  let calls = 0;
  const rebinding: WebDnsLookup = async () => [{ address: ++calls === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  await assertPublicWebUrl('https://shop.example.com/product', rebinding);
  await assert.rejects(() => assertPublicWebUrl('https://shop.example.com/product', rebinding), { code: 'UNSAFE_WEB_URL' });
});

test('failed, empty or malformed DNS results fail closed with safe error messages', async () => {
  for (const addresses of [[], [{ address: 'not-an-ip', family: 4 }], [{ address: '127.0.0.1', family: 6 }]]) {
    await assert.rejects(() => assertPublicWebUrl('https://shop.example.com/product', async () => addresses), { code: 'UNSAFE_WEB_URL' });
  }
  await assert.rejects(() => assertPublicWebUrl('https://shop.example.com/product', async () => { throw new Error('sensitive resolver detail'); }),
    { code: 'WEB_DNS_FAILED', message: 'Product host DNS lookup failed' });
  await assert.rejects(() => assertPublicWebUrl('https://user:secret@shop.example.com/product', async () => { throw new Error('must not run'); }),
    { code: 'UNSAFE_WEB_URL', message: 'Unsafe product URL' });
});
