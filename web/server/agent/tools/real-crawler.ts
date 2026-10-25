import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { COUNTRY_CODES } from '../../../shared/types.ts';
import { config } from '../../config.ts';

const REAL_CRAWLER_PLATFORMS = ['lazada', 'shopee', 'amazon-sg'] as const;

export const realCrawlerInputSchema = z.object({
  market: z.enum(COUNTRY_CODES).describe('东南亚市场代码'),
  platforms: z.array(z.enum(REAL_CRAWLER_PLATFORMS)).min(1).max(3)
    .describe('要实时抓取的平台'),
  productIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/i)).min(1).max(4)
    .describe('价格库中已经确认的商品 ID'),
});

export type RealCrawlerInput = z.infer<typeof realCrawlerInputSchema>;

export interface RealCrawlerResult {
  ok: boolean;
  market: string;
  platforms: string[];
  productIds: string[];
  summary: {
    requests: number;
    matched: number;
    skipped: number;
    failed: number;
    offers: Array<{
      productId: string;
      platformId: string;
      seller: string;
      currency: string;
      itemPrice: number;
      capturedAt: string;
    }>;
  };
}

interface RealCrawlerToolOptions {
  url: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createRealCrawlerTool(options: RealCrawlerToolOptions) {
  return tool(
    async (input: RealCrawlerInput): Promise<RealCrawlerResult> => {
      if (!options.url || !options.token) throw new Error('真实爬虫工具尚未配置');
      const response = await (options.fetchImpl || fetch)(`${options.url}/crawl`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.token}`,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(options.timeoutMs ?? 420_000),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<RealCrawlerResult> & {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.message || `真实爬虫请求失败（HTTP ${response.status}）`);
      }
      if (!body.ok || !body.summary) throw new Error('真实爬虫返回了无效结果');
      return body as RealCrawlerResult;
    },
    {
      name: 'refresh_marketplace_offers',
      description: '当已经确认具体商品并进行普通比价，或用户明确要求实时、最新、刷新价格时调用。使用本地目录已确认的商品 ID，从真实电商平台抓取报价并写入价格库。',
      schema: realCrawlerInputSchema,
    },
  );
}

export const realCrawlerTool = createRealCrawlerTool({
  url: config.crawlerTool.url,
  token: config.crawlerTool.token,
  timeoutMs: config.crawlerTool.timeoutMs,
});

export function requestsRealCrawler(message: string): boolean {
  return /(?:实时|最新|刷新|重新抓|现抓|爬一下|刚刚的价格|现在的价格|live\s*price|refresh)/i.test(message);
}

export function shouldUseRealCrawler(
  message: string,
  comparisonKind: 'comparison' | 'suggestions' | 'recommendation' | 'empty',
  hasConfirmedProduct: boolean,
): boolean {
  return requestsRealCrawler(message) || (comparisonKind === 'comparison' && hasConfirmedProduct);
}

export function supportedRealCrawlerPlatforms(
  marketPlatforms: string[],
  requestedPlatforms: string[],
  defaults: string[],
): Array<(typeof REAL_CRAWLER_PLATFORMS)[number]> {
  const candidates = requestedPlatforms.length ? requestedPlatforms : defaults;
  return candidates.filter(
    (platform, index): platform is (typeof REAL_CRAWLER_PLATFORMS)[number] =>
      REAL_CRAWLER_PLATFORMS.includes(platform as (typeof REAL_CRAWLER_PLATFORMS)[number]) &&
      marketPlatforms.includes(platform) &&
      candidates.indexOf(platform) === index,
  );
}
