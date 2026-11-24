import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool, type PoolClient } from "pg";
import { config } from "./config.ts";

// Data-access layer with two drivers behind one async interface:
//
//   * Postgres (`pg`) — used whenever DATABASE_URL is set. Neon's guidance is to
//     run migrations over the direct/unpooled URL, because PgBouncer's
//     transaction mode does not preserve session state.
//   * SQLite (`node:sqlite`) — local development and the API tests, so the suite
//     stays fast and can never touch a shared database.
//
// Domain code only depends on `all/get/run/tx`, so it stays driver-agnostic.

export type Row = Record<string, unknown>;

export interface QueryResult {
  changes: number;
}

export interface QueryExecutor {
  all<T = Row>(sql: string, params: unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, params: unknown[]): Promise<T | undefined>;
  run(sql: string, params: unknown[]): Promise<QueryResult>;
}

let executor: QueryExecutor | null = null;
let pool: Pool | null = null;
let sqlite: DatabaseSync | null = null;

// Routes a query to the transaction's connection when one is open, so code
// inside `tx()` does not have to thread a client parameter through.
const transactionScope = new AsyncLocalStorage<QueryExecutor>();

function requireExecutor(): QueryExecutor {
  if (!executor) throw new Error("Database not initialised. Call openDatabase().");
  return transactionScope.getStore() ?? executor;
}

export function databaseDriver(): "postgres" | "sqlite" | null {
  if (!executor) return null;
  return pool ? "postgres" : "sqlite";
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

function sqliteExecutor(handle: DatabaseSync): QueryExecutor {
  return {
    async all(sql, params) {
      return handle.prepare(sql).all(...(params as never[])) as never;
    },
    async get(sql, params) {
      return handle.prepare(sql).get(...(params as never[])) as never;
    },
    async run(sql, params) {
      const result = handle.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes ?? 0) };
    },
  };
}

// pg uses numbered placeholders; the repositories are written in the portable
// `?` style. No query in this codebase contains a `?` inside a string literal.
function numberedPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function postgresExecutor(queryable: Pool | PoolClient): QueryExecutor {
  return {
    async all(sql, params) {
      const result = await queryable.query(numberedPlaceholders(sql), params);
      return result.rows as never;
    },
    async get(sql, params) {
      const result = await queryable.query(numberedPlaceholders(sql), params);
      return result.rows[0] as never;
    },
    async run(sql, params) {
      const result = await queryable.query(numberedPlaceholders(sql), params);
      return { changes: result.rowCount ?? 0 };
    },
  };
}

function createPool(connectionString: string, max: number): Pool {
  const created = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    // A Neon compute that has scaled to zero takes a moment to wake; keep the
    // first statement from timing out during that window.
    statement_timeout: 30_000,
  });
  created.on("error", (error) => {
    console.error("[db] idle client error:", error instanceof Error ? error.message : error);
  });
  return created;
}

// ---------------------------------------------------------------------------
// Migrations. Append-only. Never edit a shipped migration; add a new one.
// ---------------------------------------------------------------------------

