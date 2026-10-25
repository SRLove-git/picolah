import type { NextFunction, Request, Response } from 'express';

/**
 * Minimal Prometheus-style metrics without pulling in prom-client.
 * Labels are deliberately bounded: method + normalized route + status.
 */
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;
const startedAt = Date.now();

interface RouteMetric {
  count: number;
  errors: number;
}

const routes = new Map<string, RouteMetric>();
const statuses = new Map<string, number>();
const bucketCounts = new Array<number>(BUCKETS.length).fill(0);
let errors = 0;
let durationCount = 0;
let durationSum = 0;
let inFlight = 0;

function normalizeRoute(path: string): string {
  return path
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .slice(0, 120) || '/';
}

function routeOf(req: Request): string {
  const routePath = req.route?.path;
  if (typeof routePath === 'string') {
    return normalizeRoute(`${req.baseUrl || ''}${routePath === '/' ? '' : routePath}`);
  }
  return normalizeRoute(req.path);
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function recordRequest(method: string, route: string, status: number, seconds: number): void {
  route = normalizeRoute(route);
  if (status >= 500) errors += 1;
  durationCount += 1;
  durationSum += Math.max(0, seconds);

  const key = `${method.toUpperCase()} ${route}`;
  const routeMetric = routes.get(key) || { count: 0, errors: 0 };
  routeMetric.count += 1;
  if (status >= 500) routeMetric.errors += 1;
  routes.set(key, routeMetric);

  const statusKey = String(status);
  statuses.set(statusKey, (statuses.get(statusKey) || 0) + 1);

  for (let index = 0; index < BUCKETS.length; index += 1) {
    if (seconds <= BUCKETS[index]) bucketCounts[index] += 1;
  }
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/metrics') {
    next();
    return;
  }
  const start = process.hrtime.bigint();
  inFlight += 1;
  let recorded = false;

  const finish = (status: number) => {
    if (recorded) return;
    recorded = true;
    inFlight = Math.max(0, inFlight - 1);
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    recordRequest(req.method, routeOf(req), status, seconds);
  };

  res.on('finish', () => finish(res.statusCode));
  res.on('close', () => {
    if (!res.writableEnded) finish(499);
  });
  next();
}

export function renderMetrics(): string {
  const lines: string[] = [];
  lines.push('# HELP picolah_http_requests_total Total HTTP requests served.');
  lines.push('# TYPE picolah_http_requests_total counter');
  for (const [key, metric] of [...routes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [method, ...routeParts] = key.split(' ');
    const route = routeParts.join(' ');
    lines.push(
      `picolah_http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}"} ${metric.count}`,
    );
  }

  lines.push('# HELP picolah_http_request_errors_total HTTP 5xx responses.');
  lines.push('# TYPE picolah_http_request_errors_total counter');
  lines.push(`picolah_http_request_errors_total ${errors}`);

  lines.push('# HELP picolah_http_request_duration_seconds Request duration histogram.');
  lines.push('# TYPE picolah_http_request_duration_seconds histogram');
  for (let index = 0; index < BUCKETS.length; index += 1) {
    lines.push(
      `picolah_http_request_duration_seconds_bucket{le="${BUCKETS[index]}"} ${bucketCounts[index]}`,
    );
  }
  lines.push(`picolah_http_request_duration_seconds_bucket{le="+Inf"} ${durationCount}`);
  lines.push(`picolah_http_request_duration_seconds_sum ${durationSum.toFixed(6)}`);
  lines.push(`picolah_http_request_duration_seconds_count ${durationCount}`);

  lines.push('# HELP picolah_http_requests_in_flight Requests currently being handled.');
  lines.push('# TYPE picolah_http_requests_in_flight gauge');
  lines.push(`picolah_http_requests_in_flight ${inFlight}`);

  lines.push('# HELP picolah_http_responses_total Responses by status code.');
  lines.push('# TYPE picolah_http_responses_total counter');
  for (const [status, count] of [...statuses.entries()].sort()) {
    lines.push(`picolah_http_responses_total{status="${status}"} ${count}`);
  }

  lines.push('# HELP picolah_process_uptime_seconds Process uptime.');
  lines.push('# TYPE picolah_process_uptime_seconds gauge');
  lines.push(`picolah_process_uptime_seconds ${((Date.now() - startedAt) / 1000).toFixed(3)}`);
  lines.push('# HELP picolah_process_resident_memory_bytes Resident memory.');
  lines.push('# TYPE picolah_process_resident_memory_bytes gauge');
  lines.push(`picolah_process_resident_memory_bytes ${process.memoryUsage().rss}`);
  return `${lines.join('\n')}\n`;
}

/** Test helper; not exposed over HTTP. */
export function resetMetrics(): void {
  routes.clear();
  statuses.clear();
  bucketCounts.fill(0);
  errors = 0;
  durationCount = 0;
  durationSum = 0;
  inFlight = 0;
}
