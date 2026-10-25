import { asc, desc, eq, and, gte, lt } from "drizzle-orm";
import { miners, observations } from "./schema.js";
import type { AppDatabase } from "./database.js";
import type { Observation, Device } from "../shared/contracts.js";
import { deviceState, warningReasons } from "./telemetry.js";
export function saveObservation(
  store: AppDatabase,
  minerId: string,
  observation: Observation,
) {
  store.db
    .insert(observations)
    .values({ minerId, ...observation })
    .onConflictDoNothing()
    .run();
}
export function listFleet(
  store: AppDatabase,
  now: number,
  staleSeconds: number,
): Device[] {
  return store.db
    .select()
    .from(miners)
    .orderBy(asc(miners.name))
    .all()
    .map((miner) => {
      const latest =
        store.db
          .select()
          .from(observations)
          .where(eq(observations.minerId, miner.id))
          .orderBy(desc(observations.observedAt))
          .limit(1)
          .get() ?? null;
      const lastSuccess = store.db
        .select({ at: observations.observedAt })
        .from(observations)
        .where(
          and(
            eq(observations.minerId, miner.id),
            eq(observations.online, true),
          ),
        )
        .orderBy(desc(observations.observedAt))
        .limit(1)
        .get();
      return {
        ...miner,
        latest,
        lastSuccessfulAt: lastSuccess?.at ?? null,
        state: deviceState(latest, now, staleSeconds),
        warningReasons: warningReasons(latest, now, staleSeconds),
      };
    });
}
export function deviceHistory(
  store: AppDatabase,
  id: string,
  since: number,
): Observation[] {
  return store.db
    .select()
    .from(observations)
    .where(
      and(eq(observations.minerId, id), gte(observations.observedAt, since)),
    )
    .orderBy(desc(observations.observedAt))
    .limit(10000)
    .all()
    .reverse();
}
export function pruneHistory(store: AppDatabase, before: number) {
  return store.db
    .delete(observations)
    .where(lt(observations.observedAt, before))
    .run().changes;
}

export function renameMiner(store: AppDatabase, id: string, name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 64 || /[\u0000-\u001f\u007f]/.test(clean))
    throw Object.assign(
      new Error(
        "Enter a nickname of 1–64 characters without control characters.",
      ),
      { statusCode: 400 },
    );
  const result = store.db
    .update(miners)
    .set({ name: clean })
    .where(eq(miners.id, id))
    .run();
  if (!result.changes)
    throw Object.assign(new Error("Device not found"), { statusCode: 404 });
  return { id, name: clean };
}
