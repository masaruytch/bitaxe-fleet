import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";
import { miners } from "../src/schema.js";
import { saveObservation, listFleet } from "../src/store.js";
import {
  normalizeTelemetry,
  warningReasons,
  deviceState,
} from "../src/telemetry.js";
import { deviceChartRows } from "../shared/device-history.js";
import { prepareDemoData } from "../src/demo.js";
const base = {
  hashRate: 1200,
  temp: 50,
  power: 18,
  uptimeSeconds: 86461,
  stratumURL: "primary.example",
  stratumPort: 3333,
  stratumUser: "primary.worker",
  fallbackStratumURL: "backup.example",
  fallbackStratumPort: 4444,
  fallbackStratumUser: "backup.worker",
  stratumPassword: "never-store-this",
};
const miner = {
  id: "test",
  name: "Test miner",
  ip: "192.0.2.1",
  algorithm: "sha256",
};
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNImPD/PwAGMgLvZrVhjgAAAABJRU5ErkJggg==";
const headers = { "x-fleet-request": "1", origin: "http://127.0.0.1:3080" };

test("active pool selection keeps host, port and worker from the same pool and never guesses fallback metadata", () => {
  for (const flag of [true, 1, false, 0]) {
    const sample = normalizeTelemetry(
      { ...base, isUsingFallbackStratum: flag },
      100,
    );
    const fallback = flag === true || flag === 1;
    assert.equal(sample.pool, fallback ? "backup.example" : "primary.example");
    assert.equal(sample.poolPort, fallback ? 4444 : 3333);
    assert.equal(
      sample.poolUser,
      fallback ? "backup.worker" : "primary.worker",
    );
    assert.equal(sample.poolMode, fallback ? "fallback" : "primary");
    assert.equal(sample.uptimeSeconds, 86461);
    assert.ok(!JSON.stringify(sample).includes("never-store-this"));
  }
  for (const flag of [undefined, null, "true", 2])
    assert.equal(
      normalizeTelemetry({ ...base, isUsingFallbackStratum: flag }, 100)
        .poolMode,
      "unconfirmed",
    );
  const missing = normalizeTelemetry(
    {
      hashRate: 1000,
      power: 15,
      temp: 50,
      stratumURL: "primary.example",
      stratumPort: 3333,
      stratumUser: "primary.worker",
      isUsingFallbackStratum: true,
    },
    100,
  );
  assert.equal(missing.pool, null);
  assert.equal(missing.poolPort, null);
  assert.equal(missing.poolUser, null);
  for (const stratumPort of [0, -1, 65536, 3333.5, "3333"])
    assert.equal(
      normalizeTelemetry({ ...base, stratumPort }, 100).poolPort,
      null,
    );
});

test("status reasons explain all warning triggers and respect offline/stale precedence", () => {
  const sample = normalizeTelemetry(base, 100);
  assert.deepEqual(warningReasons(sample, 100, 180), []);
  const hotIdle = { ...sample, temperatureC: 70, hashrateGhs: 0 };
  assert.equal(deviceState(hotIdle, 100, 180), "warning");
  assert.equal(warningReasons(hotIdle, 100, 180).length, 2);
  assert.match(warningReasons(hotIdle, 500, 180)[0], /stale/);
  assert.deepEqual(
    warningReasons({ ...hotIdle, online: false, error: "Timed out" }, 100, 180),
    ["Timed out"],
  );
  assert.match(warningReasons(null, 100, 180)[0], /first observation/);
});

