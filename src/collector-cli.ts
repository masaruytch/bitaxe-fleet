import { config } from "./config.js";
import { openDatabase } from "./database.js";
import { collectOnce } from "./collector.js";
import { runWorkspaceCollector } from "./workspace-scheduler.js";
const store = openDatabase(config.databasePath);
const abort = new AbortController();
process.once("SIGTERM", () => abort.abort());
process.once("SIGINT", () => abort.abort());
try {
  if (process.argv.includes("--once")) {
    const result = await collectOnce(store, {
      timeoutMs: config.timeoutMs,
      retentionDays: config.retentionDays,
      signal: abort.signal,
      demoMode: config.demoMode,
    });
    console.log(
      JSON.stringify({
        event: "collection_complete",
        at: new Date().toISOString(),
        ...result,
      }),
    );
  } else {
    await runWorkspaceCollector(store, {
      pollSeconds: config.pollSeconds,
      timeoutMs: config.timeoutMs,
      retentionDays: config.retentionDays,
      signal: abort.signal,
      demoMode: config.demoMode,
      onError: (error) => console.error(error),
      onCycle: (result) =>
        console.log(
          JSON.stringify({
            event: "collection_complete",
            at: new Date().toISOString(),
            ...result,
          }),
        ),
    });
  }
} catch (error) {
  if (!abort.signal.aborted) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  store.sqlite.close();
}
