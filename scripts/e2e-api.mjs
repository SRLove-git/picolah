#!/usr/bin/env node
/**
 * Dependency-free API smoke test. Run against a dev or staging server:
 *   PICOLAH_BASE_URL=http://127.0.0.1:8787 npm run e2e:api
 */
import assert from 'node:assert/strict';

const base = (process.env.PICOLAH_BASE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');

async function get(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  return { response, text };
}

const checks = [
  {
    name: 'health',
    async run() {
      const { response, text } = await get('/api/health');
      assert.equal(response.status, 200);
      const body = JSON.parse(text);
      assert.equal(body.ok, true);
      assert.equal(body.service, 'picolah-api');
    },
  },
  {
    name: 'public config',
    async run() {
      const { response, text } = await get('/api/config');
      assert.equal(response.status, 200);
      const body = JSON.parse(text);
      assert.ok(Array.isArray(body.markets), 'config.markets should be an array');
    },
  },
  {
    name: 'prometheus metrics',
    async run() {
      const { response, text } = await get('/metrics');
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /text\/plain/);
      assert.match(text, /picolah_http_requests_total/);
    },
  },
  {
    name: 'pwa manifest',
    async run() {
      const { response, text } = await get('/manifest.webmanifest');
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /manifest/);
      const body = JSON.parse(text);
      assert.equal(body.short_name, 'Picolah');
    },
  },
  {
    name: 'security headers',
    async run() {
      const { response } = await get('/api/health');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
    },
  },
];

let failed = 0;
for (const check of checks) {
  try {
    await check.run();
    console.log(`✓ ${check.name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${check.name}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failed) {
  console.error(`\n${failed}/${checks.length} smoke checks failed against ${base}`);
  process.exit(1);
}
console.log(`\nall ${checks.length} smoke checks passed against ${base}`);
