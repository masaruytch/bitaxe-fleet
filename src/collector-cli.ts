import { waitForNextCollection } from "./collection-schedule.js";
import { getPollingInterval } from "./settings.js";
import { config } from "./config.js";
import { openDatabase } from "./database.js";
import { collectOnce } from "./collector.js";
const store = openDatabase(config.databasePath);
const abort = new AbortController();
process.once("SIGTERM", () => abort.abort());
process.once("SIGINT", () => abort.abort());
try {
  do {
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
        pollIntervalSeconds: getPollingInterval(store, config.pollSeconds),
      }),
    );
    if (process.argv.includes("--once")) break;
    await waitForNextCollection(
      () => getPollingInterval(store, config.pollSeconds),
      abort.signal,
    );
  } while (!abort.signal.aborted);
} catch (error) {
  if (!abort.signal.aborted) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  store.sqlite.close();
}
