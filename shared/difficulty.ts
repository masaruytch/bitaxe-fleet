/** AxeOS versions report bestDiff as either an absolute number or a suffixed string. */
export function parseDifficulty(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const match = value
    .trim()
    .match(/^(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*([kmgtpe]?)$/i);
  if (!match) return null;
  const multiplier = {
    "": 1,
    k: 1e3,
    m: 1e6,
    g: 1e9,
    t: 1e12,
    p: 1e15,
    e: 1e18,
  }[match[2].toLowerCase()]!;
  const result = Number(match[1]) * multiplier;
  return Number.isFinite(result) ? result : null;
}
export function formatDifficulty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  const units = [
    [1e18, "E"],
    [1e15, "P"],
    [1e12, "T"],
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const;
  const unit = units.find(([scale]) => value >= scale);
  return unit
    ? `${(value / unit[0]).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit[1]}`
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
