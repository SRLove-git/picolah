import { parseArgs } from 'node:util';
import { BrightDataError } from './brightdata/web-unlocker.ts';
import { fetchCatalog } from './catalog.ts';
import { config } from './config.ts';
import { errorMessage, logInfo, logWarn } from './log.ts';
import { MARKETS, parseMarkets, type MarketCode, type PlatformId } from './markets.ts';
import { ADAPTERS } from './platforms/index.ts';
import { crawl } from './pipeline.ts';

const HELP = `
Picolah crawler — 用 Bright Data 采集东南亚平台报价并写入网站。

用法：
  pnpm crawl --market <SG,MY,...> [--platform lazada,shopee] [options]

必填：
  -m, --market     市场，逗号分隔：SG MY TH ID PH VN

可选：
  -p, --platform   平台，默认 lazada；已实现：lazada、shopee（实验）
  -i, --product    只跑指定商品 id，逗号分隔（默认按 --limit 取目录前几个）
  -l, --limit      最多跑多少个商品，默认 5
      --concurrency 并发搜索数，默认 2
  -d, --dry-run    只打印报价 JSON，不写入网站
      --list       列出网站商品目录后退出
      --all        不限商品数量（等于 --limit 999）
  -h, --help       显示帮助

示例：
  pnpm crawl --list
  pnpm crawl --market SG --platform lazada --product sony-wh1000xm5 --dry-run
  pnpm crawl --market SG,MY --platform lazada --limit 3
  pnpm crawl --market SG --platform lazada,shopee --limit 2

注意：每次搜索 = 1 次 Bright Data 请求（会产生费用）。
`.trim();

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      market: { type: 'string', short: 'm', multiple: true },
      platform: { type: 'string', short: 'p', multiple: true },
      product: { type: 'string', short: 'i', multiple: true },
      limit: { type: 'string', short: 'l' },
      concurrency: { type: 'string' },
      'dry-run': { type: 'boolean', short: 'd' },
      list: { type: 'boolean' },
      all: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (values.list) {
    const products = await fetchCatalog();
    console.log(`${products.length} 个商品（来自 ${config.apiBase}/api/catalog）：`);
    for (const product of products) {
      console.log(`  ${product.id.padEnd(32)} ${product.brand.padEnd(12)} ${product.name}`);
    }
    return;
  }

  if (!values.market?.length) {
    console.log(HELP);
    process.exitCode = 1;
    return;
  }

  const markets = parseMarkets(values.market);
  const platformValues = (values.platform?.length ? values.platform : ['lazada'])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const unknownPlatforms = platformValues.filter((value) => !(value in ADAPTERS));
  if (unknownPlatforms.length) {
    throw new Error(
      `平台未实现：${unknownPlatforms.join(', ')}。目前支持：${Object.keys(ADAPTERS).join(', ')}`,
    );
  }
  const platforms = [...new Set(platformValues)] as PlatformId[];

  const limit = values.all ? 999 : clampInt(values.limit, 5, 1, 999);
  const concurrency = clampInt(values.concurrency, config.concurrency, 1, 6);
  const productIds = (values.product ?? [])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  if (platforms.some((platform) => ADAPTERS[platform]?.experimental)) {
    logWarn('shopee 适配器仍标记为实验性（依赖 Scraping Browser 的渲染结果）。');
  }

  logInfo(
    `市场 ${markets.join(',')} · 平台 ${platforms.join(',')} · 商品 ${productIds.length ? productIds.join(',') : `前 ${limit} 个`}`,
  );
  logInfo(
    `商品目录 ${config.apiBase}/api/catalog · 入库源 ${config.source}${values['dry-run'] ? ' · DRY RUN' : ''}`,
  );
  for (const market of markets) {
    logInfo(`  ${market} ${MARKETS[market].currency} · ${MARKETS[market].platforms.join('/')}`);
  }

  try {
    await crawl({
      markets: markets as MarketCode[],
      platforms,
      productIds: productIds.length ? productIds : undefined,
      limit,
      dryRun: Boolean(values['dry-run']),
      concurrency,
    });
  } catch (error) {
    if (error instanceof BrightDataError) {
      console.error(`[crawler] ${error.message}`);
      if (error.hint) console.error(`[crawler] ${error.hint}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
