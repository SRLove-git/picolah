import { parseCsvRecords } from '../brightdata/csv.ts';
import { BrightDataError } from '../brightdata/web-unlocker.ts';
import { config } from '../config.ts';
import { logInfo, logWarn } from '../log.ts';
import { MARKETS, type MarketCode } from '../markets.ts';
import type { RawListing } from '../types.ts';

const API_BASE = 'https://api.brightdata.com';
const SNAPSHOT_TIMEOUT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 2_000;

interface DatasetFilter {
  name: string;
  operator: 'includes';
  value: string;
}

interface DatasetSnapshot {
  snapshot_id?: string;
  status?: string;
  records_count?: number;
  warning?: string;
  error?: string;
  message?: string;
}

/** True when an activated Shopee dataset has been configured. */
export function hasShopeeDataset(): boolean {
  return Boolean(config.brightData.shopeeDatasetId);
}

/**
 * Use the model token (e.g. "WH-1000XM5") rather than the whole marketing
 * title: the dataset filter is only a candidate retrieval step and the local
 * matcher does the strict brand/model check afterwards.
 */
export function shopeeDatasetKeyword(query: string): string {
  const tokens = query
    .replace(/[()[\]]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const model = tokens.find((token) => /[0-9]/.test(token) && token.length >= 2);
  return (model || tokens.slice(0, 2).join(' ')).trim();
}

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  try {
    return new URL(value.startsWith('//') ? `https:${value}` : value).href;
  } catch {
    return '';
  }
}

