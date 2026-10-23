import { fetchCatalog } from './catalog.ts';
import { pushOffers } from './ingest.ts';
import { logError, logInfo, logWarn, errorMessage } from './log.ts';
import { buildQuery, pickBestListing } from './match.ts';
import {
  MARKETS,
  isPlatformSupported,
  type MarketCode,
  type PlatformId,
} from './markets.ts';
import { getAdapter } from './platforms/index.ts';
import type { BrightDataError } from './brightdata/web-unlocker.ts';
import type { CatalogProduct, MarketOffer, RawListing } from './types.ts';

export interface CrawlOptions {
  markets: MarketCode[];
  platforms: PlatformId[];
  productIds?: string[];
  limit: number;
  dryRun: boolean;
  concurrency: number;
}

interface CrawlTask {
  market: MarketCode;
  platform: PlatformId;
  product: CatalogProduct;
}

export interface CrawlSummary {
  requests: number;
  matched: number;
  skipped: number;
  failed: number;
  offers: MarketOffer[];
}

function toOffer(product: CatalogProduct, listing: RawListing): MarketOffer {
  return {
    market: listing.market,
    externalId: `${listing.market}-${listing.platform}-${listing.itemId}`,
    productId: product.id,
    platformId: listing.platform,
    seller: listing.seller?.trim() || listing.platform,
    currency: listing.currency,
    itemPrice: listing.price,
    shippingFee: 0,
    discount: 0,
    url: listing.url,
    rating: Math.round((listing.rating ?? 0) * 100) / 100,
    reviews: Math.max(0, Math.round(listing.reviews ?? 0)),
    inStock: listing.inStock,
    isOfficial: Boolean(listing.isOfficial),
    capturedAt: new Date().toISOString(),
  };
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let fatal: unknown;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (!fatal) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        await worker(items[index]);
      } catch (error) {
        fatal = error;
        return;
      }
    }
  });
  await Promise.all(runners);
  if (fatal) throw fatal;
}

export async function crawl(options: CrawlOptions): Promise<CrawlSummary> {
  const catalog = await fetchCatalog();
  let products = catalog;

  if (options.productIds?.length) {
    const wanted = new Set(options.productIds);
    products = catalog.filter((product) => wanted.has(product.id));
    const missing = options.productIds.filter((id) => !catalog.some((product) => product.id === id));
    if (missing.length) {
      throw new Error(`商品不存在：${missing.join(', ')}。用 --list 查看可选商品 id。`);
    }
  }

  products = products.slice(0, options.limit);
  if (!products.length) throw new Error('没有可抓取的商品。');

  const tasks: CrawlTask[] = [];
  for (const market of options.markets) {
    for (const platform of options.platforms) {
      if (!isPlatformSupported(MARKETS[market], platform)) {
        logWarn(`${market} 不支持平台 ${platform}，已跳过。`);
        continue;
      }
      for (const product of products) tasks.push({ market, platform, product });
    }
  }

  logInfo(
    `计划 ${tasks.length} 次搜索：市场 ${options.markets.join(',')} × 平台 ${options.platforms.join(',')} × 商品 ${products.length}（并发 ${options.concurrency}）`,
  );

  const summary: CrawlSummary = { requests: 0, matched: 0, skipped: 0, failed: 0, offers: [] };

  await mapPool(tasks, options.concurrency, async (task) => {
    const adapter = getAdapter(task.platform);
    const query = buildQuery(task.product);
    summary.requests += 1;
    try {
      const listings = await adapter.search(task.market, query);
      const best = pickBestListing(task.product, listings);
      if (!best) {
        summary.skipped += 1;
        logInfo(`skip ${task.product.id} @ ${task.market}/${task.platform}：${listings.length} 条结果，没有可信匹配`);
        return;
      }
      const offer = toOffer(task.product, best.listing);
      summary.offers.push(offer);
      summary.matched += 1;
      logInfo(
        `match ${task.product.id} @ ${task.market}/${task.platform} ${offer.currency} ${offer.itemPrice} "${best.listing.title.slice(0, 70)}"`,
      );
    } catch (error) {
      const code = (error as BrightDataError)?.code;
      if (code === 'IP_BLOCKED') throw error;
      summary.failed += 1;
      logError(`${task.product.id} @ ${task.market}/${task.platform}：${errorMessage(error)}`);
    }
  });

  if (options.dryRun) {
    logInfo(`dry-run：${summary.offers.length} 条报价，不写入网站。`);
    console.log(JSON.stringify(summary.offers, null, 2));
  } else if (summary.offers.length) {
    await pushOffers(summary.offers);
  } else {
    logWarn('没有匹配到任何报价，未调用入库接口。');
  }

  logInfo(
    `完成：请求 ${summary.requests}，匹配 ${summary.matched}，跳过 ${summary.skipped}，失败 ${summary.failed}，报价 ${summary.offers.length}`,
  );
  return summary;
}
