import { Router } from 'express';
import { z } from 'zod';
import {
  deleteConversation,
  getConversation,
  listConversations,
  updateConversationTitle,
} from '../repo.ts';

export const conversationsRouter = Router();

conversationsRouter.get('/', async (_req, res) => {
  res.json({ conversations: await listConversations() });
});

conversationsRouter.get('/:id', async (req, res) => {
  const conversation = await getConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: '对话不存在' });
  }
  return res.json({ conversation });
});

conversationsRouter.patch('/:id', async (req, res) => {
  const schema = z.object({ title: z.string().trim().min(1).max(120) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: '标题不能为空' });
  }
  const existing = await getConversation(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: '对话不存在' });
  }
  await updateConversationTitle(req.params.id, parsed.data.title);
  return res.json({ ok: true, title: parsed.data.title });
});

conversationsRouter.delete('/:id', async (req, res) => {
  const existing = await getConversation(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: '对话不存在' });
  }
  await deleteConversation(req.params.id);
  return res.json({ ok: true });
});
