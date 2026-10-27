import { setTimeout } from "node:timers/promises";
import type { AppDatabase } from "./database.js";
import { collectOnce } from "./collector.js";
import { getPollingInterval } from "./settings.js";

export function dueWorkspaces(
  store: AppDatabase,
  completed: Map<string, number>,
  now: number,
  fallback: number,
) {
  const workspaces = store.sqlite
    .prepare("SELECT id FROM workspaces")
    .all() as { id: string }[];
  const ids = new Set(workspaces.map((workspace) => workspace.id));
  for (const id of completed.keys()) if (!ids.has(id)) completed.delete(id);
  return workspaces
    .filter(({ id }) => {
      const last = completed.get(id);
      return (
        last === undefined ||
        now >= last + getPollingInterval(store, fallback, id) * 1000
      );
    })
    .map(({ id }) => id);
}

/** Schedules each workspace independently, re-reading inventory and intervals each second. */
export async function runWorkspaceCollector(
  store: AppDatabase,
  options: {
    pollSeconds: number;
    timeoutMs: number;
    retentionDays: number;
    signal: AbortSignal;
    fetcher?: typeof fetch;
    demoMode?: boolean;
    onError?: (error: unknown) => void;
    onCycle?: (result: {
      skipped: boolean;
      attempted: number;
      online: number;
      offline: number;
    }) => void;
  },
) {
  const completed = new Map<string, number>();
  while (!options.signal.aborted) {
    const due = dueWorkspaces(
      store,
      completed,
      Date.now(),
      options.pollSeconds,
    );
    if (due.length) {
      try {
        const result = await collectOnce(store, {
          ...options,
          workspaceIds: due,
        });
        options.onCycle?.(result);
        if (!result.skipped) {
          const at = Date.now();
          for (const id of due) completed.set(id, at);
        }
      } catch (error) {
        if (!options.signal.aborted) options.onError?.(error);
      }
    }
    if (!options.signal.aborted) {
      try {
        await setTimeout(1000, undefined, { signal: options.signal });
      } catch (error) {
        if (!options.signal.aborted) throw error;
      }
    }
  }
}
