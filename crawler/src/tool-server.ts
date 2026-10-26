import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config } from './config.ts';
import { errorMessage } from './log.ts';
import { isPlatformSupported, MARKETS, type MarketCode, type PlatformId } from './markets.ts';
import { crawl, type CrawlOptions, type CrawlSummary } from './pipeline.ts';
import { ADAPTERS } from './platforms/index.ts';
import { discoverProduct, type DiscoveryOptions, type DiscoveryResult } from './discovery.ts';
import { normalizeDiscoveryModel, normalizeSearchQuery } from './discovery-match.ts';
import { DISCOVERY_PLATFORMS } from './web-discovery.ts';

const MAX_BODY_BYTES = 32 * 1024;

export interface CrawlerToolRequest {
  market: MarketCode;
  platforms: PlatformId[];
  productIds: string[];
}

interface ToolServerOptions {
  token: string;
  run?: (options: CrawlOptions) => Promise<CrawlSummary>;
  search?: (options: DiscoveryOptions) => Promise<DiscoveryResult>;
  maxConcurrentSearches?: number;
  maxQueuedRequests?: number;
  queueWaitTimeoutMs?: number;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function authorized(request: IncomingMessage, token: string): boolean {
  const value = request.headers.authorization || '';
  const candidate = value.startsWith('Bearer ') ? value.slice(7) : '';
  if (!candidate || Buffer.byteLength(candidate) !== Buffer.byteLength(token)) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parseScope(value: unknown): Pick<CrawlerToolRequest, 'market' | 'platforms'> {
  const body = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const market = typeof body.market === 'string' ? body.market.toUpperCase() : '';
  if (!Object.hasOwn(MARKETS, market)) throw new Error(`不支持的市场：${market || '空'}`);

  if (!Array.isArray(body.platforms) || body.platforms.some((item) => typeof item !== 'string')) throw new Error('platforms 必须是平台字符串数组');

  const platforms = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase()))]
    : [];
  if (!platforms.length || platforms.length > 3) throw new Error('platforms 必须包含 1–3 个平台');
  for (const platform of platforms) {
    if (!Object.hasOwn(ADAPTERS, platform)) throw new Error(`真实爬虫尚未实现平台：${platform}`);
    if (!isPlatformSupported(MARKETS[market as MarketCode], platform as PlatformId)) {
      throw new Error(`${market} 市场不支持平台：${platform}`);
    }
  }

  return { market: market as MarketCode, platforms: platforms as PlatformId[] };
}

