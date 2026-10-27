import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";
import { miners } from "../src/schema.js";
import { saveObservation } from "../src/store.js";
import { normalizeTelemetry } from "../src/telemetry.js";
import { collectOnce } from "../src/collector.js";
import { prepareDemoData } from "../src/demo.js";
const headers = { "x-fleet-request": "1" };
const raw = {
  hashRate: 1000,
  power: 10,
  temp: 50,
  ASICModel: "BM1370",
  boardVersion: "601",
  hostname: "fixture",
  macAddr: "02:12:34:56:78:90",
};

test("workspaces scope fleets, historical/live trends and history; moving preserves identity and readings", async () => {
  const store = openDatabase(":memory:");
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    store.db
      .insert(miners)
      .values({
        id: "a",
        name: "Miner A",
        ip: "192.0.2.1",
        algorithm: "sha256",
      })
      .run();
    saveObservation(
      store,
      "a",
      normalizeTelemetry(raw, Math.floor(Date.now() / 1000)),
    );
    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers,
      payload: { name: "Location B" },
    });
    assert.equal(created.statusCode, 201);
    const id = created.json().id;
    const before = (await app.inject("/api/miners/a/history")).json();
    assert.equal(
      (await app.inject(`/api/fleet?workspaceId=${id}`)).json().devices.length,
      0,
    );
    assert.equal(
      (await app.inject(`/api/fleet/trends?workspaceId=${id}`)).json().devices
        .length,
      0,
    );
    assert.equal(
      (await app.inject(`/api/miners/a/history?workspaceId=${id}`)).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/miners/a/workspace",
          headers,
          payload: { workspaceId: id },
        })
      ).statusCode,
      200,
    );
    assert.equal((await app.inject("/api/fleet")).json().devices.length, 0);
    const fleet = (await app.inject(`/api/fleet?workspaceId=${id}`)).json();
    assert.equal(fleet.devices.length, 1);
    assert.equal(fleet.devices[0].id, "a");
    assert.equal(fleet.devices[0].workspaceId, id);
    assert.equal(
      (await app.inject("/api/miners/a/history?workspaceId=default"))
        .statusCode,
      404,
    );
    assert.deepEqual(
      (await app.inject(`/api/miners/a/history?workspaceId=${id}`)).json(),
      before,
    );
    for (const query of ["hours=1", "hours=24", "range=collection"]) {
      const original = (
        await app.inject(`/api/fleet/trends?${query}&workspaceId=default`)
      ).json();
      const target = (
        await app.inject(`/api/fleet/trends?${query}&workspaceId=${id}`)
      ).json();
      assert.equal(original.devices.length, 0);
      assert.equal(target.devices.length, 1);
      assert.ok(
        target.fleet.some(
          (point: { hashrateThs: number | null }) => point.hashrateThs === 1,
        ),
      );
    }
    const list = (await app.inject("/api/workspaces")).json().workspaces;
    assert.equal(
      list.find((w: { id: string }) => w.id === "default").minerCount,
      0,
    );
    assert.equal(list.find((w: { id: string }) => w.id === id).minerCount, 1);
    for (const path of [
      "/api/fleet?workspaceId=missing",
      "/api/fleet/trends?workspaceId=missing",
      "/api/miners/a/history?workspaceId=missing",
    ])
      assert.equal((await app.inject(path)).statusCode, 404);
  } finally {
    await app.close();
    store.sqlite.close();
  }
});

