import type { MinerCompatibility } from "./compatibility.js";
export type DeviceState =
  "online" | "warning" | "offline" | "stale" | "unknown";
export interface Observation {
  observedAt: number;
  online: boolean;
  hashrateGhs: number | null;
  powerWatts: number | null;
  temperatureC: number | null;
  bestDifficulty: number | null;
  accepted: number | null;
  rejected: number | null;
  uptimeSeconds: number | null;
  firmware: string | null;
  pool: string | null;
  error: string | null;
}
export interface Device {
  id: string;
  name: string;
  ip: string;
  algorithm: string;
  state: DeviceState;
  latest: Observation | null;
  lastSuccessfulAt: number | null;
}
export interface FleetResponse {
  demo?: boolean;
  canCreateFleet?: boolean;
  devices: Device[];
  generatedAt: number;
  pollIntervalSeconds: number;
  staleAfterSeconds: number;
}
export interface HistoryResponse {
  deviceId: string;
  observations: Observation[];
}

export interface TrendPoint {
  at: number;
  hashrateThs: number | null;
  powerWatts: number | null;
  temperatureC: number | null;
  efficiencyJth: number | null;
}
export interface FleetTrendsResponse {
  hours: number;
  bucketSeconds: number;
  generatedAt: number;
  fleet: TrendPoint[];
  devices: {
    id: string;
    name: string;
    algorithm: string;
    points: TrendPoint[];
  }[];
}

export interface MinerProbeResponse {
  compatibility?: MinerCompatibility;
  boardVersion?: string | null;
  probeToken: string | null;
  ip: string;
  hostname: string | null;
  model: string;
  macAddress: string;
  firmware: string | null;
  observation: Observation;
  existingDevice: { id: string; name: string; ip: string } | null;
}
