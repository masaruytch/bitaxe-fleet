import { temperature, type TemperatureUnit } from "./temperature";
import { Activity, Thermometer, Zap } from "lucide-react";
import type { Observation } from "../../../shared/contracts";
import { deviceChartRows } from "../../../shared/device-history";
import { TrendChart } from "./FleetTrends";
export function DeviceHistory({
  samples,
  hours,
  temperatureUnit,
}: {
  samples: Observation[];
  hours: number;
  temperatureUnit: TemperatureUnit;
}) {
  const end = Math.floor(Date.now() / 1000);
  const rows = deviceChartRows(samples, end - hours * 3600, end).map((row) => ({
    ...row,
    temp: temperature(row.temp, temperatureUnit),
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
          subtitle={`Last ${hours} hours`}
          unit={metric.unit}
          icon={metric.icon}
          rows={rows}
          series={[
            { key: metric.key, name: metric.title, color: metric.color },
          ]}
          hours={hours}
        />
      ))}
    </div>
  );
}
