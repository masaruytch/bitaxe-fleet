import { isIP } from "node:net";
import {
  McpServer,
  type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const reading = z.number().finite().nonnegative().nullable();
const agentSettings = z.object({ agentAccessEnabled: z.boolean() });
const timestamp = z.number().int().nonnegative();
const status = z.enum(["online", "warning", "offline", "stale", "unknown"]);
const workspaceList = z.object({
  defaultWorkspaceId: id,
  demo: z.boolean().optional(),
  workspaces: z.array(
    z.object({ id, minerCount: z.number().int().nonnegative() }),
  ),
});
const fleetSchema = z.object({
  generatedAt: timestamp,
  demo: z.boolean().optional(),
  pollIntervalSeconds: z.number().int().positive(),
  staleAfterSeconds: z.number().int().positive(),
  devices: z.array(
    z.object({
      id,
      algorithm: z.string(),
      state: status,
      lastSuccessfulAt: timestamp.nullable(),
      latest: z
        .object({
          observedAt: timestamp,
          online: z.boolean(),
          hashrateGhs: reading,
          powerWatts: reading,
          temperatureC: reading,
          bestDifficulty: reading.optional(),
          bestSessionDifficulty: reading.optional(),
        })
        .nullable(),
    }),
  ),
});
const trendsSchema = z.object({
  generatedAt: timestamp,
  hours: z.number().finite().positive(),
  bucketSeconds: z.number().int().positive(),
  windowSeconds: z.number().int().positive().optional(),
  fleet: z.array(
    z.object({
      at: timestamp,
      hashrateThs: reading,
      powerWatts: reading,
      efficiencyJth: reading,
    }),
  ),
});
type Fleet = z.infer<typeof fleetSchema>;
type Device = Fleet["devices"][number];

/** The adapter accepts only loopback or RFC1918 addresses, never credentials or paths. */
export function fleetOrigin(value = "http://127.0.0.1:3080") {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid Fleet API address.");
  }
  const host = url.hostname.toLowerCase();
  const ip = host.split(".").map(Number);
  const privateV4 =
    isIP(host) === 4 &&
    (ip[0] === 10 ||
      (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) ||
      (ip[0] === 192 && ip[1] === 168) ||
      ip[0] === 127);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !(host === "localhost" || host === "[::1]" || privateV4) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Fleet API address must be a local or private-network origin without credentials or a path.",
    );
  return url.origin;
}

async function readJson(origin: string, path: string): Promise<unknown> {
  const response = await fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok || !response.body) throw new Error("Fleet unavailable");
  const limit = 16 * 1024 * 1024;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("Response too large");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}

function snapshotDevice(device: Device, index: number, now: number) {
  const fresh = device.state === "online" || device.state === "warning";
  const latest = device.latest;
  const codes: string[] = [];
  if (
    device.state === "warning" &&
    latest?.temperatureC != null &&
    latest.temperatureC >= 70
  )
    codes.push("high_temperature");
  if (device.state === "warning" && latest?.hashrateGhs === 0)
    codes.push("zero_hashrate");
  return {
    miner: `Miner ${index + 1}`,
    status: device.state,
    warningCodes: codes,
    lastObservationAt: latest?.observedAt ?? null,
    lastSuccessfulAt: device.lastSuccessfulAt,
    readingAgeSeconds: latest ? Math.max(0, now - latest.observedAt) : null,
    hashrateThs:
      fresh && latest?.hashrateGhs != null && device.algorithm === "sha256"
        ? latest.hashrateGhs / 1000
        : null,
    powerWatts: fresh ? (latest?.powerWatts ?? null) : null,
    temperatureC: fresh ? (latest?.temperatureC ?? null) : null,
    bestDifficulty: fresh ? (latest?.bestDifficulty ?? null) : null,
    bestSessionDifficulty: fresh
      ? (latest?.bestSessionDifficulty ?? null)
      : null,
  };
}
function summarize(values: (number | null)[], total: number) {
  const available = values.filter((v): v is number => v !== null);
  return {
    value: available.length ? available.reduce((a, b) => a + b, 0) : null,
    reportingMiners: available.length,
    totalMiners: total,
    complete: total > 0 && available.length === total,
  };
}
const workspaceInput = z
  .string()
  .regex(/^Workspace [1-9]\d{0,5}$/)
  .optional()
  .describe(
    "Anonymous workspace label from list_workspaces. Required when more than one workspace exists.",
  );
