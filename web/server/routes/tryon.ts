import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.ts';
import { activeProvider } from '../imagegen.ts';
import { requestUserId } from '../user-id.ts';
import { findCachedTryOn, getTryOn, recentTryOns, startTryOn } from '../tryon.ts';

export const tryOnRouter = Router();

const tryOnSchema = z.object({
  productId: z.string().trim().max(120).optional(),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  imageUrl: z.string().trim().url().max(2000).optional(),
});

/** Small in-memory per-visitor budget; cached pictures never count. */
const hits = new Map<string, number[]>();

function visitorKey(req: import('express').Request): string {
  return requestUserId(req) || req.ip || 'anonymous';
}

function withinBudget(key: string, perHour: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((at) => now - at < 3_600_000);
  hits.set(key, recent);
  return recent.length < perHour;
}

function recordHit(key: string): void {
  const list = hits.get(key) || [];
  list.push(Date.now());
  hits.set(key, list);
  if (hits.size > 5_000) {
    for (const [entry, times] of hits) {
      if (!times.length || Date.now() - times[times.length - 1] > 3_600_000) hits.delete(entry);
    }
  }
}

tryOnRouter.get('/config', (_req, res) => {
  res.json({ enabled: Boolean(activeProvider()), provider: activeProvider() || null });
});

tryOnRouter.get('/recent', async (_req, res) => {
  const limit = Number(_req.query.limit) || 12;
  return res.json({ tryons: await recentTryOns(limit) });
});

tryOnRouter.get('/:id', async (req, res) => {
  const record = await getTryOn(String(req.params.id || ''));
  if (!record) return res.status(404).json({ error: 'NOT_FOUND', message: '这张试穿图不存在。' });
  if (record.status === 'failed') {
    return res.status(422).json({ error: 'TRYON_FAILED', message: record.error || '生成失败，请稍后再试。', tryon: record });
  }
  return res.json({ tryon: record });
});

tryOnRouter.post('/', async (req, res) => {
  if (!activeProvider()) {
    return res.status(503).json({ error: 'IMAGE_GEN_NOT_CONFIGURED', message: 'AI 试穿还没有配置图像模型。' });
  }
  const parsed = tryOnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || '商品参数有误' });
  }
  const key = visitorKey(req);
  const cached = await findCachedTryOn({
    productId: parsed.data.productId,
    name: parsed.data.name,
    brand: parsed.data.brand,
    category: parsed.data.category,
    imageUrl: parsed.data.imageUrl,
  });
  // Opening a picture that already exists never spends budget.
  if (cached) return res.status(200).json({ tryon: cached, cached: true });
  if (!withinBudget(key, config.imagegen.perHour)) {
    return res.status(429).json({ error: 'RATE_LIMITED', message: '试穿生成有点频繁，请稍后再试。' });
  }
  recordHit(key);
  const { record } = await startTryOn({
    productId: parsed.data.productId,
    name: parsed.data.name,
    brand: parsed.data.brand,
    category: parsed.data.category,
    imageUrl: parsed.data.imageUrl,
  });
  return res.status(202).json({ tryon: record });
});
