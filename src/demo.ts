import type { AppDatabase } from "./database.js";
import type { Observation } from "../shared/contracts.js";
import { miners } from "./schema.js";
import { saveObservation, pruneHistory } from "./store.js";

// Documentation-only addresses and fictional readings; never discovered on a LAN.
const devices = [
  { name: "Aurora Gamma", hash: 1380, power: 18.2, temp: 47, best: 42.04e9 },
  { name: "Studio Supra", hash: 680, power: 12.4, temp: 43, best: 8.31e9 },
  { name: "Workshop Gamma", hash: 1220, power: 17.1, temp: 50, best: 7.81e12 },
  { name: "Loft Ultra", hash: 510, power: 10.8, temp: 45, best: 975e6 },
  { name: "Sunroom Gamma", hash: 1290, power: 18.6, temp: 48, best: 126.5e9 },
  { name: "Garden Supra", hash: 710, power: 12.9, temp: 44, best: 18.2e9 },
];
export function isDemoDatabase(store: AppDatabase): boolean {
  return !!store.sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='demo_state'",
    )
    .get();
}
function reading(index: number, at: number, epoch: number): Observation {
  const device = devices[index];
  const offline =
    (index === 5 && at >= epoch - 600) ||
    (index === 1 && at >= epoch - 18000 && at < epoch - 16800);
  const base = { observedAt: at, online: !offline };
  if (offline)
    return {
      ...base,
      hashrateGhs: null,
      powerWatts: null,
      temperatureC: null,
      bestDifficulty: null,
      accepted: null,
      rejected: null,
      uptimeSeconds: null,
      firmware: null,
      pool: null,
      error: "Simulated connection timeout",
    };
  const hour = at / 3600;
  const variation =
    Math.sin(hour * 1.7 + index) * 0.065 +
    Math.sin(at / 83 + index) * 0.025 +
    Math.sin(hour * 0.4) * 0.12 +
    Math.sin(hour * 2.9) * 0.03;
  const warming =
    index === 4
      ? Math.min(1, Math.max(0, (at - (epoch - 10800)) / 7200)) * 26
      : 0;
  return {
    ...base,
    hashrateGhs: Number((device.hash * (1 + variation)).toFixed(1)),
    powerWatts: Number(
      (
        device.power * (1 + Math.sin(hour * 0.4) * 0.05) +
        Math.sin(hour * 1.3 + index) * 0.6
      ).toFixed(2),
    ),
    temperatureC: Number(
      (device.temp + warming + Math.sin(hour * 0.9 + index) * 3).toFixed(1),
    ),
    bestDifficulty: device.best,
    accepted: Math.floor((at - epoch + 172800) / 5) + index * 100,
    rejected: 2 + index,
    uptimeSeconds: at - epoch + 172800,
    firmware: "Demo firmware",
    pool: "pool.demo.example",
    error: null,
  };
}
export function prepareDemoData(
  store: AppDatabase,
  now = Math.floor(Date.now() / 1000),
) {
  const at = Math.floor(now / 30) * 30;
  if (!isDemoDatabase(store)) {
    const existing = store.sqlite
      .prepare(
        "SELECT (SELECT COUNT(*) FROM miners) + (SELECT COUNT(*) FROM observations) AS count",
      )
      .get() as { count: number };
    if (existing.count)
      throw new Error(
        "Demo mode requires an empty, separate database. Existing fleet data was not changed.",
      );
    store.sqlite.transaction(() => {
      store.sqlite.exec(
        "CREATE TABLE demo_state (id INTEGER PRIMARY KEY CHECK(id=1), seeded_at INTEGER NOT NULL)",
      );
      store.sqlite.prepare("INSERT INTO demo_state VALUES (1,?)").run(at);
      devices.forEach((device, index) => {
        const id = `demo-${index + 1}`;
        store.db
          .insert(miners)
          .values({
            id,
            name: device.name,
            ip: `192.0.2.${11 + index}`,
            algorithm: "sha256",
            registeredAt: at - 86400,
            model: index % 2 ? "Demo Supra" : "Demo Gamma",
          })
          .run();
        for (let sample = at - 86400; sample <= at; sample += 60)
          saveObservation(store, id, reading(index, sample, at));
      });
    })();
  }
  refreshDemoData(store, at);
}
export function refreshDemoData(
  store: AppDatabase,
  now = Math.floor(Date.now() / 1000),
) {
  if (!isDemoDatabase(store))
    throw new Error("Refusing to simulate readings in a real fleet database.");
  const epoch = (
    store.sqlite
      .prepare("SELECT seeded_at FROM demo_state WHERE id=1")
      .get() as { seeded_at: number }
  ).seeded_at;
  const latest =
    (
      store.sqlite
        .prepare("SELECT MAX(observed_at) AS at FROM observations")
        .get() as { at: number | null }
    ).at ?? epoch - 86400;
  const end = Math.floor(now / 30) * 30;
  store.sqlite.transaction(() => {
    for (let at = Math.max(latest + 30, end - 86400); at <= end; at += 30) {
      devices.forEach((_device, index) =>
        saveObservation(store, `demo-${index + 1}`, reading(index, at, epoch)),
      );
    }
    pruneHistory(store, end - 86400);
  })();
}
