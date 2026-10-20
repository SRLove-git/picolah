import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cors from 'cors';
import express from 'express';
import { config, llmConfigured } from './config.ts';
import { dbPath } from './db.ts';
import { seedDatabase } from './seed.ts';
import { chatRouter } from './routes/chat.ts';
import { conversationsRouter } from './routes/conversations.ts';
import { catalogRouter, configRouter } from './routes/config.ts';
import { ingestRouter } from './routes/ingest.ts';

seedDatabase(false);

export const app = express();

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'picolah-api',
    llmConfigured,
    time: new Date().toISOString(),
  });
});

app.use('/api/config', configRouter);
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/v1/ingest', ingestRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'API 路由不存在' });
});

const root = join(import.meta.dirname, '..');
const distDir = join(root, 'dist');
const indexPath = join(distDir, 'index.html');
if (existsSync(indexPath)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
      res.sendFile(indexPath);
      return;
    }
    next();
  });
}

app.use(
  (
    error: Error & { type?: string; status?: number },
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'INVALID_JSON', message: '请求体不是合法的 JSON。' });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: '请求体过大，图片请压缩到 3MB 以内再上传。' });
      return;
    }
    console.error('[server]', error);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: '服务器开小差了，请稍后再试。' });
  },
);

app.listen(config.port, '127.0.0.1', () => {
  console.log(`\n  Picolah API   http://127.0.0.1:${config.port}`);
  console.log(`  Price DB      ${dbPath}`);
  console.log(`  LLM           ${llmConfigured ? `${config.llm.provider} / ${config.llm.model}` : 'local writer (set LLM_API_KEY to enable)'}`);
  console.log(
    `  Crawler key   ${config.ingestKey === 'pcl_dev_crawler_key' ? 'using development default' : 'configured'}\n`,
  );
});
