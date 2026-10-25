import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  COUNTRY_CODES,
  MARKETS,
  PRODUCT_VISUALS,
  type CountryCode,
} from '../../shared/types.ts';
import { config } from '../config.ts';
import { db } from '../db.ts';
import { getProduct } from '../repo.ts';
import { evaluateWatchlist } from '../watchlist.ts';

export const ingestRouter = Router();

const PLATFORM_IDS = ['shopee', 'lazada', 'tiktok', 'amazon-sg', 'tokopedia', 'tiki'] as const;

const productSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, '商品 id 只能使用小写字母、数字和连字符'),
  name: z.string().trim().min(2).max(160),
  brand: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40).default('其他'),
  tagline: z.string().trim().max(160).default(''),
  visual: z.enum(PRODUCT_VISUALS).default('phone'),
  specs: z.string().trim().max(160).default(''),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});

const offerSchema = z
  .object({
    externalId: z.string().trim().min(1).max(200),
    productId: z.string().trim().min(1).max(80),
    platformId: z.enum(PLATFORM_IDS),
    seller: z.string().trim().min(1).max(120),
    currency: z.string().trim().length(3).optional(),
    itemPrice: z.number().finite().positive().max(1_000_000_000_000),
    shippingFee: z.number().finite().min(0).max(1_000_000_000).default(0),
    discount: z.number().finite().min(0).max(1_000_000_000).default(0),
    landedPriceConfidence: z.enum(['exact', 'estimated']).default('estimated'),
    url: z
      .string()
      .url()
      .max(2000)
      .refine((value) => /^https?:\/\//i.test(value), 'url 必须是 http(s) 链接'),
    rating: z.number().finite().min(0).max(5).default(0),
    reviews: z.number().int().min(0).max(100_000_000).default(0),
    inStock: z.boolean().default(true),
    isOfficial: z.boolean().default(false),
    capturedAt: z
      .string()
      .max(40)
      .refine((value) => !Number.isNaN(Date.parse(value)), 'capturedAt 不是合法时间')
      .optional(),
  })
  .refine((offer) => offer.itemPrice + offer.shippingFee - offer.discount > 0, {
    message: '折扣不能大于商品价与运费之和',
    path: ['discount'],
  });

const ingestSchema = z.object({
  source: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9._-]+$/, 'source 只能包含字母、数字、点、下划线和连字符'),
  country: z.enum(COUNTRY_CODES),
  products: z.array(productSchema).max(100).default([]),
  offers: z.array(offerSchema).min(1).max(100),
});

