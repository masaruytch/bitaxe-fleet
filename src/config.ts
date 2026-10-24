import { DEFAULT_POLL_INTERVAL_SECONDS } from "../shared/settings.js";
import { resolve } from "node:path";
import { homedir } from "node:os";
function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer`);
  return value;
}
const demoMode = process.env.DEMO_MODE === "1";
const defaultPort = demoMode ? 3081 : 3080;
export const config = {
  demoMode,
  fleetPort: positiveInt("FLEET_PORT", 3082),
  fleetDatabasePath: process.env.FLEET_DATABASE_PATH,
  databasePath: resolve(
    process.env.DATABASE_PATH ??
      `${homedir()}/.local/share/${demoMode ? "bitaxe-fleet-demo" : "bitaxe-fleet"}/dashboard.sqlite`,
  ),
  host: process.env.HOST ?? "127.0.0.1",
  port: positiveInt("PORT", defaultPort),
  pollSeconds: positiveInt(
    "POLL_INTERVAL_SECONDS",
    DEFAULT_POLL_INTERVAL_SECONDS,
  ),
  timeoutMs: positiveInt("MINER_TIMEOUT_MS", 5000),
  appOrigin:
    process.env.APP_ORIGIN ??
    `http://127.0.0.1:${process.env.PORT ?? defaultPort}`,
  retentionDays: positiveInt("RETENTION_DAYS", 1),
};
