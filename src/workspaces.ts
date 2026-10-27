import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "./database.js";
import { miners, workspaces } from "./schema.js";
import { getPollingInterval, setPollingInterval } from "./settings.js";
function failure(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}
export function requireWorkspace(store: AppDatabase, id = "default") {
  const workspace = store.db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get();
  return workspace ?? failure("Workspace not found", 404);
}
export function listWorkspaces(store: AppDatabase) {
  return store.sqlite
    .prepare(
      `SELECT w.id, w.name, w.temperature_unit AS temperatureUnit, COUNT(m.id) AS minerCount FROM workspaces w LEFT JOIN miners m ON m.workspace_id = w.id GROUP BY w.id ORDER BY CASE WHEN w.id = 'default' THEN 0 ELSE 1 END, w.name COLLATE NOCASE, w.id`,
    )
    .all() as { id: string; name: string; minerCount: number }[];
}
function cleanName(name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 64 || /[\u0000-\u001f\u007f]/.test(clean))
    failure(
      "Enter a workspace name of 1–64 characters without control characters.",
      400,
    );
  return clean;
}
export function saveWorkspace(store: AppDatabase, name: string, id?: string) {
  const clean = cleanName(name);
  if (id) requireWorkspace(store, id);
  const duplicate = store.sqlite
    .prepare("SELECT id FROM workspaces WHERE name = ? COLLATE NOCASE")
    .get(clean) as { id: string } | undefined;
  if (duplicate && duplicate.id !== id)
    failure("A workspace with that name already exists.", 409);
  const workspaceId = id ?? `workspace-${randomUUID()}`;
  // Serialize the duplicate check and write across concurrent API processes.
  return store.sqlite
    .transaction(() => {
      const existing = store.sqlite
        .prepare("SELECT id FROM workspaces WHERE name = ? COLLATE NOCASE")
        .get(clean) as { id: string } | undefined;
      if (existing && existing.id !== id)
        failure("A workspace with that name already exists.", 409);
      if (id)
        store.db
          .update(workspaces)
          .set({ name: clean })
          .where(eq(workspaces.id, id))
          .run();
      else
        store.db
          .insert(workspaces)
          .values({ id: workspaceId, name: clean })
          .run();
      return { id: workspaceId, name: clean };
    })
    .immediate();
}
export function moveMiner(store: AppDatabase, id: string, workspaceId: string) {
  return store.sqlite
    .transaction(() => {
      requireWorkspace(store, workspaceId);
      const result = store.db
        .update(miners)
        .set({ workspaceId })
        .where(eq(miners.id, id))
        .run();
      if (!result.changes) failure("Device not found", 404);
      return { id, workspaceId };
    })
    .immediate();
}

export function updateWorkspaceSettings(
  store: AppDatabase,
  id: string,
  seconds: number | undefined,
  rename?: { name: string; expectedName: string },
  temperatureUnit?: "C" | "F",
  fallback?: number,
) {
  return store.sqlite
    .transaction(() => {
      const current = requireWorkspace(store, id);
      if (rename) {
        if (current.name !== rename.expectedName)
          failure(
            "Workspace name changed elsewhere. Reopen settings and try again.",
            409,
          );
        saveWorkspace(store, rename.name, id);
      }
      const result =
        seconds === undefined
          ? { pollIntervalSeconds: getPollingInterval(store, fallback, id) }
          : setPollingInterval(store, seconds, id);
      if (temperatureUnit !== undefined)
        store.sqlite
          .prepare("UPDATE workspaces SET temperature_unit = ? WHERE id = ?")
          .run(temperatureUnit, id);
      return result;
    })
    .immediate();
}
export function deleteWorkspace(store: AppDatabase, id: string) {
  return store.sqlite
    .transaction(() => {
      requireWorkspace(store, id);
      if (id === "default")
        failure("The default workspace cannot be deleted.", 409);
      const count = store.sqlite
        .prepare("SELECT COUNT(*) AS count FROM miners WHERE workspace_id = ?")
        .get(id) as { count: number };
      if (count.count)
        failure(
          "Move all miners out of this workspace before deleting it.",
          409,
        );
      store.sqlite.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
      return { id };
    })
    .immediate();
}
