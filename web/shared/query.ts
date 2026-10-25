import type { CountryCode, Product } from './types.ts';
import { MARKETS } from './types.ts';

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
  'air fryer',
  '空气炸锅',
  '降噪耳机',
  '头戴式耳机',
  '无线耳机',
  '跑鞋',
  '运动鞋',
  '球鞋',
  '智能手表',
  '手表',
  '蓝牙音箱',
  '便携音箱',
  '音箱',
  '咖啡机',
  '胶囊咖啡机',
  'coffee machine',
]);

const VARIANT_PATTERN = /\b\d+(?:\.\d+)?\s*(?:gb|tb|ml|mm|l)\b/gi;

/**
 * Text matching shared by the API, the seed script and the offline mock.
 * The products list is always injected, so this module stays free of database
 * or Node-only imports and can run in the browser.
 */
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
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[，。！？、,.!?;；:：()[\]{}"'“”‘’/\\_+]/g, ' ')
    .replace(/[‐‑‒–—−-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(text: string): string {
  return normalize(text).replace(/\s+/g, '');
}

function variants(text: string): string[] {
  return [...text.matchAll(VARIANT_PATTERN)].map((match) =>
    match[0].toLowerCase().replace(/\s+/g, ''),
  );
}

function hasVariantConflict(query: string, product: Product): boolean {
  const queryVariants = variants(normalize(query));
  if (!queryVariants.length) return false;
  const productText = compact(
    [product.name, product.specs, ...product.aliases].join(' '),
  );
  return queryVariants.some((variant) => !productText.includes(variant));
}

export interface ProductMatch {
  product: Product | null;
  score: number;
  matchedOn: string;
}

function oneEditAway(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let first = left;
  let second = right;
  if (first.length > second.length) [first, second] = [second, first];
  let edits = 0;
  for (let a = 0, b = 0; a < first.length || b < second.length;) {
    if (first[a] === second[b]) {
      a += 1;
      b += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (first.length === second.length) a += 1;
    if (first.length < second.length) b += 1;
    else b += 1;
  }
  return true;
}

function fuzzyAliasMatch(query: string, candidate: string): boolean {
  const queryTokens = normalize(query).split(' ').filter(Boolean);
  const candidateTokens = normalize(candidate).split(' ').filter(Boolean);
  if (candidateTokens.length < 2 || candidateTokens.some((token) => token.length < 3)) return false;
  return candidateTokens.every((candidateToken) =>
    queryTokens.some((queryToken) => {
      if (candidateToken === queryToken) return true;
      if (/\d/.test(candidateToken) || /\d/.test(queryToken)) return false;
      return oneEditAway(candidateToken, queryToken);
    }),
  );
}

function matchProduct(text: string, product: Product): ProductMatch {
  const normalized = normalize(text);
  const compactText = compact(text);
  if (hasVariantConflict(text, product)) return { product: null, score: 0, matchedOn: '' };

  const candidates = [
    { value: product.name, kind: 'name' },
    ...product.aliases.map((value) => ({ value, kind: 'alias' })),
    { value: product.brand, kind: 'brand' },
    { value: `${product.brand} ${product.category}`, kind: 'brand-category' },
  ] as const;

  let score = 0;
  let matchedOn = '';
  for (const entry of candidates) {
    const candidate = normalize(entry.value);
    if (!candidate || candidate.length < 2) continue;
    const compactCandidate = compact(candidate);
    const exact = normalized.includes(candidate) || compactText.includes(compactCandidate);
    const fuzzy = entry.kind === 'alias' && fuzzyAliasMatch(text, candidate);
    if (!exact && !fuzzy) continue;

    const generic =
      GENERIC_ALIASES.has(candidate) ||
      (entry.kind === 'alias' &&
        !/\d/.test(candidate) &&
        candidate.endsWith(normalize(product.category)));
    const kindWeight = entry.kind === 'name' ? 5 : entry.kind === 'alias' ? 3.5 : 0.5;
    const genericPenalty = generic ? 0.2 : 1;
    const fuzzyPenalty = fuzzy && !exact ? 0.7 : 0;
    const specificity = Math.min(compactCandidate.length, 24) / 8;
    const candidateScore = (kindWeight + specificity - fuzzyPenalty) * genericPenalty;
    if (candidateScore > score) {
      score = candidateScore;
      matchedOn = candidate;
    }
  }

  return score >= 2.5 ? { product, score, matchedOn } : { product: null, score: 0, matchedOn: '' };
}

export function findProducts(text: string, products: Product[], limit = 4): ProductMatch[] {
  return products
    .map((product) => matchProduct(text, product))
    .filter((match): match is ProductMatch & { product: Product } => Boolean(match.product))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}

export function findProduct(text: string, products: Product[]): ProductMatch {
  return findProducts(text, products, 1)[0] || { product: null, score: 0, matchedOn: '' };
}

export function isContextualFollowUp(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized || normalized.length > 40) return false;
  return /(?:那|这个|这款|它|它们|这些|第[一二三四1234]个|前者|后者|黑色|白色|颜色|容量|版本|官方|保修|运费|库存|便宜|价格|值得|怎么样|还有|呢|对比|只看|全部平台|所有平台|取消筛选|不限平台|lazada|来赞达|shopee|虾皮|tiktok|抖音|amazon|亚马逊|tokopedia|tiki|品牌官网|官网)/i.test(
    normalized,
  );
}

const PLATFORM_WORDS: Array<[string, RegExp]> = [
  ['lazada', /\blazada\b|来赞达/i],
  ['shopee', /\bshopee\b|虾皮/i],
  ['tiktok', /\btiktok(?:\s*shop)?\b|抖音(?:商城)?/i],
  ['amazon-sg', /\bamazon(?:\s*sg)?\b|亚马逊/i],
  ['tokopedia', /\btokopedia\b/i],
  ['tiki', /\btiki\b/i],
  ['official', /\bofficial\s*(?:store|shop)?\b|品牌官网|官网/i],
];

export function detectRequestedPlatforms(text: string): string[] {
  return PLATFORM_WORDS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}

export type PlatformDirectiveMode = 'none' | 'include' | 'exclude' | 'reset';

export interface PlatformDirective {
  mode: PlatformDirectiveMode;
  mentioned: string[];
  platformIds: string[];
  unsupported: string[];
}

export function resolvePlatformDirective(
  text: string,
  market: CountryCode,
  previous: string[] = [],
): PlatformDirective {
  if (/全部平台|所有平台|取消(?:平台)?筛选|不限平台|都看|恢复全部/i.test(text)) {
    return { mode: 'reset', mentioned: [], platformIds: [], unsupported: [] };
  }

  const mentioned = detectRequestedPlatforms(text);
  if (!mentioned.length) {
    return { mode: 'none', mentioned: [], platformIds: [...previous], unsupported: [] };
  }

  const supported = [...MARKETS[market].platformIds, 'official'];
  const exclude = /不要|不看|排除|去掉|移除|除了.+(?:都看|之外)/i.test(text);
  if (exclude) {
    return {
      mode: 'exclude',
      mentioned,
      platformIds: supported.filter((id) => !mentioned.includes(id)),
      unsupported: [],
    };
  }

  return {
    mode: 'include',
    mentioned,
    platformIds: mentioned,
    unsupported: mentioned.filter((id) => !supported.includes(id)),
  };
}

export interface ParsedQuery {
  market: CountryCode;
  product: Product | null;
  matchedOn: string;
  title: string;
  cleaned: string;
}

export function parseQuery(
  message: string,
  fallbackMarket: CountryCode,
  products: Product[],
): ParsedQuery {
  const market = detectMarket(message, fallbackMarket);
  const match = findProduct(message, products);
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
