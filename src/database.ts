import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";
export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  // Versioned schema upgrades run transactionally without replacing existing data.
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)",
  );
  sqlite.transaction(() => {
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 1")
        .get()
    ) {
      sqlite.exec(`
        CREATE TABLE miners (id TEXT PRIMARY KEY, name TEXT NOT NULL, ip TEXT NOT NULL UNIQUE, algorithm TEXT NOT NULL);
        CREATE TABLE observations (
          miner_id TEXT NOT NULL REFERENCES miners(id), observed_at INTEGER NOT NULL,
          online INTEGER NOT NULL, hashrate_ghs REAL, power_watts REAL, temperature_c REAL,
          accepted INTEGER, rejected INTEGER, uptime_seconds INTEGER, firmware TEXT, pool TEXT, error TEXT,
          PRIMARY KEY(miner_id, observed_at)
        );
        CREATE INDEX observations_time ON observations(observed_at);
        INSERT INTO schema_migrations(version) VALUES (1);
      `);
    }
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 2")
        .get()
    ) {
      sqlite.exec(`
        ALTER TABLE miners ADD COLUMN mac_address TEXT;
        ALTER TABLE miners ADD COLUMN hostname TEXT;
        ALTER TABLE miners ADD COLUMN model TEXT;
        ALTER TABLE miners ADD COLUMN registered_at INTEGER NOT NULL DEFAULT 0;
        CREATE UNIQUE INDEX miners_mac ON miners(mac_address) WHERE mac_address IS NOT NULL;
        INSERT INTO schema_migrations(version) VALUES (2);
      `);
    }
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 3")
        .get()
    ) {
      sqlite.exec(`ALTER TABLE observations ADD COLUMN best_difficulty REAL;
        INSERT INTO schema_migrations(version) VALUES (3);`);
    }
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 4")
        .get()
    ) {
      sqlite.exec(`CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL CHECK(value BETWEEN 10 AND 3600)
      ); INSERT INTO schema_migrations(version) VALUES (4);`);
    }
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 5")
        .get()
    ) {
      sqlite.exec(`
        ALTER TABLE miners ADD COLUMN coin TEXT;
        ALTER TABLE miners ADD COLUMN icon TEXT;
        ALTER TABLE miners ADD COLUMN custom_icon TEXT;
        ALTER TABLE observations ADD COLUMN pool_port INTEGER;
        ALTER TABLE observations ADD COLUMN pool_user TEXT;
        ALTER TABLE observations ADD COLUMN pool_mode TEXT;
        INSERT INTO schema_migrations(version) VALUES (5);
      `);
    }
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 6")
        .get()
    ) {
      sqlite.exec(`
        ALTER TABLE observations ADD COLUMN best_session_difficulty REAL;
        INSERT INTO schema_migrations(version) VALUES (6);
      `);
    }
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 7")
        .get()
    ) {
      // SQLite cannot add a non-null REFERENCES column with an existing default.
      // Triggers enforce workspace membership without rebuilding miners/history.
      sqlite.exec(`
        CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE);
        INSERT INTO workspaces VALUES ('default', 'My mining fleet');
        ALTER TABLE miners ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
        CREATE INDEX miners_workspace ON miners(workspace_id);
        CREATE TRIGGER miners_workspace_insert BEFORE INSERT ON miners
          WHEN NOT EXISTS (SELECT 1 FROM workspaces WHERE id = NEW.workspace_id)
          BEGIN SELECT RAISE(ABORT, 'Unknown workspace'); END;
        CREATE TRIGGER miners_workspace_update BEFORE UPDATE OF workspace_id ON miners
          WHEN NOT EXISTS (SELECT 1 FROM workspaces WHERE id = NEW.workspace_id)
          BEGIN SELECT RAISE(ABORT, 'Unknown workspace'); END;
        CREATE TRIGGER workspaces_delete_used BEFORE DELETE ON workspaces
          WHEN EXISTS (SELECT 1 FROM miners WHERE workspace_id = OLD.id)
          BEGIN SELECT RAISE(ABORT, 'Workspace contains miners'); END;
        INSERT INTO schema_migrations(version) VALUES (7);
      `);
    }
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 8")
        .get()
    ) {
      sqlite.exec(`ALTER TABLE workspaces ADD COLUMN poll_interval_seconds INTEGER CHECK(poll_interval_seconds IS NULL OR poll_interval_seconds BETWEEN 10 AND 3600);
        INSERT INTO schema_migrations(version) VALUES (8);`);
    }
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 9")
        .get()
    ) {
      sqlite.exec(`ALTER TABLE workspaces ADD COLUMN temperature_unit TEXT NOT NULL DEFAULT 'C' CHECK(temperature_unit IN ('C', 'F'));
        INSERT INTO schema_migrations(version) VALUES (9);`);
    }
    if (
      !sqlite
        .prepare("SELECT version FROM schema_migrations WHERE version = 10")
        .get()
    ) {
      sqlite.exec(`ALTER TABLE workspaces ADD COLUMN agent_access_enabled INTEGER NOT NULL DEFAULT 0 CHECK(agent_access_enabled IN (0, 1));
        INSERT INTO schema_migrations(version) VALUES (10);`);
    }
  })();
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export type AppDatabase = ReturnType<typeof openDatabase>;
