import { useWorkspace } from "./Workspaces";
export type TemperatureUnit = "C" | "F";
export function useTemperatureUnit() {
  const workspace = useWorkspace();
  return [workspace.active?.temperatureUnit ?? "C"] as const;
}
export function temperature(
  value: number | null | undefined,
  unit: TemperatureUnit,
): number | null {
  return value == null ? null : unit === "F" ? (value * 9) / 5 + 32 : value;
}
