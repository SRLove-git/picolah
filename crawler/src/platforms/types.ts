import type { MarketCode, PlatformId } from '../markets.ts';
import { MARKETS } from '../markets.ts';
import type { RawListing } from '../types.ts';

export interface PlatformAdapter {
  id: PlatformId;
  /** True while the parser still needs live verification. */
  experimental?: boolean;
  search(market: MarketCode, query: string): Promise<RawListing[]>;
}
