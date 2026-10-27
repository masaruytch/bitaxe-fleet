import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/database.js";
import { miners } from "../src/schema.js";
import { saveObservation } from "../src/store.js";
import { normalizeTelemetry } from "../src/telemetry.js";
import { fleetTrends } from "../src/trends.js";
import { createApp } from "../src/app.js";

test("fleet trends average each miner before summing, and preserve missing/offline gaps", () => {
  const store = openDatabase(":memory:");
  try {
    for (const id of ["a", "b"])
      store.db
        .insert(miners)
        .values({
          id,
          name: id,
          ip: id === "a" ? "192.0.2.1" : "192.0.2.2",
          algorithm: "sha256",
        })
        .run();
    const now = 90000;
    const sample = (
      hashRate: number,
      power: number,
      temp: number,
      at: number,
    ) => normalizeTelemetry({ hashRate, power, temp }, at);
    // Unequal sample counts must not give a frequently sampled miner more weight.
    saveObservation(store, "a", sample(1000, 10, 40, 89110));
    saveObservation(store, "a", sample(2000, 20, 50, 89120));
    saveObservation(store, "b", sample(3000, 30, 60, 89115));
    // The next interval has only one device: its fleet total must remain unknown.
    saveObservation(store, "a", sample(1000, 10, 40, 90000));
    const trends = fleetTrends(store, 24, now);
    const point = trends.fleet.find((point) => point.at === 89100)!;
    assert.equal(point.hashrateThs, 4.5);
    assert.equal(point.powerWatts, 45);
    assert.equal(point.efficiencyJth, 10);
    assert.equal(
      trends.devices[0].points.find((point) => point.at === 89100)!
        .temperatureC,
      45,
    );
    assert.equal(trends.fleet.at(-1)!.hashrateThs, null);
    assert.equal(trends.fleet[0].powerWatts, null);
    saveObservation(store, "b", {
      ...sample(3000, 30, 60, 89130),
      online: false,
      hashrateGhs: null,
      powerWatts: null,
      temperatureC: null,
    });
    assert.equal(
      fleetTrends(store, 24, now).fleet.find((point) => point.at === 89100)!
        .hashrateThs,
      null,
    );
  } finally {
    store.sqlite.close();
  }
});
test("trend windows are bounded and empty fleets contain gaps rather than zero measurements", async () => {
  const store = openDatabase(":memory:");
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    for (const hours of [1, 24, 168]) {
      const response = await app.inject(`/api/fleet/trends?hours=${hours}`);
      assert.equal(response.statusCode, 200);
      assert.ok(response.json().fleet.length <= 168);
      assert.ok(
        response
          .json()
          .fleet.every(
            (point: { hashrateThs: number | null }) =>
              point.hashrateThs === null,
          ),
      );
    }
    assert.equal(
      (await app.inject("/api/fleet/trends?hours=999")).statusCode,
      400,
    );
  } finally {
    await app.close();
    store.sqlite.close();
  }
});

test("live collection trends cover 25 intervals with the newest bucket at the right edge and preserve totals/gaps", () => {
  const store = openDatabase(":memory:");
  try {
    for (const [id, ip] of [
      ["a", "192.0.2.1"],
      ["b", "192.0.2.2"],
    ])
      store.db
        .insert(miners)
        .values({ id, ip, name: id, algorithm: "sha256" })
        .run();
    const reading = (hashRate: number, at: number) =>
      normalizeTelemetry({ hashRate, power: hashRate / 100, temp: 50 }, at);
    saveObservation(store, "a", reading(99000, 249));
    saveObservation(store, "a", reading(1000, 251));
    saveObservation(store, "b", reading(3000, 252));
    saveObservation(store, "a", reading(1500, 985));
    saveObservation(store, "a", reading(2500, 999));
    saveObservation(store, "b", reading(4000, 1000));
    saveObservation(store, "a", reading(99000, 1001));
    const result = fleetTrends(store, 24, 1000, 30);
    assert.equal(result.windowSeconds, 750);
    assert.equal(result.bucketSeconds, 30);
    assert.equal(result.fleet.length, 25);
    assert.equal(result.fleet[0].at, 280);
    assert.equal(result.fleet.at(-1)!.at, 1000);
    assert.ok(
      result.fleet.slice(1, -1).every((point) => point.hashrateThs === null),
    );
    assert.deepEqual(
      [result.fleet[0].hashrateThs, result.fleet.at(-1)!.hashrateThs],
      [4, 6],
    );
    assert.deepEqual(
      [result.fleet[0].powerWatts, result.fleet.at(-1)!.powerWatts],
      [40, 60],
    );
    assert.equal(result.fleet.at(-1)!.efficiencyJth, 10);
    store.db
      .insert(miners)
      .values({
        id: "c",
        ip: "192.0.2.3",
        name: "c",
        algorithm: "sha256",
        registeredAt: 1000,
      })
      .run();
    saveObservation(store, "c", reading(1000, 1000));
    assert.deepEqual(
      [
        fleetTrends(store, 24, 1000, 30).fleet[0].hashrateThs,
        fleetTrends(store, 24, 1000, 30).fleet.at(-1)!.hashrateThs,
      ],
      [4, 7],
    );
    saveObservation(store, "b", {
      ...reading(3000, 991),
      online: false,
      hashrateGhs: null,
      powerWatts: null,
    });
    assert.equal(
      fleetTrends(store, 24, 1000, 30).fleet.at(-1)!.hashrateThs,
      null,
    );
    assert.equal(
      fleetTrends(store, 24, 1000, 30).devices[1].points.at(-1)!.powerWatts,
      null,
    );
  } finally {
    store.sqlite.close();
  }
});

