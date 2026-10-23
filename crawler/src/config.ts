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

const brightData = {
  token: process.env.BRIGHTDATA_API_TOKEN?.trim() || '',
  zone: process.env.BRIGHTDATA_ZONE?.trim() || '',
  customerId: process.env.BRIGHTDATA_CUSTOMER_ID?.trim() || '',
  zonePassword: process.env.BRIGHTDATA_ZONE_PASSWORD?.trim() || '',
  browserCustomerId: process.env.BRIGHTDATA_BROWSER_CUSTOMER_ID?.trim() || '',
  browserZone: process.env.BRIGHTDATA_BROWSER_ZONE?.trim() || '',
  browserPassword: process.env.BRIGHTDATA_BROWSER_ZONE_PASSWORD?.trim() || '',
};

export const config = {
  apiBase: (process.env.PICOLAH_API_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, ''),
  ingestKey: process.env.PICOLAH_INGEST_KEY || 'pcl_dev_crawler_key',
  source: process.env.CRAWLER_SOURCE || 'picolah-crawler',
  concurrency: numberEnv('CRAWLER_CONCURRENCY', 2, 1, 6),
  brightData,
};

/** Web Unlocker only needs the API token + zone. */
export function webUnlockerCredentials(): { token: string; zone: string } {
  return {
    token: brightData.token || requiredEnv('BRIGHTDATA_API_TOKEN'),
    zone: brightData.zone || requiredEnv('BRIGHTDATA_ZONE'),
  };
}

/** Scraping Browser needs the browser zone credentials (or falls back to the API zone). */
export function browserCredentials(): {
  customerId: string;
  zone: string;
  password: string;
} {
  return {
    customerId: brightData.browserCustomerId || brightData.customerId || requiredEnv('BRIGHTDATA_BROWSER_CUSTOMER_ID'),
    zone: brightData.browserZone || requiredEnv('BRIGHTDATA_BROWSER_ZONE'),
    password: brightData.browserPassword || requiredEnv('BRIGHTDATA_BROWSER_ZONE_PASSWORD'),
  };
}
