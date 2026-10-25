import { Router } from 'express';
import { z } from 'zod';
import { COUNTRY_CODES } from '../../shared/types.ts';
import {
  getShoppingProfile,
  recordOfferClick,
  requestUserId,
  resetProfile,
} from '../profile.ts';

export const profileRouter = Router();

const offerClickSchema = z.object({
  type: z.literal('offer_click'),
  market: z.enum(COUNTRY_CODES),
  productId: z.string().trim().max(100).optional(),
  platformId: z.string().trim().min(1).max(40),
  price: z.number().finite().positive().max(100_000_000),
  isLowest: z.boolean().default(false),
  position: z.number().int().min(1).max(50).default(1),
});

profileRouter.get('/', (req, res) => {
  const userId = requestUserId(req);
  if (!userId) {
    return res.json({ profile: getShoppingProfile('') });
  }
  res.json({ profile: getShoppingProfile(userId) });
});

profileRouter.post('/events', (req, res) => {
  const userId = requestUserId(req);
  if (!userId) return res.status(204).end();

  const parsed = offerClickSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_EVENT',
      message: parsed.error.issues[0]?.message || '事件参数有误',
    });
  }

  try {
    recordOfferClick(userId, parsed.data);
  } catch (error) {
    console.warn(
      '[profile] failed to record offer click:',
      error instanceof Error ? error.message : error,
    );
  }
  res.status(204).end();
});

profileRouter.delete('/', (req, res) => {
  const userId = requestUserId(req);
  if (userId) resetProfile(userId);
  res.status(204).end();
});
