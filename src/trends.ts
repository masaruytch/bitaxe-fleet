import type { AppDatabase } from "./database.js";
import type { FleetTrendsResponse, TrendPoint } from "../shared/contracts.js";
import { miners } from "./schema.js";
import { asc } from "drizzle-orm";

/** Average each device first, then total matching intervals across the fleet.
 * Never convert an absent/offline observation into a measured zero. */
export function fleetTrends(
  store: AppDatabase,
  hours: number,
  now: number,
): FleetTrendsResponse {
  const bucketSeconds = hours <= 1 ? 60 : hours <= 24 ? 900 : 3600;
  const bucketCount = Math.ceil((hours * 3600) / bucketSeconds);
  const start =
    Math.floor(now / bucketSeconds) * bucketSeconds -
    (bucketCount - 1) * bucketSeconds;
  const devices = store.db
    .select()
    .from(miners)
    .orderBy(asc(miners.name))
    .all();
  type Bucket = {
    minerId: string;
    bucket: number;
    failed: number;
    hash: number | null;
    power: number | null;
    temperature: number | null;
  };
  const rows = store.sqlite
    .prepare(
      `
    SELECT miner_id AS minerId, CAST((observed_at - ?) / ? AS INTEGER) AS bucket,
      SUM(CASE WHEN online = 0 THEN 1 ELSE 0 END) AS failed,
      AVG(CASE WHEN online = 1 THEN hashrate_ghs END) AS hash,
      AVG(CASE WHEN online = 1 THEN power_watts END) AS power,
      AVG(CASE WHEN online = 1 THEN temperature_c END) AS temperature
    FROM observations WHERE observed_at >= ? AND observed_at <= ?
    GROUP BY miner_id, bucket ORDER BY bucket
  `,
    )
    .all(start, bucketSeconds, start, now) as Bucket[];
  const byDevice = new Map<string, Map<number, Bucket>>();
  for (const row of rows) {
    if (!byDevice.has(row.minerId)) byDevice.set(row.minerId, new Map());
    byDevice.get(row.minerId)!.set(row.bucket, row);
  }
  const series = devices.map((device) => ({
    id: device.id,
    name: device.name,
    algorithm: device.algorithm,
    registeredAt: device.registeredAt,
    points: Array.from({ length: bucketCount }, (_, index): TrendPoint => {
      const bucket = byDevice.get(device.id)?.get(index);
      const valid = bucket && bucket.failed === 0;
      return {
        at: start + index * bucketSeconds,
        hashrateThs:
          valid && device.algorithm === "sha256" && bucket.hash !== null
            ? bucket.hash / 1000
            : null,
        powerWatts: valid ? bucket.power : null,
        temperatureC: valid ? bucket.temperature : null,
        efficiencyJth:
          valid &&
          device.algorithm === "sha256" &&
          bucket.hash !== null &&
          bucket.hash > 0 &&
          bucket.power !== null
            ? bucket.power / (bucket.hash / 1000)
            : null,
      };
    }),
  }));
  const total = (values: (number | null)[]) =>
    values.length > 0 && values.every((value) => value !== null)
      ? values.reduce<number>((sum, value) => sum + value!, 0)
      : null;
  const fleet = Array.from({ length: bucketCount }, (_, index): TrendPoint => {
    const active = series.filter(
      (device) => device.registeredAt < start + (index + 1) * bucketSeconds,
    );
    const sha = active.filter((device) => device.algorithm === "sha256");
    const hash = total(sha.map((device) => device.points[index].hashrateThs));
    const shaPower = total(
      sha.map((device) => device.points[index].powerWatts),
    );
    return {
      at: start + index * bucketSeconds,
      hashrateThs: hash,
      powerWatts: total(
        active.map((device) => device.points[index].powerWatts),
      ),
      temperatureC: null,
      efficiencyJth:
        hash !== null && hash > 0 && shaPower !== null ? shaPower / hash : null,
    };
  });
  return { hours, bucketSeconds, generatedAt: now, fleet, devices: series };
}
