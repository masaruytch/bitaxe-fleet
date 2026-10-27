import type { MinerCompatibility } from "./compatibility.js";
export type DeviceState =
  "online" | "warning" | "offline" | "stale" | "unknown";
export type MiningCoin = "BTC" | "BCH" | "DGB";
export interface MinerAppearance {
  coin: MiningCoin | null;
  icon: MiningCoin | null;
  customIcon: string | null;
}
export interface Observation {
  observedAt: number;
  online: boolean;
  hashrateGhs: number | null;
  powerWatts: number | null;
  temperatureC: number | null;
  bestDifficulty: number | null;
  bestSessionDifficulty?: number | null;
  accepted: number | null;
  rejected: number | null;
  uptimeSeconds: number | null;
  firmware: string | null;
  pool: string | null;
  poolPort?: number | null;
  poolUser?: string | null;
  poolMode?: string | null;
  error: string | null;
}
export interface Workspace {
  id: string;
  name: string;
  minerCount: number;
  temperatureUnit: "C" | "F";
}
export interface WorkspacesResponse {
  workspaces: Workspace[];
  defaultWorkspaceId: string;
  demo: boolean;
}
export interface Device {
  id: string;
  name: string;
  ip: string;
  algorithm: string;
  workspaceId?: string;
  coin?: string | null;
  icon?: string | null;
  customIcon?: string | null;
  warningReasons?: string[];
  state: DeviceState;
  latest: Observation | null;
  lastSuccessfulAt: number | null;
}
export interface FleetResponse {
  workspaceId?: string;
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

export interface DeviceTrendsResponse {
  deviceId: string;
  hours: number;
  generatedAt: number;
  windowSeconds?: number;
  bucketSeconds?: number;
  truncated: boolean;
  points: {
    at: number;
    hash: number | null;
    temp: number | null;
    power: number | null;
  }[];
}

export interface TrendPoint {
  at: number;
  hashrateThs: number | null;
  powerWatts: number | null;
  temperatureC: number | null;
  efficiencyJth: number | null;
}
export interface FleetTrendsResponse {
  windowSeconds?: number;
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
  existingDevice: {
    id: string;
    name: string;
    ip: string;
    workspaceId?: string;
    workspaceName?: string;
  } | null;
}
