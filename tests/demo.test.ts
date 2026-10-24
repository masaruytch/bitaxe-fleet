import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/database.js";
import {
  isDemoDatabase,
  prepareDemoData,
  refreshDemoData,
} from "../src/demo.js";
import { listFleet } from "../src/store.js";
import { fleetTrends } from "../src/trends.js";
import { collectOnce } from "../src/collector.js";
import { createApp } from "../src/app.js";
import { miners } from "../src/schema.js";
const now = 1800000000;

test("demo seeds six fictional miners, useful history and representative health states; refresh is idempotent", () => {
  const store = openDatabase(":memory:");
  try {
    prepareDemoData(store, now);
    assert.equal(isDemoDatabase(store), true);
    const fleet = listFleet(store, now, 180);
    assert.equal(fleet.length, 6);
    assert.equal(fleet.filter((device) => device.state === "online").length, 4);
    assert.equal(
      fleet.filter((device) => device.state === "warning").length,
      1,
    );
    assert.equal(
      fleet.filter((device) => device.state === "offline").length,
      1,
    );
    assert.ok(fleet.every((device) => device.ip.startsWith("192.0.2.")));
    const trends = fleetTrends(store, 24, now);
    assert.ok(
      trends.fleet.filter((point) => point.hashrateThs !== null).length > 50,
    );
    assert.ok(trends.fleet.some((point) => point.hashrateThs === null));
    assert.ok(
      trends.devices.some((device) =>
        device.points.some((point) => (point.temperatureC ?? 0) >= 70),
      ),
    );
    const rows = () =>
      (
        store.sqlite
          .prepare("SELECT COUNT(*) AS count FROM observations")
          .get() as { count: number }
      ).count;
    assert.equal(rows(), 8646);
    prepareDemoData(store, now);
    assert.equal(rows(), 8646);
    refreshDemoData(store, now + 60);
    const count = rows();
    assert.ok(count > 8646);
    refreshDemoData(store, now + 60);
    assert.equal(rows(), count);
    assert.equal(
      (
        store.sqlite
          .prepare("SELECT MIN(observed_at) AS oldest FROM observations")
          .get() as { oldest: number }
      ).oldest,
      now + 60 - 86400,
    );
  } finally {
    store.sqlite.close();
  }
});
test("demo initialization and refresh refuse to modify a real fleet", () => {
  const store = openDatabase(":memory:");
  try {
    store.db
      .insert(miners)
      .values({
        id: "real",
        name: "Real fleet fixture",
        ip: "192.168.10.40",
        algorithm: "sha256",
      })
      .run();
    const before = store.db.select().from(miners).all();
    assert.throws(
      () => prepareDemoData(store, now),
      /empty, separate database/,
    );
    assert.throws(() => refreshDemoData(store, now), /real fleet database/);
    assert.deepEqual(store.db.select().from(miners).all(), before);
    assert.equal(isDemoDatabase(store), false);
  } finally {
    store.sqlite.close();
  }
});
test("collector never contacts miners in a marked demo database or with the explicit demo option", async () => {
  const store = openDatabase(":memory:");
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    throw new Error("No network calls are allowed");
  };
  try {
    store.db
      .insert(miners)
      .values({
        id: "fixture",
        name: "Fixture",
        ip: "192.168.10.40",
        algorithm: "sha256",
      })
      .run();
    assert.equal(
      (
        await collectOnce(store, {
          timeoutMs: 100,
          retentionDays: 1,
          fetcher,
          demoMode: true,
        })
      ).attempted,
      0,
    );
    store.sqlite.exec("DELETE FROM miners");
    prepareDemoData(store, now);
    const result = await collectOnce(store, {
      timeoutMs: 100,
      retentionDays: 1,
      fetcher,
    });
    assert.equal(result.attempted, 0);
    assert.equal(result.skipped, true);
    assert.equal(calls, 0);
  } finally {
    store.sqlite.close();
  }
});
test("demo API clearly marks its data and blocks writes and probes before any network request", async () => {
  const store = openDatabase(":memory:");
  prepareDemoData(store);
  let calls = 0;
  const app = await createApp(store, {
    webRoot: "/nonexistent",
    minerFetcher: async () => {
      calls++;
      throw new Error("No network");
    },
  });
  const headers = { "x-fleet-request": "1", origin: "http://127.0.0.1:3080" };
  try {
    assert.equal((await app.inject("/api/fleet")).json().demo, true);
    assert.equal((await app.inject("/api/fleet")).json().devices.length, 6);
    for (const request of [
      {
        method: "POST" as const,
        url: "/api/miners/probe",
        payload: { ip: "192.168.10.40" },
      },
      {
        method: "PATCH" as const,
        url: "/api/miners/demo-1",
        payload: { name: "Changed" },
      },
      {
        method: "PATCH" as const,
        url: "/api/settings",
        payload: { pollIntervalSeconds: 60 },
      },
    ])
      assert.equal((await app.inject({ ...request, headers })).statusCode, 409);
    assert.equal(calls, 0);
    assert.equal(
      (await app.inject("/api/settings")).json().pollIntervalSeconds,
      30,
    );
    assert.equal((await app.inject("/api/fleet")).json().devices.length, 6);
  } finally {
    await app.close();
    store.sqlite.close();
  }
});
