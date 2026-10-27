import { temperature, type TemperatureUnit } from "./temperature";
import { Activity, Thermometer, Zap } from "lucide-react";
import type { DeviceTrendsResponse } from "../../../shared/contracts";
import { TrendChart } from "./FleetTrends";
export function DeviceHistory({
  points,
  hours,
  windowSeconds,
  generatedAt,
  temperatureUnit,
}: {
  points: DeviceTrendsResponse["points"];
  hours: number;
  windowSeconds?: number;
  generatedAt: number;
  temperatureUnit: TemperatureUnit;
}) {
  const rows = points.map((point) => ({
    at: point.at,
    hash: point.hash,
    temp: temperature(point.temp, temperatureUnit),
    power: point.power,
  }));
  return (
    <div className="device-history">
      {[
        {
          key: "hash",
          title: "Hashrate",
          unit: "TH/s",
          icon: <Activity size={17} />,
          color: "var(--chart-1, #a59afa)",
        },
        {
          key: "temp",
          title: "Chip temperature",
          unit: `°${temperatureUnit}`,
          icon: <Thermometer size={17} />,
          color: "var(--chart-3, #efbc77)",
        },
        {
          key: "power",
          title: "Power",
          unit: "W",
          icon: <Zap size={17} />,
          color: "var(--chart-2, #6fcbbd)",
        },
      ].map((metric) => (
        <TrendChart
          key={metric.key}
          title={metric.title}
          subtitle={
            windowSeconds
              ? "Recent collection intervals"
              : `Last ${hours === 168 ? "7 days" : `${hours} ${hours === 1 ? "hour" : "hours"}`}`
          }
          unit={metric.unit}
          icon={metric.icon}
          rows={rows}
          series={[
            { key: metric.key, name: metric.title, color: metric.color },
          ]}
          hours={hours}
          windowSeconds={windowSeconds}
          generatedAt={generatedAt}
        />
      ))}
    </div>
  );
}
