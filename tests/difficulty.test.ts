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
