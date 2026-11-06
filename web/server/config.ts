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
  /** Catalog mode never invokes the on-demand marketplace crawler. */
  productSearchSource: process.env.PRODUCT_SEARCH_SOURCE === 'catalog' ? 'catalog' : 'live',
  /** Chat can search current web prices without changing Discover's catalog policy. */
  chatPriceSearchSource: process.env.CHAT_PRICE_SEARCH_SOURCE === 'web' ? 'web' : 'default',
  /**
   * Guests can always browse, chat and compare. When true, account-owned data
   * (watchlist, price alerts, account settings) asks the visitor to sign in.
   */
  authRequired: process.env.AUTH_REQUIRED !== undefined
    ? /^(1|true|yes)$/i.test(process.env.AUTH_REQUIRED)
    : production,
  sessionCookie: 'picolah_session',
  sessionDays: num(process.env.SESSION_DAYS, 30),
  ingestKey: process.env.INGEST_API_KEY || 'pcl_dev_crawler_key',
  /** When set, /metrics requires `Authorization: Bearer <token>`. */
  metricsToken: process.env.METRICS_TOKEN || '',
  mail: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: process.env.MAIL_FROM || 'Picolah <no-reply@picolah.com>',
    secret: process.env.MAIL_CODE_SECRET || process.env.SESSION_SECRET || 'pcl_dev_mail_secret',
    /** Without a provider the API returns the code so local/test flows work. */
    exposeCodes: !production,
  },
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** PostgreSQL DSN. When set, the app uses PostgreSQL instead of SQLite. */
  databaseUrl: process.env.DATABASE_URL || '',
  dbPoolSize: num(process.env.DATABASE_POOL_SIZE, 10),
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
    model: process.env.LLM_MODEL || 'deepseek-flash',
    intentModel: process.env.LLM_INTENT_MODEL || process.env.LLM_MODEL || 'deepseek-flash',
    visionModel: process.env.LLM_VISION_MODEL || 'deepseek-flash',
    provider: process.env.LLM_PROVIDER || 'DeepSeek',
  },
  /** DeepSeek official search API; opt in separately from marketplace crawling. */
  webSearch: {
    enabled: /^(1|true|yes)$/i.test(process.env.WEB_SEARCH_ENABLED || ''),
    apiKey: process.env.WEB_SEARCH_API_KEY ||
      (/^https:\/\/api\.deepseek\.com(?:\/|$)/i.test(process.env.LLM_BASE_URL || 'https://api.deepseek.com') ? process.env.LLM_API_KEY || '' : ''),
    timeoutMs: Math.max(1000, Math.min(30_000, num(process.env.WEB_SEARCH_TIMEOUT_MS, 20_000))),
  },
  /**
   * AI try-on: compose real marketplace product photos onto the capybara.
   * Every provider is optional; without a key the feature stays off and the
   * UI falls back to the existing artwork.
   */
  imagegen: {
    enabled: process.env.IMAGE_GEN !== 'off',
    provider: (process.env.IMAGE_PROVIDER || '').toLowerCase(),
    geminiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    geminiBaseUrl: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, ''),
    geminiModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    openaiKey: process.env.OPENAI_API_KEY || '',
    openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    openaiModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    dashscopeKey: process.env.DASHSCOPE_API_KEY || '',
    dashscopeBaseUrl: (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/$/, ''),
    dashscopeModel: process.env.DASHSCOPE_IMAGE_MODEL || 'qwen-image-edit',
    timeoutMs: Math.max(15_000, num(process.env.IMAGE_TIMEOUT_MS, 120_000)),
    /** Per-visitor hourly generation budget; cached results do not count. */
    perHour: Math.max(1, num(process.env.IMAGE_RATE_PER_HOUR, 6)),
  },
  crawlerTool: {
    // Cache verified search results for at most five minutes; 0 disables reuse.
    cacheTtlMs: Math.max(0, Math.min(300, Math.floor(num(process.env.PRICE_SEARCH_CACHE_TTL_SECONDS, 300)))) * 1000,
    cacheMaxEntries: Math.max(1, Math.min(1000, Math.floor(num(process.env.PRICE_SEARCH_CACHE_MAX_ENTRIES, 200)))),
    searchScope: (process.env.CRAWLER_SEARCH_SCOPE === 'web' ? 'web' : 'platforms') as 'web' | 'platforms',
    url: (process.env.CRAWLER_TOOL_URL || '').replace(/\/+$/, ''),
    token: process.env.CRAWLER_TOOL_TOKEN || '',
    timeoutMs: Math.max(10_000, num(process.env.CRAWLER_TOOL_TIMEOUT_MS, 420_000)),
    maxProducts: Math.min(4, Math.max(1, num(process.env.CRAWLER_TOOL_MAX_PRODUCTS, 2))),
    defaultPlatforms: (process.env.CRAWLER_TOOL_DEFAULT_PLATFORMS || 'shopee,lazada,amazon-sg')
      .split(',')
      .map((platform) => platform.trim().toLowerCase())
      .filter(Boolean),
  },
};

export const llmConfigured = Boolean(config.llm.apiKey);
export const crawlerToolConfigured = Boolean(config.crawlerTool.url && config.crawlerTool.token);
