import { config } from './config.ts';
import type { CatalogProduct } from './types.ts';

export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const response = await fetch(`${config.apiBase}/api/catalog`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`读取商品目录失败：GET ${config.apiBase}/api/catalog -> ${response.status}`);
  }
  const body = (await response.json()) as { products?: CatalogProduct[] };
  return Array.isArray(body.products) ? body.products : [];
}
