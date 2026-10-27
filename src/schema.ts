import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  pollIntervalSeconds: integer("poll_interval_seconds"),
  temperatureUnit: text("temperature_unit").notNull().default("C"),
});
export const miners = sqliteTable("miners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull().unique(),
  algorithm: text("algorithm").notNull(),
  workspaceId: text("workspace_id").notNull().default("default"),
  coin: text("coin"),
  icon: text("icon"),
  customIcon: text("custom_icon"),
  macAddress: text("mac_address"),
  hostname: text("hostname"),
  model: text("model"),
  registeredAt: integer("registered_at").notNull().default(0),
});
export const observations = sqliteTable(
  "observations",
  {
    minerId: text("miner_id")
      .notNull()
      .references(() => miners.id),
    observedAt: integer("observed_at").notNull(),
    online: integer("online", { mode: "boolean" }).notNull(),
    hashrateGhs: real("hashrate_ghs"),
    powerWatts: real("power_watts"),
    temperatureC: real("temperature_c"),
    bestDifficulty: real("best_difficulty"),
    bestSessionDifficulty: real("best_session_difficulty"),
    accepted: integer("accepted"),
    rejected: integer("rejected"),
    uptimeSeconds: integer("uptime_seconds"),
    firmware: text("firmware"),
    pool: text("pool"),
    poolPort: integer("pool_port"),
    poolUser: text("pool_user"),
    poolMode: text("pool_mode"),
    error: text("error"),
  },
  (table) => [primaryKey({ columns: [table.minerId, table.observedAt] })],
);
