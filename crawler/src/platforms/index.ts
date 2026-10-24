import type { PlatformId } from '../markets.ts';
import { lazadaAdapter } from './lazada.ts';
import { shopeeAdapter } from './shopee.ts';
import { amazonSgAdapter } from './amazon-sg.ts';
import type { PlatformAdapter } from './types.ts';

export const ADAPTERS: Partial<Record<PlatformId, PlatformAdapter>> = {
  lazada: lazadaAdapter,
  shopee: shopeeAdapter,
  'amazon-sg': amazonSgAdapter,
};

export function getAdapter(platform: PlatformId): PlatformAdapter {
  const adapter = ADAPTERS[platform];
  if (!adapter) {
    throw new Error(`平台 ${platform} 还没有实现适配器（目前支持：${Object.keys(ADAPTERS).join(', ')}）`);
  }
  return adapter;
}
