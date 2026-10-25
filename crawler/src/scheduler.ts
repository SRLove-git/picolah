import { config } from './config.ts';
import { MARKETS, type MarketCode, type PlatformId } from './markets.ts';
import { crawl } from './pipeline.ts';
import { errorMessage } from './log.ts';

const PLATFORM_IDS: PlatformId[] = ['shopee', 'lazada', 'tiktok', 'amazon-sg', 'tokopedia', 'tiki'];

function listEnv(name: string, fallback: string): string[] {
  return (process.env[name] || fallback)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const markets = listEnv('CRAWLER_MARKETS', 'SG,MY,TH,ID,PH,VN').filter(
  (value): value is MarketCode => value in MARKETS,
);
const platforms = listEnv('CRAWLER_PLATFORMS', 'shopee,lazada').filter(
  (value): value is PlatformId => PLATFORM_IDS.includes(value as PlatformId),
);
const limit = Math.max(1, Math.min(200, Number(process.env.CRAWLER_LIMIT) || 20));
const intervalMinutes = Math.max(15, Number(process.env.CRAWLER_SCHEDULE_MINUTES) || 360);
const once = /^(1|true|yes)$/i.test(process.env.CRAWLER_SCHEDULE_ONCE || '');

if (!markets.length) throw new Error('CRAWLER_MARKETS 没有合法市场。');
if (!platforms.length) throw new Error('CRAWLER_PLATFORMS 没有合法平台。');

let running = false;

async function runOnce(): Promise<void> {
  if (running) {
    console.warn('[scheduler] previous crawl is still running; skipping this tick.');
    return;
  }
  running = true;
  const started = Date.now();
  console.log(
    `[scheduler] start markets=${markets.join(',')} platforms=${platforms.join(',')} limit=${limit}`,
  );
  try {
    const summary = await crawl({
      markets,
      platforms,
      limit,
      dryRun: false,
      concurrency: config.concurrency,
    });
    console.log(
      `[scheduler] done requests=${summary.requests} matched=${summary.matched} ` +
        `skipped=${summary.skipped} failed=${summary.failed} offers=${summary.offers.length} ` +
        `elapsed=${Math.round((Date.now() - started) / 1000)}s`,
    );
  } catch (error) {
    console.error(`[scheduler] crawl failed: ${errorMessage(error)}`);
  } finally {
    running = false;
  }
}

await runOnce();
if (!once) {
  console.log(`[scheduler] next run in ${intervalMinutes} minutes.`);
  setInterval(() => void runOnce(), intervalMinutes * 60_000);
}
