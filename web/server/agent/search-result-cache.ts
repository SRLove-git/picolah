import type { LiveSearchInput, LiveSearchResult } from './tools/model-search.ts';
import type { SearchCacheMetadata } from '../../shared/types.ts';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY_BYTES = 128 * 1024;
interface Entry { result: LiveSearchResult; metadata: SearchCacheMetadata; expires: number; bytes: number }

/** Only validated, public search data is shared. Answers and user context never enter this cache. */
export function createSearchResultCache(options: { ttlMs: number; maxEntries?: number; now?: () => number }) {
  const ttl = options.ttlMs;
  const maxEntries = options.maxEntries ?? 200;
  if (!Number.isSafeInteger(ttl) || ttl < 0 || ttl > 300_000) throw new Error('Search cache TTL must be 0–300000 ms');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000) throw new Error('Search cache capacity must be 1–1000');
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<LiveSearchResult>>();
  let bytes = 0;
  const remove = (key: string) => { const entry = entries.get(key); if (entry) bytes -= entry.bytes; entries.delete(key); };
  const keyFor = (input: LiveSearchInput) => JSON.stringify({
    query: input.query, model: input.model ?? null, market: input.market,
    scope: input.scope ?? 'platforms', geography: input.geography ?? null, maxPrice: input.maxPrice ?? null,
    platforms: [...new Set(input.platforms)].sort(), excludedPlatforms: [...new Set(input.excludedPlatforms ?? [])].sort(),
  });
  function store(key: string, result: LiveSearchResult): LiveSearchResult {
    if (!result.listings.length) return result;
    // Do not amplify the known deal-article false positive found in the live audit.
    if (result.listings.some(row => /(^|\.)dealmoon\./i.test(new URL(row.url).hostname))) return result;
    const timestamps = result.listings.map(row => Date.parse(row.verification?.checkedAt ?? ''));
    if (timestamps.some(stamp => !Number.isFinite(stamp))) return result;
    const checked = Math.min(now(), ...timestamps);
    const expires = checked + ttl;
    if (expires <= now()) return result;
    const metadata: SearchCacheMetadata = { hit: false, checkedAt: new Date(checked).toISOString(), expiresAt: new Date(expires).toISOString() };
    const value = structuredClone({ ...result, cache: metadata });
    const size = Buffer.byteLength(JSON.stringify(value));
    if (size > MAX_ENTRY_BYTES) return result;
    for (const [entryKey, entry] of entries) if (entry.expires <= now()) remove(entryKey);
    remove(key);
    while (entries.size >= maxEntries || bytes + size > MAX_BYTES) remove(entries.keys().next().value!);
    entries.set(key, { result: value, metadata, expires, bytes: size }); bytes += size;
    return structuredClone(value);
  }
  return {
    async run(input: LiveSearchInput, load: () => Promise<LiveSearchResult>): Promise<LiveSearchResult> {
      if (!ttl) return load();
      const key = keyFor(input), cached = entries.get(key);
      if (cached && cached.expires > now() && now() >= Date.parse(cached.metadata.checkedAt)) {
        entries.delete(key); entries.set(key, cached);
        return structuredClone({ ...cached.result, cache: { ...cached.metadata, hit: true } });
      }
      if (cached) remove(key);
      const existing = pending.get(key);
      if (existing) return structuredClone(await existing);
      const request = Promise.resolve().then(load).then(result => store(key, result));
      pending.set(key, request);
      try { return structuredClone(await request); }
      finally { if (pending.get(key) === request) pending.delete(key); }
    },
  };
}
