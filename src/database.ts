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
  })();
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export type AppDatabase = ReturnType<typeof openDatabase>;
