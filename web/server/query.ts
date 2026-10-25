import type { CountryCode } from '../shared/types.ts';
import type { ParsedQuery, ProductMatch } from '../shared/query.ts';
import {
  detectMarket,
  detectRequestedPlatforms,
  findProduct as findProductIn,
  findProducts as findProductsIn,
  isContextualFollowUp,
  parseQuery as parseQueryIn,
  resolvePlatformDirective,
  shortProductName,
} from '../shared/query.ts';
import { listProducts } from './repo.ts';

export {
  detectMarket,
  detectRequestedPlatforms,
  isContextualFollowUp,
  resolvePlatformDirective,
  shortProductName,
};
export type { ParsedQuery, ProductMatch };

/** Database-backed wrappers around the pure matchers in shared/query.ts. */
export function findProduct(text: string, products = listProducts()): ProductMatch {
  return findProductIn(text, products);
}

export function findProducts(text: string, products = listProducts()): ProductMatch[] {
  return findProductsIn(text, products);
}

export function parseQuery(message: string, fallbackMarket: CountryCode): ParsedQuery {
  return parseQueryIn(message, fallbackMarket, listProducts());
}
