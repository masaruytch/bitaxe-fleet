import { parseDifficulty } from "../shared/difficulty.js";
import type { Observation, DeviceState } from "../shared/contracts.js";
export function normalizeTelemetry(
  raw: unknown,
  observedAt: number,
): Observation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Miner returned invalid telemetry");
  const info = raw as Record<string, unknown>;
  const number = (key: string): number | null => {
    const value = info[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  };
  // AxeOS reports hashRate in GH/s, not TH/s. Store a single explicit unit.
  if (
    number("hashRate") === null ||
    number("power") === null ||
    number("temp") === null
  ) {
    throw new Error("Miner telemetry is missing hashRate, power, or temp");
  }
  const text = (key: string) =>
    typeof info[key] === "string" ? (info[key] as string).slice(0, 255) : null;
  return {
    observedAt,
    online: true,
    hashrateGhs: number("hashRate"),
    powerWatts: number("power"),
    temperatureC: number("temp"),
    bestDifficulty: parseDifficulty(info.bestDiff),
    accepted: number("sharesAccepted"),
    rejected: number("sharesRejected"),
    uptimeSeconds: number("uptimeSeconds"),
    firmware: text("version"),
    pool: text("stratumURL"),
    error: null,
  };
}
export function deviceState(
  latest: Observation | null,
  now: number,
  staleSeconds: number,
): DeviceState {
  if (!latest) return "unknown";
  if (now - latest.observedAt > staleSeconds) return "stale";
  if (!latest.online) return "offline";
  if ((latest.temperatureC ?? 0) >= 70 || latest.hashrateGhs === 0)
    return "warning";
  return "online";
}
