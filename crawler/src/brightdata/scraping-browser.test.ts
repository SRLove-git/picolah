import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { config } from '../config.ts';
import { findChromePath, localProxy, scrapingBrowserEndpoint, withBrowserPage } from './scraping-browser.ts';

function fakeBrowser() {
  const calls = { pageClosed: 0, browserClosed: 0, contexts: [] as unknown[] };
  const page = { close: async () => { calls.pageClosed++; } } as unknown as Page;
  const context = { newPage: async () => page } as unknown as BrowserContext;
  const browser = {
    contexts: () => [context],
    newContext: async (options: unknown) => { calls.contexts.push(options); return context; },
    close: async () => { calls.browserClosed++; },
  } as unknown as Browser;
  return { browser, page, calls };
}

test('restored browser helpers find configured Chrome and build market-scoped proxy/endpoint', (t) => {
  const previousPath = process.env.CHROME_PATH;
  const previous = { ...config.brightData };
  const previousProxy = config.localProxyEnabled;
  t.after(() => { if (previousPath === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = previousPath; Object.assign(config.brightData, previous); config.localProxyEnabled = previousProxy; });
  process.env.CHROME_PATH = '/test/chrome';
  assert.equal(findChromePath((path) => path === '/test/chrome'), '/test/chrome');
  assert.equal(findChromePath(() => false), undefined);
  Object.assign(config.brightData, { customerId: 'test-customer', proxyZone: 'test-proxy', proxyPassword: 'test-secret', proxyHost: 'http://proxy.invalid:44445', browserCustomerId: 'test-customer', browserZone: 'test-browser', browserPassword: 'test-secret', browserHost: 'browser.invalid', browserPort: 9222 });
  config.localProxyEnabled = true;
  assert.deepEqual(localProxy('SG'), { server: 'http://proxy.invalid:44445', username: 'brd-customer-test-customer-zone-test-proxy-country-sg', password: 'test-secret' });
  assert.equal(scrapingBrowserEndpoint('MY'), 'wss://brd-customer-test-customer-zone-test-browser-country-my:test-secret@browser.invalid:9222');
  config.localProxyEnabled = false;
  assert.equal(localProxy('SG'), undefined);
});

test('local browser applies login state and market options, returns typed result and closes after failure', async (t) => {
  const previousPath = process.env.CHROME_PATH;
  process.env.CHROME_PATH = process.execPath; // Existing path only; the launch below is mocked.
  t.after(() => { if (previousPath === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = previousPath; });
  const fake = fakeBrowser();
  t.mock.method(chromium, 'launch', async () => fake.browser);
  t.mock.method(chromium, 'connectOverCDP', async () => { throw new Error('must not connect remotely'); });
  assert.equal(await withBrowserPage(async () => 42, { mode: 'local', storageState: '/test/state.json', locale: 'en-SG', timezoneId: 'Asia/Singapore' }), 42);
  assert.deepEqual(fake.calls.contexts[0], { storageState: '/test/state.json', locale: 'en-SG', timezoneId: 'Asia/Singapore', viewport: { width: 1440, height: 1000 } });
  await assert.rejects(withBrowserPage(async () => { throw new Error('callback failed'); }, { mode: 'local' }), /callback failed/);
  assert.equal(fake.calls.pageClosed, 2);
  assert.equal(fake.calls.browserClosed, 2);
});

test('remote browser preserves existing-context operation and applies explicit context options', async (t) => {
  const previous = { ...config.brightData };
  t.after(() => Object.assign(config.brightData, previous));
  Object.assign(config.brightData, { browserCustomerId: 'test-customer', browserZone: 'test-browser', browserPassword: 'test-secret' });
  const fake = fakeBrowser();
  t.mock.method(chromium, 'connectOverCDP', async () => fake.browser);
  t.mock.method(chromium, 'launch', async () => { throw new Error('must not launch local browser'); });
  assert.equal(await withBrowserPage(async () => 'remote', { mode: 'brightdata' }), 'remote');
  assert.equal(fake.calls.contexts.length, 0);
  await withBrowserPage(async () => undefined, { mode: 'brightdata', country: 'SG', storageState: '/test/state.json', locale: 'en-SG' });
  assert.deepEqual(fake.calls.contexts[0], { storageState: '/test/state.json', locale: 'en-SG', viewport: { width: 1440, height: 1000 } });
  assert.equal(fake.calls.browserClosed, 2);
});

test('unsupported remote context settings fail explicitly and release the browser', async (t) => {
  const previous = { ...config.brightData };
  t.after(() => Object.assign(config.brightData, previous));
  Object.assign(config.brightData, { browserCustomerId: 'test-customer', browserZone: 'test-browser', browserPassword: 'test-secret' });
  const fake = fakeBrowser();
  fake.browser.newContext = async () => { throw new Error('unsupported'); };
  t.mock.method(chromium, 'connectOverCDP', async () => fake.browser);
  await assert.rejects(withBrowserPage(async () => undefined, { mode: 'brightdata', storageState: '/test/state.json' }), (error: Error & { code?: string }) => error.code === 'BROWSER_CONTEXT_FAILED');
  assert.equal(fake.calls.browserClosed, 1);
});
