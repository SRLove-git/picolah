import type { CountryCode } from '../shared/types.ts';
import type { ParsedQuery, ProductMatch } from '../shared/query.ts';
import {
  detectMarket,
  findProduct as findProductIn,
  parseQuery as parseQueryIn,
  shortProductName,
} from '../shared/query.ts';
import { listProducts } from './repo.ts';

export { detectMarket, shortProductName };
export type { ParsedQuery, ProductMatch };

/** Database-backed wrappers around the pure matchers in shared/query.ts. */
export function findProduct(text: string, products = listProducts()): ProductMatch {
  return findProductIn(text, products);
}

export function parseQuery(message: string, fallbackMarket: CountryCode): ParsedQuery {
  return parseQueryIn(message, fallbackMarket, listProducts());
}