test("collection range follows saved settings, handles odd intervals and stays bounded without polling miners", async () => {
  const store = openDatabase(":memory:");
  let fetches = 0;
  const app = await createApp(store, {
    webRoot: "/nonexistent",
    minerFetcher: async () => {
      fetches++;
      throw new Error("Must not poll a miner for chart data");
    },
  });
  try {
    let result = (
      await app.inject("/api/fleet/trends?range=collection")
    ).json();
    assert.equal(result.windowSeconds, 750);
    assert.ok(
      result.fleet.every(
        (point: { hashrateThs: number | null }) => point.hashrateThs === null,
      ),
    );
    for (const seconds of [10, 31, 45, 3600]) {
      const settings = await app.inject({
        method: "PATCH",
        url: "/api/settings",
        headers: { "x-fleet-request": "1" },
        payload: { pollIntervalSeconds: seconds },
      });
      assert.equal(settings.statusCode, 200);
      const response = await app.inject("/api/fleet/trends?range=collection");
      assert.equal(response.statusCode, 200);
      result = response.json();
      assert.equal(result.windowSeconds, seconds * 25);
      assert.equal(result.bucketSeconds, seconds);
      assert.equal(result.fleet.length, 25);
      assert.equal(result.fleet[0].at, result.generatedAt - seconds * 24);
      assert.equal(result.fleet.at(-1).at, result.generatedAt);
      assert.ok(
        result.fleet.every(
          (point: { at: number }) => point.at <= result.generatedAt,
        ),
      );
    }
    assert.equal((await app.inject("/api/fleet/trends")).json().hours, 24);
    assert.equal(
      (await app.inject("/api/fleet/trends?hours=1")).json().windowSeconds,
      undefined,
    );
    for (const query of [
      "range=invalid",
      "range=collection&hours=1",
      "hours=0.5",
    ])
      assert.equal(
        (await app.inject(`/api/fleet/trends?${query}`)).statusCode,
        400,
      );
    assert.equal(fetches, 0);
  } finally {
    await app.close();
    store.sqlite.close();
  }
});

test("new readings start at the right, roll left, and can fill all 25 collection points", () => {
  const store = openDatabase(":memory:");
  try {
    store.db
      .insert(miners)
      .values({ id: "a", name: "Test", ip: "192.0.2.1", algorithm: "sha256" })
      .run();
    const sample = (at: number, hashRate: number) =>
      saveObservation(
        store,
        "a",
        normalizeTelemetry({ hashRate, power: 10, temp: 50 }, at),
      );
    sample(999, 1000);
    let result = fleetTrends(store, 24, 1000, 30);
    assert.equal(result.fleet.at(-1)!.at, 1000);
    assert.equal(result.fleet.at(-1)!.hashrateThs, 1);
    assert.ok(
      result.fleet.slice(0, -1).every((point) => point.hashrateThs === null),
    );
    sample(1029, 2000);
    result = fleetTrends(store, 24, 1030, 30);
    assert.equal(result.fleet.at(-2)!.hashrateThs, 1);
    assert.equal(result.fleet.at(-1)!.hashrateThs, 2);
    for (let index = 2; index < 25; index++)
      sample(1029 - index * 30, 1000 + index * 100);
    result = fleetTrends(store, 24, 1030, 30);
    assert.equal(
      result.fleet.filter((point) => point.hashrateThs !== null).length,
      25,
    );
    assert.ok(
      result.fleet.every(
        (point, index) => point.at === 1030 - (24 - index) * 30,
      ),
    );
  } finally {
    store.sqlite.close();
  }
});
