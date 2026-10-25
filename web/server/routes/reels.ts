import { Router } from 'express';
import { z } from 'zod';
import { COUNTRY_CODES } from '../../shared/types.ts';
import { requestUserId } from '../profile.ts';
import { getReelFeed, recordReelEvent, ReelEventError, reelEventSchema, reelIdSchema } from '../reels.ts';

export const reelsRouter = Router();

const feedQuerySchema = z.object({
  market: z.enum(COUNTRY_CODES).default('SG'),
  exclude: z.string().max(10_000).transform((value) => value ? value.split(',') : [])
    .pipe(z.array(reelIdSchema).max(100)).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(20)).optional(),
}).strict();

reelsRouter.get('/', async (req, res) => {
  const parsed = feedQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_FEED_QUERY', message: parsed.error.issues[0]?.message });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await getReelFeed(requestUserId(req) ?? '', parsed.data.market, parsed.data.exclude, parsed.data.limit));
});

reelsRouter.post('/events', async (req, res) => {
  const userId = requestUserId(req);
  if (!userId) return res.status(400).json({ error: 'INVALID_USER', message: 'A valid viewer identity is required' });
  const parsed = reelEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_EVENT', message: parsed.error.issues[0]?.message });
  try {
    await recordReelEvent(userId, parsed.data);
    return res.status(204).end();
  } catch (error) {
    if (error instanceof ReelEventError) return res.status(error.status).json({ error: error.code, message: error.message });
    throw error;
  }
});
