import { Router } from 'express';
import type { CountryCode } from '../../shared/types.ts';
import { config } from '../config.ts';
import { db } from '../db.ts';
import { recordOfferClick, requestUserId } from '../profile.ts';

export const outRouter = Router();

function affiliateUrl(platformId: string, url: string): string {
  const template = config.affiliateTemplates[platformId];
  if (!template) return url;
  return template
    .replaceAll('{url}', encodeURIComponent(url))
    .replaceAll('{rawUrl}', url)
    .replaceAll('{platform}', platformId);
}

type OfferRow = {
  id: string;
  product_id: string;
  platform_id: string;
  country: string;
  final_price: number;
  currency: string;
  url: string;
};

/**
 * Outbound click gateway. Keeps raw marketplace URLs out of the SPA, records
 * the click against the current owner, then appends the configured affiliate
 * tag (if any) before redirecting.
 */
outRouter.get('/:id', async (req, res) => {
  const offer = await db.get<OfferRow>('SELECT id, product_id, platform_id, country, final_price, currency, url FROM offers WHERE id = ?', [req.params.id]);
  if (!offer) return res.status(404).type('text').send('Offer not found');

  const userId = requestUserId(req);
  if (userId) {
    const cheaper = await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM offers
       WHERE product_id = ? AND country = ? AND in_stock = 1 AND final_price < ?`,
      [offer.product_id, offer.country, offer.final_price],
    );
    try {
      await recordOfferClick(userId, {
        type: 'offer_click',
        market: offer.country as CountryCode,
        productId: offer.product_id,
        platformId: offer.platform_id,
        price: offer.final_price,
        isLowest: Number(cheaper?.count || 0) === 0,
        position: Number(cheaper?.count || 0) + 1,
      });
    } catch (error) {
      console.warn('[out] click tracking failed:', error instanceof Error ? error.message : error);
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, affiliateUrl(offer.platform_id, offer.url));
});