function parseRequest(value: unknown): CrawlerToolRequest {
  const scope = parseScope(value);
  const body = value as Record<string, unknown>;
  const productIds = Array.isArray(body.productIds)
    ? [...new Set(body.productIds.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : [];
  if (!productIds.length || productIds.length > 4) throw new Error('productIds 必须包含 1–4 个商品 ID');
  if (productIds.some((id) => !/^[a-z0-9][a-z0-9-]{1,80}$/i.test(id))) {
    throw new Error('productIds 包含非法字符');
  }

  return {
    ...scope,
    productIds,
  };
}

function parseSearchRequest(value: unknown): DiscoveryOptions {
  const body = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  if (body.scope !== undefined && body.scope !== 'web' && body.scope !== 'platforms') throw new Error('scope 必须是 web 或 platforms');
  let scope: Pick<DiscoveryOptions, 'market' | 'platforms' | 'scope' | 'excludedPlatforms'>;
  if (body.scope === 'web') {
    const market = typeof body.market === 'string' ? body.market.toUpperCase() : '';
    if (!Object.hasOwn(MARKETS, market)) throw new Error('不支持的全网搜索市场');
    if (!Array.isArray(body.platforms) || body.platforms.length !== 0) throw new Error('全网搜索的 platforms 必须为空数组');
    if (body.excludedPlatforms !== undefined && (!Array.isArray(body.excludedPlatforms)
      || body.excludedPlatforms.length > 6 || body.excludedPlatforms.some((item) => typeof item !== 'string' || !DISCOVERY_PLATFORMS.includes(item as PlatformId)))) {
      throw new Error('excludedPlatforms 必须是有效平台数组');
    }
    const excluded = [...new Set((body.excludedPlatforms ?? []) as PlatformId[])];
    scope = { market: market as MarketCode, platforms: [], scope: 'web', ...(excluded.length ? { excludedPlatforms: excluded } : {}) };
  } else {
    if (body.excludedPlatforms !== undefined && (!Array.isArray(body.excludedPlatforms) || body.excludedPlatforms.length)) {
      throw new Error('平台搜索应直接通过 platforms 指定范围');
    }
    scope = { ...parseScope(value), ...(body.scope === 'platforms' ? { scope: 'platforms' as const } : {}) };
  }
  const query = normalizeSearchQuery(typeof body.query === 'string' ? body.query : '');
  const model = body.model === undefined ? undefined : normalizeDiscoveryModel(typeof body.model === 'string' ? body.model : '');
  if (body.maxPrice !== undefined && (typeof body.maxPrice !== 'number' || !Number.isFinite(body.maxPrice) || body.maxPrice <= 0 || body.maxPrice > 1e12)) throw new Error('maxPrice 必须是有效正数');
  return { ...scope, query, ...(model ? { model } : {}), ...(typeof body.maxPrice === 'number' ? { maxPrice: body.maxPrice } : {}) };
}

export function createCrawlerToolServer(options: ToolServerOptions) {
  if (!options.token) throw new Error('CRAWLER_TOOL_TOKEN 未配置');
  const run = options.run || crawl;
  const search = options.search || discoverProduct;
  const maxConcurrentSearches = options.maxConcurrentSearches ?? 3;
  const maxQueuedRequests = options.maxQueuedRequests ?? 8;
  const queueWaitTimeoutMs = options.queueWaitTimeoutMs ?? 120_000;
  if (!Number.isSafeInteger(maxConcurrentSearches) || maxConcurrentSearches < 1 || maxConcurrentSearches > 8) {
    throw new Error('maxConcurrentSearches 必须是 1–8 的整数');
  }
  if (!Number.isSafeInteger(maxQueuedRequests) || maxQueuedRequests < 0 || maxQueuedRequests > 100) {
    throw new Error('maxQueuedRequests 必须是 0–100 的整数');
  }
  if (!Number.isSafeInteger(queueWaitTimeoutMs) || queueWaitTimeoutMs < 1 || queueWaitTimeoutMs > 420_000) {
    throw new Error('queueWaitTimeoutMs 必须是 1–420000 的整数');
  }
  interface Job {
    kind: 'search' | 'crawl';
    response: ServerResponse;
    execute: () => Promise<unknown>;
    errorCode: 'search_failed' | 'crawl_failed';
    timeout?: ReturnType<typeof setTimeout>;
    onClose?: () => void;
  }
  let activeSearches = 0;
  let crawlRunning = false;
  const queue: Job[] = [];

  function cleanup(job: Job): void {
    if (job.timeout) clearTimeout(job.timeout);
    if (job.onClose) job.response.off('close', job.onClose);
  }

  function removeQueuedJob(job: Job): void {
    const index = queue.indexOf(job);
    if (index !== -1) queue.splice(index, 1);
    cleanup(job);
  }

  function dispatch(): void {
    while (queue.length) {
      const next = queue[0];
      if (next.response.destroyed || next.response.writableEnded) {
        queue.shift();
        cleanup(next);
        continue;
      }
      if (next.kind === 'crawl') {
        if (crawlRunning || activeSearches > 0) return;
        queue.shift();
        void execute(next);
        return;
      }
      if (crawlRunning || activeSearches >= maxConcurrentSearches) return;
      queue.shift();
      void execute(next);
    }
  }

  async function execute(job: Job): Promise<void> {
    cleanup(job);
    if (job.kind === 'search') activeSearches += 1;
    else crawlRunning = true;
    try {
      json(job.response, 200, await job.execute());
    } catch (error) {
      json(job.response, 400, { error: job.errorCode, message: errorMessage(error) });
    } finally {
      // A disconnected active request still owns its slot until its crawler settles.
      // Releasing it earlier could exceed the paid-request limit or overlap writes.
      if (job.kind === 'search') activeSearches -= 1;
      else crawlRunning = false;
      dispatch();
    }
  }

  function enqueue(job: Job): void {
    if (job.response.destroyed || job.response.writableEnded) return;
    const canStartNow = queue.length === 0 && (job.kind === 'search'
      ? !crawlRunning && activeSearches < maxConcurrentSearches
      : !crawlRunning && activeSearches === 0);
    if (canStartNow) {
      void execute(job);
      return;
    }
    if (queue.length >= maxQueuedRequests) {
      job.response.setHeader('retry-after', '5');
      json(job.response, 503, { error: 'crawler_queue_full', message: '商品搜索排队人数较多，请稍后重试' });
      return;
    }
    job.onClose = () => removeQueuedJob(job);
    job.response.once('close', job.onClose);
    job.timeout = setTimeout(() => {
      removeQueuedJob(job);
      job.response.setHeader('retry-after', '5');
      json(job.response, 503, { error: 'crawler_queue_timeout', message: '商品搜索排队超时，请稍后重试' });
    }, queueWaitTimeoutMs);
    job.timeout.unref();
    queue.push(job);
    dispatch();
  }

  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      json(response, 200, {
        ok: true,
        running: crawlRunning || activeSearches > 0,
        activeSearches,
        crawlRunning,
        searchConcurrency: maxConcurrentSearches,
        queued: queue.length,
        queueCapacity: maxQueuedRequests,
      });
      return;
    }
    if (request.method !== 'POST' || !['/crawl', '/search'].includes(request.url || '')) {
      json(response, 404, { error: 'not_found' });
      return;
    }
    if (!authorized(request, options.token)) {
      json(response, 401, { error: 'unauthorized' });
      return;
    }
    try {
      if (request.url === '/search') {
        const input = parseSearchRequest(await readBody(request));
        enqueue({ kind: 'search', response, errorCode: 'search_failed', execute: () => search(input) });
        return;
      }
      const input = parseRequest(await readBody(request));
      enqueue({ kind: 'crawl', response, errorCode: 'crawl_failed', execute: async () => {
        const summary = await run({
          markets: [input.market],
          platforms: input.platforms,
          productIds: input.productIds,
          limit: input.productIds.length,
          dryRun: false,
          concurrency: Math.min(config.concurrency, 2),
        });
        return {
          ok: true,
          market: input.market,
          platforms: input.platforms,
          productIds: input.productIds,
          summary: {
            requests: summary.requests,
            matched: summary.matched,
            skipped: summary.skipped,
            failed: summary.failed,
            offers: summary.offers.map((offer) => ({
              productId: offer.productId,
              platformId: offer.platformId,
              seller: offer.seller,
              currency: offer.currency,
              itemPrice: offer.itemPrice,
              capturedAt: offer.capturedAt,
            })),
          },
        };
      } });
    } catch (error) {
      json(response, 400, { error: request.url === '/search' ? 'search_failed' : 'crawl_failed', message: errorMessage(error) });
    }
  });
}

async function main(): Promise<void> {
  const server = createCrawlerToolServer({
    token: config.toolToken,
    maxConcurrentSearches: config.toolSearchConcurrency,
  });
  server.listen(config.toolPort, config.toolHost, () => {
    console.log(`[crawler-tool] listening on http://${config.toolHost}:${config.toolPort}`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch((error) => {
    console.error(`[crawler-tool] fatal: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