test("registration targets the chosen workspace, detects duplicates globally, and collector covers all groups once", async () => {
  const store = openDatabase(":memory:");
  let fetches = 0;
  const app = await createApp(store, {
    webRoot: "/nonexistent",
    minerFetcher: async () => new Response(JSON.stringify(raw)),
  });
  try {
    const id = (
      await app.inject({
        method: "POST",
        url: "/api/workspaces",
        headers,
        payload: { name: "Bitcoin" },
      })
    ).json().id;
    const probe = (
      await app.inject({
        method: "POST",
        url: "/api/miners/probe",
        headers,
        payload: { ip: "192.168.10.41" },
      })
    ).json();
    const invalidDestination = await app.inject({
      method: "POST",
      url: "/api/miners",
      headers,
      payload: { probeToken: probe.probeToken, workspaceId: "missing" },
    });
    assert.equal(invalidDestination.statusCode, 404);
    assert.equal((await app.inject("/api/fleet")).json().devices.length, 0);
    const added = await app.inject({
      method: "POST",
      url: "/api/miners",
      headers,
      payload: { probeToken: probe.probeToken, workspaceId: id, name: "Test" },
    });
    assert.equal(added.statusCode, 201);
    assert.equal(added.json().workspaceId, id);
    const duplicate = (
      await app.inject({
        method: "POST",
        url: "/api/miners/probe",
        headers,
        payload: { ip: "192.168.10.41" },
      })
    ).json();
    assert.equal(duplicate.probeToken, null);
    assert.equal(duplicate.existingDevice.workspaceId, id);
    assert.equal(duplicate.existingDevice.workspaceName, "Bitcoin");
    store.db
      .insert(miners)
      .values({
        id: "default-miner",
        name: "Default",
        ip: "192.168.10.42",
        algorithm: "sha256",
      })
      .run();
    const result = await collectOnce(store, {
      timeoutMs: 100,
      retentionDays: 1,
      fetcher: async (url) => {
        fetches++;
        return new Response(
          JSON.stringify({
            ...raw,
            macAddr: String(url).includes(".42/")
              ? "02:12:34:56:78:91"
              : raw.macAddr,
          }),
        );
      },
    });
    assert.equal(result.online, 2);
    assert.equal(fetches, 2);
    assert.equal((await app.inject("/api/fleet")).json().devices.length, 1);
    assert.equal(
      (await app.inject(`/api/fleet?workspaceId=${id}`)).json().devices.length,
      1,
    );
  } finally {
    await app.close();
    store.sqlite.close();
  }
});

