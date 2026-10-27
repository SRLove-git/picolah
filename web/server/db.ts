import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Pool, type PoolClient } from 'pg';
import { config } from './config.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** SQLite file path. Ignored when DATABASE_URL points at PostgreSQL. */
export const dbPath = config.dbPath || join(here, '..', 'data', 'picolah.db');

export type Row = Record<string, unknown>;

export interface DbExecutor {
  all<T = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  run(sql: string, params?: readonly unknown[]): Promise<{ changes: number }>;
}

export interface Database extends DbExecutor {
  kind: 'sqlite' | 'postgres';
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const SQLITE_SCHEMA = `
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
    landed_price_confidence TEXT NOT NULL DEFAULT 'estimated',
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
    price REAL,
    currency TEXT,
    is_lowest INTEGER,
    position INTEGER,
    metadata TEXT,
    created_at TEXT NOT NULL
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

  CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    market TEXT NOT NULL,
    target_price REAL,
    currency TEXT NOT NULL,
    last_price REAL,
    last_alert_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (owner_id, product_id, market)
  );

  CREATE TABLE IF NOT EXISTS price_alerts (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    watchlist_id TEXT REFERENCES watchlist(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('target', 'drop')),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    market TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    url TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS capybara_state (
    owner_id TEXT PRIMARY KEY,
    xp INTEGER NOT NULL DEFAULT 0,
    equipped TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS capybara_purchases (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    market TEXT NOT NULL,
    price REAL,
    currency TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (owner_id, product_id)
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
  CREATE INDEX IF NOT EXISTS idx_capybara_purchases_owner ON capybara_purchases(owner_id, created_at DESC);
`;

function applySqliteMigrations(handle: DatabaseSync): void {
  for (const [table, column, definition] of [
    ['offers', 'landed_price_confidence', "TEXT NOT NULL DEFAULT 'estimated'"],
  ] as const) {
    const columns = handle.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((item) => item.name === column)) {
      handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

class SqliteDatabase implements Database {
  readonly kind = 'sqlite' as const;
  private readonly handle: DatabaseSync;
  private queue: Promise<unknown> = Promise.resolve();

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private executor(): DbExecutor {
    return {
      all: async <T = Row>(sql: string, params: readonly unknown[] = []) =>
        this.handle.prepare(sql).all(...(params as never[])) as T[],
      get: async <T = Row>(sql: string, params: readonly unknown[] = []) =>
        this.handle.prepare(sql).get(...(params as never[])) as T | undefined,
      run: async (sql: string, params: readonly unknown[] = []) => ({
        changes: Number(this.handle.prepare(sql).run(...(params as never[])).changes),
      }),
    };
  }

  constructor(path: string) {
    this.handle = new DatabaseSync(path);
    this.handle.exec(SQLITE_SCHEMA);
    applySqliteMigrations(this.handle);
  }

  async all<T = Row>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.serialized(() => this.executor().all<T>(sql, params));
  }

  async get<T = Row>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
    return this.serialized(() => this.executor().get<T>(sql, params));
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    return this.serialized(() => this.executor().run(sql, params));
  }

  async transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    // Async callbacks must not allow another request to enter the same SQLite
    // connection mid-transaction. The callback receives an unqueued executor.
    return this.serialized(async () => {
      this.handle.exec('BEGIN IMMEDIATE');
      try {
        const value = await fn(this.executor());
        this.handle.exec('COMMIT');
        return value;
      } catch (error) {
        this.handle.exec('ROLLBACK');
        throw error;
      }
    });
  }

  async close(): Promise<void> {
    await this.queue;
    this.handle.close();
  }
}

function postgresSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

class PostgresExecutor implements DbExecutor {
  constructor(private readonly client: Pool | PoolClient) {}

  async all<T = Row>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const result = await this.client.query(postgresSql(sql), params as unknown[]);
    return result.rows as T[];
  }

  async get<T = Row>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
    const result = await this.client.query(postgresSql(sql), params as unknown[]);
    return result.rows[0] as T | undefined;
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    const result = await this.client.query(postgresSql(sql), params as unknown[]);
    return { changes: result.rowCount ?? 0 };
  }
}

class PostgresDatabase extends PostgresExecutor implements Database {
  readonly kind = 'postgres' as const;

  constructor(private readonly pool: Pool) {
    super(pool);
  }

  static async connect(connectionString: string): Promise<PostgresDatabase> {
    const pool = new Pool({
      connectionString,
      max: Math.max(1, config.dbPoolSize),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on('error', (error) => console.error('[db] idle PostgreSQL client error:', error.message));
    const schema = readFileSync(join(here, '..', 'db', 'postgres.sql'), 'utf8');
    await pool.query(schema);
    return new PostgresDatabase(pool);
  }

  async transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(new PostgresExecutor(client));
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

async function createDatabase(): Promise<Database> {
  if (config.databaseUrl) {
    return PostgresDatabase.connect(config.databaseUrl);
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  return new SqliteDatabase(dbPath);
}

export const db: Database = await createDatabase();

/** Backwards-compatible helper for health/debug output. */
export function databaseKind(): 'sqlite' | 'postgres' {
  return db.kind;
}
