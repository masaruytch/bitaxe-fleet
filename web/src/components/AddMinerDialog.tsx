import { SensitiveValue, usePrivacy, deviceField } from "./Privacy";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Cpu, Plus, RefreshCw, X } from "lucide-react";
import type { MinerProbeResponse } from "../../../shared/contracts";
import { Button } from "./ui/button";
export interface AddedMiner {
  id: string;
  name: string;
  ip: string;
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Fleet-Request": "1" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "The request failed. Please try again.");
  return result as T;
}
export function MinerRegistrationForm({
  onAdded,
  onCancel,
  onBusyChange,
}: {
  onAdded: (miner: AddedMiner) => void;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const privacy = usePrivacy();
  const client = useQueryClient();
  const [ip, setIp] = useState(""),
    [name, setName] = useState(""),
    [probe, setProbe] = useState<MinerProbeResponse | null>(null),
    [checking, setChecking] = useState(false),
    [adding, setAdding] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function check(event: React.FormEvent) {
    event.preventDefault();
    setChecking(true);
    setError("");
    setProbe(null);
    const attempt = ++generation.current;
    try {
      const result = await post<MinerProbeResponse>("/api/miners/probe", {
        ip: ip.trim(),
      });
      if (attempt !== generation.current) return;
      setProbe(result);
      setName(result.hostname ?? "");
    } catch (error) {
      if (attempt === generation.current)
        setError(
          error instanceof Error ? error.message : "Connection check failed.",
        );
    } finally {
      if (attempt === generation.current) setChecking(false);
    }
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!probe?.probeToken || adding) return;
    setAdding(true);
    onBusyChange?.(true);
    setError("");
    try {
      const device = await post<AddedMiner>("/api/miners", {
        probeToken: probe.probeToken,
        name: name.trim(),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["fleet"] }),
        client.invalidateQueries({ queryKey: ["fleet-trends"] }),
      ]);
      onAdded(device);
      setProbe(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not add this miner.",
      );
    } finally {
      setAdding(false);
      onBusyChange?.(false);
    }
  }
  if (privacy.all)
    return (
      <div className="notice">
        <p>Turn off Screenshot privacy before connecting a miner.</p>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  return (
    <>
      {!probe ? (
        <form onSubmit={check} className="add-miner-form">
          <label htmlFor="miner-ip">IP address</label>
          <input
            id="miner-ip"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="192.168.10.40"
            value={ip}
            onChange={(event) => {
              setIp(event.target.value);
              setError("");
            }}
            maxLength={15}
            required
            disabled={checking}
            aria-describedby="miner-ip-help"
          />
          <p id="miner-ip-help">
            Use the private IPv4 address shown in AxeOS or your router.
          </p>
          {error && (
            <div className="notice warning" role="alert">
              {privacy.anyHidden
                ? "Request failed. Details hidden for privacy."
                : error}
            </div>
          )}
          <div className="dialog-actions">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={checking || !ip.trim()}>
              {checking ? (
                <RefreshCw className="spinning" size={15} />
              ) : (
                <Cpu size={15} />
              )}{" "}
              {checking ? "Checking device…" : "Check connection"}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={add} className="add-miner-form">
          <div className="detected-device">
            <CheckCircle2 size={19} />
            <div>
              <strong>AxeOS device detected</strong>
              <span>
                <SensitiveValue
                  fieldKey="registration:ip"
                  value={probe.ip}
                  label="IP address"
                />
              </span>
            </div>
          </div>
          {probe.compatibility && (
            <div
              className={`compatibility-note ${probe.compatibility.status}`}
              role="status"
            >
              <strong>{probe.compatibility.label}</strong>
              <p>{probe.compatibility.message}</p>
            </div>
          )}
          <dl className="detail-list">
            <div>
              <dt>Board revision</dt>
              <dd>{probe.boardVersion ?? "Not reported"}</dd>
            </div>
            <div>
              <dt>Hostname</dt>
              <dd>
                <SensitiveValue
                  fieldKey="registration:hostname"
                  value={probe.hostname}
                  label="hostname"
                />
              </dd>
            </div>
            <div>
              <dt>ASIC model</dt>
              <dd>{probe.model}</dd>
            </div>
            <div>
              <dt>Firmware</dt>
              <dd>{probe.firmware ?? "Not reported"}</dd>
            </div>
            <div>
              <dt>Hardware address</dt>
              <dd>
                <SensitiveValue
                  fieldKey="registration:mac"
                  value={probe.macAddress}
                  label="MAC address"
                />
              </dd>
            </div>
            <div>
              <dt>Current hashrate</dt>
              <dd>
                {((probe.observation.hashrateGhs ?? 0) / 1000).toFixed(2)} TH/s
              </dd>
            </div>
            <div>
              <dt>Temperature / power</dt>
              <dd>
                {probe.observation.temperatureC?.toFixed(1)} °C /{" "}
                {probe.observation.powerWatts?.toFixed(1)} W
              </dd>
            </div>
          </dl>
          {probe.existingDevice ? (
            <div className="notice" role="status">
              Already in your fleet as{" "}
              <SensitiveValue
                fieldKey={deviceField(probe.existingDevice.id, "name")}
                value={probe.existingDevice.name}
                label="miner name"
              />{" "}
              (
              <SensitiveValue
                fieldKey={deviceField(probe.existingDevice.id, "ip")}
                value={probe.existingDevice.ip}
                label="IP address"
              />
              ). No duplicate was added.
            </div>
          ) : (
            <>
              <label htmlFor="miner-name">
                Friendly name <span className="muted">(optional)</span>
              </label>
              <input
                id="miner-name"
                type={
                  privacy.isHidden("registration:hostname")
                    ? "password"
                    : "text"
                }
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={64}
                placeholder="Office Gamma"
                disabled={adding}
              />
              <p>This label is only used in this dashboard.</p>
            </>
          )}
          {error && (
            <div className="notice warning" role="alert">
              {privacy.anyHidden
                ? "Request failed. Details hidden for privacy."
                : error}
            </div>
          )}
          <div className="dialog-actions">
            <Button
              variant="ghost"
              disabled={adding}
              onClick={() => {
                setProbe(null);
                setError("");
              }}
            >
              Use another IP
            </Button>
            {probe.existingDevice ? (
              <Button onClick={onCancel}>Done</Button>
            ) : (
              <Button type="submit" disabled={adding}>
                {adding ? (
                  <RefreshCw className="spinning" size={15} />
                ) : (
                  <Plus size={15} />
                )}{" "}
                {adding ? "Adding…" : "Add to fleet"}
              </Button>
            )}
          </div>
        </form>
      )}
      <div className="registration-note">
        Monitoring only · No pool, firmware, or device settings are changed.
      </div>
    </>
  );
}
export function AddMinerDialog() {
  const privacy = usePrivacy();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [added, setAdded] = useState("");
  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <Dialog.Trigger asChild>
          <Button>
            <Plus size={16} />
            Add miner
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content add-miner-dialog">
            <div className="dialog-top">
              <div>
                <span className="eyebrow">FLEET MONITORING</span>
                <Dialog.Title>Add miner</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  aria-label="Close add miner"
                  disabled={busy}
                >
                  <X size={19} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description>
              Enter the miner’s local IP address. We’ll check its connection
              before adding it to your fleet. Its settings stay unchanged.
            </Dialog.Description>
            <MinerRegistrationForm
              onBusyChange={setBusy}
              onCancel={() => setOpen(false)}
              onAdded={(device) => {
                setAdded(
                  `${privacy.text(deviceField(device.id, "name"), device.name, "Miner")} added to the fleet. Monitoring has started.`,
                );
                setOpen(false);
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {added && (
        <div className="registration-toast" role="status">
          <CheckCircle2 size={16} />
          {added}
          <button
            aria-label="Dismiss notification"
            onClick={() => setAdded("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
