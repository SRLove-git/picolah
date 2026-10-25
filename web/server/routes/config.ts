import { Router } from 'express';
import { config, llmConfigured } from '../config.ts';
import { getGatewayStats, listProducts } from '../repo.ts';
import { COUNTRY_LIST } from '../../shared/types.ts';

export const configRouter = Router();

configRouter.get('/', (_req, res) => {
  res.json({
    llmConfigured,
    llmProvider: config.llm.provider,
    llmModel: config.llm.model,
    markets: COUNTRY_LIST,
    gateway: getGatewayStats(),
  });
});

export const catalogRouter = Router();

catalogRouter.get('/', (req, res) => {
  const rawQuery = String(req.query.q || '').trim().toLowerCase();
  const rawCategory = String(req.query.category || '').trim();
  const all = listProducts();
  const categories = [...new Set(all.map((product) => product.category))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
  const products = all.filter((product) => {
    if (rawCategory && product.category !== rawCategory) return false;
    if (!rawQuery) return true;
    return [product.name, product.brand, product.category, product.specs]
      .join(' ')
      .toLowerCase()
      .includes(rawQuery);
  });
  res.json({
    products: products.slice(0, 100).map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      visual: product.visual,
      specs: product.specs,
    })),
    categories,
    total: products.length,
  });
});
