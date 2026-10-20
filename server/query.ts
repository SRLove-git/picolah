import type { CountryCode, Product } from '../shared/types.ts';
import { MARKETS } from '../shared/types.ts';
import { listProducts } from './repo.ts';

const COUNTRY_WORDS: Record<CountryCode, string[]> = {
  SG: ['新加坡', '狮城', 'singapore', 'sg'],
  MY: ['马来西亚', '大马', '吉隆坡', 'malaysia', 'kuala lumpur', 'my'],
  TH: ['泰国', '曼谷', 'thailand', 'bangkok', 'th'],
  ID: ['印度尼西亚', '印尼', '雅加达', 'indonesia', 'jakarta', 'id'],
  PH: ['菲律宾', '马尼拉', 'philippines', 'manila', 'ph'],
  VN: ['越南', '胡志明', '河内', 'vietnam', 'ho chi minh', 'hanoi', 'vn'],
};

const GENERIC_ALIASES = new Set([
  '耳机',
  '手机',
  '手表',
  '音箱',
  '精华',
  '苹果',
  '手机壳',
  'headphones',
  'speaker',
  'airpods',
]);

export function detectMarket(text: string, fallback: CountryCode): CountryCode {
  const normalized = text.toLowerCase();
  let winner: { code: CountryCode; index: number; length: number } | null = null;

  for (const [code, words] of Object.entries(COUNTRY_WORDS) as [CountryCode, string[]][]) {
    for (const word of words) {
      const needle = word.toLowerCase();
      let index = -1;
      if (/^[a-z]{1,2}$/.test(needle)) {
        // Two-letter codes are case-sensitive: "my budget" or "which id" should
        // not silently switch the market. Users can still write SG / MY / TH.
        const match = text.match(new RegExp(`\\b${word.toUpperCase()}\\b`));
        index = match?.index ?? -1;
      } else {
        index = normalized.indexOf(needle);
      }
      if (index === -1) continue;
      if (
        !winner ||
        index < winner.index ||
        (index === winner.index && needle.length > winner.length)
      ) {
        winner = { code, index, length: needle.length };
      }
    }
  }

  return winner?.code || fallback;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[，。！？、,.!?;；:：()[\]{}"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ProductMatch {
  product: Product | null;
  score: number;
  matchedOn: string;
}

export function findProduct(text: string, products = listProducts()): ProductMatch {
  const normalized = normalize(text);
  let best: ProductMatch = { product: null, score: 0, matchedOn: '' };

  for (const product of products) {
    const candidates = [
      product.name,
      product.brand,
      ...product.aliases,
      `${product.brand} ${product.category}`,
    ].map(normalize);

    let score = 0;
    let matchedOn = '';
    for (const candidate of candidates) {
      if (!candidate || candidate.length < 2) continue;
      if (!normalized.includes(candidate)) continue;
      const genericPenalty = GENERIC_ALIASES.has(candidate) ? 0.35 : 1;
      const specificity = Math.min(candidate.length, 24) / 8;
      const candidateScore = (2 + specificity) * genericPenalty;
      if (candidateScore > score) {
        score = candidateScore;
        matchedOn = candidate;
      }
    }

    if (score > best.score) best = { product, score, matchedOn };
  }

  if (!best.product || best.score < 1.2) return { product: null, score: 0, matchedOn: '' };
  return best;
}

export interface ParsedQuery {
  market: CountryCode;
  product: Product | null;
  matchedOn: string;
  title: string;
  cleaned: string;
}

export function parseQuery(message: string, fallbackMarket: CountryCode): ParsedQuery {
  const market = detectMarket(message, fallbackMarket);
  const match = findProduct(message);
  const trimmed = message.trim().replace(/\s+/g, ' ');
  let title = trimmed.slice(0, 34);
  if (match.product) {
    const marketName = MARKETS[market].nameZh;
    const baseName = match.product.name.startsWith(match.product.brand)
      ? match.product.name
      : `${match.product.brand} ${match.product.name}`;
    title = `${baseName} · ${marketName}`;
  }
  return {
    market,
    product: match.product,
    matchedOn: match.matchedOn,
    title,
    cleaned: trimmed,
  };
}

export function shortProductName(product: Product): string {
  return product.name
    .replace(/^Apple\s+/, '')
    .replace(/^Sony\s+/, '')
    .replace(/^小米/, '')
    .replace(/\s*无线降噪耳机$/, '')
    .replace(/\s*便携蓝牙音箱$/, '');
}
