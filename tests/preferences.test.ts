import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";
import { miners } from "../src/schema.js";
import { saveObservation } from "../src/store.js";
import { normalizeTelemetry } from "../src/telemetry.js";
import { getPollingInterval } from "../src/settings.js";
import { waitForNextCollection } from "../src/collection-schedule.js";
const headers = { "x-fleet-request": "1", origin: "http://127.0.0.1:3080" };
test("nicknames preserve device identity/history and appear in fleet and chart responses", async () => {
  const store = openDatabase(":memory:");
  store.db
    .insert(miners)
    .values({
      id: "office",
      name: "Old name",
      ip: "192.168.10.40",
      algorithm: "sha256",
    })
    .run();
  saveObservation(
    store,
    "office",
    normalizeTelemetry(
      { hashRate: 1000, temp: 50, power: 15 },
      Math.floor(Date.now() / 1000),
    ),
  );
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    const before = (await app.inject("/api/miners/office/history")).json();
    const renamed = await app.inject({
      method: "PATCH",
      url: "/api/miners/office",
      headers,
      payload: { name: "  Office Gamma  " },
    });
    assert.equal(renamed.statusCode, 200);
    assert.equal(renamed.json().name, "Office Gamma");
    const device = (await app.inject("/api/fleet")).json().devices[0];
    assert.equal(device.name, "Office Gamma");
    assert.equal(device.id, "office");
    assert.equal(device.ip, "192.168.10.40");
    assert.equal(
      (await app.inject("/api/fleet/trends")).json().devices[0].name,
      "Office Gamma",
    );
    assert.deepEqual(
      (await app.inject("/api/miners/office/history")).json(),
      before,
    );
    for (const name of ["   ", "Bad\nname", "a".repeat(65)])
      assert.equal(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/miners/office",
            headers,
            payload: { name },
          })
        ).statusCode,
        400,
      );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/miners/missing",
          headers,
          payload: { name: "Office" },
        })
      ).statusCode,
      404,
    );
    for (const badHeaders of [
      {},
      { ...headers, origin: "https://untrusted.example" },
    ])
      assert.equal(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/miners/office",
            headers: badHeaders,
            payload: { name: "Changed" },
          })
        ).statusCode,
        403,
      );
    assert.equal(
      (await app.inject("/api/fleet")).json().devices[0].name,
      "Office Gamma",
    );
  } finally {
    await app.close();
    store.sqlite.close();
  }
});
test("collection settings default to 30 seconds, validate writes, persist across reopening and update stale thresholds", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-settings-"));
  const path = join(directory, "test.sqlite");
  const store = openDatabase(path);
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    assert.equal(
      (await app.inject("/api/settings")).json().pollIntervalSeconds,
      30,
    );
    for (const value of [0, 9, 3601, 30.5, "bad"])
      assert.equal(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/settings",
            headers,
            payload: { pollIntervalSeconds: value },
          })
        ).statusCode,
        400,
      );
    for (const badHeaders of [
      {},
      { ...headers, origin: "https://untrusted.example" },
    ])
      assert.equal(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/settings",
            headers: badHeaders,
            payload: { pollIntervalSeconds: 10 },
          })
        ).statusCode,
        403,
      );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/settings",
          headers,
          payload: { pollIntervalSeconds: 120 },
        })
      ).statusCode,
      200,
    );
    const fleet = (await app.inject("/api/fleet")).json();
    assert.equal(fleet.pollIntervalSeconds, 120);
    assert.equal(fleet.staleAfterSeconds, 360);
  } finally {
    await app.close();
    store.sqlite.close();
  }
  const reopened = openDatabase(path);
  try {
    assert.equal(getPollingInterval(reopened, 60), 120);
  } finally {
    reopened.sqlite.close();
    rmSync(directory, { recursive: true });
  }
});
test("waiting collector responds to both shorter and longer intervals without restart", async () => {
  for (const [initial, changed, expected] of [
    [60, 10, 10000],
    [10, 30, 30000],
  ]) {
    let time = 0,
      interval = initial;
    await waitForNextCollection(() => interval, new AbortController().signal, {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
        if (time === 5000) interval = changed;
      },
    });
    assert.equal(time, expected);
  }
  const controller = new AbortController();
  let reads = 0;
  controller.abort();
  await waitForNextCollection(() => {
    reads++;
    return 30;
  }, controller.signal);
  assert.equal(reads, 0);
});

test("24-hour device history remains complete at the new 30-second default", async () => {
  const store = openDatabase(":memory:");
  store.db
    .insert(miners)
    .values({
      id: "gamma",
      name: "Gamma",
      ip: "192.168.10.41",
      algorithm: "sha256",
    })
    .run();
  const now = Math.floor(Date.now() / 1000);
  store.sqlite.transaction(() => {
    for (let i = 0; i < 2880; i++)
      saveObservation(
        store,
        "gamma",
        normalizeTelemetry(
          { hashRate: 1000, temp: 50, power: 15 },
          now - i * 30,
        ),
      );
  })();
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    assert.equal(
      (await app.inject("/api/miners/gamma/history?hours=24")).json()
        .observations.length,
      2880,
    );
  } finally {
    await app.close();
    store.sqlite.close();
  }
});