function isAuthorized(header: string | undefined): boolean {
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const provided = Buffer.from(token);
  const expected = Buffer.from(config.ingestKey);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

function roundMoney(value: number, currency: string): number {
  if (currency === 'IDR' || currency === 'VND') return Math.round(value);
  return Math.round(value * 100) / 100;
}

ingestRouter.post('/offers', async (req, res) => {
  if (!isAuthorized(req.header('authorization'))) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="picolah-ingest"');
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: '缺少或错误的数据接入密钥' });
  }

  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      ok: false,
      error: 'VALIDATION_ERROR',
      message: '批次未通过校验，未写入任何数据。',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { source, country, products, offers } = parsed.data;
  const market = MARKETS[country as CountryCode];
  const errors: { externalId: string; message: string }[] = [];

  const allowedPlatforms = new Set(market.platformIds);
  for (const offer of offers) {
    if (!allowedPlatforms.has(offer.platformId)) {
      errors.push({
        externalId: offer.externalId,
        message: `${market.nameZh} 不支持平台 ${offer.platformId}`,
      });
    }
    if (offer.currency && offer.currency.toUpperCase() !== market.currency) {
      errors.push({
        externalId: offer.externalId,
        message: `${market.nameZh} 的币种必须是 ${market.currency}`,
      });
    }
  }
  if (errors.length) {
    return res.status(422).json({ ok: false, error: 'VALIDATION_ERROR', issues: errors });
  }

  const payloadProductIds = new Set(products.map((product) => product.id));
  const knownProductIds = new Set(payloadProductIds);
  for (const offer of offers) {
    if (!knownProductIds.has(offer.productId) && await getProduct(offer.productId)) {
      knownProductIds.add(offer.productId);
    }
  }
  const missingProducts = [...new Set(offers.map((offer) => offer.productId))].filter(
    (id) => !knownProductIds.has(id),
  );
  if (missingProducts.length) {
    return res.status(422).json({
      ok: false,
      error: 'UNKNOWN_PRODUCT',
      message: '报价引用了未知商品。请在 products 中同时提交商品信息，或使用已有商品 id。',
      missingProducts,
    });
  }

  const now = new Date().toISOString();
  const runId = randomUUID();
  let created = 0;
  let updated = 0;

  try {
    const result = await db.transaction(async (tx) => {
      for (const product of products) {
        await tx.run(
          `INSERT INTO products (id, name, brand, category, tagline, visual, specs, aliases, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             brand = excluded.brand,
             category = excluded.category,
             tagline = excluded.tagline,
             visual = excluded.visual,
             specs = excluded.specs,
             aliases = excluded.aliases,
             updated_at = excluded.updated_at`,
          [
            product.id,
            product.name,
            product.brand,
            product.category,
            product.tagline,
            product.visual,
            product.specs,
            JSON.stringify(product.aliases),
            now,
            now,
          ],
        );
      }

      for (const offer of offers) {
        const currency = market.currency;
        const finalPrice = roundMoney(
          offer.itemPrice + offer.shippingFee - offer.discount,
          currency,
        );
        const seenAt = offer.capturedAt ? new Date(offer.capturedAt).toISOString() : now;
        const existing = await tx.get<{ id: string }>(
          'SELECT id FROM offers WHERE source = ? AND external_id = ?',
          [source, offer.externalId],
        );
        let offerId: string;

        if (existing) {
          offerId = existing.id;
          await tx.run(
            `UPDATE offers SET
               product_id = ?, platform_id = ?, seller = ?, country = ?, currency = ?,
               item_price = ?, shipping_fee = ?, discount = ?, final_price = ?,
               landed_price_confidence = ?, url = ?,
               rating = ?, reviews = ?, in_stock = ?, is_official = ?, last_seen = ?, updated_at = ?
             WHERE id = ?`,
            [
              offer.productId,
              offer.platformId,
              offer.seller,
              country,
              currency,
              roundMoney(offer.itemPrice, currency),
              roundMoney(offer.shippingFee, currency),
              roundMoney(offer.discount, currency),
              finalPrice,
              offer.landedPriceConfidence,
              offer.url,
              offer.rating,
              offer.reviews,
              offer.inStock ? 1 : 0,
              offer.isOfficial ? 1 : 0,
              seenAt,
              now,
              offerId,
            ],
          );
          updated += 1;
        } else {
          offerId = randomUUID();
          await tx.run(
            `INSERT INTO offers (
               id, external_id, source, product_id, platform_id, seller, country, currency,
               item_price, shipping_fee, discount, final_price, landed_price_confidence, url, rating, reviews,
               in_stock, is_official, last_seen, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              offerId,
              offer.externalId,
              source,
              offer.productId,
              offer.platformId,
              offer.seller,
              country,
              currency,
              roundMoney(offer.itemPrice, currency),
              roundMoney(offer.shippingFee, currency),
              roundMoney(offer.discount, currency),
              finalPrice,
              offer.landedPriceConfidence,
              offer.url,
              offer.rating,
              offer.reviews,
              offer.inStock ? 1 : 0,
              offer.isOfficial ? 1 : 0,
              seenAt,
              now,
              now,
            ],
          );
          created += 1;
        }

        await tx.run(
          `INSERT INTO price_points (offer_id, recorded_at, price) VALUES (?, ?, ?)
           ON CONFLICT(offer_id, recorded_at) DO UPDATE SET price = excluded.price`,
          [offerId, seenAt, finalPrice],
        );
      }

      await tx.run(
        `INSERT INTO ingest_runs (id, source, country, received, upserted, status, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          source,
          country,
          offers.length,
          offers.length,
          'ok',
          `接收 ${offers.length} 条，新增 ${created} 条，更新 ${updated} 条`,
          now,
        ],
      );
      return { created, updated };
    });
    created = result.created;
    updated = result.updated;
  } catch (error) {
    console.error('[ingest] failed:', error);
    try {
      await db.run(
        `INSERT INTO ingest_runs (id, source, country, received, upserted, status, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          source,
          country,
          offers.length,
          0,
          'failed',
          error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
          now,
        ],
      );
    } catch {
      // Keep the API response useful even if logging the failed run also fails.
    }
    return res.status(500).json({
      ok: false,
      error: 'INGEST_FAILED',
      message: '写入价格库失败，整批数据已回滚。',
    });
  }

  try {
    await evaluateWatchlist(country as CountryCode);
  } catch (watchError) {
    console.warn('[ingest] watchlist evaluation failed:', watchError);
  }

  return res.json({
    ok: true,
    runId,
    source,
    country,
    received: offers.length,
    created,
    updated,
    productsUpserted: products.length,
    status: 'ok',
  });
});
