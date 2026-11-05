import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { COUNTRY_CODES, MARKETS } from '../../../shared/types.ts';
import { canonicalModelCode, compactModel } from '../../../shared/model-search.ts';
import { config } from '../../config.ts';
import { isSupportedCurrency } from '../../../shared/format.ts';

const platforms = ['lazada', 'shopee', 'amazon-sg'] as const;
const excludedPlatforms = ['lazada', 'shopee', 'amazon-sg', 'tiktok', 'tokopedia', 'tiki'] as const;
export const liveSearchInputSchema = z.object({
  market: z.enum(COUNTRY_CODES),
  scope: z.enum(['web', 'platforms']).optional(),
  geography: z.literal('global').optional(),
  platforms: z.array(z.enum(platforms)).max(3),
  excludedPlatforms: z.array(z.enum(excludedPlatforms)).max(6).optional(),
  query: z.string().trim().min(2).max(120),
  maxPrice: z.number().finite().positive().max(1e12).optional(),
  model: z.string().trim().min(6).max(40).transform((value, ctx) => {
    const model = canonicalModelCode(value);
    if (model) return model;
    ctx.addIssue({ code: 'custom', message: '请提供完整且唯一的商品型号' });
    return z.NEVER;
  }).optional(),
}).refine((input) => input.scope === 'web' ? input.platforms.length === 0 : input.platforms.length > 0,
  { message: '全网搜索不能附带平台限制，指定平台搜索至少需要一个平台' })
  .refine((input) => input.scope === 'web' || !input.excludedPlatforms?.length,
    { message: '指定平台搜索需直接传入已排除后的平台列表' })
  .refine((input) => !input.geography || input.scope === 'web', { message: '全球范围仅支持全网搜索' });
export type LiveSearchInput = z.infer<typeof liveSearchInputSchema>;
const listingSchema = z.object({
  platform: z.enum([...platforms, 'web']), sourceHost: z.string().max(253).optional(), market: z.enum(COUNTRY_CODES),
  itemId: z.string().min(1).max(150), title: z.string().min(2).max(1000),
  url: z.string().url().max(2000), imageUrl: z.string().url().max(2000).optional(),
  price: z.number().finite().positive().max(1e12),
  currency: z.string().length(3), inStock: z.literal(true),
  shippingFee: z.number().finite().min(0).max(1e9).optional(),
  discount: z.number().finite().min(0).max(1e9).optional(),
  rating: z.number().finite().min(0).max(5).optional(),
  reviews: z.number().finite().min(0).max(1e8).optional(),
  seller: z.string().max(200).optional(), isOfficial: z.boolean().optional(),
  verification: z.object({ source: z.literal('product-page'), checkedAt: z.string().datetime() }).optional(),
  productDetails: z.object({ brand: z.string().max(120).optional(), model: z.string().max(120).optional(),
    description: z.string().max(1000).optional() }).optional(),
});
export type LiveListing = z.infer<typeof listingSchema>;
const resultSchema = z.object({
  ok: z.literal(true), query: z.string(), model: z.string().optional(),
  geography: z.literal('global').optional(),
  market: z.enum(COUNTRY_CODES), scope: z.enum(['web', 'platforms']).optional(), platforms: z.array(z.enum(platforms)),
  summary: z.object({
    requests: z.number().int().nonnegative(), matched: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
    failureCodes: z.array(z.string().max(80)).max(20).optional(),
    failedPlatforms: z.array(z.enum(excludedPlatforms)).max(6).optional(),
    discovered: z.number().int().nonnegative().max(24).optional(),
    pagesChecked: z.number().int().nonnegative().max(12).optional(),
    pagesVerified: z.number().int().nonnegative().max(12).optional(),
  }),
  listings: z.array(listingSchema).max(12),
});
export type LiveSearchResult = z.infer<typeof resultSchema>;

const domains: Record<string, Partial<Record<typeof COUNTRY_CODES[number], string>>> = {
  lazada: { SG: 'lazada.sg', MY: 'lazada.com.my', TH: 'lazada.co.th', ID: 'lazada.co.id', PH: 'lazada.com.ph', VN: 'lazada.vn' },
  shopee: { SG: 'shopee.sg', MY: 'shopee.com.my', TH: 'shopee.co.th', ID: 'shopee.co.id', PH: 'shopee.ph', VN: 'shopee.vn' },
  'amazon-sg': { SG: 'amazon.sg' },
};

