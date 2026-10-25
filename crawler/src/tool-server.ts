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
}

function json(response: ServerResponse, status: number, body: unknown): void {
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
  if (!(market in MARKETS)) throw new Error(`不支持的市场：${market || '空'}`);

  const platforms = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase()))]
    : [];
  if (!platforms.length || platforms.length > 3) throw new Error('platforms 必须包含 1–3 个平台');
  for (const platform of platforms) {
    if (!(platform in ADAPTERS)) throw new Error(`真实爬虫尚未实现平台：${platform}`);
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
  const scope = parseScope(value);
  const body = value as Record<string, unknown>;
  const query = normalizeSearchQuery(typeof body.query === 'string' ? body.query : '');
  const model = body.model === undefined ? undefined : normalizeDiscoveryModel(typeof body.model === 'string' ? body.model : '');
  if (body.maxPrice !== undefined && (typeof body.maxPrice !== 'number' || !Number.isFinite(body.maxPrice) || body.maxPrice <= 0 || body.maxPrice > 1e12)) throw new Error('maxPrice 必须是有效正数');
  return { ...scope, query, ...(model ? { model } : {}), ...(typeof body.maxPrice === 'number' ? { maxPrice: body.maxPrice } : {}) };
}

export function createCrawlerToolServer(options: ToolServerOptions) {
  if (!options.token) throw new Error('CRAWLER_TOOL_TOKEN 未配置');
  const run = options.run || crawl;
  const search = options.search || discoverProduct;
  let running = false;

  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      json(response, 200, { ok: true, running });
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
    if (running) {
      json(response, 409, { error: 'crawler_busy', message: '已有真实爬虫任务正在运行' });
      return;
    }

    running = true;
    try {
      if (request.url === '/search') {
        const input = parseSearchRequest(await readBody(request));
        json(response, 200, await search(input));
        return;
      }
      const input = parseRequest(await readBody(request));
      const summary = await run({
        markets: [input.market],
        platforms: input.platforms,
        productIds: input.productIds,
        limit: input.productIds.length,
        dryRun: false,
        concurrency: Math.min(config.concurrency, 2),
      });
      json(response, 200, {
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
      });
    } catch (error) {
      json(response, 400, { error: request.url === '/search' ? 'search_failed' : 'crawl_failed', message: errorMessage(error) });
    } finally {
      running = false;
    }
  });
}

async function main(): Promise<void> {
  const server = createCrawlerToolServer({ token: config.toolToken });
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
