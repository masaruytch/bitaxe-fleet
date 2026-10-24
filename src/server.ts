import { dirname, resolve } from "node:path";
import { createFleetSession } from "./fleet-session.js";
import { isDemoDatabase, prepareDemoData, refreshDemoData } from "./demo.js";
import { config } from "./config.js";
import { openDatabase } from "./database.js";
import { createApp } from "./app.js";
const store = openDatabase(config.databasePath);
const demo = config.demoMode || isDemoDatabase(store);
if (demo) prepareDemoData(store);
const demoTimer = demo
  ? setInterval(() => refreshDemoData(store), 30000)
  : null;
demoTimer?.unref();
const fleetOrigin = new URL(config.appOrigin);
fleetOrigin.port = String(config.fleetPort);
const fleetSession = demo
  ? createFleetSession({
      demoStore: store,
      demoPath: config.databasePath,
      databasePath: resolve(
        config.fleetDatabasePath ??
          resolve(dirname(config.databasePath), "fleet.sqlite"),
      ),
      host: config.host,
      port: config.fleetPort,
      origin: fleetOrigin.origin,
      pollSeconds: config.pollSeconds,
      timeoutMs: config.timeoutMs,
      retentionDays: config.retentionDays,
      logger: true,
    })
  : null;
if (fleetSession?.wasCreated()) {
  try {
    await fleetSession.start();
  } catch {
    console.error(
      "Could not resume the created fleet. The demo remains available; check FLEET_PORT and try Create your fleet again.",
    );
  }
}
const app = await createApp(store, {
  createFleet: fleetSession ? () => fleetSession.start() : undefined,
  pollSeconds: config.pollSeconds,
  logger: true,
  timeoutMs: config.timeoutMs,
  allowedOrigins: [
    config.appOrigin,
    ...(config.appOrigin === "http://127.0.0.1:3080"
      ? ["http://localhost:3080"]
      : []),
  ],
});
app.addHook("onClose", async () => {
  if (demoTimer) clearInterval(demoTimer);
  await fleetSession?.stop();
  store.sqlite.close();
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    void app.close();
  });
try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
