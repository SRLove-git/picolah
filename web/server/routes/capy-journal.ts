import { Router } from 'express';
import { z } from 'zod';
import { JOURNAL_CONTENT_LIMIT, JOURNAL_TITLE_LIMIT, isJournalDate } from '../../shared/capy-journal.ts';
import { createCapyJournal, JournalError, listCapyJournal, removeCapyJournal, updateCapyJournal } from '../capy-journal.ts';
import { requestUserId } from '../user-id.ts';

export const capyJournalRouter = Router();
const fields = {
  date: z.string().refine(isJournalDate, '日期无效。'),
  title: z.string().trim().max(JOURNAL_TITLE_LIMIT),
  content: z.string().trim().min(1, '写点什么再保存吧。').max(JOURNAL_CONTENT_LIMIT),
};
const createSchema = z.object({ id: z.uuid(), ...fields }).strict();
const updateSchema = z.object({ revision: z.number().int().positive(), ...fields }).strict();
const deleteSchema = z.object({ revision: z.number().int().positive() }).strict();

capyJournalRouter.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const owner = requestUserId(req);
  if (!owner) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '缺少用户标识。' });
  res.locals.journalOwner = owner;
  next();
});

capyJournalRouter.get('/', async (req, res) => {
  const offset = z.coerce.number().int().min(0).max(1_000_000).safeParse(req.query.offset ?? 0);
  if (!offset.success) return res.status(422).json({ error: 'VALIDATION_ERROR', message: '分页参数无效。' });
  res.json(await listCapyJournal(res.locals.journalOwner, offset.data));
});

capyJournalRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message });
  const result = await createCapyJournal(res.locals.journalOwner, parsed.data.id, parsed.data);
  res.status(result.created ? 201 : 200).json({ entry: result.entry });
});

capyJournalRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message });
  const entry = await updateCapyJournal(res.locals.journalOwner, String(req.params.id), parsed.data.revision, parsed.data);
  res.json({ entry });
});

capyJournalRouter.delete('/:id', async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: 'VALIDATION_ERROR', message: '缺少日记版本。' });
  await removeCapyJournal(res.locals.journalOwner, String(req.params.id), parsed.data.revision);
  res.json({ ok: true });
});

capyJournalRouter.use((error: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
  if (!(error instanceof JournalError)) return next(error);
  res.status(error.code === 'NOT_FOUND' ? 404 : 409).json({ error: error.code,
    message: error.code === 'NOT_FOUND' ? '这篇日记不存在。' : '这篇日记已被修改，请重新打开后再编辑。' });
});
