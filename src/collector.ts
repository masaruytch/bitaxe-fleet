import { isDemoDatabase } from "./demo.js";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { AppDatabase } from "./database.js";
import { minerIdentity } from "./miner-registration.js";
import { eq } from "drizzle-orm";
import { miners } from "./schema.js";
import { normalizeTelemetry } from "./telemetry.js";
import { saveObservation, pruneHistory } from "./store.js";
import type { Observation } from "../shared/contracts.js";
export async function collectOnce(
  store: AppDatabase,
  options: {
    timeoutMs: number;
    retentionDays: number;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    demoMode?: boolean;
  },
) {
  if (options.demoMode || isDemoDatabase(store))
    return { skipped: true, attempted: 0, online: 0, offline: 0 };
  const devices = store.db.select().from(miners).all();
  const now = Math.floor(Date.now() / 1000);
  const owner = randomUUID();
  store.sqlite.exec(
    "CREATE TABLE IF NOT EXISTS collector_lease (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)",
  );
  const leaseSeconds = Math.max(
    60,
    Math.ceil((devices.length * options.timeoutMs) / 1000) * 2,
  );
  const claimed = store.sqlite
    .prepare(
      `INSERT INTO collector_lease VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
    WHERE collector_lease.expires_at < ?`,
    )
    .run(owner, now + leaseSeconds, now).changes;
  if (!claimed) return { skipped: true, attempted: 0, online: 0, offline: 0 };
  let online = 0;
  let offline = 0;
  try {
    // Bounded concurrency and per-device timeouts keep unreachable devices from blocking the fleet.
    for (let index = 0; index < devices.length; index += 4) {
      if (options.signal?.aborted) break;
      await Promise.all(
        devices.slice(index, index + 4).map(async (device) => {
          const observedAt = Math.floor(Date.now() / 1000);
          let observation: Observation;
          try {
            if (!isIP(device.ip) || device.algorithm !== "sha256")
              throw new Error("Unsupported device address or protocol");
            const host = isIP(device.ip) === 6 ? `[${device.ip}]` : device.ip;
            const timeout = AbortSignal.timeout(options.timeoutMs);
            const signal = options.signal
              ? AbortSignal.any([timeout, options.signal])
              : timeout;
            const response = await (options.fetcher ?? fetch)(
              `http://${host}/api/system/info`,
              { signal, redirect: "error" },
            );
            if (!response.ok)
              throw new Error(`Miner returned HTTP ${response.status}`);
            const raw = await response.json();
            observation = normalizeTelemetry(raw, observedAt);
            const identity = minerIdentity(raw);
            if (identity.macAddress) {
              if (
                device.macAddress &&
                device.macAddress !== identity.macAddress
              )
                throw new Error(
                  "Hardware identity changed at this IP address.",
                );
              const duplicate = store.db
                .select()
                .from(miners)
                .where(eq(miners.macAddress, identity.macAddress))
                .get();
              if (duplicate && duplicate.id !== device.id)
                throw new Error(
                  "Hardware identity is already registered to another miner.",
                );
              store.db
                .update(miners)
                .set({
                  macAddress: identity.macAddress,
                  hostname: identity.hostname,
                  model: identity.model,
                })
                .where(eq(miners.id, device.id))
                .run();
            }
            online++;
          } catch (error) {
            if (options.signal?.aborted) return;
            observation = {
              observedAt,
              online: false,
              hashrateGhs: null,
              powerWatts: null,
              temperatureC: null,
              bestDifficulty: null,
              bestSessionDifficulty: null,
              accepted: null,
              rejected: null,
              uptimeSeconds: null,
              firmware: null,
              pool: null,
              error:
                error instanceof Error
                  ? error.message.slice(0, 255)
                  : "Polling failed",
            };
            offline++;
          }
          saveObservation(store, device.id, observation);
        }),
      );
    }
    pruneHistory(store, now - options.retentionDays * 86400);
    return { skipped: false, attempted: online + offline, online, offline };
  } finally {
    store.sqlite
      .prepare("DELETE FROM collector_lease WHERE id = 1 AND owner = ?")
      .run(owner);
  }
}
