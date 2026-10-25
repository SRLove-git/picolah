import 'dotenv/config';

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const production = process.env.NODE_ENV === 'production';

export const config = {
  port: num(process.env.PORT, 8787),
  host: process.env.HOST || '127.0.0.1',
  isProduction: production,
  /** Production is closed by default; local development stays open for demos. */
  authRequired: process.env.AUTH_REQUIRED !== undefined
    ? /^(1|true|yes)$/i.test(process.env.AUTH_REQUIRED)
    : production,
  sessionCookie: 'picolah_session',
  sessionDays: num(process.env.SESSION_DAYS, 30),
  ingestKey: process.env.INGEST_API_KEY || 'pcl_dev_crawler_key',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  dbPath: process.env.PICOLAH_DB_PATH || '',
  offerFreshnessHours: num(process.env.OFFER_FRESHNESS_HOURS, 24),
  /** Optional outbound webhook for price alerts (Slack/Telegram bridge/email worker). */
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || '',
  /** Optional affiliate URL templates, e.g. AFFILIATE_SHOPEE_TEMPLATE. */
  affiliateTemplates: Object.fromEntries(
    ['shopee', 'lazada', 'tiktok', 'amazon-sg', 'tokopedia', 'tiki'].map((id) => [
      id,
      process.env[`AFFILIATE_${id.toUpperCase().replace(/-/g, '_')}_TEMPLATE`] || '',
    ]),
  ) as Record<string, string>,
  /** Crawler data older than this is hidden from comparisons. 0 disables the filter. */
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    model: process.env.LLM_MODEL || 'deepseek-chat',
    provider: process.env.LLM_PROVIDER || 'DeepSeek',
  },
};

export const llmConfigured = Boolean(config.llm.apiKey);
