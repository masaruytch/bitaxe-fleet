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
  const fallback = info.isUsingFallbackStratum;
  const knownPool =
    fallback === true || fallback === false || fallback === 0 || fallback === 1;
  const usingFallback = fallback === true || fallback === 1;
  const prefix = usingFallback ? "fallbackStratum" : "stratum";
  const port = number(`${prefix}Port`);
  return {
    observedAt,
    online: true,
    hashrateGhs: number("hashRate"),
    powerWatts: number("power"),
    temperatureC: number("temp"),
    bestDifficulty: parseDifficulty(info.bestDiff),
    bestSessionDifficulty: parseDifficulty(info.bestSessionDiff),
    accepted: number("sharesAccepted"),
    rejected: number("sharesRejected"),
    uptimeSeconds: number("uptimeSeconds"),
    firmware: text("version"),
    pool: text(`${prefix}URL`),
    poolPort:
      port !== null && Number.isInteger(port) && port >= 1 && port <= 65535
        ? port
        : null,
    poolUser: text(`${prefix}User`),
    poolMode: knownPool
      ? usingFallback
        ? "fallback"
        : "primary"
      : "unconfirmed",
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

/** Reasons use the same rules as the status badge; no warning is left unexplained. */
export function warningReasons(
  latest: Observation | null,
  now: number,
  staleSeconds: number,
): string[] {
  if (!latest) return ["Waiting for the first observation."];
  if (now - latest.observedAt > staleSeconds)
    return ["Telemetry is stale: no recent observation from the collector."];
  if (!latest.online)
    return [
      latest.error ||
        "The latest collection attempt could not reach this miner.",
    ];
  const reasons: string[] = [];
  if ((latest.temperatureC ?? 0) >= 70)
    reasons.push(
      `High chip temperature: ${latest.temperatureC!.toFixed(1)} °C (warning at 70 °C).`,
    );
  if (latest.hashrateGhs === 0) reasons.push("Miner reports zero hashrate.");
  return reasons;
}
