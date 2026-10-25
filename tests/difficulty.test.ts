import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDifficulty, formatDifficulty } from "../shared/difficulty.js";
import { normalizeTelemetry } from "../src/telemetry.js";

test("best difficulty accepts both numeric and compact AxeOS readings", () => {
  const raw = { hashRate: 1000, power: 17, temp: 50 };
  for (const [input, expected] of [
    [42040000000, 42040000000],
    ["42.04G", 42040000000],
    ["7.81 T", 7810000000000],
    ["1e9", 1e9],
    [0, 0],
  ] as const) {
    assert.equal(parseDifficulty(input), expected);
    assert.equal(
      normalizeTelemetry({ ...raw, bestDiff: input }, 100).bestDifficulty,
      expected,
    );
  }
  for (const input of [undefined, null, "invalid", -1, Infinity, "1e999"])
    assert.equal(parseDifficulty(input), null);
  assert.equal(normalizeTelemetry(raw, 100).bestDifficulty, null);
  assert.equal(formatDifficulty(42040000000), "42.04 G");
  assert.equal(formatDifficulty(7810000000000), "7.81 T");
  assert.equal(formatDifficulty(null), "—");
  assert.equal(formatDifficulty(0), "0");
});

test("session best difficulty is independent of all-time best, resets after boot and never falls back", async () => {
  const { openDatabase } = await import("../src/database.js");
  const { saveObservation, listFleet, deviceHistory } =
    await import("../src/store.js");
  const { miners } = await import("../src/schema.js");
  const store = openDatabase(":memory:");
  const raw = { hashRate: 1000, power: 17, temp: 50, bestDiff: "7.81T" };
  try {
    store.db
      .insert(miners)
      .values({
        id: "test",
        name: "Test",
        ip: "192.0.2.1",
        algorithm: "sha256",
      })
      .run();
    for (const [at, value, expected] of [
      [100, "42.04G", 42.04e9],
      [130, 0, 0],
      [160, 123, 123],
      [190, undefined, null],
      [220, "invalid", null],
    ] as const) {
      const observation = normalizeTelemetry(
        { ...raw, bestSessionDiff: value },
        at,
      );
      assert.equal(observation.bestSessionDifficulty, expected);
      saveObservation(store, "test", observation);
      const device = listFleet(store, at, 180)[0];
      assert.equal(device.latest?.bestSessionDifficulty, expected);
      assert.equal(device.latest?.bestDifficulty, 7.81e12);
    }
    assert.equal(
      deviceHistory(store, "test", 100)[0].bestSessionDifficulty,
      42.04e9,
    );
  } finally {
    store.sqlite.close();
  }
});
