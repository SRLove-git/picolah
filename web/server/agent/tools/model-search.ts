import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { COUNTRY_CODES, MARKETS } from '../../../shared/types.ts';
import { config } from '../../config.ts';

const platforms = ['lazada', 'shopee', 'amazon-sg'] as const;
export const liveSearchInputSchema = z.object({
  market: z.enum(COUNTRY_CODES),
  platforms: z.array(z.enum(platforms)).min(1).max(3),
  query: z.string().trim().min(2).max(120),
  maxPrice: z.number().finite().positive().max(1e12).optional(),
  model: z.string().min(6).max(40).regex(/^[A-Z]{2,}-?\d{3,}(?:[A-Z]+\d+)*$/).optional(),
});
export type LiveSearchInput = z.infer<typeof liveSearchInputSchema>;
const listingSchema = z.object({
  platform: z.enum(platforms), market: z.enum(COUNTRY_CODES),
  itemId: z.string().min(1).max(150), title: z.string().min(2).max(1000),
  url: z.string().url().max(2000), price: z.number().finite().positive().max(1e12),
  currency: z.string().length(3), inStock: z.literal(true),
  shippingFee: z.number().finite().min(0).max(1e9).optional(),
  discount: z.number().finite().min(0).max(1e9).optional(),
  rating: z.number().finite().min(0).max(5).optional(),
  reviews: z.number().finite().min(0).max(1e8).optional(),
  seller: z.string().max(200).optional(), isOfficial: z.boolean().optional(),
});
export type LiveListing = z.infer<typeof listingSchema>;
const resultSchema = z.object({
  ok: z.literal(true), query: z.string(), model: z.string().optional(),
  market: z.enum(COUNTRY_CODES), platforms: z.array(z.enum(platforms)),
  summary: z.object({
    requests: z.number().int().nonnegative(), matched: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
  }),
  listings: z.array(listingSchema).max(9),
});
export type LiveSearchResult = z.infer<typeof resultSchema>;

const domains: Record<string, Partial<Record<typeof COUNTRY_CODES[number], string>>> = {
  lazada: { SG: 'lazada.sg', MY: 'lazada.com.my', TH: 'lazada.co.th', ID: 'lazada.co.id', PH: 'lazada.com.ph', VN: 'lazada.vn' },
  shopee: { SG: 'shopee.sg', MY: 'shopee.com.my', TH: 'shopee.co.th', ID: 'shopee.co.id', PH: 'shopee.ph', VN: 'shopee.vn' },
  'amazon-sg': { SG: 'amazon.sg' },
};

export function createModelSearchTool(options: {
  url: string; token: string; timeoutMs?: number; fetchImpl?: typeof fetch;
}) {
  return tool(async (input: LiveSearchInput): Promise<LiveSearchResult> => {
    if (!options.url || !options.token) throw new Error('真实爬虫工具尚未配置');
    const response = await (options.fetchImpl ?? fetch)(`${options.url}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token}` },
      body: JSON.stringify(input), signal: AbortSignal.timeout(options.timeoutMs ?? 420_000),
    });
    if (!response.ok) throw new Error(`商品搜索失败（HTTP ${response.status}）`);
    const result = resultSchema.parse(await response.json());
    if (result.summary.matched !== result.listings.length) throw new Error('商品搜索结果计数不一致');
    if (result.model !== input.model || result.query !== input.query || result.market !== input.market ||
        result.platforms.some((platform) => !input.platforms.includes(platform))) {
      throw new Error('商品搜索返回的查询或市场不一致');
    }
    for (const listing of result.listings) {
      const url = new URL(listing.url);
      const domain = domains[listing.platform]?.[input.market];
      if (listing.market !== input.market || !input.platforms.includes(listing.platform) ||
          listing.currency !== MARKETS[input.market].currency || !domain ||
          (input.maxPrice !== undefined && listing.price > input.maxPrice) ||
          url.protocol !== 'https:' || url.username || url.password || url.port ||
          (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) ||
          listing.price + (listing.shippingFee ?? 0) - (listing.discount ?? 0) <= 0) {
        throw new Error('商品搜索返回了无效报价');
      }
      if (input.model) {
        const full = input.model.replace(/-/g, '').split('').join('[\\s-]*');
        if (!new RegExp(`(^|[^A-Z0-9])${full}(?=$|[^A-Z0-9])`, 'i').test(listing.title)) {
          throw new Error('商品搜索返回的型号不一致');
        }
      }
    }
    return result;
  }, {
    name: 'search_marketplace_products',
    description: '所有商品搜索及比价直接调用此工具，从真实电商平台返回本次商品信息和报价。不查询本地商品目录，不回退历史报价。',
    schema: liveSearchInputSchema,
  });
}
export const modelSearchTool = createModelSearchTool(config.crawlerTool);