function hostMatches(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function itemIdFromUrl(url: string): string {
  return url.match(/-i\.\d+\.(\d+)/)?.[1] || url.match(/\/product\/\d+\/(\d+)/)?.[1] || '';
}

function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.eE+-]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function roundAmount(value: number, decimals: 0 | 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function positiveNumber(raw: string | undefined): number | undefined {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Map Shopee marketplace dataset CSV rows to the crawler's RawListing shape.
 * Rows from other Shopee markets (the dataset is multi-country) are dropped.
 */
export function mapShopeeDatasetRows(
  rows: Array<Record<string, string>>,
  market: MarketCode,
): RawListing[] {
  const marketConfig = MARKETS[market];
  const domain = marketConfig.domains.shopee;
  if (!domain) throw new Error(`Shopee 不支持市场 ${market}`);

  const listings: RawListing[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const url = normalizeUrl(row.url ?? '');
    if (!url || !hostMatches(url, domain)) continue;

    const itemId = row.id?.trim() || itemIdFromUrl(url);
    const title = row.title?.trim().replace(/\s+/g, ' ');
    if (!itemId || !title || seen.has(itemId)) continue;

    const rawPrice = parsePrice(row.final_price ?? row.initial_price);
    if (rawPrice === null) continue;
    const price = roundAmount(rawPrice, marketConfig.decimals);
    if (!price) continue;

    const currency = /^[A-Z]{3}$/.test(row.currency?.trim().toUpperCase() || '')
      ? row.currency.trim().toUpperCase()
      : marketConfig.currency;
    const stock = row.stock?.trim() ?? '';
    const available = row.is_available?.trim().toLowerCase() ?? '';
    const inStock = available === 'false' ? false : stock !== '0';

    seen.add(itemId);
    listings.push({
      platform: 'shopee',
      market,
      itemId,
      title,
      url,
      price,
      currency,
      rating: positiveNumber(row.rating),
      reviews: positiveNumber(row.reviews),
      seller: row.seller_name?.trim() || 'Shopee',
      isOfficial: /official|官方|旗舰/i.test(row.seller_name ?? ''),
      inStock,
    });
  }

  return listings;
}

/** Parse the downloaded CSV snapshot of a Shopee dataset. */
export function parseShopeeDatasetCsv(text: string, market: MarketCode): RawListing[] {
  return mapShopeeDatasetRows(parseCsvRecords(text), market);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function payloadMessage(payload: unknown): string {
  if (typeof payload === 'string') return payload.slice(0, 500);
  if (!isRecord(payload)) return '';
  for (const key of ['message', 'error', 'detail', 'warning']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
  }
  return JSON.stringify(payload).slice(0, 500);
}

function datasetError(status: number, payload: unknown, context: string): BrightDataError {
  const detail = payloadMessage(payload);
  const hints: Record<number, string> = {
    400: '数据集 API 拒绝了请求。若提示 “does not support collection”，说明该数据集不支持 Filter/URL 采集，需要在 Marketplace 里确认它支持 Filter，或改用该数据集的 inputs 接口。',
    401: 'BRIGHTDATA_API_TOKEN 无效或没有数据集权限。',
    402: '账户余额/额度不足。到 Bright Data 控制台充值或确认套餐包含该数据集。',
    404: '数据集不存在或尚未开通。先在 Bright Data Marketplace 激活 “Shopee - products”，再把账号里的 dataset_id 填到 BRIGHTDATA_SHOPEE_DATASET_ID。',
    422: '筛选条件被拒绝；可能是数据集不支持当前字段（title/domain）或 records_limit 超限。',
    429: '请求过于频繁，稍后重试。',
  };
  const code = status === 402 ? 'NO_CREDITS' : status === 404 ? 'DATASET_NOT_FOUND' : 'DATASET_API_ERROR';
  return new BrightDataError(
    `Bright Data 数据集 ${context} 失败（${status}）${detail ? `：${detail}` : ''}`,
    { code, status, hint: hints[status] },
  );
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function authHeaders(): Record<string, string> {
  const token = config.brightData.apiToken;
  if (!token) {
    throw new BrightDataError('缺少 BRIGHTDATA_API_TOKEN，无法调用 Shopee 数据集 API。', {
      code: 'CONFIG_ERROR',
      hint: '在 crawler/.env 里填 BRIGHTDATA_API_TOKEN。',
    });
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function triggerFilter(keyword: string, domain: string): Promise<string> {
  const filter: { operator: 'and'; filters: DatasetFilter[] } = {
    operator: 'and',
    filters: [
      { name: 'title', operator: 'includes', value: keyword },
      { name: 'domain', operator: 'includes', value: domain },
    ],
  };

  const response = await fetch(`${API_BASE}/datasets/filter`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      dataset_id: config.brightData.shopeeDatasetId,
      records_limit: config.brightData.shopeeDatasetLimit,
      filter,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw datasetError(response.status, payload, '筛选');

  if (!isRecord(payload) || typeof payload.snapshot_id !== 'string' || !payload.snapshot_id) {
    throw new BrightDataError('数据集筛选没有返回 snapshot_id。', {
      code: 'DATASET_API_ERROR',
      status: response.status,
    });
  }
  return payload.snapshot_id;
}

/** Poll a filter snapshot until it is ready. Returns false when it has no records. */
async function waitForSnapshot(snapshotId: string): Promise<boolean> {
  const deadline = Date.now() + SNAPSHOT_TIMEOUT_MS;
  let lastWarning = '';
  let lastLogAt = 0;

  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/datasets/snapshots/${encodeURIComponent(snapshotId)}`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      logWarn(`数据集快照状态查询失败，继续等待：${error instanceof Error ? error.message : String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      if (response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      throw datasetError(response.status, payload, '查询快照');
    }

    const snapshot = (isRecord(payload) ? payload : {}) as DatasetSnapshot;
    const status = String(snapshot.status || '').toLowerCase();
    lastWarning = snapshot.warning || snapshot.error || snapshot.message || lastWarning;

    if (status === 'ready') {
      if (snapshot.records_count === 0) return false;
      return true;
    }
    if (status === 'failed') {
      if (/no[_\s-]?records|empty/i.test(lastWarning)) return false;
      throw new BrightDataError(
        `Shopee 数据集筛选失败：${lastWarning || '未返回原因'}`,
        { code: 'DATASET_SNAPSHOT_FAILED', hint: '在 Bright Data 控制台检查该数据集是否已开通、筛选条件是否合法。' },
      );
    }

    const now = Date.now();
    if (now - lastLogAt > 15_000) {
      logInfo(`数据集快照 ${snapshotId} 状态：${status || '等待中'}`);
      lastLogAt = now;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new BrightDataError('等待 Shopee 数据集快照超时（5 分钟）。', {
    code: 'DATASET_TIMEOUT',
    hint: '稍后重试，或在 Bright Data 控制台查看该数据集任务是否堆积。',
  });
}

async function downloadSnapshot(snapshotId: string, market: MarketCode): Promise<RawListing[]> {
  const response = await fetch(
    `${API_BASE}/datasets/snapshots/${encodeURIComponent(snapshotId)}/download?format=csv`,
    { headers: authHeaders(), signal: AbortSignal.timeout(120_000) },
  );
  const text = await response.text();
  if (!response.ok) throw datasetError(response.status, text, '下载快照');
  if (!text.trim()) return [];
  return parseShopeeDatasetCsv(text, market);
}

/**
 * Shopee via an activated Bright Data marketplace dataset (no Shopee login).
 * Requires BRIGHTDATA_SHOPEE_DATASET_ID; otherwise the caller should use the
 * browser/login adapter.
 */
export async function searchShopeeDataset(market: MarketCode, query: string): Promise<RawListing[]> {
  if (!hasShopeeDataset()) {
    throw new BrightDataError('未配置 BRIGHTDATA_SHOPEE_DATASET_ID。', {
      code: 'DATASET_NOT_CONFIGURED',
      hint: '在 Bright Data Marketplace 开通 “Shopee - products” 后，把账号里的 dataset_id 填入 crawler/.env。',
    });
  }

  const domain = MARKETS[market].domains.shopee;
  if (!domain) throw new Error(`Shopee 不支持市场 ${market}`);

  const keyword = shopeeDatasetKeyword(query);
  if (!keyword) throw new Error('Shopee 数据集搜索词为空');

  logInfo(`[crawler] shopee-dataset ${market} 筛选 "${keyword}" ...`);
  const snapshotId = await triggerFilter(keyword, domain);
  const hasRecords = await waitForSnapshot(snapshotId);
  if (!hasRecords) {
    logInfo(`[crawler] shopee-dataset ${market} "${keyword}" -> 0 listings`);
    return [];
  }

  const listings = await downloadSnapshot(snapshotId, market);
  logInfo(`[crawler] shopee-dataset ${market} "${keyword}" -> ${listings.length} listings`);
  return listings;
}
