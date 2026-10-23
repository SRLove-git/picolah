import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeBrightDataError } from './errors.ts';

test('keeps zone passwords out of logs', () => {
  const input =
    'browserType.connectOverCDP: WebSocket error: wss://brd-customer-hl_abc-zone-browser1:s3cret@brd.superproxy.io:9222/ 407 Auth Failed';
  const output = sanitizeBrightDataError(input);
  assert.ok(!output.includes('s3cret'));
  assert.ok(output.includes('brd-customer-hl_abc-zone-browser1:***@'));
});