const excludedDomains: Record<typeof excludedPlatforms[number], string[]> = {
  lazada: [...Object.values(domains.lazada), 'lazada.com', 'lazmall.com'] as string[],
  shopee: [...Object.values(domains.shopee), 'shopee.com', 'shopee.tw', 'shopee.co.th', 'shopee.co.id', 'shopee.com.br', 'shopee.com.mx', 'shopee.cl', 'shopee.com.co', 'shp.ee', 'shope.ee'] as string[],
  'amazon-sg': ['amazon.sg', 'amazon.com', 'amazon.co.uk', 'amazon.co.jp', 'amazon.com.au', 'amazon.in', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.ca', 'amazon.com.br', 'amazon.com.mx', 'amazon.ae', 'amazon.sa', 'amazon.nl', 'amazon.pl', 'amazon.se', 'amazon.com.be', 'amazon.com.tr', 'amazon.eg', 'amazon.co.za', 'amzn.to', 'amzn.asia', 'amzn.eu', 'amzn.in', 'a.co'],
  tiktok: ['tiktok.com', 'tiktokglobalshop.com', 'tiktokshop.com', 'shop-tokopedia.com'],
  tokopedia: ['tokopedia.com', 'tokopedia.link', 'shop-tokopedia.com'],
  tiki: ['tiki.vn'],
};
const withinDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export class ModelSearchError extends Error {
  constructor(readonly code: 'CRAWLER_QUEUE_FULL' | 'CRAWLER_QUEUE_TIMEOUT') {
    super(code === 'CRAWLER_QUEUE_FULL' ? '当前搜索较多，请稍后重试' : '搜索等待超时，请稍后重试');
    this.name = 'ModelSearchError';
  }
}

function publicSourceHost(host: string): boolean {
  if (host !== host.toLowerCase() || host.startsWith('www.') || host.length > 253 || !host.includes('.')) return false;
  const labels = host.split('.');
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    /^[a-z]{2,63}$/.test(labels.at(-1)!) &&
    !/(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion|home|lan|arpa)$/.test(host);
}

export function createModelSearchTool(options: {
  url: string; token: string; timeoutMs?: number; fetchImpl?: typeof fetch;
}) {
  return tool(async (input: LiveSearchInput): Promise<LiveSearchResult> => {
    if (!options.url || !options.token) throw new Error('真实爬虫工具尚未配置');
    const startedAt = Date.now();
    const response = await (options.fetchImpl ?? fetch)(`${options.url}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token}` },
      body: JSON.stringify(input), signal: AbortSignal.timeout(options.timeoutMs ?? 420_000),
    });
    if (!response.ok) {
      if (response.status === 503) {
        const body: unknown = await response.json().catch(() => null);
        const code = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
        if (code === 'crawler_queue_full') throw new ModelSearchError('CRAWLER_QUEUE_FULL');
        if (code === 'crawler_queue_timeout') throw new ModelSearchError('CRAWLER_QUEUE_TIMEOUT');
      }
      throw new Error(`商品搜索失败（HTTP ${response.status}）`);
    }
    const result = resultSchema.parse(await response.json());
    if (result.summary.matched !== result.listings.length) throw new Error('商品搜索结果计数不一致');
    const web = input.scope === 'web';
    if ((result.scope ?? 'platforms') !== (input.scope ?? 'platforms') ||
        result.model !== input.model || result.query !== input.query || result.market !== input.market || result.geography !== input.geography ||
        (!web && result.platforms.some((platform) => !input.platforms.includes(platform)))) {
      throw new Error('商品搜索返回的查询或市场不一致');
    }
    for (const listing of result.listings) {
      if (!listing.verification || Date.parse(listing.verification.checkedAt) > Date.now() + 60_000
        || Date.parse(listing.verification.checkedAt) < startedAt - 60_000) {
        throw new Error('商品搜索返回了未经本次商品详情页核验的报价');
      }
      const url = new URL(listing.url);
      const imageUrl = listing.imageUrl ? new URL(listing.imageUrl) : null;
      const domain = domains[listing.platform]?.[input.market];
      const host = url.hostname.replace(/^www\./, '');
      const validSource = listing.platform === 'web'
        ? web && listing.sourceHost === host && publicSourceHost(host)
        : Boolean(domain && withinDomain(url.hostname, domain) && (web || input.platforms.includes(listing.platform)));
      const global = web && input.geography === 'global';
      const foreignKnownMarket = !global && platforms.some((platform) => excludedDomains[platform].some((entry) => withinDomain(host, entry)) &&
        (!domains[platform]?.[input.market] || !withinDomain(host, domains[platform][input.market]!)));
      const excluded = (input.excludedPlatforms ?? []).some((platform) => excludedDomains[platform].some((domain) => withinDomain(host, domain)));
      if (listing.market !== input.market || !validSource || excluded || foreignKnownMarket ||
          (global ? !isSupportedCurrency(listing.currency) : listing.currency !== MARKETS[input.market].currency) ||
          (input.maxPrice !== undefined && (!global || listing.currency === MARKETS[input.market].currency) && listing.price > input.maxPrice) ||
          url.protocol !== 'https:' || url.username || url.password || url.port ||
          (imageUrl && (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password || imageUrl.port
            || !publicSourceHost(imageUrl.hostname.replace(/^www\./, '')))) ||
          listing.price + (listing.shippingFee ?? 0) - (listing.discount ?? 0) <= 0) {
        throw new Error('商品搜索返回了无效报价');
      }
      if (input.model) {
        const full = compactModel(input.model).split('').join('[\\s-]*');
        const identity = [listing.title, listing.productDetails?.model].filter(Boolean).join(' ');
        if (!new RegExp(`(^|[^A-Z0-9])${full}(?=$|[^A-Z0-9])`, 'i').test(identity.normalize('NFKC'))) {
          throw new Error('商品搜索返回的型号不一致');
        }
      }
    }
    return result;
  }, {
    name: 'search_marketplace_products',
    description: '商品比价使用两阶段查询：先搜索当前市场的商品链接，再抓取详情页核验型号、在售价格和库存。默认 scope=platforms，支持 Shopee、Lazada 及新加坡的 Amazon SG，保留用户平台筛选；配置了搜索引擎接口时可使用 scope=web、platforms=[]。只返回商品页已核验的报价与详情，不使用搜索摘要价或历史报价。',
    schema: liveSearchInputSchema,
  });
}
export const modelSearchTool = createModelSearchTool(config.crawlerTool);
