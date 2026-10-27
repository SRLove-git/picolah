import { Router, type Request } from 'express';
import { z } from 'zod';
import { COUNTRY_CODES } from '../../shared/types.ts';
import {
  addCapybaraPurchase,
  getCapybara,
  removeCapybaraPurchase,
  setCapybaraOutfit,
} from '../capybara.ts';
import { requestUserId } from '../user-id.ts';

export const capybaraRouter = Router();

const purchaseSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  market: z.enum(COUNTRY_CODES),
  price: z.number().finite().positive().max(100_000_000).nullish(),
});

const outfitSchema = z.object({
  equipped: z.array(z.string().trim().min(1).max(40)).max(20),
});

interface Viewer {
  id: string;
  watchOwner: string;
}

function viewer(request: Request): Viewer {
  const id = requestUserId(request) || '';
  return {
    id,
    watchOwner: request.user ? `user:${request.user.id}` : id ? `anon:${id}` : '',
  };
}

capybaraRouter.get('/', async (req, res) => {
  const { id, watchOwner } = viewer(req);
  if (!id) return res.json({ capybara: null });
  return res.json({ capybara: await getCapybara(id, watchOwner) });
});

capybaraRouter.post('/purchases', async (req, res) => {
  const { id, watchOwner } = viewer(req);
  if (!id) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '缺少用户标识。' });

  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || '商品参数有误',
    });
  }

  const capybara = await addCapybaraPurchase(
    id,
    parsed.data.productId,
    parsed.data.market,
    parsed.data.price ?? null,
    watchOwner,
  );
  if (!capybara) {
    return res.status(404).json({ error: 'PRODUCT_NOT_FOUND', message: '没有找到这件商品。' });
  }
  return res.status(201).json({ capybara });
});

capybaraRouter.delete('/purchases/:id', async (req, res) => {
  const { id, watchOwner } = viewer(req);
  if (!id) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '缺少用户标识。' });
  const capybara = await removeCapybaraPurchase(id, String(req.params.id || ''), watchOwner);
  if (!capybara) return res.status(404).json({ error: 'NOT_FOUND', message: '没有这条购买记录。' });
  return res.json({ capybara });
});

capybaraRouter.post('/outfit', async (req, res) => {
  const { id, watchOwner } = viewer(req);
  if (!id) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '缺少用户标识。' });

  const parsed = outfitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || '穿搭参数有误',
    });
  }

  const capybara = await setCapybaraOutfit(id, parsed.data.equipped, watchOwner);
  if (!capybara) return res.status(400).json({ error: 'INVALID_USER', message: '用户标识无效。' });
  return res.json({ capybara });
});