test("workspace writes validate names, reject unsafe/demo requests and never strand miners", async () => {
  const store = openDatabase(":memory:");
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    for (const name of [" ", "a".repeat(65), "Bad\nname"])
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/workspaces",
            headers,
            payload: { name },
          })
        ).statusCode,
        400,
      );
    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers,
      payload: { name: " Location A " },
    });
    assert.equal(created.statusCode, 201);
    const id = created.json().id;
    assert.equal(created.json().name, "Location A");
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/workspaces",
          headers,
          payload: { name: "location a" },
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/workspaces/${id}`,
          headers,
          payload: { name: "DGB" },
        })
      ).statusCode,
      200,
    );
    for (const badHeaders of [
      {},
      { ...headers, origin: "https://untrusted.example" },
    ])
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/workspaces",
            headers: badHeaders,
            payload: { name: "Unsafe" },
          })
        ).statusCode,
        403,
      );
    store.db
      .insert(miners)
      .values({ id: "a", name: "A", ip: "192.0.2.1", algorithm: "sha256" })
      .run();
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/miners/a/workspace",
          headers,
          payload: { workspaceId: "missing" },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await app.inject("/api/fleet")).json().devices[0].workspaceId,
      "default",
    );
    assert.throws(
      () =>
        store.sqlite.prepare("UPDATE miners SET workspace_id='missing'").run(),
      /Unknown workspace/,
    );
    assert.throws(
      () =>
        store.sqlite.prepare("DELETE FROM workspaces WHERE id='default'").run(),
      /contains miners/,
    );
  } finally {
    await app.close();
    store.sqlite.close();
  }
  const demo = openDatabase(":memory:");
  prepareDemoData(demo);
  const demoApp = await createApp(demo, { webRoot: "/nonexistent" });
  try {
    for (const [method, url, payload] of [
      ["POST", "/api/workspaces", { name: "Blocked" }],
      ["PATCH", "/api/workspaces/default", { name: "Blocked" }],
      ["PATCH", "/api/miners/demo-1/workspace", { workspaceId: "default" }],
    ] as const)
      assert.equal(
        (await demoApp.inject({ method, url, headers, payload })).statusCode,
        409,
      );
  } finally {
    await demoApp.close();
    demo.sqlite.close();
  }
});

test("version 7 migration keeps existing data in default workspace and persists new assignments across restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-workspace-"));
  const path = join(directory, "test.sqlite");
  let store = openDatabase(path);
  try {
    store.db
      .insert(miners)
      .values({
        id: "a",
        name: "A",
        ip: "192.0.2.1",
        algorithm: "sha256",
        coin: "DGB",
      })
      .run();
    saveObservation(store, "a", normalizeTelemetry(raw, 100));
    store.sqlite.exec(
      "DROP TRIGGER miners_workspace_insert; DROP TRIGGER miners_workspace_update; DROP TRIGGER workspaces_delete_used; DROP INDEX miners_workspace; ALTER TABLE miners DROP COLUMN workspace_id; DROP TABLE workspaces; DELETE FROM schema_migrations WHERE version IN (7,8,9);",
    );
    store.sqlite.close();
    store = openDatabase(path);
    assert.equal(
      (
        store.sqlite.prepare("SELECT workspace_id,coin FROM miners").get() as {
          workspace_id: string;
        }
      ).workspace_id,
      "default",
    );
    const app = await createApp(store, { webRoot: "/nonexistent" });
    const id = (
      await app.inject({
        method: "POST",
        url: "/api/workspaces",
        headers,
        payload: { name: "Saved group" },
      })
    ).json().id;
    await app.inject({
      method: "PATCH",
      url: "/api/miners/a/workspace",
      headers,
      payload: { workspaceId: id },
    });
    await app.close();
    store.sqlite.close();
    store = openDatabase(path);
    const miner = store.sqlite
      .prepare("SELECT workspace_id,coin FROM miners")
      .get() as { workspace_id: string; coin: string };
    assert.equal(miner.workspace_id, id);
    assert.equal(miner.coin, "DGB");
    assert.equal(
      (
        store.sqlite
          .prepare("SELECT count(*) AS n FROM observations")
          .get() as { n: number }
      ).n,
      1,
    );
  } finally {
    store.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("workspace intervals migrate, schedule independently, and scope API freshness and live trends", async () => {
  const { dueWorkspaces } = await import("../src/workspace-scheduler.js");
  const { getPollingInterval } = await import("../src/settings.js");
  const store = openDatabase(":memory:");
  store.sqlite
    .prepare("INSERT INTO app_settings VALUES ('poll_interval_seconds', 45)")
    .run();
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    const id = (
      await app.inject({
        method: "POST",
        url: "/api/workspaces",
        headers,
        payload: { name: "Second" },
      })
    ).json().id;
    assert.equal(getPollingInterval(store, 30, id), 45);
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/settings?workspaceId=${id}`,
          headers,
          payload: { pollIntervalSeconds: 120 },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await app.inject("/api/settings")).json().pollIntervalSeconds,
      45,
    );
    assert.equal(
      (await app.inject(`/api/settings?workspaceId=${id}`)).json()
        .pollIntervalSeconds,
      120,
    );
    assert.equal(
      (await app.inject(`/api/fleet?workspaceId=${id}`)).json()
        .staleAfterSeconds,
      360,
    );
    assert.equal(
      (
        await app.inject(`/api/fleet/trends?range=collection&workspaceId=${id}`)
      ).json().bucketSeconds,
      120,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/settings?workspaceId=missing",
          headers,
          payload: { pollIntervalSeconds: 30 },
        })
      ).statusCode,
      404,
    );
    const completed = new Map([
      ["default", 1000],
      [id, 1000],
    ]);
    assert.deepEqual(dueWorkspaces(store, completed, 47000, 30), ["default"]);
    assert.deepEqual(
      dueWorkspaces(store, completed, 121000, 30).sort(),
      ["default", id].sort(),
    );
    await app.inject({
      method: "PATCH",
      url: `/api/settings?workspaceId=${id}`,
      headers,
      payload: { pollIntervalSeconds: 10 },
    });
    assert.ok(dueWorkspaces(store, completed, 12000, 30).includes(id));
  } finally {
    await app.close();
    store.sqlite.close();
  }
});

