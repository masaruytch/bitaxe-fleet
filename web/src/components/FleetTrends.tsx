import { trendRanges, type TrendRange } from "./trendRanges";
import { temperature, useTemperatureUnit } from "./temperature";
import { useWorkspace } from "./Workspaces";
import { SensitiveValue, usePrivacy, deviceField } from "./Privacy";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, RefreshCw, Thermometer, Zap, Gauge } from "lucide-react";
import type { FleetTrendsResponse } from "../../../shared/contracts";
import { Button } from "./ui/button";
const colors = [
  "var(--chart-1, #a59afa)",
  "var(--chart-2, #6fcbbd)",
  "var(--chart-3, #efbc77)",
  "var(--chart-4, #79aff5)",
  "var(--chart-5, #f293ae)",
  "var(--chart-6, #b6ce77)",
];
interface ChartSeries {
  key: string;
  name: string;
  color: string;
  privacyKey?: string;
}
interface ChartRow {
  at: number;
  [key: string]: number | null;
}
export function TrendChart({
  title,
  subtitle,
  unit,
  icon,
  rows,
  series,
  hours,
  windowSeconds,
  generatedAt,
}: {
  title: string;
  subtitle: string;
  unit: string;
  icon: React.ReactNode;
  rows: ChartRow[];
  series: ChartSeries[];
  hours: number;
  windowSeconds?: number;
  generatedAt?: number;
}) {
  const populated = rows.some((row) =>
    series.some((line) => row[line.key] != null),
  );
  const timeLabel = (at: number) =>
    new Date(at * 1000).toLocaleString(
      undefined,
      windowSeconds
        ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
        : hours > 24
          ? { month: "short", day: "numeric" }
          : { hour: "2-digit", minute: "2-digit" },
    );
  return (
    <article className="trend-card">
      <div className="trend-card-heading">
        <div className="trend-icon">{icon}</div>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <span className="chart-unit">{unit}</span>
      </div>
      {populated ? (
        <>
          <div
            className="trend-chart"
            role="img"
            aria-label={`${title} for the last ${windowSeconds ? `${windowSeconds} seconds` : `${hours} hours`}. Gaps indicate unavailable observations.`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={rows}
                margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
                accessibilityLayer
              >
                <CartesianGrid
                  stroke="var(--border-default, #2c3544)"
                  vertical={false}
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="at"
                  type="number"
                  domain={
                    windowSeconds !== undefined && generatedAt !== undefined
                      ? [generatedAt - windowSeconds, generatedAt]
                      : ["dataMin", "dataMax"]
                  }
                  tickFormatter={timeLabel}
                  tick={{ fill: "var(--text-muted, #8f9cb2)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={36}
                  tickCount={hours > 24 ? 5 : 4}
                />
                <YAxis
                  width={48}
                  domain={[0, "auto"]}
                  tick={{ fill: "var(--text-muted, #8f9cb2)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) =>
                    value.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })
                  }
                />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(Number(value) * 1000).toLocaleString()
                  }
                  formatter={(value, name) => [
                    `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`,
                    String(name),
                  ]}
                  contentStyle={{
                    background: "var(--surface-base, #192230)",
                    border: "1px solid var(--border-default, #46516a)",
                    borderRadius: 8,
                    color: "var(--text-primary, #e7ebf3)",
                    fontSize: 11,
                  }}
                  labelStyle={{
                    color: "var(--text-muted, #aab6c9)",
                    marginBottom: 8,
                  }}
                  cursor={{
                    stroke: "var(--text-muted, #64728b)",
                    strokeDasharray: "4 4",
                  }}
                />
                {series.map((line) => (
                  <Line
                    key={line.key}
                    type="linear"
                    dataKey={line.key}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={2}
                    dot={
                      windowSeconds
                        ? {
                            r: 3,
                            fill: line.color,
                            stroke: line.color,
                            strokeWidth: 0,
                          }
                        : false
                    }
                    activeDot={{
                      r: 4,
                      fill: line.color,
                      stroke: line.color,
                      strokeWidth: 2,
                    }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="trend-legend">
            {series.map((line) => (
              <span key={line.key}>
                <i style={{ background: line.color }} />
                {line.privacyKey ? (
                  <SensitiveValue
                    fieldKey={line.privacyKey}
                    value={line.name}
                    label="miner name"
                    hiddenText={line.name}
                  />
                ) : (
                  line.name
                )}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="trend-empty">
          <Activity size={22} />
          <strong>No readings for this window</strong>
          <span>New observations appear here as they are collected.</span>
        </div>
      )}
    </article>
  );
}
export function FleetTrends({
  pollIntervalSeconds,
}: {
  pollIntervalSeconds: number;
}) {
  const [temperatureUnit] = useTemperatureUnit();
  const workspace = useWorkspace();
  const privacy = usePrivacy();
  const [range, setRange] = useState<TrendRange>(24);
  const live = range === "collection";
  const result = useQuery({
    queryKey: [
      "fleet-trends",
      workspace.workspaceId,
      range,
      ...(live ? [pollIntervalSeconds] : []),
    ],
    queryFn: async (): Promise<FleetTrendsResponse> => {
      const response = await fetch(
        `/api/fleet/trends?workspaceId=${encodeURIComponent(workspace.workspaceId)}&${live ? "range=collection" : `hours=${range}`}`,
      );
      if (!response.ok) throw new Error("Could not load recorded trends.");
      return response.json();
    },
    refetchInterval: live ? 5000 : 60000,
  });
  const data = result.data;
  const hours =
    data?.hours ?? (live ? (pollIntervalSeconds * 25) / 3600 : Number(range));
  const fleetRows: ChartRow[] =
    data?.fleet.map((point) => ({ ...point })) ?? [];
  const temperatureRows: ChartRow[] =
    data?.fleet.map((point, index) =>
      Object.assign(
        { at: point.at },
        ...data.devices.map((device, i) => ({
          [`device${i}`]: temperature(
            device.points[index]?.temperatureC,
            temperatureUnit,
          ),
        })),
      ),
    ) ?? [];
  return (
    <section className="fleet-trends" aria-labelledby="fleet-trends-heading">
      <div className="trends-heading">
        <div>
          <span className="eyebrow">PERFORMANCE OVER TIME</span>
          <h2 id="fleet-trends-heading">Fleet trends</h2>
          <p>Recorded observations across your mining fleet.</p>
        </div>
        <div
          className="trend-ranges"
          role="group"
          aria-label="Trend time range"
        >
          {trendRanges(pollIntervalSeconds).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              className={range === value ? "selected" : ""}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {result.isPending ? (
        <div className="trend-loading" role="status">
          <RefreshCw className="spinning" size={17} />
          Loading recorded trends…
        </div>
      ) : result.isError ? (
        <div className="notice warning" role="alert">
          Trends are temporarily unavailable.{" "}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void result.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="trends-grid">
            <TrendChart
              title="Fleet hashrate"
              subtitle="Combined SHA-256 output"
              unit="TH/s"
              icon={<Activity size={17} />}
              rows={fleetRows}
              series={[
                { key: "hashrateThs", name: "Fleet total", color: colors[0] },
              ]}
              hours={hours}
              windowSeconds={data?.windowSeconds}
              generatedAt={data?.generatedAt}
            />
            <TrendChart
              title="Miner temperatures"
              subtitle="Compare chip temperature by device"
              unit={`°${temperatureUnit}`}
              icon={<Thermometer size={17} />}
              rows={temperatureRows}
              series={data!.devices.map((device, i) => ({
                key: `device${i}`,
                name: privacy.text(
                  deviceField(device.id, "name"),
                  device.name,
                  `Miner ${i + 1}`,
                ),
                privacyKey: deviceField(device.id, "name"),
                color: colors[i % colors.length],
              }))}
              hours={hours}
              windowSeconds={data?.windowSeconds}
              generatedAt={data?.generatedAt}
            />
            <TrendChart
              title="Power draw"
              subtitle="Combined measured device power"
              unit="W"
              icon={<Zap size={17} />}
              rows={fleetRows}
              series={[
                { key: "powerWatts", name: "Fleet total", color: colors[1] },
              ]}
              hours={hours}
              windowSeconds={data?.windowSeconds}
              generatedAt={data?.generatedAt}
            />
            <TrendChart
              title="Fleet efficiency"
              subtitle="SHA-256 power per unit of hashrate"
              unit="J/TH"
              icon={<Gauge size={17} />}
              rows={fleetRows}
              series={[
                {
                  key: "efficiencyJth",
                  name: "Lower is more efficient",
                  color: colors[2],
                },
              ]}
              hours={hours}
              windowSeconds={data?.windowSeconds}
              generatedAt={data?.generatedAt}
            />
          </div>
          <p className="trend-footnote">
            {data!.windowSeconds
              ? `${data!.fleet.length} collection intervals · ${data!.bucketSeconds} sec each · New readings appear on the right.`
              : `${data!.bucketSeconds / 60}-minute averages.`}{" "}
            Gaps indicate missing or offline readings. Fleet totals require
            readings from every registered device.
          </p>
        </>
      )}
    </section>
  );
}
