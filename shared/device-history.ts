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

/** Average uninterrupted readings within each time bucket; nulls always break a segment. */
export function aggregateDeviceRows(
  rows: ReturnType<typeof deviceChartRows>,
  start: number,
  bucketSeconds: number,
) {
  const result: typeof rows = [];
  let segment: typeof rows = [];
  let bucket = -1;
  let mask = "";
  const flush = () => {
    if (!segment.length) return;
    const average = (key: "hash" | "temp" | "power") => {
      const values = segment
        .map((row) => row[key])
        .filter((value): value is number => value !== null);
      return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    };
    result.push({
      at: segment.at(-1)!.at,
      hash: average("hash"),
      temp: average("temp"),
      power: average("power"),
    });
    segment = [];
  };
  for (const row of rows) {
    if (row.hash === null && row.temp === null && row.power === null) {
      flush();
      result.push(row);
      bucket = -1;
      mask = "";
      continue;
    }
    const nextBucket = Math.floor((row.at - start) / bucketSeconds);
    const nextMask = `${row.hash === null}:${row.temp === null}:${row.power === null}`;
    if (segment.length && (nextBucket !== bucket || nextMask !== mask)) flush();
    bucket = nextBucket;
    mask = nextMask;
    segment.push(row);
  }
  flush();
  return result;
}
