import type { MarketCode, PlatformId } from '../markets.ts';
import { MARKETS } from '../markets.ts';
import type { RawListing } from '../types.ts';

export interface PlatformSearchOptions {
  timeoutMs?: number;
  renderRetry?: boolean;
}

export interface PlatformAdapter {
  id: PlatformId;
  /** True while the parser still needs live verification. */
  experimental?: boolean;
  search(market: MarketCode, query: string, options?: PlatformSearchOptions): Promise<RawListing[]>;
}
