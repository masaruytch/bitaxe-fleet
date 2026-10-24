import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/database.js";
import { normalizeTelemetry, deviceState } from "../src/telemetry.js";
import { listFleet, saveObservation } from "../src/store.js";
import { miners } from "../src/schema.js";
import { collectOnce } from "../src/collector.js";
import { createApp } from "../src/app.js";
const telemetry = {
  hashRate: 1250,
  power: 17.5,
  temp: 51,
  sharesAccepted: 100,
  sharesRejected: 2,
  uptimeSeconds: 300,
  version: "test",
  stratumURL: "pool.example",
};
const device = {
  id: "miner1",
  name: "Test device",
  ip: "192.0.2.1",
  algorithm: "sha256",
};

test("AxeOS normalization preserves explicit GH/s and rejects invalid payloads", () => {
  const sample = normalizeTelemetry(telemetry, 100);
  assert.equal(sample.hashrateGhs, 1250);
  assert.equal(sample.temperatureC, 51);
  assert.equal(sample.powerWatts, 17.5);
  for (const raw of [
    null,
    [],
    {},
    { ...telemetry, hashRate: "1250" },
    { ...telemetry, temp: -5 },
  ])
    assert.throws(() => normalizeTelemetry(raw, 100));
});
test("offline and stale states never appear as fresh online readings", () => {
  const sample = normalizeTelemetry(telemetry, 100);
  assert.equal(deviceState(null, 200, 180), "unknown");
  assert.equal(deviceState(sample, 200, 180), "online");
  assert.equal(deviceState(sample, 400, 180), "stale");
  assert.equal(deviceState({ ...sample, online: false }, 200, 180), "offline");
  assert.equal(
    deviceState({ ...sample, temperatureC: 75 }, 200, 180),
    "warning",
  );
});
test("collector persists successful telemetry and failed polls separately", async () => {
  const store = openDatabase(":memory:");
  try {
    store.db.insert(miners).values(device).run();
    const good = await collectOnce(store, {
      timeoutMs: 100,
      retentionDays: 30,
      fetcher: async () => new Response(JSON.stringify(telemetry)),
    });
    assert.equal(good.online, 1);
    assert.equal(
      listFleet(store, Math.floor(Date.now() / 1000), 180)[0].latest
        ?.hashrateGhs,
      1250,
    );
    // Remove the earlier sample to ensure this test does not depend on wall-clock resolution.
    store.sqlite.exec("DELETE FROM observations");
    const bad = await collectOnce(store, {
      timeoutMs: 100,
      retentionDays: 30,
      fetcher: async () => {
        throw new Error("Device unreachable");
      },
    });
    assert.equal(bad.offline, 1);
    const result = listFleet(store, Math.floor(Date.now() / 1000), 180)[0];
    assert.equal(result.state, "offline");
    assert.equal(result.latest?.hashrateGhs, null);
    assert.equal(result.latest?.error, "Device unreachable");
  } finally {
    store.sqlite.close();
  }
});
test("collector lease prevents overlapping runs", async () => {
  const store = openDatabase(":memory:");
  try {
    store.db.insert(miners).values(device).run();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = collectOnce(store, {
      timeoutMs: 100,
      retentionDays: 30,
      fetcher: async () => {
        await pending;
        return new Response(JSON.stringify(telemetry));
      },
    });
    const second = await collectOnce(store, {
      timeoutMs: 100,
      retentionDays: 30,
      fetcher: async () => {
        throw new Error("Must not poll");
      },
    });
    assert.equal(second.skipped, true);
    release();
    await first;
  } finally {
    store.sqlite.close();
  }
});
test("API returns genuine states, validates history queries, and exposes no device controls", async () => {
  const store = openDatabase(":memory:");
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    store.db.insert(miners).values(device).run();
    saveObservation(
      store,
      device.id,
      normalizeTelemetry(telemetry, Math.floor(Date.now() / 1000) - 1000),
    );
    assert.equal((await app.inject("/readyz")).statusCode, 200);
    const fleet = await app.inject("/api/fleet");
    assert.equal(fleet.statusCode, 200);
    assert.equal(fleet.json().devices[0].state, "stale");
    assert.equal(fleet.headers["cache-control"], "no-store");
    assert.equal(
      (await app.inject("/api/miners/miner1/history?hours=999")).statusCode,
      400,
    );
    assert.equal(
      (await app.inject("/api/miners/unknown/history")).statusCode,
      404,
    );
    assert.equal(
      (await app.inject("/api/miners/miner1/history?hours=24")).json()
        .observations.length,
      1,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/restart",
          payload: { miner_id: "miner1" },
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
    store.sqlite.close();
  }
});
