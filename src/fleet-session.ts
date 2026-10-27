import { resolve } from "node:path";
import { openDatabase, type AppDatabase } from "./database.js";
import { createApp } from "./app.js";
import { isDemoDatabase } from "./demo.js";
import { runWorkspaceCollector } from "./workspace-scheduler.js";

/** A real fleet is served independently of the sample database and demo API. */
export function createFleetSession(options: {
  demoStore: AppDatabase;
  demoPath: string;
  databasePath: string;
  host: string;
  port: number;
  origin: string;
  pollSeconds: number;
  timeoutMs: number;
  retentionDays: number;
  logger?: boolean;
  fetcher?: typeof fetch;
}) {
  if (!isDemoDatabase(options.demoStore))
    throw new Error("Fleet setup must start from a demo workspace.");
  if (resolve(options.databasePath) === resolve(options.demoPath))
    throw new Error("Real fleet and demo databases must have separate paths.");
  let active: Promise<{ url: string }> | null = null;
  let shutdown: (() => Promise<void>) | null = null;
  const wasCreated = () =>
    !!options.demoStore.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE name='created_fleet'")
      .get();
  async function start() {
    if (active) return active;
    active = (async () => {
      const store = openDatabase(options.databasePath);
      if (isDemoDatabase(store)) {
        store.sqlite.close();
        throw new Error(
          "The new fleet database contains demo data. Choose a separate fleet database.",
        );
      }
      const abort = new AbortController();
      const app = await createApp(store, {
        pollSeconds: options.pollSeconds,
        timeoutMs: options.timeoutMs,
        allowedOrigins: [options.origin],
        logger: options.logger,
        minerFetcher: options.fetcher,
      });
      app.addHook("onClose", async () => store.sqlite.close());
      try {
        await app.listen({ host: options.host, port: options.port });
      } catch (error) {
        await app.close();
        throw error;
      }
      const worker = runWorkspaceCollector(store, {
        pollSeconds: options.pollSeconds,
        timeoutMs: options.timeoutMs,
        retentionDays: options.retentionDays,
        signal: abort.signal,
        fetcher: options.fetcher,
        onError: (error) =>
          app.log.error(error, "Fleet collection cycle failed"),
      });
      shutdown = async () => {
        abort.abort();
        await worker;
        await app.close();
      };
      options.demoStore.sqlite.exec(
        "CREATE TABLE IF NOT EXISTS created_fleet (id INTEGER PRIMARY KEY CHECK(id=1))",
      );
      options.demoStore.sqlite
        .prepare("INSERT OR IGNORE INTO created_fleet VALUES(1)")
        .run();
      return { url: options.origin };
    })();
    try {
      return await active;
    } catch (error) {
      active = null;
      throw Object.assign(
        new Error(
          "Could not open your fleet. Its port may already be in use; check the server configuration and try again.",
        ),
        { statusCode: 503, cause: error },
      );
    }
  }
  return {
    wasCreated,
    start,
    async stop() {
      if (active) await active.catch(() => undefined);
      if (shutdown) await shutdown();
      active = null;
      shutdown = null;
    },
  };
}
