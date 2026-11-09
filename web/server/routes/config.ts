import { Router } from 'express';
import { config, llmConfigured } from '../config.ts';
import { getGatewayStats, listProducts } from '../repo.ts';
import { COUNTRY_LIST } from '../../shared/types.ts';

export const configRouter = Router();

configRouter.get('/', async (_req, res) => {
  res.json({
    llmConfigured,
    llmProvider: config.llm.provider,
    llmModel: config.llm.model,
    markets: COUNTRY_LIST,
    gateway: await getGatewayStats(),
  });
});

export const catalogRouter = Router();

catalogRouter.get('/', async (req, res) => {
  const rawQuery = String(req.query.q || '').trim().toLowerCase();
  const rawCategory = String(req.query.category || '').trim();
  const rawBrand = String(req.query.brand || '').trim();
  const sort = String(req.query.sort || 'name-asc');
  const parsePositiveInteger = (value: unknown, fallback: number, maximum: number) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
  };
  const requestedPage = parsePositiveInteger(req.query.page, 1, 10_000);
  // Keep the historical unpaginated API response for existing consumers.
  // The Discover page explicitly requests its smaller display page size.
  const pageSize = parsePositiveInteger(req.query.pageSize, 100, 100);
  const all = await listProducts();
  const categories = [...new Set(all.map((product) => product.category))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
  const matches = all.filter((product) => {
    if (rawCategory && product.category !== rawCategory) return false;
    if (!rawQuery) return true;
    return [product.name, product.brand, product.category, product.specs]
      .join(' ')
      .toLowerCase()
      .includes(rawQuery);
  });
  const compare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
  const brands = [...new Set(matches.map(product => product.brand))].sort(compare);
  const products = matches.filter(product => !rawBrand || product.brand === rawBrand).sort((a, b) => {
    const byName = compare(a.name, b.name) || compare(a.id, b.id);
    if (sort === 'name-desc') return -byName;
    if (sort === 'brand-asc') return compare(a.brand, b.brand) || byName;
    return byName;
  });
  const totalPages = Math.ceil(products.length / pageSize);
  const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
  const pageStart = (page - 1) * pageSize;
  res.json({
    products: products.slice(pageStart, pageStart + pageSize).map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      visual: product.visual,
      specs: product.specs,
    })),
    categories,
    brands,
    total: products.length,
    page,
    pageSize,
    totalPages,
  });
});
