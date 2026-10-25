import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Load crawler/.env regardless of the current working directory.
loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${name}。复制 crawler/.env.example 为 crawler/.env 后填写。`);
  }
  return value;
}

function numberEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export type BrightDataTransport = 'api' | 'proxy';

function transportEnv(): BrightDataTransport {
  const value = (process.env.BRIGHTDATA_TRANSPORT || 'api').trim().toLowerCase();
  if (value !== 'api' && value !== 'proxy') {
    throw new Error(`BRIGHTDATA_TRANSPORT 只能是 api 或 proxy，当前是 "${value}"。`);
  }
  return value;
}

const brightData = {
  customerId: process.env.BRIGHTDATA_CUSTOMER_ID?.trim() || '',
  apiToken: process.env.BRIGHTDATA_API_TOKEN?.trim() || '',
  zone: process.env.BRIGHTDATA_ZONE?.trim() || '',
  transport: transportEnv(),
  proxyZone: process.env.BRIGHTDATA_PROXY_ZONE?.trim() || '',
  proxyPassword: process.env.BRIGHTDATA_PROXY_PASSWORD?.trim() || '',
  proxyHost: (process.env.BRIGHTDATA_PROXY_HOST?.trim() || 'http://brd.superproxy.io:44445').replace(/\/+$/, ''),
  browserCustomerId: process.env.BRIGHTDATA_BROWSER_CUSTOMER_ID?.trim() || '',
  browserZone: process.env.BRIGHTDATA_BROWSER_ZONE?.trim() || '',
  browserPassword: process.env.BRIGHTDATA_BROWSER_ZONE_PASSWORD?.trim() || '',
  browserHost: process.env.BRIGHTDATA_BROWSER_HOST?.trim() || 'brd.superproxy.io',
  browserPort: numberEnv('BRIGHTDATA_BROWSER_PORT', 9222, 1, 65535),
  /** Activated Shopee marketplace dataset id; empty = use the login/browser path. */
  shopeeDatasetId: process.env.BRIGHTDATA_SHOPEE_DATASET_ID?.trim() || '',
  /** Max records requested per dataset filter job. */
  shopeeDatasetLimit: numberEnv('BRIGHTDATA_SHOPEE_DATASET_LIMIT', 50, 1, 1000),
};

export const config = {
  apiBase: (process.env.PICOLAH_API_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, ''),
  ingestKey: process.env.PICOLAH_INGEST_KEY || 'pcl_dev_crawler_key',
  source: process.env.CRAWLER_SOURCE || 'picolah-crawler',
  concurrency: numberEnv('CRAWLER_CONCURRENCY', 2, 1, 6),
  toolHost: process.env.CRAWLER_TOOL_HOST || '127.0.0.1',
  toolPort: numberEnv('CRAWLER_TOOL_PORT', 8790, 1, 65535),
  toolToken: process.env.CRAWLER_TOOL_TOKEN?.trim() || '',
  /** Set CRAWLER_LOCAL_PROXY=off to let local Chrome use the direct connection. */
  localProxyEnabled: !/^(off|0|false|no)$/i.test((process.env.CRAWLER_LOCAL_PROXY || '').trim()),
  brightData,
};

/** Web Unlocker credentials, either REST API mode or ISP proxy mode. */
export function webUnlockerCredentials(
  transport: BrightDataTransport = brightData.transport,
):
  | { mode: 'api'; token: string; zone: string }
  | { mode: 'proxy'; customerId: string; zone: string; password: string; host: string } {
  if (transport === 'proxy') {
    return {
      mode: 'proxy',
      customerId: brightData.customerId || requiredEnv('BRIGHTDATA_CUSTOMER_ID'),
      zone: brightData.proxyZone || requiredEnv('BRIGHTDATA_PROXY_ZONE'),
      password: brightData.proxyPassword || requiredEnv('BRIGHTDATA_PROXY_PASSWORD'),
      host: brightData.proxyHost,
    };
  }
  return {
    mode: 'api',
    token: brightData.apiToken || requiredEnv('BRIGHTDATA_API_TOKEN'),
    zone: brightData.zone || requiredEnv('BRIGHTDATA_ZONE'),
  };
}

/** Scraping Browser needs the browser zone credentials. */
export function browserCredentials(): {
  customerId: string;
  zone: string;
  password: string;
  host: string;
  port: number;
} {
  return {
    customerId:
      brightData.browserCustomerId || brightData.customerId || requiredEnv('BRIGHTDATA_BROWSER_CUSTOMER_ID'),
    zone: brightData.browserZone || requiredEnv('BRIGHTDATA_BROWSER_ZONE'),
    password: brightData.browserPassword || requiredEnv('BRIGHTDATA_BROWSER_ZONE_PASSWORD'),
    host: brightData.browserHost,
    port: brightData.browserPort,
  };
}
