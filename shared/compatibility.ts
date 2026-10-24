export type CompatibilityStatus = "tested" | "unverified";
export interface MinerCompatibility {
  status: CompatibilityStatus;
  label: string;
  message: string;
}
export const minerCompatibility = [
  {
    name: "Bitaxe Gamma 601",
    status: "Tested",
    detail:
      "The maintainer has tested this board with AxeOS. Firmware differences may affect available readings.",
  },
  {
    name: "Other Gamma boards",
    status: "Unverified",
    detail:
      "Other 600-series board revisions have not been tested with this dashboard.",
  },
  {
    name: "Bitaxe Max, Ultra, Supra, Gamma Turbo",
    status: "Unverified",
    detail:
      "AxeOS devices may expose the required telemetry, but these models have not been tested.",
  },
  {
    name: "Other AxeOS-based miners",
    status: "Unverified",
    detail:
      "Successful connection checks confirm the required API fields, not complete hardware or firmware compatibility.",
  },
  {
    name: "Other firmware or USB-only miners",
    status: "Not supported",
    detail:
      "A compatible AxeOS monitoring API reachable at a private IPv4 address is required.",
  },
] as const;
export function identifyCompatibility(raw: unknown): MinerCompatibility {
  const info = raw as Record<string, unknown> | null;
  const board =
    typeof info?.boardVersion === "string" ||
    typeof info?.boardVersion === "number"
      ? String(info.boardVersion).trim()
      : "";
  const asic =
    typeof info?.ASICModel === "string"
      ? info.ASICModel.trim().toUpperCase()
      : "";
  if (board === "601" && asic === "BM1370")
    return {
      status: "tested",
      label: "Matches tested model: Bitaxe Gamma 601",
      message:
        "This is the board model tested by the maintainer. Available readings can still vary with AxeOS firmware.",
    };
  return {
    status: "unverified",
    label: "Model compatibility not yet verified",
    message:
      "The required AxeOS telemetry was detected, but this board and firmware combination has not been tested by the maintainer.",
  };
}
