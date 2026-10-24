import type { AppDatabase } from "./database.js";
import {
  DEFAULT_POLL_INTERVAL_SECONDS,
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
} from "../shared/settings.js";
import { registrationError } from "./miner-registration.js";
function validateInterval(seconds: number) {
  if (
    !Number.isInteger(seconds) ||
    seconds < MIN_POLL_INTERVAL_SECONDS ||
    seconds > MAX_POLL_INTERVAL_SECONDS
  )
    throw registrationError(
      `Collection interval must be a whole number between ${MIN_POLL_INTERVAL_SECONDS} and ${MAX_POLL_INTERVAL_SECONDS} seconds.`,
      400,
    );
}
export function getPollingInterval(
  store: AppDatabase,
  fallback = DEFAULT_POLL_INTERVAL_SECONDS,
): number {
  const row = store.sqlite
    .prepare(
      "SELECT value FROM app_settings WHERE key = 'poll_interval_seconds'",
    )
    .get() as { value: number } | undefined;
  const value = row?.value ?? fallback;
  validateInterval(value);
  return value;
}
export function setPollingInterval(store: AppDatabase, seconds: number) {
  validateInterval(seconds);
  store.sqlite
    .prepare(
      "INSERT INTO app_settings(key,value) VALUES ('poll_interval_seconds',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(seconds);
  return { pollIntervalSeconds: seconds };
}
