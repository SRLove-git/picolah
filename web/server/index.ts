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
import { profileRouter } from './routes/profile.ts';
import { authRouter } from './routes/auth.ts';
import { watchlistRouter, alertsRouter } from './routes/watchlist.ts';
import { outRouter } from './routes/out.ts';
import { accountRouter } from './routes/account.ts';
import { attachUser, requireAuth } from './auth.ts';

seedDatabase(false);

export const app = express();

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Picolah-User'],
});

app.use((req, res, next) => {
  // Same-origin requests do not need CORS, and browsers send an Origin header
  // for module scripts. Never let an allowlist miss break the app's own assets.
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host === req.headers.host) {
        next();
        return;
      }
    } catch {
      // Malformed Origin: let the CORS middleware reject it.
    }
  }
  corsMiddleware(req, res, next);
});
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'picolah-api',
    llmConfigured,
    time: new Date().toISOString(),
  });
});

// Hide the workspace behind an unguessable path. API calls need the cookie set
// by the entry page; health checks and the crawler's Bearer ingest stay open.
app.use('/api', (req, res, next) => {
  if (!config.isProduction) return next();
  if (req.path === '/health') return next();
  if (req.path.startsWith('/v1/ingest')) return next();
  if (hasEntryCookie(req)) return next();
  res.status(404).json({ error: 'NOT_FOUND' });
});

app.use('/api', attachUser);
app.use('/api/auth', authRouter);
app.use('/api/config', configRouter);
app.use('/api/chat', requireAuth, chatRouter);
app.use('/api/conversations', requireAuth, conversationsRouter);
app.use('/api/catalog', requireAuth, catalogRouter);
app.use('/api/profile', requireAuth, profileRouter);
app.use('/api/watchlist', requireAuth, watchlistRouter);
app.use('/api/alerts', requireAuth, alertsRouter);
app.use('/api/account', requireAuth, accountRouter);
app.use('/api/v1/ingest', ingestRouter);
app.use('/go', attachUser, outRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'API 路由不存在' });
});

const root = join(import.meta.dirname, '..');
const distDir = join(root, 'dist');
const indexPath = join(distDir, 'index.html');
const landingPath = join(distDir, 'landing.html');
const ENTRY_PATH = (process.env.PICOLAH_ENTRY_PATH || '/7hk9ho').replace(/\/+$/, '') || '/7hk9ho';

function isSecureRequest(req: express.Request): boolean {
  const forwarded = req.header('x-forwarded-proto');
  return req.secure || (forwarded ? forwarded.split(',')[0].trim() === 'https' : false);
}

function hasEntryCookie(req: express.Request): boolean {
  return /(?:^|;\s*)pcl_entry=1(?:;|$)/.test(req.header('cookie') || '');
}

function sendLandingPage(res: express.Response): void {
  if (existsSync(landingPath)) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(landingPath);
    return;
  }
  res.type('html').send('<!doctype html><title>Picolah</title><h1>Picolah</h1>');
}

function sendApp(req: express.Request, res: express.Response): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-cache');
  if (config.isProduction) {
    res.cookie('pcl_entry', '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest(req),
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
  res.sendFile(indexPath);
}

if (existsSync(indexPath)) {
  // The public site: a quiet research page, not the workspace.
  app.get('/', (_req, res) => sendLandingPage(res));
  app.get('/index.html', (_req, res) => res.status(404).type('text').send('Not found'));

  app.use(express.static(distDir, { index: false, maxAge: '1h' }));

  // The real workspace lives at an unguessable path.
  app.use(ENTRY_PATH, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!req.accepts('html')) return next();
    sendApp(req, res);
  });

  app.use((_req, res) => res.status(404).type('text').send('Not found'));
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

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, config.host, () => {
    console.log(`\n  Picolah API   http://${config.host}:${config.port}`);
    console.log(`  Price DB      ${dbPath}`);
    console.log(`  LLM           ${llmConfigured ? `${config.llm.provider} / ${config.llm.model}` : 'local writer (set LLM_API_KEY to enable)'}`);
    console.log(
      `  Crawler key   ${config.ingestKey === 'pcl_dev_crawler_key' ? 'using development default' : 'configured'}\n`,
    );
  });
}
