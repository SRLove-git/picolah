import 'dotenv/config';

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 8787),
  host: process.env.HOST || '127.0.0.1',
  isProduction: process.env.NODE_ENV === 'production',
  ingestKey: process.env.INGEST_API_KEY || 'pcl_dev_crawler_key',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  dbPath: process.env.PICOLAH_DB_PATH || '',
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    model: process.env.LLM_MODEL || 'deepseek-chat',
    provider: process.env.LLM_PROVIDER || 'DeepSeek',
  },
};

export const llmConfigured = Boolean(config.llm.apiKey);
