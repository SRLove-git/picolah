-- Picolah PostgreSQL schema (runtime schema when DATABASE_URL is set).
-- Applied automatically by web/server/db.ts, or manually: psql "$DATABASE_URL" -f web/db/postgres.sql
-- Keep TEXT timestamps so the existing API can switch drivers without changing payloads.

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
  item_price DOUBLE PRECISION NOT NULL,
  shipping_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  final_price DOUBLE PRECISION NOT NULL,
  landed_price_confidence TEXT NOT NULL DEFAULT 'estimated',
  url TEXT NOT NULL,
  rating DOUBLE PRECISION NOT NULL DEFAULT 0,
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
  price DOUBLE PRECISION NOT NULL,
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

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('comparison', 'offer_click')),
  market TEXT NOT NULL,
  product_id TEXT,
  category TEXT,
  brand TEXT,
  platform_id TEXT,
  price DOUBLE PRECISION,
  currency TEXT,
  is_lowest INTEGER,
  position INTEGER,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  target_price DOUBLE PRECISION,
  currency TEXT NOT NULL,
  last_price DOUBLE PRECISION,
  last_alert_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_id, product_id, market)
);

CREATE TABLE IF NOT EXISTS reel_sessions (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  reel_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, session_id),
  UNIQUE (user_id, session_id, reel_id)
);

CREATE TABLE IF NOT EXISTS reel_event_receipts (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  reel_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (user_id, session_id, reel_id) REFERENCES reel_sessions(user_id, session_id, reel_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reel_events (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  state_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  reel_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('view', 'watch', 'like', 'unlike', 'save', 'unsave', 'follow', 'unfollow', 'share', 'not_interested', 'compare')),
  market TEXT NOT NULL,
  watch_ms INTEGER NOT NULL DEFAULT 0 CHECK (watch_ms >= 0 AND watch_ms <= 3600000),
  ended INTEGER NOT NULL DEFAULT 0 CHECK (ended IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, state_key),
  FOREIGN KEY (user_id, session_id, reel_id) REFERENCES reel_sessions(user_id, session_id, reel_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  watchlist_id TEXT REFERENCES watchlist(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('target', 'drop')),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  market TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL,
  url TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offers_product_country ON offers(product_id, country);
CREATE INDEX IF NOT EXISTS idx_offers_country ON offers(country);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_points_offer ON price_points(offer_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_user_events_user_created ON user_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_events_user_updated ON reel_events(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_events_reel_updated ON reel_events(reel_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reel_events_session_type ON reel_events(user_id, session_id, type) WHERE type IN ('view', 'watch');
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_owner ON watchlist(owner_id, market);
CREATE INDEX IF NOT EXISTS idx_price_alerts_owner ON price_alerts(owner_id, created_at DESC);