test("device charts preserve failed polls, missing intervals, zero values and time bounds", () => {
  const samples = [100, 130, 160, 190, 220, 600, 630].map((at) =>
    normalizeTelemetry(base, at),
  );
  samples[2] = { ...samples[2], online: false };
  samples[3] = { ...samples[3], hashrateGhs: 0 };
  const rows = deviceChartRows(samples, 110, 620);
  assert.equal(rows[0].at, 110);
  assert.equal(rows.at(-1)?.at, 620);
  assert.deepEqual(
    rows.find((row) => row.at === 160),
    { at: 160, hash: null, temp: null, power: null },
  );
  assert.equal(rows.find((row) => row.at === 190)?.hash, 0);
  assert.equal(rows.find((row) => row.at === 221)?.power, null);
  assert.ok(!rows.some((row) => row.at === 100 || row.at === 630));
  assert.deepEqual(deviceChartRows([], 0, 100), [
    { at: 0, hash: null, temp: null, power: null },
    { at: 100, hash: null, temp: null, power: null },
  ]);
});

test("appearance and pool data persist across restart, independently of coin choice and device history", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-appearance-"));
  const path = join(directory, "fleet.sqlite");
  let store = openDatabase(path);
  store.db.insert(miners).values(miner).run();
  saveObservation(
    store,
    miner.id,
    normalizeTelemetry(
      { ...base, isUsingFallbackStratum: 1 },
      Math.floor(Date.now() / 1000),
    ),
  );
  let app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    const before = (await app.inject("/api/miners/test/history")).json();
    const payload = { coin: "DGB", icon: "BCH", customIcon: png };
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/miners/test/appearance",
          headers,
          payload,
        })
      ).statusCode,
      200,
    );
    await app.close();
    store.sqlite.close();
    store = openDatabase(path);
    app = await createApp(store, { webRoot: "/nonexistent" });
    const device = (await app.inject("/api/fleet")).json().devices[0];
    assert.equal(device.coin, "DGB");
    assert.equal(device.icon, "BCH");
    assert.equal(device.customIcon, png);
    assert.equal(device.latest.pool, "backup.example");
    assert.equal(device.latest.poolPort, 4444);
    assert.equal(device.latest.poolUser, "backup.worker");
    assert.deepEqual(
      (await app.inject("/api/miners/test/history")).json(),
      before,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/miners/test/appearance",
          headers,
          payload: { coin: null, icon: null, customIcon: null },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await app.inject("/api/fleet")).json().devices[0].customIcon,
      null,
    );
  } finally {
    await app.close();
    store.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("appearance rejects invalid uploads, unsupported coins, oversized bodies and unauthorized/demo writes", async () => {
  const store = openDatabase(":memory:");
  store.db.insert(miners).values(miner).run();
  const app = await createApp(store, { webRoot: "/nonexistent" });
  const payload = { coin: "BTC", icon: null, customIcon: null };
  try {
    const oversized = Buffer.from(png.split(",")[1], "base64");
    oversized.writeUInt32BE(257, 16);
    for (const customIcon of [
      "https://example.com/icon.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,aW52YWxpZA==",
      `data:image/png;base64,${oversized.toString("base64")}`,
    ]) {
      assert.equal(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/miners/test/appearance",
            headers,
            payload: { ...payload, customIcon },
          })
        ).statusCode,
        400,
      );
    }
    for (const coin of ["LTC", "auto", "", 1])
      assert.equal(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/miners/test/appearance",
            headers,
            payload: { ...payload, coin },
          })
        ).statusCode,
        400,
      );
    for (const badHeaders of [
      {},
      { ...headers, origin: "https://example.com" },
    ])
      assert.equal(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/miners/test/appearance",
            headers: badHeaders,
            payload,
          })
        ).statusCode,
        403,
      );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/miners/test/appearance",
          headers,
          payload: { ...payload, customIcon: "a".repeat(110000) },
        })
      ).statusCode,
      413,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/miners/missing/appearance",
          headers,
          payload,
        })
      ).statusCode,
      404,
    );
    assert.equal(listFleet(store, 100, 180)[0].coin, null);
  } finally {
    await app.close();
    store.sqlite.close();
  }
  const demo = openDatabase(":memory:");
  prepareDemoData(demo);
  const demoApp = await createApp(demo, { webRoot: "/nonexistent" });
  try {
    assert.equal(
      (
        await demoApp.inject({
          method: "PATCH",
          url: "/api/miners/demo-1/appearance",
          headers,
          payload,
        })
      ).statusCode,
      409,
    );
  } finally {
    await demoApp.close();
    demo.sqlite.close();
  }
});

