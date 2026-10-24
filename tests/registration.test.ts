import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";
import {
  createMinerRegistration,
  validateMinerIp,
} from "../src/miner-registration.js";
import { collectOnce } from "../src/collector.js";
import { fleetTrends } from "../src/trends.js";
import { saveObservation } from "../src/store.js";
import { miners } from "../src/schema.js";
import { normalizeTelemetry } from "../src/telemetry.js";
const info = {
  hashRate: 1250,
  power: 17,
  temp: 51,
  version: "v2.10.0",
  hostname: "bitaxe-office",
  ASICModel: "BM1370",
  macAddr: "02:12:34:56:78:90",
};
const headers = { "x-fleet-request": "1", origin: "http://127.0.0.1:3080" };

test("connection checks do not register devices; confirmation saves a first reading and the collector picks it up", async () => {
  const store = openDatabase(":memory:");
  const calls: { url: string; method: string }[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? "GET" });
    return new Response(JSON.stringify(info));
  };
  const app = await createApp(store, {
    webRoot: "/nonexistent",
    minerFetcher: fetcher,
  });
  try {
    const probe = await app.inject({
      method: "POST",
      url: "/api/miners/probe",
      headers,
      payload: { ip: "192.168.10.41" },
    });
    assert.equal(probe.statusCode, 200);
    assert.equal(probe.json().model, "BM1370");
    assert.equal((await app.inject("/api/fleet")).json().devices.length, 0);
    const added = await app.inject({
      method: "POST",
      url: "/api/miners",
      headers,
      payload: { probeToken: probe.json().probeToken, name: "Office Gamma" },
    });
    assert.equal(added.statusCode, 201);
    const fleet = (await app.inject("/api/fleet")).json();
    assert.equal(fleet.devices[0].name, "Office Gamma");
    assert.equal(fleet.devices[0].state, "online");
    assert.equal(fleet.devices[0].latest.hashrateGhs, 1250);
    assert.equal(
      (await collectOnce(store, { timeoutMs: 100, retentionDays: 30, fetcher }))
        .attempted,
      1,
    );
    assert.ok(
      calls.every(
        (call) =>
          call.method === "GET" &&
          call.url === "http://192.168.10.41/api/system/info",
      ),
    );
    const replay = await app.inject({
      method: "POST",
      url: "/api/miners",
      headers,
      payload: { probeToken: probe.json().probeToken },
    });
    assert.equal(replay.statusCode, 409);
  } finally {
    await app.close();
    store.sqlite.close();
  }
});
test("duplicates are recognized by IP and MAC, including two simultaneous connection checks", async () => {
  const store = openDatabase(":memory:");
  const registration = createMinerRegistration(store, {
    timeoutMs: 100,
    fetcher: async () => new Response(JSON.stringify(info)),
  });
  try {
    const first = await registration.probe("192.168.10.41");
    const second = await registration.probe("192.168.10.41");
    const added = registration.add(first.probeToken!, "Office");
    assert.throws(
      () => registration.add(second.probeToken!),
      /already registered/,
    );
    const duplicateIp = await registration.probe("192.168.10.41");
    assert.equal(duplicateIp.probeToken, null);
    assert.equal(duplicateIp.existingDevice?.id, added.id);
    const duplicateMac = await registration.probe("192.168.10.42");
    assert.equal(duplicateMac.probeToken, null);
    assert.equal(duplicateMac.existingDevice?.ip, "192.168.10.41");
  } finally {
    store.sqlite.close();
  }
});
test("expired verification and unsafe addresses cannot register or probe devices", async () => {
  const store = openDatabase(":memory:");
  let time = 100;
  const registration = createMinerRegistration(store, {
    timeoutMs: 100,
    now: () => time,
    fetcher: async () => new Response(JSON.stringify(info)),
  });
  try {
    for (const ip of [
      "127.0.0.1",
      "169.254.169.254",
      "8.8.8.8",
      "192.168.1.1:80",
      "http://192.168.1.1",
      "miner.local",
    ])
      assert.throws(() => validateMinerIp(ip));
    const probe = await registration.probe("192.168.10.41");
    time = 221;
    assert.throws(() => registration.add(probe.probeToken!), /expired/);
    assert.equal(store.db.select().from(miners).all().length, 0);
  } finally {
    store.sqlite.close();
  }
});
test("unreachable and incompatible devices leave the inventory unchanged", async () => {
  const store = openDatabase(":memory:");
  try {
    for (const fetcher of [
      async () => {
        throw new Error("timeout");
      },
      async () => new Response("not json"),
      async () =>
        new Response(JSON.stringify({ hashRate: 1, power: 1, temp: 1 })),
      async () => new Response("redirect", { status: 302 }),
    ] as (typeof fetch)[]) {
      const registration = createMinerRegistration(store, {
        timeoutMs: 100,
        fetcher,
      });
      await assert.rejects(() => registration.probe("192.168.10.41"));
    }
    assert.equal(store.db.select().from(miners).all().length, 0);
  } finally {
    store.sqlite.close();
  }
});
test("cross-origin and unmarked writes are rejected before connecting to a device", async () => {
  const store = openDatabase(":memory:");
  let calls = 0;
  const app = await createApp(store, {
    webRoot: "/nonexistent",
    minerFetcher: async () => {
      calls++;
      return new Response(JSON.stringify(info));
    },
  });
  try {
    for (const requestHeaders of [
      {},
      { ...headers, origin: "https://untrusted.example" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/miners/probe",
        headers: requestHeaders,
        payload: { ip: "192.168.10.41" },
      });
      assert.equal(response.statusCode, 403);
    }
    assert.equal(calls, 0);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/miners",
          headers,
          payload: { ip: "192.168.10.41" },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
    store.sqlite.close();
  }
});
test("a new miner does not make earlier fleet totals disappear", () => {
  const store = openDatabase(":memory:");
  try {
    store.db
      .insert(miners)
      .values({
        id: "old",
        name: "Old",
        ip: "192.168.10.1",
        algorithm: "sha256",
      })
      .run();
    store.db
      .insert(miners)
      .values({
        id: "new",
        name: "New",
        ip: "192.168.10.2",
        algorithm: "sha256",
        registeredAt: 90000,
      })
      .run();
    saveObservation(store, "old", normalizeTelemetry(info, 89110));
    const result = fleetTrends(store, 24, 90000);
    const historical = result.fleet.find((point) => point.at === 89100)!;
    assert.equal(historical.hashrateThs, 1.25);
    assert.equal(historical.powerWatts, 17);
    assert.equal(result.fleet.at(-1)!.hashrateThs, null);
  } finally {
    store.sqlite.close();
  }
});
