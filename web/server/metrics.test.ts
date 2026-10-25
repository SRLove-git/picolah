import assert from 'node:assert/strict';
import test from 'node:test';
import { recordRequest, renderMetrics, resetMetrics } from './metrics.ts';

test('renders bounded request counters and latency buckets', () => {
  resetMetrics();
  recordRequest('GET', '/api/health', 200, 0.004);
  recordRequest('GET', '/api/health', 200, 0.08);
  recordRequest('POST', '/api/v1/ingest', 500, 1.2);

  const text = renderMetrics();
  assert.match(text, /picolah_http_requests_total\{method="GET",route="\/api\/health"\} 2/);
  assert.match(text, /picolah_http_request_errors_total 1/);
  assert.match(text, /picolah_http_responses_total\{status="200"\} 2/);
  assert.match(text, /picolah_http_responses_total\{status="500"\} 1/);
  assert.match(text, /picolah_http_request_duration_seconds_bucket\{le="0\.005"\} 1/);
  assert.match(text, /picolah_http_request_duration_seconds_bucket\{le="0\.1"\} 2/);
  assert.match(text, /picolah_http_request_duration_seconds_bucket\{le="\+Inf"\} 3/);
  assert.match(text, /picolah_http_request_duration_seconds_count 3/);
});

test('normalizes ids so URLs do not explode label cardinality', () => {
  resetMetrics();
  recordRequest('GET', '/api/conversations/123e4567-e89b-12d3-a456-426614174000', 200, 0.01);
  const text = renderMetrics();
  assert.doesNotMatch(text, /123e4567/);
  assert.match(text, /route="\/api\/conversations\/:id"/);
});