test("version 5 migration preserves existing miners and readings and is idempotent", () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-upgrade-"));
  const path = join(directory, "fleet.sqlite");
  let store = openDatabase(path);
  try {
    store.db.insert(miners).values(miner).run();
    saveObservation(store, miner.id, normalizeTelemetry(base, 100));
    for (const column of ["coin", "icon", "custom_icon"])
      store.sqlite.exec(`ALTER TABLE miners DROP COLUMN ${column}`);
    for (const column of ["pool_port", "pool_user", "pool_mode"])
      store.sqlite.exec(`ALTER TABLE observations DROP COLUMN ${column}`);
    store.sqlite.exec("DELETE FROM schema_migrations WHERE version = 5");
    store.sqlite.close();
    store = openDatabase(path);
    let device = listFleet(store, 100, 180)[0];
    assert.equal(device.id, miner.id);
    assert.equal(device.coin, null);
    assert.equal(device.latest?.pool, "primary.example");
    assert.equal(device.latest?.poolMode, null);
    store.sqlite.close();
    store = openDatabase(path);
    device = listFleet(store, 100, 180)[0];
    assert.equal(device.latest?.hashrateGhs, 1200);
  } finally {
    store.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("device trend ranges preserve successful readings around failed polls in the same bucket", async () => {
  const store = openDatabase(":memory:");
  store.db.insert(miners).values(miner).run();
  const now = Math.floor(Date.now() / 1000);
  const first = normalizeTelemetry({ ...base, hashRate: 1000 }, now - 100);
  const failure = {
    ...normalizeTelemetry(base, now - 90),
    online: false,
    hashrateGhs: null,
    powerWatts: null,
    temperatureC: null,
  };
  const last = normalizeTelemetry({ ...base, hashRate: 2000 }, now - 80);
  for (const sample of [first, failure, last])
    saveObservation(store, miner.id, sample);
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    for (const query of [
      "hours=1",
      "hours=24",
      "hours=168",
      "range=collection",
    ]) {
      const response = await app.inject(
        `/api/miners/${miner.id}/trends?${query}`,
      );
      assert.equal(response.statusCode, 200);
      const data = response.json();
      const before = data.points.findIndex(
        (point: { at: number; hash: number | null }) =>
          point.at === first.observedAt && point.hash === 1,
      );
      const gap = data.points.findIndex(
        (point: { at: number; hash: number | null }) =>
          point.at === failure.observedAt && point.hash === null,
      );
      const after = data.points.findIndex(
        (point: { at: number; hash: number | null }) =>
          point.at === last.observedAt && point.hash === 2,
      );
      assert.ok(before >= 0 && before < gap && gap < after, query);
      if (query === "range=collection") assert.equal(data.windowSeconds, 750);
    }
    assert.equal(
      (
        await app.inject(
          `/api/miners/${miner.id}/trends?hours=24&range=collection`,
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (await app.inject(`/api/miners/${miner.id}/trends?workspaceId=missing`))
        .statusCode,
      404,
    );
  } finally {
    await app.close();
    store.sqlite.close();
  }
});

test("temperature warnings display in the selected workspace unit", async () => {
  const { formatTemperatureWarning } =
    await import("../shared/temperature-warning.js");
  const hot = "High chip temperature: 74.0 °C (warning at 70 °C).";
  assert.equal(formatTemperatureWarning(hot, "C"), hot);
  assert.equal(
    formatTemperatureWarning(hot, "F"),
    "High chip temperature: 165.2 °F (warning at 158 °F).",
  );
  assert.equal(
    formatTemperatureWarning("Miner reports zero hashrate.", "F"),
    "Miner reports zero hashrate.",
  );
  assert.equal(formatTemperatureWarning("Timed out", "F"), "Timed out");
});