const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "core",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('driver','mechanic','tow','vendor','admin')),
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        email TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE auth_credentials (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE otp_codes (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_otp_phone ON otp_codes(phone, created_at);

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        user_agent TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE vehicles (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        year INTEGER NOT NULL,
        plate TEXT NOT NULL,
        mileage_km INTEGER NOT NULL DEFAULT 0,
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_vehicles_owner ON vehicles(owner_id);

      CREATE TABLE providers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('mechanic','tow','vendor')),
        business_name TEXT NOT NULL,
        region TEXT,
        service_areas TEXT NOT NULL DEFAULT '[]',
        specialisations TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','suspended')),
        available INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 0,
        reliability REAL NOT NULL DEFAULT 0,
        verification_note TEXT,
        verified_at TEXT,
        verified_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE provider_credentials (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        document_type TEXT NOT NULL,
        document_ref TEXT NOT NULL,
        expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','expired','rejected')),
        verified_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_credentials_provider ON provider_credentials(provider_id);

      CREATE TABLE service_requests (
        id TEXT PRIMARY KEY,
        ref TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL REFERENCES users(id),
        vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
        provider_id TEXT REFERENCES providers(id),
        kind TEXT NOT NULL CHECK (kind IN ('emergency','booking','tow')),
        problem TEXT NOT NULL,
        location_label TEXT,
        lat REAL,
        lng REAL,
        region TEXT,
        status TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        decline_count INTEGER NOT NULL DEFAULT 0,
        cancellation_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        accepted_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT
      );
      CREATE INDEX idx_requests_customer ON service_requests(customer_id);
      CREATE INDEX idx_requests_provider ON service_requests(provider_id);
      CREATE INDEX idx_requests_status ON service_requests(status);

      CREATE TABLE service_request_events (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        actor_id TEXT,
        actor_role TEXT,
        note TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_events_request ON service_request_events(request_id);

      CREATE TABLE estimates (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        provider_id TEXT NOT NULL REFERENCES providers(id),
        revision INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected','superseded')),
        total_ghs REAL NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT,
        decision_reason TEXT
      );
      CREATE INDEX idx_estimates_request ON estimates(request_id);

      CREATE TABLE estimate_line_items (
        id TEXT PRIMARY KEY,
        estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('labour','part','diagnostic','transport','other')),
        description TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit_price_ghs REAL NOT NULL
      );

      CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES service_requests(id),
        customer_id TEXT NOT NULL REFERENCES users(id),
        provider_id TEXT REFERENCES providers(id),
        amount_ghs REAL NOT NULL,
        method TEXT NOT NULL CHECK (method IN ('momo','cash','card')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded','partially_refunded')),
        provider_name TEXT NOT NULL,
        provider_ref TEXT,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        verified_at TEXT
      );
      CREATE UNIQUE INDEX idx_payments_idem ON payments(idempotency_key);
      CREATE INDEX idx_payments_request ON payments(request_id);

      CREATE TABLE refunds (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL REFERENCES payments(id),
        amount_ghs REAL NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
        actor_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE disputes (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES service_requests(id),
        raised_by TEXT NOT NULL REFERENCES users(id),
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','rejected')),
        resolution TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT
      );

      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_notifications_user ON notifications(user_id);

      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        actor_role TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
    `,
  },
  {
    version: 2,
    name: "oauth_accounts",
    sql: `
      CREATE TABLE oauth_accounts (
        provider TEXT NOT NULL CHECK (provider IN ('google')),
        provider_subject TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider, provider_subject)
      );
      CREATE INDEX idx_oauth_user ON oauth_accounts(user_id);
    `,
  },
  {
    version: 3,
    name: "user_avatar",
    sql: `ALTER TABLE users ADD COLUMN avatar_data_url TEXT;`,
  },
  {
    version: 4,
    name: "map_locations",
    sql: `
      ALTER TABLE providers ADD COLUMN lat REAL;
      ALTER TABLE providers ADD COLUMN lng REAL;
      ALTER TABLE providers ADD COLUMN address TEXT;
      ALTER TABLE service_requests ADD COLUMN provider_lat REAL;
      ALTER TABLE service_requests ADD COLUMN provider_lng REAL;
      ALTER TABLE service_requests ADD COLUMN provider_location_at TEXT;
    `,
  },
  {
    version: 5,
    name: "reviews_and_safety",
    sql: `
      ALTER TABLE providers ADD COLUMN bio TEXT;
      ALTER TABLE providers ADD COLUMN years_experience INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE providers ADD COLUMN safety_note TEXT;
      ALTER TABLE providers ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        request_id TEXT UNIQUE REFERENCES service_requests(id) ON DELETE SET NULL,
        customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_reviews_provider ON reviews(provider_id, status, created_at);
      CREATE INDEX idx_reviews_customer ON reviews(customer_id);

      CREATE TABLE safety_reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
        request_id TEXT REFERENCES service_requests(id) ON DELETE SET NULL,
        reason TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_safety_reports_status ON safety_reports(status, created_at);
    `,
  },
  {
    version: 6,
    name: "provider_managed_otp",
    sql: `ALTER TABLE otp_codes ADD COLUMN provider_managed BOOLEAN NOT NULL DEFAULT 0;`,
  },
];

function migrateSqlite(handle: DatabaseSync) {
  const current = Number((handle.prepare("PRAGMA user_version").get() as { user_version: number }).user_version ?? 0);
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    handle.exec("BEGIN");
    try {
      handle.exec(migration.sql);
      handle.exec(`PRAGMA user_version = ${migration.version}`);
      handle.exec("COMMIT");
    } catch (error) {
      handle.exec("ROLLBACK");
      throw error;
    }
  }
}

async function migratePostgres(connectionString: string) {
  const migrator = createPool(connectionString, 1);
  try {
    await migrator.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    const applied = await migrator.query<{ version: number }>("SELECT version FROM schema_migrations");
    const done = new Set(applied.rows.map((row) => Number(row.version)));
    for (const migration of migrations) {
      if (done.has(migration.version)) continue;
      // Statements are sent without parameters so multi-statement migrations
      // run through the simple-query protocol.
      await migrator.query("BEGIN");
      try {
        await migrator.query(migration.sql);
        await migrator.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)", [
          migration.version,
          migration.name,
          new Date().toISOString(),
        ]);
        await migrator.query("COMMIT");
      } catch (error) {
        await migrator.query("ROLLBACK").catch(() => {});
        throw error;
      }
    }
  } finally {
    await migrator.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Opens the database. An explicit path (including ":memory:") always means
 * SQLite, which keeps tests hermetic. With no path, DATABASE_URL selects
 * Postgres and anything else falls back to the local SQLite file.
 */
export async function openDatabase(databasePath?: string): Promise<void> {
  if (executor) return;

  if (databasePath === undefined && config.databaseUrl) {
    const created = createPool(config.databaseUrl, 10);
    await migratePostgres(config.databaseUrlUnpooled || config.databaseUrl);
    pool = created;
    executor = postgresExecutor(created);
    return;
  }

  const target = databasePath ?? config.databasePath;
  if (target !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  }
  const handle = new DatabaseSync(target);
  handle.exec("PRAGMA journal_mode = WAL;");
  handle.exec("PRAGMA foreign_keys = ON;");
  handle.exec("PRAGMA busy_timeout = 5000;");
  sqlite = handle;
  executor = sqliteExecutor(handle);
  migrateSqlite(handle);
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
  sqlite?.close();
  sqlite = null;
  executor = null;
}

// ---------------------------------------------------------------------------
// Tiny query helpers shared by all repositories.
// ---------------------------------------------------------------------------

export function all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return requireExecutor().all<T>(sql, params);
}

export function get<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return requireExecutor().get<T>(sql, params);
}

export function run(sql: string, params: unknown[] = []): Promise<QueryResult> {
  return requireExecutor().run(sql, params);
}

/**
 * Runs `work` in a transaction. Postgres takes a dedicated connection and
 * routes the helpers through it with AsyncLocalStorage; SQLite serialises on
 * its single handle. Nested calls join the outer transaction.
 */
export async function tx<T>(work: () => Promise<T> | T): Promise<T> {
  if (!executor) throw new Error("Database not initialised. Call openDatabase().");
  if (transactionScope.getStore()) return work();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await transactionScope.run(postgresExecutor(client), async () => work());
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  const handle = sqlite;
  if (!handle) throw new Error("Database not initialised. Call openDatabase().");
  handle.exec("BEGIN");
  try {
    const result = await work();
    handle.exec("COMMIT");
    return result;
  } catch (error) {
    handle.exec("ROLLBACK");
    throw error;
  }
}
