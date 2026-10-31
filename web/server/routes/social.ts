import { Router } from 'express';
import { z } from 'zod';
import {
  SocialError,
  listFriends,
  listIncomingRequests,
  listMessages,
  listOutgoingRequests,
  listRadar,
  radarSelf,
  respondToRequest,
  sendFriendRequest,
  sendMessage,
} from '../social.ts';

export const socialRouter = Router();

const userIdSchema = z.string().regex(/^[0-9a-f]{32}$/, '用户不存在。');

const requestSchema = z.object({ toUserId: userIdSchema });

const messageSchema = z.object({
  toUserId: userIdSchema,
  body: z.string().trim().min(1, '消息不能为空。').max(1000, '消息最多 1000 字。'),
});

function currentUserId(req: import('express').Request): string {
  return req.user?.id ?? '';
}

function handleError(res: import('express').Response, error: unknown): void {
  if (error instanceof SocialError) {
    res.status(error.status).json({ error: 'SOCIAL_ERROR', message: error.message });
    return;
  }
  throw error;
}

socialRouter.get('/radar', async (req, res) => {
  const userId = currentUserId(req);
  const [self, candidates, incoming, outgoing, friends] = await Promise.all([
    radarSelf(userId),
    listRadar(userId),
    listIncomingRequests(userId),
    listOutgoingRequests(userId),
    listFriends(userId),
  ]);
  return res.json({ self, candidates, incoming, outgoing, friends });
});

socialRouter.post('/requests', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: 'VALIDATION_ERROR', message: '用户不存在。' });
  }
  try {
    const status = await sendFriendRequest(currentUserId(req), parsed.data.toUserId);
    return res.json({ status });
  } catch (error) {
    return handleError(res, error);
  }
});

socialRouter.post('/requests/:id/accept', async (req, res) => {
  try {
    await respondToRequest(currentUserId(req), req.params.id, true);
    return res.json({ ok: true });
  } catch (error) {
    return handleError(res, error);
  }
});

socialRouter.post('/requests/:id/decline', async (req, res) => {
  try {
    await respondToRequest(currentUserId(req), req.params.id, false);
    return res.json({ ok: true });
  } catch (error) {
    return handleError(res, error);
  }
});

socialRouter.get('/messages/:userId', async (req, res) => {
  const after = typeof req.query.after === 'string' ? req.query.after : '';
  try {
    const messages = await listMessages(currentUserId(req), req.params.userId, after);
    return res.json({ messages });
  } catch (error) {
    return handleError(res, error);
  }
});

socialRouter.post('/messages', async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || '消息有误。',
    });
  }
  try {
    const message = await sendMessage(currentUserId(req), parsed.data.toUserId, parsed.data.body);
    return res.status(201).json({ message });
  } catch (error) {
    return handleError(res, error);
  }
});
