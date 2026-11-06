import { config } from '../config.ts';
import { MARKETS, type MarketCode } from '../markets.ts';
import { parseSearchCandidates, type WebSearchCandidate } from '../brightdata/serp.ts';
import { BrightDataError } from '../brightdata/web-unlocker.ts';

const fail = (code: string) => new BrightDataError('全网商品搜索暂时不可用', { code });
/** Search discovers URLs only. Prices must come from a subsequent product-page fetch. */
export async function searchDeepSeekCandidates(query: string, market: MarketCode,
  options: { apiKey?: string; fetchImpl?: typeof fetch; geography?: 'global' } = {}): Promise<WebSearchCandidate[]> {
  const apiKey = options.apiKey ?? config.webSearch.apiKey;
  if (!apiKey) throw fail('SERP_NOT_CONFIGURED');
  if (!MARKETS[market] || !query.trim()) throw fail('SERP_INVALID_QUERY');
  const suffix = options.geography === 'global' ? ' buy price' : ` ${MARKETS[market].name} ${MARKETS[market].currency} buy price`;
  // Canonical identifiers may contain an inserted hyphen (NA-221/09). Search
  // engines can treat it as an exclusion operator; use the compact prefix.
  const normalized = query.trim().replace(/\b([A-Z]{2,})-(?=[A-Z]{2,}\d{3,})/gi, '$1').replace(/\b([A-Z]{2,})-(?=\d)/gi, '$1');
  const searchQuery = Array.from(normalized).slice(0, 128 - suffix.length).join('') + suffix;
  const signal = AbortSignal.timeout(20_000);
  try {
    const response = await (options.fetchImpl ?? fetch)('https://api.deepseek.com/v1/tools/search', {
      method: 'POST', redirect: 'error', signal,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: searchQuery, count: 30, need_content: false }),
    });
    if (!response.ok) { await response.body?.cancel(); throw fail(response.status === 401 || response.status === 403 ? 'SERP_AUTH_FAILED' : 'SERP_HTTP_ERROR'); }
    const reader = response.body?.getReader();
    if (!reader) throw fail('SERP_PARSE_FAILED');
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.byteLength;
        if (length > 2_000_000) { await reader.cancel(); throw fail('SERP_RESPONSE_TOO_LARGE'); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(data.results)) throw fail('SERP_PARSE_FAILED');
    const organic = data.results.slice(0, 30).map((row: { url?: unknown; title?: unknown }) => ({ link: row?.url, title: row?.title }));
    // Validate every candidate before ranking. A first-page cap used to discard
    // independent merchants behind repeated marketplace results.
    const seen = new Set<string>();
    return [0, 10, 20].flatMap((offset) => parseSearchCandidates({ organic: organic.slice(offset, offset + 10) }))
      .filter((candidate) => { if (seen.has(candidate.url)) return false; seen.add(candidate.url); return true; });
  } catch (error) {
    if (error instanceof BrightDataError) throw error;
    if (signal.aborted) throw fail('SERP_TIMEOUT');
    if (error instanceof SyntaxError) throw fail('SERP_PARSE_FAILED');
    throw fail('SERP_NETWORK_ERROR');
  }
}
