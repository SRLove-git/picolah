import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const dbPath = config.dbPath || join(here, '..', 'data', 'picolah.db');

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    visual TEXT NOT NULL DEFAULT 'phone',
    specs TEXT NOT NULL DEFAULT '',
    aliases TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    external_id TEXT,
    source TEXT NOT NULL DEFAULT 'seed',
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    platform_id TEXT NOT NULL,
    seller TEXT NOT NULL,
    country TEXT NOT NULL,
    currency TEXT NOT NULL,
    item_price REAL NOT NULL,
    shipping_fee REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    final_price REAL NOT NULL,
    url TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 0,
    reviews INTEGER NOT NULL DEFAULT 0,
    in_stock INTEGER NOT NULL DEFAULT 1,
    is_official INTEGER NOT NULL DEFAULT 0,
    last_seen TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (source, external_id)
  );

  CREATE TABLE IF NOT EXISTS price_points (
    offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    recorded_at TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (offer_id, recorded_at)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    market TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ingest_runs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    country TEXT NOT NULL,
    received INTEGER NOT NULL DEFAULT 0,
    upserted INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_offers_product_country ON offers(product_id, country);
  CREATE INDEX IF NOT EXISTS idx_offers_country ON offers(country);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_price_points_offer ON price_points(offer_id, recorded_at);
`);
