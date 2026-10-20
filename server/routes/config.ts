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

catalogRouter.get('/', (_req, res) => {
  res.json({
    products: listProducts().map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      visual: product.visual,
      specs: product.specs,
    })),
  });
});
