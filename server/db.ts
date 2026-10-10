import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "./config.ts";

// Data-access layer. Uses Node's built-in SQLite driver so the backend has no
// native build step. The schema and query shapes are intentionally portable to
// Postgres: swap this module for a pg-backed implementation of the same
// `get/all/run/tx` helpers without touching domain code.

let database: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (!database) throw new Error("Database not initialised. Call openDatabase().");
  return database;
}

function applyPragmas(handle: DatabaseSync) {
  handle.exec("PRAGMA journal_mode = WAL;");
  handle.exec("PRAGMA foreign_keys = ON;");
  handle.exec("PRAGMA busy_timeout = 5000;");
}

export function openDatabase(databasePath: string = config.databasePath): DatabaseSync {
  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }
  const handle = new DatabaseSync(databasePath);
  applyPragmas(handle);
  database = handle;
  migrate(handle);
  return handle;
}

export function closeDatabase() {
  database?.close();
  database = null;
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
];

function migrate(handle: DatabaseSync) {
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

// ---------------------------------------------------------------------------
// Tiny query helpers shared by all repositories.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return db().prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return db().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, params: unknown[] = []) {
  return db().prepare(sql).run(...(params as never[]));
}

export function tx<T>(work: () => T): T {
  const handle = db();
  handle.exec("BEGIN");
  try {
    const result = work();
    handle.exec("COMMIT");
    return result;
  } catch (error) {
    handle.exec("ROLLBACK");
    throw error;
  }
}
