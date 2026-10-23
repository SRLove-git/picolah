import { config } from './config.ts';
import { MARKETS, type MarketCode } from './markets.ts';
import type { IngestResponse, MarketOffer } from './types.ts';

const MAX_BATCH = 100;

export interface PushResult {
  market: MarketCode;
  received: number;
  created: number;
  updated: number;
  runId?: string;
  error?: string;
}

async function postBatch(market: MarketCode, offers: MarketOffer[]): Promise<IngestResponse> {
  const response = await fetch(`${config.apiBase}/api/v1/ingest/offers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ingestKey}`,
    },
    body: JSON.stringify({
      source: config.source,
      country: market,
      offers: offers.map(({ market: _market, ...offer }) => offer),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  let body: IngestResponse = {};
  try {
    body = (await response.json()) as IngestResponse;
  } catch {
    // Keep the status code when the API returns an empty/non-JSON error page.
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `入库失败：${market} HTTP ${response.status} ${body.error || ''} ${body.message || ''}`.trim(),
    );
  }
  return body;
}

/** Push offers grouped by market; the ingest API accepts one market per batch. */
export async function pushOffers(offers: MarketOffer[]): Promise<PushResult[]> {
  const byMarket = new Map<MarketCode, MarketOffer[]>();
  for (const offer of offers) {
    const group = byMarket.get(offer.market);
    if (group) group.push(offer);
    else byMarket.set(offer.market, [offer]);
  }

  const results: PushResult[] = [];
  for (const [market, group] of byMarket) {
    for (let start = 0; start < group.length; start += MAX_BATCH) {
      const batch = group.slice(start, start + MAX_BATCH);
      const body = await postBatch(market, batch);
      const result: PushResult = {
        market,
        received: body.received ?? batch.length,
        created: body.created ?? 0,
        updated: body.updated ?? 0,
        runId: body.runId,
      };
      results.push(result);
      console.log(
        `[crawler] ingest ${market} (${MARKETS[market].currency}) sent=${batch.length} created=${result.created} updated=${result.updated} run=${result.runId ?? '-'}`,
      );
    }
  }
  return results;
}
