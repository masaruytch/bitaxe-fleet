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
