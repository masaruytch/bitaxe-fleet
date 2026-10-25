import type { Observation } from "./contracts.js";
/** Explicit null rows break lines across failed polls and unobserved periods. */
export function deviceChartRows(
  samples: Observation[],
  start: number,
  end: number,
) {
  const intervals = samples
    .slice(1)
    .map((point, i) => point.observedAt - samples[i].observedAt)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const maxGap = Math.max(
    180,
    (intervals[Math.floor(intervals.length / 2)] ?? 60) * 1.8,
  );
  const empty = (at: number) => ({
    at,
    hash: null as number | null,
    temp: null as number | null,
    power: null as number | null,
  });
  const rows = [empty(start)];
  let previous: number | null = null;
  for (const point of samples) {
    if (point.observedAt < start || point.observedAt > end) continue;
    if (previous !== null && point.observedAt - previous > maxGap)
      rows.push(empty(previous + 1));
    rows.push({
      at: point.observedAt,
      hash:
        point.online && point.hashrateGhs !== null
          ? point.hashrateGhs / 1000
          : null,
      temp: point.online ? point.temperatureC : null,
      power: point.online ? point.powerWatts : null,
    });
    previous = point.observedAt;
  }
  rows.push(empty(end));
  return rows;
}
