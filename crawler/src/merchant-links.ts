import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { WebSearchCandidate } from './brightdata/serp.ts';
import type { DiscoveryOptions } from './discovery.ts';
import { productPageUrl } from './product-page-links.ts';
import { sourceCountry } from './source-country.ts';

type Identity = Pick<DiscoveryOptions, 'market' | 'query' | 'model' | 'geography'>;
export interface VerifiedLink extends WebSearchCandidate { checkedAt: string }
const retention = 30 * 24 * 3600_000;

function queryKey(options: Identity): string {
  const normalized = (s = '') => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(JSON.stringify([options.market, normalized(options.query), normalized(options.model)])).digest('hex');
}

/** Stores a publicly verified location, never an amount or availability. */
export class MerchantLinks {
  private db?: DatabaseSync;
  constructor(private path: string) {}

  private database(): DatabaseSync {
    if (!this.db) {
      const db = new DatabaseSync(this.path);
      try {
        db.exec(`PRAGMA busy_timeout=1500;
          CREATE TABLE IF NOT EXISTS merchant_links (
            query_key TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, checked INTEGER NOT NULL,
            PRIMARY KEY (query_key, url));
          CREATE INDEX IF NOT EXISTS merchant_links_checked ON merchant_links(checked);`);
        this.db = db;
      } catch (error) { db.close(); throw error; }
    }
    return this.db;
  }

  find(options: Identity, now = Date.now()): WebSearchCandidate[] {
    if (options.geography === 'global') return [];
    try {
      return this.database().prepare(`SELECT url,title FROM merchant_links WHERE query_key=?
        AND checked BETWEEN ? AND ? ORDER BY checked DESC, url LIMIT 8`).all(queryKey(options), now-retention, now) as unknown as WebSearchCandidate[];
    } catch { console.warn('[merchant-links] saved product links unavailable'); return []; }
  }

  remember(options: Identity, links: VerifiedLink[], now = Date.now()): void {
    if (options.geography === 'global' || !links.length) return;
    try {
      const db = this.database();
      const key = queryKey(options);
      db.exec('BEGIN IMMEDIATE');
      try {
        const insert = db.prepare(`INSERT INTO merchant_links(query_key,url,title,checked) VALUES(?,?,?,?)
          ON CONFLICT(query_key,url) DO UPDATE SET title=excluded.title, checked=excluded.checked
          WHERE excluded.checked >= merchant_links.checked`);
        for (const link of links) {
          const url = productPageUrl(link.url, true), ts = Date.parse(link.checkedAt);
          if (!url || sourceCountry(url, options.market) !== 'local' || !link.title || link.title.length>1000 ||
            !Number.isFinite(ts) || ts<=now-retention || ts>now) continue;
          // Keep identity parameters such as variant. Drop search attribution before saving a public URL.
          for (const p of [...url.searchParams.keys()]) if (/^(?:utm_|t-referrer_|t-id$|t-tap_|_ps[idq]|_pos$|_ss$)/i.test(p)) url.searchParams.delete(p);
          insert.run(key, url.href, link.title, ts);
        }
        db.prepare('DELETE FROM merchant_links WHERE checked < ?').run(now-retention);
        db.exec('DELETE FROM merchant_links WHERE rowid IN (SELECT rowid FROM merchant_links ORDER BY checked DESC, rowid DESC LIMIT -1 OFFSET 4096)');
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } catch { console.warn('[merchant-links] could not save verified links'); }
  }

  close(): void { this.db?.close(); this.db = undefined; }
}
