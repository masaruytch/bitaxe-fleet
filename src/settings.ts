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
  workspaceId = "default",
): number {
  const row = store.sqlite
    .prepare(
      "SELECT value FROM app_settings WHERE key = 'poll_interval_seconds'",
    )
    .get() as { value: number } | undefined;
  const workspace = store.sqlite
    .prepare(
      "SELECT poll_interval_seconds AS value FROM workspaces WHERE id = ?",
    )
    .get(workspaceId) as { value: number | null } | undefined;
  if (!workspace) throw registrationError("Workspace not found", 404);
  const value = workspace.value ?? row?.value ?? fallback;
  validateInterval(value);
  return value;
}
export function setPollingInterval(
  store: AppDatabase,
  seconds: number,
  workspaceId = "default",
) {
  validateInterval(seconds);
  const result = store.sqlite
    .prepare("UPDATE workspaces SET poll_interval_seconds = ? WHERE id = ?")
    .run(seconds, workspaceId);
  if (!result.changes) throw registrationError("Workspace not found", 404);
  return { pollIntervalSeconds: seconds };
}
