import { requireWorkspace } from "./workspaces.js";
import { identifyCompatibility } from "../shared/compatibility.js";
import { randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { eq, or } from "drizzle-orm";
import type { AppDatabase } from "./database.js";
import type { MinerProbeResponse, Observation } from "../shared/contracts.js";
import { miners } from "./schema.js";
import { normalizeTelemetry } from "./telemetry.js";
import { saveObservation } from "./store.js";

export function registrationError(
  message: string,
  statusCode: number,
): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
export function validateMinerIp(value: string): string {
  const ip = value.trim();
  const octets = ip.split(".").map(Number);
  if (
    isIP(ip) !== 4 ||
    !(
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    )
  ) {
    throw registrationError(
      "Enter a private IPv4 address, such as 192.168.10.40. URLs, ports, and hostnames are not supported.",
      400,
    );
  }
  return ip;
}
export function minerIdentity(raw: unknown) {
  const info = raw as Record<string, unknown> | null;
  const sourceMac = typeof info?.macAddr === "string" ? info.macAddr : "";
  const mac = sourceMac.replace(/[:-]/g, "").toLowerCase();
  const model =
    typeof info?.ASICModel === "string"
      ? info.ASICModel.trim().slice(0, 64)
      : null;
  const hostname =
    typeof info?.hostname === "string"
      ? info.hostname.trim().slice(0, 64)
      : null;
  return {
    macAddress:
      /^[0-9a-f]{12}$/.test(mac) &&
      mac !== "000000000000" &&
      mac !== "ffffffffffff"
        ? mac.match(/.{2}/g)!.join(":")
        : null,
    model,
    hostname,
  };
}
// Bound the response as well as the request duration. Only the AxeOS info endpoint is read.
export async function readMinerInfo(
  ip: string,
  timeoutMs: number,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(`http://${ip}/api/system/info`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
  } catch {
    throw registrationError(
      "Could not reach this miner. Check its IP address and network connection, then try again.",
      502,
    );
  }
  if (!response.ok)
    throw registrationError(
      `The device returned HTTP ${response.status}. Check that AxeOS is available at this address.`,
      502,
    );
  const reader = response.body?.getReader();
  if (!reader)
    throw registrationError("This device returned an empty response.", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 131072) {
        await reader.cancel();
        throw registrationError(
          "This address did not return a supported AxeOS response.",
          422,
        );
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    throw registrationError(
      "This address did not return a valid AxeOS response. Check the address and try again.",
      422,
    );
  } finally {
    reader.releaseLock();
  }
}
export function createMinerRegistration(
  store: AppDatabase,
  options: { timeoutMs: number; fetcher?: typeof fetch; now?: () => number },
) {
  type Verified = {
    ip: string;
    macAddress: string;
    model: string;
    hostname: string | null;
    observation: Observation;
    expiresAt: number;
  };
  const verified = new Map<string, Verified>();
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  function existing(ip: string, mac: string) {
    return (
      store.db
        .select({
          id: miners.id,
          name: miners.name,
          ip: miners.ip,
          workspaceId: miners.workspaceId,
        })
        .from(miners)
        .where(or(eq(miners.ip, ip), eq(miners.macAddress, mac)))
        .get() ?? null
    );
  }
  return {
    async probe(input: string): Promise<MinerProbeResponse> {
      const ip = validateMinerIp(input);
      const raw = await readMinerInfo(ip, options.timeoutMs, options.fetcher);
      let observation: Observation;
      try {
        observation = normalizeTelemetry(raw, now());
      } catch {
        throw registrationError(
          "The device is not returning supported AxeOS telemetry.",
          422,
        );
      }
      const identity = minerIdentity(raw);
      if (!identity.macAddress || !identity.model)
        throw registrationError(
          "Could not identify a supported Bitaxe device at this address.",
          422,
        );
      const duplicate = existing(ip, identity.macAddress);
      for (const [token, item] of verified)
        if (item.expiresAt <= now()) verified.delete(token);
      let token: string | null = null;
      if (!duplicate) {
        if (verified.size >= 100)
          verified.delete(verified.keys().next().value!);
        token = randomBytes(32).toString("hex");
        verified.set(token, {
          ip,
          macAddress: identity.macAddress,
          model: identity.model,
          hostname: identity.hostname,
          observation,
          expiresAt: now() + 120,
        });
      }
      return {
        compatibility: identifyCompatibility(raw),
        boardVersion:
          typeof (raw as Record<string, unknown>).boardVersion === "string" ||
          typeof (raw as Record<string, unknown>).boardVersion === "number"
            ? String((raw as Record<string, unknown>).boardVersion).slice(0, 64)
            : null,
        probeToken: token,
        ip,
        hostname: identity.hostname,
        model: identity.model,
        macAddress: identity.macAddress,
        firmware: observation.firmware,
        observation,
        existingDevice: duplicate
          ? {
              ...duplicate,
              workspaceName: requireWorkspace(store, duplicate.workspaceId)
                .name,
            }
          : null,
      };
    },
    add(token: string, name?: string, workspaceId = "default") {
      const info = verified.get(token);
      if (!info || info.expiresAt <= now()) {
        verified.delete(token);
        throw registrationError(
          "The connection check expired. Check the miner again before adding it.",
          409,
        );
      }
      const displayName = name?.trim() || info.hostname || `Bitaxe ${info.ip}`;
      if (displayName.length > 64 || /[\u0000-\u001f\u007f]/.test(displayName))
        throw registrationError(
          "Use a name of up to 64 characters without control characters.",
          400,
        );
      const id = `miner-${randomUUID()}`;
      store.sqlite
        .transaction(() => {
          requireWorkspace(store, workspaceId);
          const duplicate = existing(info.ip, info.macAddress);
          if (duplicate)
            throw registrationError(
              `This miner is already registered as ${duplicate.name} at ${duplicate.ip}.`,
              409,
            );
          store.db
            .insert(miners)
            .values({
              id,
              name: displayName,
              workspaceId,
              ip: info.ip,
              algorithm: "sha256",
              registeredAt: now(),
              macAddress: info.macAddress,
              hostname: info.hostname,
              model: info.model,
            })
            .run();
          saveObservation(store, id, info.observation);
        })
        .immediate();
      verified.delete(token);
      return { id, name: displayName, ip: info.ip, workspaceId };
    },
  };
}