test("version 8 upgrades every existing workspace using the saved installation interval", async () => {
  const { getPollingInterval } = await import("../src/settings.js");
  const directory = mkdtempSync(join(tmpdir(), "fleet-interval-"));
  const path = join(directory, "test.sqlite");
  let store = openDatabase(path);
  try {
    store.sqlite.exec(
      "INSERT INTO workspaces(id,name) VALUES ('other','Other'); INSERT INTO app_settings VALUES ('poll_interval_seconds',90); ALTER TABLE workspaces DROP COLUMN poll_interval_seconds; DELETE FROM schema_migrations WHERE version=8;",
    );
    store.sqlite.close();
    store = openDatabase(path);
    assert.equal(getPollingInterval(store, 30, "default"), 90);
    assert.equal(getPollingInterval(store, 30, "other"), 90);
    store.sqlite.close();
    store = openDatabase(path);
    assert.equal(getPollingInterval(store, 30, "other"), 90);
  } finally {
    store.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("collection of a due workspace does not poll miners in other workspaces", async () => {
  const store = openDatabase(":memory:");
  try {
    store.sqlite.exec(
      "INSERT INTO workspaces(id,name) VALUES ('other','Other')",
    );
    store.db
      .insert(miners)
      .values([
        { id: "first", name: "First", ip: "192.0.2.1", algorithm: "sha256" },
        {
          id: "second",
          name: "Second",
          ip: "192.0.2.2",
          algorithm: "sha256",
          workspaceId: "other",
        },
      ])
      .run();
    const urls: string[] = [];
    const result = await collectOnce(store, {
      timeoutMs: 100,
      retentionDays: 1,
      workspaceIds: ["other"],
      fetcher: async (url) => {
        urls.push(String(url));
        return new Response(JSON.stringify(raw));
      },
    });
    assert.equal(result.attempted, 1);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /192\.0\.2\.2/);
  } finally {
    store.sqlite.close();
  }
});

test("workspace settings save atomically and protect concurrent renames", async () => {
  const store = openDatabase(":memory:");
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    const create = async (name: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/api/workspaces",
          headers,
          payload: { name },
        })
      ).json().id;
    const id = await create("Original");
    await create("Taken");
    const settings = `/api/settings?workspaceId=${id}`;
    const write = (payload: object) =>
      app.inject({ method: "PATCH", url: settings, headers, payload });
    assert.equal(
      (
        await write({
          pollIntervalSeconds: 120,
          name: "Taken",
          expectedName: "Original",
        })
      ).statusCode,
      409,
    );
    assert.equal((await app.inject(settings)).json().pollIntervalSeconds, 30);
    assert.equal(
      (
        await write({
          pollIntervalSeconds: 60,
          name: "Updated",
          expectedName: "Original",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await write({
          pollIntervalSeconds: 120,
          name: "Old edit",
          expectedName: "Original",
        })
      ).statusCode,
      409,
    );
    assert.equal((await app.inject(settings)).json().pollIntervalSeconds, 60);
    assert.equal((await write({ pollIntervalSeconds: 90 })).statusCode, 200);
    assert.equal(
      (await app.inject("/api/workspaces"))
        .json()
        .workspaces.find((w: { id: string }) => w.id === id).name,
      "Updated",
    );
    assert.equal(
      (await write({ pollIntervalSeconds: 30, name: "No precondition" }))
        .statusCode,
      400,
    );
  } finally {
    await app.close();
    store.sqlite.close();
  }
});

test("deleting workspaces protects the default and miners, enforces guards, and removes empty workspaces", async () => {
  const store = openDatabase(":memory:");
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    const id = (
      await app.inject({
        method: "POST",
        url: "/api/workspaces",
        headers,
        payload: { name: "Empty" },
      })
    ).json().id;
    const del = (
      target: string,
      requestHeaders: Record<string, string> = headers,
    ) =>
      app.inject({
        method: "DELETE",
        url: `/api/workspaces/${target}`,
        headers: requestHeaders,
      });
    assert.equal((await del(id, {})).statusCode, 403);
    assert.equal((await del("default")).statusCode, 409);
    assert.equal((await del("missing")).statusCode, 404);
    store.db
      .insert(miners)
      .values({
        id: "x",
        name: "X",
        ip: "192.0.2.3",
        algorithm: "sha256",
        workspaceId: id,
      })
      .run();
    assert.equal((await del(id)).statusCode, 409);
    assert.equal(
      (await app.inject(`/api/fleet?workspaceId=${id}`)).json().devices.length,
      1,
    );
    await app.inject({
      method: "PATCH",
      url: "/api/miners/x/workspace",
      headers,
      payload: { workspaceId: "default" },
    });
    assert.equal((await del(id)).statusCode, 200);
    assert.equal(
      (await app.inject(`/api/fleet?workspaceId=${id}`)).statusCode,
      404,
    );
    assert.equal((await app.inject("/api/fleet")).json().devices.length, 1);
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
          method: "DELETE",
          url: "/api/workspaces/default",
          headers,
        })
      ).statusCode,
      409,
    );
  } finally {
    await demoApp.close();
    demo.sqlite.close();
  }
});