const minerInput = z
  .string()
  .regex(/^Miner [1-9]\d{0,5}$/)
  .describe("Anonymous miner label from list_miners.");

export function createAgentServer(originValue?: string) {
  const origin = fleetOrigin(originValue);
  const server = new McpServer(
    { name: "bitaxe-fleet", version: "0.3.0" },
    {
      instructions:
        "Read-only, anonymous fleet monitoring. For miner or workspace questions, use Bitaxe Fleet MCP tools. Do not directly access miners, the Fleet API, database, or configuration files without the user's explicit permission. If information is unavailable through these tools, say what is missing; before any direct access, explain what you intend to access and that it may expose additional private information, then ask for permission. Permission applies only to the specific request; if declined or unanswered, do not access it. Workspace and miner labels may change when membership changes. Data are stored samples, not direct polls. Missing or stale readings are not zero. Collector health is unknown. Do not infer sensitive identifiers.",
    },
  );
  async function workspaces() {
    const result = workspaceList.parse(
      await readJson(origin, "/api/workspaces"),
    );
    const items = result.workspaces
      .sort((a, b) =>
        a.id === result.defaultWorkspaceId
          ? -1
          : b.id === result.defaultWorkspaceId
            ? 1
            : a.id.localeCompare(b.id),
      )
      .map((item, index) => ({
        ...item,
        demo: result.demo === true,
        label: `Workspace ${index + 1}`,
      }));
    const settings = await Promise.all(
      items.map(async (item) =>
        agentSettings.parse(
          await readJson(
            origin,
            `/api/settings?workspaceId=${encodeURIComponent(item.id)}`,
          ),
        ),
      ),
    );
    return items.filter((_, index) => settings[index].agentAccessEnabled);
  }
  async function select(label?: string) {
    const all = await workspaces();
    if (!all.length)
      throw new SafeError(
        "Agent access is disabled. Enable it in workspace settings.",
      );
    if (!label && all.length !== 1)
      throw new SafeError("Choose a workspace using list_workspaces.");
    const selected = label ? all.find((item) => item.label === label) : all[0];
    if (!selected)
      throw new SafeError("Workspace not found. Call list_workspaces again.");
    return selected;
  }
  async function fleet(label?: string) {
    const ws = await select(label);
    const data = fleetSchema.parse(
      await readJson(
        origin,
        `/api/fleet?workspaceId=${encodeURIComponent(ws.id)}`,
      ),
    );
    const devices = [...data.devices]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((device, index) => snapshotDevice(device, index, data.generatedAt));
    return { ws, data, devices };
  }
  const register = <T extends z.ZodType & StandardSchemaWithJSON>(
    name: string,
    description: string,
    schema: T,
    handler: (input: z.infer<T>) => Promise<unknown>,
  ) => {
    const registerTool = server.registerTool.bind(server) as unknown as (
      name: string,
      config: {
        description: string;
        inputSchema: StandardSchemaWithJSON;
        annotations: {
          readOnlyHint: boolean;
          destructiveHint: boolean;
          openWorldHint: boolean;
        };
      },
      callback: (input: unknown) => Promise<{
        isError?: boolean;
        content: { type: "text"; text: string }[];
      }>,
    ) => void;
    registerTool(
      name,
      {
        description,
        inputSchema: schema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (input) => {
        try {
          const value = await handler(input as z.infer<T>);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(value) }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text:
                  error instanceof SafeError
                    ? error.message
                    : "Fleet data unavailable. Check the Fleet service and adapter configuration.",
              },
            ],
          };
        }
      },
    );
  };
  register(
    "list_workspaces",
    "List anonymous workspace labels and miner counts. Labels may change when workspaces are added or removed.",
    z.object({}),
    async () => {
      const items = await workspaces();
      return {
        demo: items[0]?.demo ?? false,
        workspaces: items.map((item) => ({
          workspace: item.label,
          minerCount: item.minerCount,
        })),
      };
    },
  );
  register(
    "list_miners",
    "List anonymous miner status and fresh measurements, including miner-reported all-time and session-best share difficulties. Labels may change when membership changes.",
    z.object({ workspace: workspaceInput }),
    async ({ workspace }) => {
      const { ws, data, devices } = await fleet(workspace);
      return {
        workspace: ws.label,
        generatedAt: data.generatedAt,
        demo: data.demo === true,
        collectorHealth: "unknown",
        miners: devices,
      };
    },
  );
  register(
    "get_miner_status",
    "Get one anonymous miner's status and fresh measurements, including miner-reported all-time and session-best share difficulties. Use list_miners to find its label.",
    z.object({ workspace: workspaceInput, miner: minerInput }),
    async ({ workspace, miner }) => {
      const { ws, data, devices } = await fleet(workspace);
      const item = devices.find((d) => d.miner === miner);
      if (!item)
        throw new SafeError("Miner not found. Call list_miners again.");
      return {
        workspace: ws.label,
        generatedAt: data.generatedAt,
        demo: data.demo === true,
        collectorHealth: "unknown",
        miner: item,
      };
    },
  );
  register(
    "get_fleet_summary",
    "Get current fleet totals with coverage, status counts and freshness. Does not trigger miner polls.",
    z.object({ workspace: workspaceInput }),
    async ({ workspace }) => {
      const { ws, data, devices } = await fleet(workspace);
      const paired = devices.filter(
        (d) => d.hashrateThs !== null && d.powerWatts !== null,
      );
      const pairedHash = paired.reduce((sum, d) => sum + d.hashrateThs!, 0);
      return {
        workspace: ws.label,
        generatedAt: data.generatedAt,
        demo: data.demo === true,
        collectorHealth: "unknown",
        pollIntervalSeconds: data.pollIntervalSeconds,
        staleAfterSeconds: data.staleAfterSeconds,
        statusCounts: {
          online: devices.filter((d) => d.status === "online").length,
          warning: devices.filter((d) => d.status === "warning").length,
          offline: devices.filter((d) => d.status === "offline").length,
          stale: devices.filter((d) => d.status === "stale").length,
          unknown: devices.filter((d) => d.status === "unknown").length,
        },
        hashrateThs: summarize(
          devices.map((d) => d.hashrateThs),
          devices.length,
        ),
        powerWatts: summarize(
          devices.map((d) => d.powerWatts),
          devices.length,
        ),
        efficiencyJTh: {
          value:
            pairedHash > 0
              ? paired.reduce((sum, d) => sum + d.powerWatts!, 0) / pairedHash
              : null,
          reportingMiners: paired.length,
          totalMiners: devices.length,
          complete: devices.length > 0 && paired.length === devices.length,
        },
        newestReadingAgeSeconds: devices
          .filter((d) => d.hashrateThs !== null || d.powerWatts !== null)
          .reduce<number | null>(
            (age, d) =>
              d.readingAgeSeconds === null
                ? age
                : age === null
                  ? d.readingAgeSeconds
                  : Math.min(age, d.readingAgeSeconds),
            null,
          ),
        oldestReadingAgeSeconds: devices
          .filter((d) => d.hashrateThs !== null || d.powerWatts !== null)
          .reduce<number | null>(
            (age, d) =>
              d.readingAgeSeconds === null
                ? age
                : age === null
                  ? d.readingAgeSeconds
                  : Math.max(age, d.readingAgeSeconds),
            null,
          ),
      };
    },
  );
  register(
    "get_fleet_trends",
    "Get recorded fleet trend samples. Nulls represent missing or incomplete readings; retention may be shorter than the requested window.",
    z.object({
      workspace: workspaceInput,
      range: z.enum(["collection", "1h", "24h", "7d"]),
    }),
    async ({ workspace, range }) => {
      const ws = await select(workspace);
      const query =
        range === "collection"
          ? "range=collection"
          : `hours=${range === "1h" ? 1 : range === "24h" ? 24 : 168}`;
      const data = trendsSchema.parse(
        await readJson(
          origin,
          `/api/fleet/trends?workspaceId=${encodeURIComponent(ws.id)}&${query}`,
        ),
      );
      return {
        workspace: ws.label,
        demo: ws.demo,
        generatedAt: data.generatedAt,
        requestedRange: range,
        hours: data.hours,
        bucketSeconds: data.bucketSeconds,
        ...(data.windowSeconds === undefined
          ? {}
          : { windowSeconds: data.windowSeconds }),
        historyMayBeIncomplete: true,
        points: data.fleet,
      };
    },
  );
  return server;
}
class SafeError extends Error {}
