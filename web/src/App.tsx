import {
  SensitiveValue,
  PrivateConnectionDetails,
  PrivacyToggle,
  usePrivacy,
  deviceField,
} from "./components/Privacy";
import { temperature, useTemperatureUnit } from "./components/temperature";
import { DeviceIcon } from "./components/DeviceIcon";
import { DeviceAppearance } from "./components/DeviceAppearance";
import { formatDifficulty } from "../../shared/difficulty";
import { lazy, Suspense, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import type {
  Device,
  FleetResponse,
  HistoryResponse,
} from "../../shared/contracts";
import { NicknameDialog, SettingsDialog } from "./components/FleetPreferences";
import { CreateFleetWizard } from "./components/CreateFleetWizard";
import { ThemeToggle } from "./components/ThemeToggle";
import { CompatibilityPage } from "./components/Compatibility";
import { AddMinerDialog } from "./components/AddMinerDialog";
import { Button } from "./components/ui/button";
const FleetTrends = lazy(() =>
  import("./components/FleetTrends").then((module) => ({
    default: module.FleetTrends,
  })),
);
const DeviceHistory = lazy(() =>
  import("./components/DeviceHistory").then((module) => ({
    default: module.DeviceHistory,
  })),
);
function uptime(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes / 60) % 24}h ${minutes % 60}m`;
}
function poolLabel(mode: string | null | undefined) {
  return mode === "fallback"
    ? "Active fallback"
    : mode === "primary"
      ? "Active primary"
      : "Configured primary · active pool unconfirmed";
}
async function request<T>(path: string): Promise<T> {
  const result = await fetch(path);
  if (!result.ok)
    throw new Error(
      `Request failed (${result.status}). Check the API connection and try again.`,
    );
  return result.json() as Promise<T>;
}
const useFleet = () =>
  useQuery({
    queryKey: ["fleet"],
    queryFn: () => request<FleetResponse>("/api/fleet"),
    refetchInterval: 15000,
  });
const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
const timestamp = (at: number | null | undefined) =>
  at ? new Date(at * 1000).toLocaleString() : "No observation yet";
const stateLabel = {
  online: "Online",
  warning: "Needs attention",
  offline: "Offline",
  stale: "Stale",
  unknown: "Awaiting data",
};
function StateBadge({ device }: { device: Device }) {
  const privacy = usePrivacy();
  return (
    <span
      className={`state state-${device.state}`}
      title={
        !device.latest?.online && privacy.anyHidden
          ? "Connection details hidden"
          : device.warningReasons?.join(" ")
      }
    >
      <span />
      {stateLabel[device.state]}
    </span>
  );
}
function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  const privacy = usePrivacy();
  return (
    <div className="empty error" role="alert">
      <WifiOff size={25} />
      <h2>Couldn’t load telemetry</h2>
      <p>
        {privacy.anyHidden
          ? "Could not load readings. Details hidden for privacy."
          : message}
      </p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
function DeviceDialog({
  device,
  demo = false,
}: {
  device: Device;
  demo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(24);
  const [temperatureUnit] = useTemperatureUnit();
  const privacy = usePrivacy();
  const displayName = privacy.text(
    deviceField(device.id, "name"),
    device.name,
    "Hidden miner",
  );
  const history = useQuery({
    queryKey: ["history", device.id],
    queryFn: () =>
      request<HistoryResponse>(
        `/api/miners/${encodeURIComponent(device.id)}/history?hours=24`,
      ),
    enabled: open,
    refetchInterval: open ? 15000 : false,
  });
  const latest = device.latest;
  const points = history.data?.observations ?? [];
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Inspect ${displayName}`}>
          Inspect <ArrowUpRight size={14} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content inspect-dialog">
          <div className="dialog-top">
            <div className="inspect-device-heading">
              <DeviceIcon device={device} />
              <div>
                <span className="eyebrow">DEVICE TELEMETRY</span>
                <Dialog.Title>
                  <SensitiveValue
                    fieldKey={deviceField(device.id, "name")}
                    value={device.name}
                    label="miner name"
                    hiddenText="Hidden miner"
                  />
                </Dialog.Title>
              </div>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Close device details">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description>
            <SensitiveValue
              fieldKey={deviceField(device.id, "ip")}
              value={device.ip}
              label="IP address"
            />{" "}
            · {device.coin ?? "Coin unassigned"} · SHA-256 · Latest observation{" "}
            {timestamp(latest?.observedAt)}
          </Dialog.Description>
          <StateBadge device={device} />
          {!!device.warningReasons?.length && (
            <ul className="device-reasons" aria-label="Device status details">
              {device.warningReasons.map((reason) => (
                <li key={reason}>
                  {device.latest?.online ? (
                    reason
                  ) : (
                    <PrivateConnectionDetails id={device.id} value={reason} />
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="detail-metrics">
            <div>
              <span>Hashrate</span>
              <strong>
                {number(
                  latest?.hashrateGhs == null
                    ? null
                    : latest.hashrateGhs / 1000,
                  2,
                )}{" "}
                <small>TH/s</small>
              </strong>
            </div>
            <div>
              <span>Temperature</span>
              <strong>
                {number(temperature(latest?.temperatureC, temperatureUnit), 1)}{" "}
                <small>°{temperatureUnit}</small>
              </strong>
            </div>
            <div>
              <span>Power</span>
              <strong>
                {number(latest?.powerWatts, 1)} <small>W</small>
              </strong>
            </div>
            <div title="Best difficulty since the miner last booted, reported by AxeOS">
              <span>Best Difficulty (since boot)</span>
              <strong>{formatDifficulty(latest?.bestSessionDifficulty)}</strong>
            </div>
          </div>
          <div className="history-heading">
            <h3>Device history</h3>
            <div role="group" aria-label="History time range">
              {[1, 6, 24].map((range) => (
                <Button
                  key={range}
                  size="sm"
                  variant={hours === range ? "default" : "ghost"}
                  aria-pressed={hours === range}
                  onClick={() => setHours(range)}
                >
                  {range}h
                </Button>
              ))}
            </div>
          </div>
          {history.isPending ? (
            <p role="status">Loading history…</p>
          ) : history.isError ? (
            <ErrorState
              message={history.error.message}
              retry={() => {
                void history.refetch();
              }}
            />
          ) : points.length ? (
            <>
              <Suspense fallback={<p role="status">Loading charts…</p>}>
                <DeviceHistory
                  samples={points}
                  hours={hours}
                  temperatureUnit={temperatureUnit}
                />
              </Suspense>
              <p className="muted">
                {
                  points.filter(
                    (p) => p.observedAt >= Date.now() / 1000 - hours * 3600,
                  ).length
                }{" "}
                observations ·{" "}
                {
                  points.filter(
                    (p) =>
                      !p.online &&
                      p.observedAt >= Date.now() / 1000 - hours * 3600,
                  ).length
                }{" "}
                failed polls · gaps indicate unavailable readings.
              </p>
            </>
          ) : (
            <div className="empty compact">
              No observations in the last 24 hours.
            </div>
          )}
          <dl className="detail-list">
            <div>
              <dt>Stratum host</dt>
              <dd>
                <SensitiveValue
                  fieldKey={deviceField(device.id, "pool")}
                  value={latest?.pool}
                  label="Stratum host"
                />
              </dd>
            </div>
            <div>
              <dt>Stratum port</dt>
              <dd>
                <SensitiveValue
                  fieldKey={deviceField(device.id, "port")}
                  value={latest?.poolPort}
                  label="Stratum port"
                />
              </dd>
            </div>
            <div>
              <dt>Stratum user / worker</dt>
              <dd>
                <SensitiveValue
                  fieldKey={deviceField(device.id, "worker")}
                  value={latest?.poolUser}
                  label="worker or wallet"
                />
              </dd>
            </div>
            <div>
              <dt>Pool selection</dt>
              <dd>
                {latest?.online ? poolLabel(latest.poolMode) : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Uptime</dt>
              <dd>
                {uptime(latest?.uptimeSeconds)}{" "}
                <small>(at latest observation)</small>
              </dd>
            </div>
            <div>
              <dt>Firmware</dt>
              <dd>{latest?.firmware ?? "—"}</dd>
            </div>
            <div>
              <dt>Last successful contact</dt>
              <dd>{timestamp(device.lastSuccessfulAt)}</dd>
            </div>
            <div>
              <dt>Accepted / rejected</dt>
              <dd>
                {number(latest?.accepted)} / {number(latest?.rejected)}
              </dd>
            </div>
          </dl>
          {!demo && !privacy.isHidden(deviceField(device.id, "ip")) && (
            <a
              className="axeos-link"
              href={`http://${device.ip.includes(":") ? `[${device.ip}]` : device.ip}/#/`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open this device in AxeOS <ArrowUpRight size={14} />
            </a>
          )}
          <p className="notice">
            <ShieldCheck size={16} /> Read-only fleet monitoring. Device
            configuration stays in AxeOS.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Overview({ devicesOnly = false }: { devicesOnly?: boolean }) {
  const fleet = useFleet();
  const privacy = usePrivacy();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  if (fleet.isPending)
    return (
      <div className="empty" role="status">
        <RefreshCw className="spinning" />
        <h2>Connecting to your fleet</h2>
        <p>Loading recorded device telemetry.</p>
      </div>
    );
  if (fleet.isError && !fleet.data)
    return (
      <ErrorState
        message={fleet.error.message}
        retry={() => {
          void fleet.refetch();
        }}
      />
    );
  const demo = fleet.data!.demo === true;
  const devices = fleet.data!.devices;
  const healthy = devices.filter(
    (d) => d.state === "online" || d.state === "warning",
  );
  const shaDevices = healthy.filter((d) => d.algorithm === "sha256");
  const hash =
    shaDevices.reduce((sum, d) => sum + (d.latest?.hashrateGhs ?? 0), 0) / 1000;
  const power = healthy.reduce(
    (sum, d) => sum + (d.latest?.powerWatts ?? 0),
    0,
  );
  const attention = devices.filter((d) => d.state !== "online");
  const latest = Math.max(0, ...devices.map((d) => d.latest?.observedAt ?? 0));
  const filtered = devices.filter(
    (d) =>
      (filter === "all" ||
        (filter === "online" ? d.state === "online" : d.state !== "online")) &&
      `${d.name} ${d.ip} ${d.latest?.pool ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            Workspace <ChevronRight size={12} />{" "}
            {devicesOnly ? "Devices" : "Overview"}
          </div>
          <h1>{devicesOnly ? "Your devices" : "Fleet overview"}</h1>
          <p>Your mining operation, at a glance.</p>
        </div>
        <div className="page-actions">
          <Button
            variant="outline"
            onClick={() => {
              void fleet.refetch();
            }}
            disabled={fleet.isFetching}
          >
            <RefreshCw
              size={15}
              className={fleet.isFetching ? "spinning" : ""}
            />
            Refresh
          </Button>
          {demo ? (
            fleet.data!.canCreateFleet && <CreateFleetWizard demo />
          ) : devices.length ? (
            <AddMinerDialog />
          ) : (
            <CreateFleetWizard />
          )}
        </div>
      </header>
      {demo && (
        <div className="demo-banner" role="status">
          <strong>Demo fleet</strong>
          <span>
            Demo readings are simulated. Create your own fleet to connect real
            miners.
          </span>
        </div>
      )}
      {fleet.isError && (
        <p className="notice warning" role="alert">
          Connection lost. Displayed data may be out of date.
        </p>
      )}
      {!devicesOnly && (
        <>
          <div className="metrics">
            <Metric
              icon={<Cpu size={17} />}
              label="Fleet hashrate"
              value={number(hash, 2)}
              unit="TH/s"
              detail="SHA-256 · fresh online devices"
            />
            <Metric
              icon={<Zap size={17} />}
              label="Power draw"
              value={number(power, 1)}
              unit="W"
              detail="Fresh online readings"
            />
            <Metric
              icon={<Server size={17} />}
              label="Devices online"
              value={`${healthy.length}`}
              unit={`/ ${devices.length}`}
              detail={`${attention.length} need attention`}
            />
            <Metric
              icon={<Gauge size={17} />}
              label="Fleet efficiency"
              value={number(hash > 0 ? power / hash : null, 2)}
              unit="J/TH"
              detail="SHA-256 power / hashrate"
            />
          </div>
          <div className="fleet-summary">
            <span className="eyebrow">FLEET STATUS</span>
            <span
              className={attention.length ? "summary-warn" : "summary-good"}
            >
              {!devices.length
                ? "Add your first miner to get started"
                : attention.length
                  ? `${attention.length} device${attention.length > 1 ? "s" : ""} to review`
                  : "All devices reporting normally"}
            </span>
            <span className="collection-time">
              <Clock3 size={13} />{" "}
              {latest
                ? `Last collection ${timestamp(latest)}`
                : "No observations yet"}
            </span>
          </div>
        </>
      )}
      {!devicesOnly && (
        <Suspense
          fallback={
            <p className="muted" role="status">
              Loading fleet charts…
            </p>
          }
        >
          <FleetTrends />
        </Suspense>
      )}
      <section className="device-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Registered devices <span>{devices.length}</span>
            </h2>
            <p>Latest telemetry, connection health, and routing.</p>
          </div>
          <span className="muted text-xs">
            Checks every {fleet.data!.pollIntervalSeconds}s · UI refreshes every
            15s
          </span>
        </div>
        <div className="table-toolbar">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Search devices"
              type={privacy.anyHidden ? "password" : "text"}
              autoComplete="off"
              placeholder="Search name, IP, or pool…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div
            className="filters"
            role="group"
            aria-label="Device status filter"
          >
            {[
              ["all", "All devices"],
              ["online", "Online"],
              ["attention", "Needs attention"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={filter === id}
                className={filter === id ? "selected" : ""}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="result-count" role="status">
            {filtered.length} of {devices.length}
          </span>
        </div>
        {!devices.length ? (
          <div className="empty">
            <Database size={28} />
            <h2>No miners added yet</h2>
            <p>
              Use Create your fleet to connect your first device and start
              collecting its history.
            </p>
          </div>
        ) : !filtered.length ? (
          <div className="empty compact">
            <Search size={24} />
            <h2>No matching devices</h2>
            <p>Try another search or change the status filter.</p>
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Device telemetry table"
          >
            <table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Status</th>
                  <th className="numeric">Hashrate</th>
                  <th className="numeric">Power</th>
                  <th className="numeric">Temp.</th>
                  <th className="numeric">Best Difficulty</th>
                  <th>Stratum host</th>
                  <th>
                    <span>Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <div className="device-name">
                        {demo ? (
                          <DeviceIcon device={device} />
                        ) : (
                          <DeviceAppearance device={device} />
                        )}
                        <div>
                          <div className="nickname-row">
                            <strong>
                              <SensitiveValue
                                fieldKey={deviceField(device.id, "name")}
                                value={device.name}
                                label="miner name"
                                hiddenText="Hidden miner"
                              />
                            </strong>
                            {!demo && <NicknameDialog device={device} />}
                          </div>
                          <span>
                            <SensitiveValue
                              fieldKey={deviceField(device.id, "ip")}
                              value={device.ip}
                              label="IP address"
                            />
                            {device.coin ? ` · ${device.coin}` : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StateBadge device={device} />
                      {!!device.warningReasons?.length && (
                        <small className="status-reason">
                          {device.latest?.online ? (
                            device.warningReasons.join(" ")
                          ) : (
                            <PrivateConnectionDetails
                              id={device.id}
                              value={device.warningReasons.join(" ")}
                            />
                          )}
                        </small>
                      )}
                    </td>
                    <td className="numeric">
                      <strong>
                        {number(
                          device.latest?.hashrateGhs == null
                            ? null
                            : device.latest.hashrateGhs / 1000,
                          2,
                        )}
                      </strong>
                      <small> TH/s</small>
                    </td>
                    <td className="numeric">
                      {number(device.latest?.powerWatts, 1)}
                      <small> W</small>
                    </td>
                    <td className="numeric">
                      <span
                        className={
                          (device.latest?.temperatureC ?? 0) >= 70 ? "hot" : ""
                        }
                      >
                        {number(device.latest?.temperatureC, 1)}
                        <small> °C</small>
                      </span>
                    </td>
                    <td
                      className="numeric"
                      title="All-time best difficulty reported by AxeOS"
                    >
                      {formatDifficulty(device.latest?.bestDifficulty)}
                    </td>
                    <td>
                      <span className="pool-host">
                        <SensitiveValue
                          fieldKey={deviceField(device.id, "pool")}
                          value={device.latest?.pool}
                          label="Stratum host"
                        />
                      </span>
                      <small className="status-reason">
                        {device.latest?.online
                          ? poolLabel(device.latest.poolMode)
                          : "Unavailable"}
                      </small>
                    </td>
                    <td>
                      <DeviceDialog device={device} demo={demo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="panel-footer">
          <span>
            <Database size={12} /> Stored history
          </span>
          <span>
            Stale after {fleet.data!.staleAfterSeconds}s without an observation
          </span>
        </div>
      </section>
    </>
  );
}
function Metric({
  icon,
  label,
  value,
  unit,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  detail: string;
}) {
  return (
    <article className="metric">
      <div className="metric-top">
        <span>{label}</span>
        {icon}
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <p>{detail}</p>
    </article>
  );
}
export function App() {
  const fleet = useFleet();
  return (
    <div className="app">
      <a href="#main" className="skip">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-symbol">
            <Cpu size={22} />
          </div>
          <div>
            Bitaxe Fleet<span>OPERATIONS WORKSPACE</span>
          </div>
        </div>
        <div className="workspace">
          <span className="workspace-avatar">M</span>
          <div>
            My mining fleet<span>AxeOS devices</span>
          </div>
          <span className="workspace-dot" />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            <LayoutDashboard size={17} />
            Overview
          </NavLink>
          <NavLink to="/devices">
            <Server size={17} />
            Devices
          </NavLink>
          <NavLink to="/compatibility">
            <ShieldCheck size={17} />
            Compatibility
          </NavLink>
        </nav>
      </aside>
      <div className="main-shell">
        <div className="topbar">
          <span>
            <span className="environment-dot" />
            FLEET MONITORING
          </span>
          <span className="topbar-right">
            <PrivacyToggle />
            <ThemeToggle />
            <span className="miner-access">
              <ShieldCheck size={14} /> Read-only miner access
            </span>
            {!fleet.data?.demo && <SettingsDialog />}
          </span>
        </div>
        <main id="main" tabIndex={-1}>
          {new URLSearchParams(window.location.search).get("setup") === "1" &&
            fleet.data &&
            !fleet.data.demo && (
              <CreateFleetWizard
                autoOpen={fleet.data.devices.length === 0}
                hideTrigger
              />
            )}
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/devices" element={<Overview devicesOnly />} />
            <Route path="/compatibility" element={<CompatibilityPage />} />
            <Route path="/system" element={<Navigate to="/" replace />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>Page not found</h1>
                  <NavLink to="/">Return to fleet overview</NavLink>
                </div>
              }
            />
          </Routes>
          <footer>
            Bitaxe Fleet <span>Built for a clear view of your operation.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
