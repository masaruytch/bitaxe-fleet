export type TrendRange = "collection" | 1 | 24 | 168;
export function trendRanges(pollIntervalSeconds: number) {
  return [
    ["collection", `${pollIntervalSeconds} sec`],
    [1, "1 hour"],
    [24, "24 hours"],
    [168, "7 days"],
  ] as const;
}
