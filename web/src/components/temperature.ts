import { useSyncExternalStore } from "react";
export type TemperatureUnit = "C" | "F";
const key = "bitaxe-fleet-temperature-unit";
const eventName = "fleet-temperature-unit-change";
let fallback: TemperatureUnit = "C";
let memoryOnly = false;
function snapshot(): TemperatureUnit {
  if (memoryOnly) return fallback;
  try {
    return localStorage.getItem(key) === "F" ? "F" : "C";
  } catch {
    memoryOnly = true;
    return fallback;
  }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(eventName, listener);
  };
}
export function useTemperatureUnit() {
  const unit = useSyncExternalStore(subscribe, snapshot, () => "C" as const);
  function setUnit(next: TemperatureUnit) {
    fallback = next;
    try {
      localStorage.setItem(key, next);
    } catch {
      memoryOnly = true;
      /* Keep the control usable without browser storage. */
    }
    window.dispatchEvent(new Event(eventName));
  }
  return [unit, setUnit] as const;
}
export function temperature(
  value: number | null | undefined,
  unit: TemperatureUnit,
): number | null {
  return value == null ? null : unit === "F" ? (value * 9) / 5 + 32 : value;
}
