import { parseArgs } from 'node:util';
import { BrightDataError } from '../src/brightdata/web-unlocker.ts';
import { config } from '../src/config.ts';
import { MARKETS, parseMarkets } from '../src/markets.ts';
import { hasShopeeDataset, searchShopeeDataset } from '../src/platforms/shopee-dataset.ts';

const HELP = `
检查 Bright Data Shopee 数据集是否已配置/开通。

用法：
  pnpm shopee:dataset-check --market=SG --query="Sony WH-1000XM5"

参数：
  -m, --market  市场（默认 SG）
  -q, --query   搜索词（默认 Sony WH-1000XM5）
  -h, --help    显示帮助

注意：这会创建一次真实的 Bright Data 数据集筛选任务，按记录计费。
`.trim();

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      market: { type: 'string', short: 'm' },
      query: { type: 'string', short: 'q' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }
  if (!hasShopeeDataset()) {
    console.error('未配置 BRIGHTDATA_SHOPEE_DATASET_ID。');
    console.error('先在 Bright Data Marketplace 开通 “Shopee - products”，再把 dataset_id 填到 crawler/.env。');
    process.exitCode = 1;
    return;
  }

  const markets = parseMarkets(values.market ? [values.market] : ['SG']);
  const query = values.query?.trim() || 'Sony WH-1000XM5';
  console.log(`dataset_id=${config.brightData.shopeeDatasetId} limit=${config.brightData.shopeeDatasetLimit}`);

  for (const market of markets) {
    console.log(`\n${market} (${MARKETS[market].currency}) query="${query}"`);
    const listings = await searchShopeeDataset(market, query);
    if (!listings.length) {
      console.log('  0 条结果（检查数据集是否覆盖该市场，或筛选词是否太窄）');
      continue;
    }
    for (const listing of listings.slice(0, 5)) {
      console.log(
        `  ${listing.currency} ${listing.price}  rating=${listing.rating ?? '-'}  reviews=${listing.reviews ?? '-'}  ${listing.title.slice(0, 70)}`,
      );
      console.log(`    ${listing.url}`);
    }
  }
}

main().catch((error: unknown) => {
  if (error instanceof BrightDataError) {
    console.error(`[crawler] ${error.message}`);
    if (error.hint) console.error(`[crawler] ${error.hint}`);
  } else {
    console.error(error instanceof Error ? error.stack : String(error));
  }
  process.exitCode = 1;
});
