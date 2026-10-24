import { isDemoDatabase } from "./demo.js";
import { getPollingInterval, setPollingInterval } from "./settings.js";
import {
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
} from "../shared/settings.js";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppDatabase } from "./database.js";
import { listFleet, deviceHistory, renameMiner } from "./store.js";
import { miners } from "./schema.js";
import { eq } from "drizzle-orm";
import { fleetTrends } from "./trends.js";
import { createMinerRegistration } from "./miner-registration.js";
import type { FleetResponse } from "../shared/contracts.js";
export async function createApp(
  store: AppDatabase,
  options: {
    pollSeconds?: number;
    staleSeconds?: number;
    logger?: boolean;
    webRoot?: string;
    minerFetcher?: typeof fetch;
    timeoutMs?: number;
    allowedOrigins?: string[];
    createFleet?: () => Promise<{ url: string }>;
  } = {},
) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 16384 });
  app.setErrorHandler((error, request, reply) => {
    const status =
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({
      error:
        status >= 500
          ? "Internal server error"
          : error instanceof Error
            ? error.message
            : "Invalid request",
    });
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "same-origin");
    reply.header("X-Frame-Options", "DENY");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
  });
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => {
    store.sqlite.prepare("SELECT 1").get();
    return { status: "ok", database: "ready" };
  });
  app.get("/api/fleet", async (_request, reply): Promise<FleetResponse> => {
    reply.header("Cache-Control", "no-store");
    const now = Math.floor(Date.now() / 1000);
    const interval = getPollingInterval(store, options.pollSeconds);
    const staleSeconds = options.staleSeconds ?? Math.max(180, interval * 3);
    return {
      devices: listFleet(store, now, staleSeconds),
      generatedAt: now,
      demo: isDemoDatabase(store),
      canCreateFleet: isDemoDatabase(store) && !!options.createFleet,
      pollIntervalSeconds: interval,
      staleAfterSeconds: staleSeconds,
    };
  });
  app.get<{ Params: { id: string }; Querystring: { hours?: number } }>(
    "/api/miners/:id/history",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,64}$" },
          },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            hours: { type: "integer", minimum: 1, maximum: 168, default: 24 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!store.db.select().from(miners).where(eq(miners.id, id)).get())
        return reply.code(404).send({ error: "Device not found" });
      reply.header("Cache-Control", "no-store");
      return {
        deviceId: id,
        observations: deviceHistory(
          store,
          id,
          Math.floor(Date.now() / 1000) - (request.query.hours ?? 24) * 3600,
        ),
      };
    },
  );
  app.get<{ Querystring: { hours?: number } }>(
    "/api/fleet/trends",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            hours: { type: "integer", enum: [1, 24, 168], default: 24 },
          },
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return fleetTrends(
        store,
        request.query.hours ?? 24,
        Math.floor(Date.now() / 1000),
      );
    },
  );
  const registration = createMinerRegistration(store, {
    timeoutMs: options.timeoutMs ?? 5000,
    fetcher: options.minerFetcher,
  });
  const ipSchema = { type: "string", minLength: 7, maxLength: 15 };
  const originGuard = async (
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) => {
    const allowed = options.allowedOrigins ?? [
      "http://127.0.0.1:3080",
      "http://localhost:3080",
    ];
    if (
      request.headers["x-fleet-request"] !== "1" ||
      (request.headers.origin && !allowed.includes(request.headers.origin))
    )
      return reply
        .code(403)
        .send({ error: "Use the dashboard to update fleet data." });
  };
  const writeGuard = async (
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) => {
    if (isDemoDatabase(store))
      return reply.code(409).send({
        error:
          "Demo mode is read-only. Create a separate fleet to add real miners.",
      });
    return originGuard(request, reply);
  };
  app.post(
    "/api/fleet/create",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      preHandler: originGuard,
      schema: {
        body: { type: "object", additionalProperties: false, properties: {} },
      },
    },
    async (request, reply) => {
      if (!isDemoDatabase(store) || !options.createFleet)
        return reply.code(409).send({
          error:
            "A separate fleet cannot be created from this workspace. Use Add miner in your existing fleet.",
        });
      reply.header("Cache-Control", "no-store");
      try {
        return await options.createFleet();
      } catch (error) {
        request.log.error(error);
        return reply.code(503).send({
          error:
            "Could not open your fleet. Its port may already be in use; check the server configuration and try again.",
        });
      }
    },
  );
  app.post<{ Body: { ip: string } }>(
    "/api/miners/probe",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      preHandler: writeGuard,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["ip"],
          properties: { ip: ipSchema },
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return registration.probe(request.body.ip);
    },
  );
  app.post<{ Body: { probeToken: string; name?: string } }>(
    "/api/miners",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      preHandler: writeGuard,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["probeToken"],
          properties: {
            probeToken: { type: "string", pattern: "^[a-f0-9]{64}$" },
            name: { type: "string", maxLength: 64 },
          },
        },
      },
    },
    async (request, reply) => {
      const device = registration.add(
        request.body.probeToken,
        request.body.name,
      );
      return reply.code(201).send(device);
    },
  );
  app.get("/api/settings", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return {
      pollIntervalSeconds: getPollingInterval(store, options.pollSeconds),
    };
  });
  app.patch<{ Body: { pollIntervalSeconds: number } }>(
    "/api/settings",
    {
      preHandler: writeGuard,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["pollIntervalSeconds"],
          properties: {
            pollIntervalSeconds: {
              type: "integer",
              minimum: MIN_POLL_INTERVAL_SECONDS,
              maximum: MAX_POLL_INTERVAL_SECONDS,
            },
          },
        },
      },
    },
    async (request) =>
      setPollingInterval(store, request.body.pollIntervalSeconds),
  );
  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/api/miners/:id",
    {
      preHandler: writeGuard,
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,64}$" },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: { name: { type: "string", minLength: 1, maxLength: 64 } },
        },
      },
    },
    async (request) => renameMiner(store, request.params.id, request.body.name),
  );
  const webRoot = options.webRoot ?? resolve("dist/web");
  if (existsSync(resolve(webRoot, "index.html"))) {
    await app.register(fastifyStatic, { root: webRoot, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === "GET" &&
        !request.url.startsWith("/api/") &&
        request.headers.accept?.includes("text/html") &&
        !request.url.split("?")[0].includes(".")
      )
        return reply.sendFile("index.html");
      return reply.code(404).send({ error: "Not found" });
    });
  }
  return app;
}