test("workspace temperature units are independent, validated, and persist with atomic settings", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-temperature-"));
  const path = join(directory, "test.sqlite");
  let store = openDatabase(path);
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    const id = (
      await app.inject({
        method: "POST",
        url: "/api/workspaces",
        headers,
        payload: { name: "Other" },
      })
    ).json().id;
    const url = `/api/settings?workspaceId=${id}`;
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url,
          headers,
          payload: { pollIntervalSeconds: 60, temperatureUnit: "F" },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url,
          headers,
          payload: { pollIntervalSeconds: 90, temperatureUnit: "K" },
        })
      ).statusCode,
      400,
    );
    assert.equal((await app.inject(url)).json().pollIntervalSeconds, 60);
    const list = (await app.inject("/api/workspaces")).json().workspaces;
    assert.equal(
      list.find((w: { id: string }) => w.id === "default").temperatureUnit,
      "C",
    );
    assert.equal(
      list.find((w: { id: string }) => w.id === id).temperatureUnit,
      "F",
    );
    await app.close();
    store.sqlite.close();
    store = openDatabase(path);
    assert.equal(
      (
        store.sqlite
          .prepare(
            "SELECT temperature_unit AS unit FROM workspaces WHERE id = ?",
          )
          .get(id) as { unit: string }
      ).unit,
      "F",
    );
  } finally {
    if (!store.sqlite.open) store = openDatabase(path);
    store.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("version 9 migration gives existing workspaces Celsius without changing their interval", () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-temp-migration-"));
  const path = join(directory, "test.sqlite");
  let store = openDatabase(path);
  try {
    store.sqlite.exec(
      "UPDATE workspaces SET poll_interval_seconds=75; ALTER TABLE workspaces DROP COLUMN temperature_unit; DELETE FROM schema_migrations WHERE version=9;",
    );
    store.sqlite.close();
    store = openDatabase(path);
    const row = store.sqlite
      .prepare(
        "SELECT temperature_unit AS unit, poll_interval_seconds AS interval FROM workspaces WHERE id='default'",
      )
      .get() as { unit: string; interval: number };
    assert.deepEqual(row, { unit: "C", interval: 75 });
  } finally {
    store.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("partial workspace settings updates preserve a concurrently changed interval", async () => {
  const store = openDatabase(":memory:");
  const app = await createApp(store, { webRoot: "/nonexistent" });
  try {
    const patch = (payload: object) =>
      app.inject({ method: "PATCH", url: "/api/settings", headers, payload });
    assert.equal((await patch({ pollIntervalSeconds: 120 })).statusCode, 200);
    assert.equal(
      (await patch({ name: "Renamed", expectedName: "My mining fleet" }))
        .statusCode,
      200,
    );
    assert.equal((await patch({ temperatureUnit: "F" })).statusCode, 200);
    assert.equal(
      (await app.inject("/api/settings")).json().pollIntervalSeconds,
      120,
    );
    assert.equal((await patch({})).statusCode, 400);
  } finally {
    await app.close();
    store.sqlite.close();
  }
});
