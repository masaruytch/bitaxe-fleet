import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { identifyCompatibility } from "../shared/compatibility.js";
import { openDatabase } from "../src/database.js";
import { prepareDemoData } from "../src/demo.js";
import { createApp } from "../src/app.js";
import { createFleetSession } from "../src/fleet-session.js";
const headers = { "x-fleet-request": "1", origin: "http://127.0.0.1:3080" };
async function port() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const value = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return value;
}
const info = {
  hashRate: 1250,
  power: 17,
  temp: 51,
  hostname: "test-gamma",
  ASICModel: "BM1370",
  boardVersion: "601",
  macAddr: "02:12:34:56:78:90",
  version: "fixture",
};
test("only Gamma 601 board and ASIC metadata match the maintainer-tested model", () => {
  for (const boardVersion of ["601", 601])
    assert.equal(
      identifyCompatibility({ ...info, boardVersion }).status,
      "tested",
    );
  for (const raw of [
    null,
    {},
    { ...info, boardVersion: "600" },
    { ...info, boardVersion: "603" },
    { ...info, boardVersion: undefined },
    { ...info, ASICModel: "BM1368" },
  ])
    assert.equal(identifyCompatibility(raw).status, "unverified");
});
test("connection review reports the board and compatibility without registering a miner", async () => {
  const store = openDatabase(":memory:");
  const app = await createApp(store, {
    webRoot: "/nonexistent",
    minerFetcher: async () => new Response(JSON.stringify(info)),
  });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/miners/probe",
      headers,
      payload: { ip: "192.168.10.41" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().boardVersion, "601");
    assert.equal(response.json().compatibility.status, "tested");
    assert.equal((await app.inject("/api/fleet")).json().devices.length, 0);
  } finally {
    await app.close();
    store.sqlite.close();
  }
});
test("creating a fleet is explicit, same-origin and unavailable from an existing real workspace", async () => {
  const store = openDatabase(":memory:");
  prepareDemoData(store);
  let starts = 0;
  let fail = false;
  const app = await createApp(store, {
    webRoot: "/nonexistent",
    createFleet: async () => {
      starts++;
      if (fail) throw new Error("internal machine detail");
      return { url: "http://127.0.0.1:3082" };
    },
  });
  try {
    assert.equal((await app.inject("/api/fleet")).json().canCreateFleet, true);
    assert.equal(starts, 0);
    for (const badHeaders of [
      {},
      { ...headers, origin: "https://untrusted.example" },
    ])
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/fleet/create",
            headers: badHeaders,
            payload: {},
          })
        ).statusCode,
        403,
      );
    assert.equal(starts, 0);
    const response = await app.inject({
      method: "POST",
      url: "/api/fleet/create",
      headers,
      payload: {},
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().url, "http://127.0.0.1:3082");
    assert.equal(starts, 1);
    fail = true;
    const unavailable = await app.inject({
      method: "POST",
      url: "/api/fleet/create",
      headers,
      payload: {},
    });
    assert.equal(unavailable.statusCode, 503);
    assert.match(unavailable.json().error, /port may already be in use/);
    assert.ok(!unavailable.body.includes("internal machine detail"));
    assert.equal((await app.inject("/api/fleet")).json().devices.length, 6);
  } finally {
    await app.close();
    store.sqlite.close();
  }
  const real = openDatabase(":memory:");
  const realApp = await createApp(real, {
    webRoot: "/nonexistent",
    createFleet: async () => {
      throw new Error("Must not create another workspace");
    },
  });
  try {
    assert.equal(
      (
        await realApp.inject({
          method: "POST",
          url: "/api/fleet/create",
          headers,
          payload: {},
        })
      ).statusCode,
      409,
    );
  } finally {
    await realApp.close();
    real.sqlite.close();
  }
});
test("a created fleet stays separate, accepts a first miner, starts collection and resumes without duplicates", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bitaxe-onboarding-"));
  const demoPath = join(directory, "demo.sqlite");
  const livePath = join(directory, "fleet.sqlite");
  const demo = openDatabase(demoPath);
  prepareDemoData(demo);
  const selectedPort = await port();
  const origin = `http://127.0.0.1:${selectedPort}`;
  const calls: string[] = [];
  const options = {
    demoStore: demo,
    demoPath,
    databasePath: livePath,
    host: "127.0.0.1",
    port: selectedPort,
    origin,
    pollSeconds: 30,
    timeoutMs: 100,
    retentionDays: 1,
    fetcher: async (url: Parameters<typeof fetch>[0]) => {
      calls.push(String(url));
      return new Response(JSON.stringify(info));
    },
  };
  let session = createFleetSession(options);
  try {
    assert.equal(session.wasCreated(), false);
    const results = await Promise.all([session.start(), session.start()]);
    assert.deepEqual(results, [{ url: origin }, { url: origin }]);
    assert.equal(session.wasCreated(), true);
    let fleet = await (
      await fetch(`${origin}/api/fleet`, { headers: { Connection: "close" } })
    ).json();
    assert.equal(fleet.demo, false);
    assert.equal(fleet.devices.length, 0);
    assert.equal(calls.length, 0);
    const post = async (path: string, payload: unknown) => {
      const response = await fetch(origin + path, {
        method: "POST",
        headers: {
          ...headers,
          origin,
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify(payload),
      });
      assert.ok(response.ok);
      return response.json();
    };
    const probe = await post("/api/miners/probe", { ip: "192.168.10.41" });
    assert.equal(probe.compatibility.status, "tested");
    await post("/api/miners", {
      probeToken: probe.probeToken,
      name: "First Gamma",
    });
    fleet = await (
      await fetch(`${origin}/api/fleet`, { headers: { Connection: "close" } })
    ).json();
    assert.equal(fleet.devices.length, 1);
    assert.equal(fleet.devices[0].name, "First Gamma");
    assert.equal(fleet.devices[0].state, "online");
    assert.equal(
      (
        demo.sqlite.prepare("SELECT COUNT(*) AS n FROM miners").get() as {
          n: number;
        }
      ).n,
      6,
    );
    await session.stop();
    session = createFleetSession(options);
    assert.equal(session.wasCreated(), true);
    await session.start();
    for (let i = 0; i < 100 && calls.length < 2; i++) await delay(10);
    assert.ok(calls.length >= 2);
    assert.ok(
      calls.every((url) => url === "http://192.168.10.41/api/system/info"),
    );
    fleet = await (
      await fetch(`${origin}/api/fleet`, { headers: { Connection: "close" } })
    ).json();
    assert.equal(fleet.devices.length, 1);
  } finally {
    await session.stop();
    demo.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("fleet setup rejects the demo database as the destination", async () => {
  const store = openDatabase(":memory:");
  prepareDemoData(store);
  try {
    assert.throws(
      () =>
        createFleetSession({
          demoStore: store,
          demoPath: "/tmp/demo.sqlite",
          databasePath: "/tmp/demo.sqlite",
          host: "127.0.0.1",
          port: 3082,
          origin: "http://127.0.0.1:3082",
          pollSeconds: 30,
          timeoutMs: 100,
          retentionDays: 1,
        }),
      /separate paths/,
    );
  } finally {
    store.sqlite.close();
  }
});

test("onboarding errors stay useful and sanitized when the frontend is served", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bitaxe-static-errors-"));
  writeFileSync(
    join(directory, "index.html"),
    "<!doctype html><title>Fixture</title>",
  );
  const store = openDatabase(":memory:");
  const app = await createApp(store, { webRoot: directory });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/miners/probe",
      headers,
      payload: { ip: "127.0.0.1" },
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /private IPv4 address/);
  } finally {
    await app.close();
    store.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
