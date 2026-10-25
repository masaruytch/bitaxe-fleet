import { useTemperatureUnit } from "./temperature";
import { SensitiveValue, usePrivacy, deviceField } from "./Privacy";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, Settings, X } from "lucide-react";
import type { Device } from "../../../shared/contracts";
import {
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
  type DashboardSettings,
} from "../../../shared/settings";
import { Button } from "./ui/button";
async function patch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Fleet-Request": "1" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ?? "Could not save changes. Please try again.",
    );
  return result as T;
}
function PreferenceDialog({
  title,
  description,
  trigger,
  onOpen,
  children,
  pending,
  open,
  onOpenChange,
}: {
  title: string;
  description: ReactNode;
  trigger: ReactNode;
  onOpen: () => void;
  children: ReactNode;
  pending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        if (value) onOpen();
        onOpenChange(value);
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content add-miner-dialog">
          <div className="dialog-top">
            <div>
              <span className="eyebrow">FLEET MONITORING</span>
              <Dialog.Title>{title}</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                aria-label={`Close ${title.toLowerCase()}`}
                disabled={pending}
              >
                <X size={19} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function NicknameDialog({ device }: { device: Device }) {
  const privacy = usePrivacy();
  const client = useQueryClient();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(device.name),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await patch(`/api/miners/${encodeURIComponent(device.id)}`, {
        name: name.trim(),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["fleet"] }),
        client.invalidateQueries({ queryKey: ["fleet-trends"] }),
      ]);
      setOpen(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save nickname.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <PreferenceDialog
      title="Edit nickname"
      description={
        <>
          <SensitiveValue
            fieldKey={deviceField(device.id, "ip")}
            value={device.ip}
            label="IP address"
          />{" "}
          · Choose a name to recognize this miner across your fleet and charts.
        </>
      }
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="nickname-edit"
          aria-label={`Edit nickname for ${privacy.text(deviceField(device.id, "name"), device.name, "hidden miner")}`}
          disabled={privacy.isHidden(deviceField(device.id, "name"))}
        >
          <Pencil size={13} />
        </Button>
      }
      onOpen={() => {
        setName(device.name);
        setError("");
      }}
      pending={pending}
      open={open}
      onOpenChange={setOpen}
    >
      <form className="add-miner-form" onSubmit={save}>
        <label htmlFor={`nickname-${device.id}`}>Nickname</label>
        <input
          id={`nickname-${device.id}`}
          autoFocus
          value={name}
          type={
            privacy.isHidden(deviceField(device.id, "name"))
              ? "password"
              : "text"
          }
          onChange={(event) => setName(event.target.value)}
          maxLength={64}
          required
          disabled={pending}
          autoComplete="off"
        />
        <p>
          This label is saved only in your dashboard. Device settings and
          history stay unchanged.
        </p>
        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <Dialog.Close asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Saving…" : "Save nickname"}
          </Button>
        </div>
      </form>
    </PreferenceDialog>
  );
}
export function SettingsDialog() {
  const [temperatureUnit, setTemperatureUnit] = useTemperatureUnit();
  const client = useQueryClient();
  const [open, setOpen] = useState(false),
    [interval, setInterval] = useState(""),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function load() {
    setLoading(true);
    setInterval("");
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/settings");
      if (!response.ok)
        throw new Error(
          "Could not load settings. Close and reopen to try again.",
        );
      const data = (await response.json()) as DashboardSettings;
      setInterval(String(data.pollIntervalSeconds));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load settings.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setSaved(false);
    try {
      await patch<DashboardSettings>("/api/settings", {
        pollIntervalSeconds: Number(interval),
      });
      await client.invalidateQueries({ queryKey: ["fleet"] });
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save settings.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <PreferenceDialog
      title="Settings"
      description="Choose your temperature display and how often the dashboard collects readings."
      trigger={
        <Button variant="ghost" size="sm" className="settings-trigger">
          <Settings size={15} />
          Settings
        </Button>
      }
      onOpen={() => {
        void load();
      }}
      pending={pending}
      open={open}
      onOpenChange={setOpen}
    >
      <section
        className="temperature-setting"
        aria-labelledby="temperature-setting-label"
      >
        <div className="temperature-setting-row">
          <h3 id="temperature-setting-label">Temperature</h3>
          <div
            className="temperature-unit-toggle"
            role="group"
            aria-label="Temperature unit"
          >
            {(["C", "F"] as const).map((unit) => (
              <button
                type="button"
                key={unit}
                aria-label={`Show temperatures in ${unit === "C" ? "Celsius" : "Fahrenheit"}`}
                aria-pressed={temperatureUnit === unit}
                onClick={() => setTemperatureUnit(unit)}
              >
                °{unit}
              </button>
            ))}
          </div>
        </div>
        <p>
          Applies immediately to Inspect readings and charts. Saved
          automatically in this browser.
        </p>
      </section>
      <form className="add-miner-form" onSubmit={save}>
        <label htmlFor="collection-interval">
          Collection interval (seconds)
        </label>
        <input
          id="collection-interval"
          type="number"
          min={MIN_POLL_INTERVAL_SECONDS}
          max={MAX_POLL_INTERVAL_SECONDS}
          step="1"
          value={interval}
          onChange={(event) => {
            setInterval(event.target.value);
            setSaved(false);
          }}
          required
          disabled={pending || loading}
          aria-describedby="collection-help"
        />
        <p id="collection-help">
          Default: 30 seconds. Choose between 10 and 3,600 seconds. Changes
          apply automatically to the running collector.
        </p>
        <p>
          Collection continues while this dashboard is closed, as long as the
          collector is running.
        </p>
        {loading && <p role="status">Loading settings…</p>}
        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}
        {saved && (
          <p className="notice" role="status">
            Settings saved. The collector will use this interval for its next
            poll.
          </p>
        )}
        <div className="dialog-actions">
          <Dialog.Close asChild>
            <Button variant="ghost" disabled={pending}>
              Close
            </Button>
          </Dialog.Close>
          <Button type="submit" disabled={pending || loading || !interval}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>
    </PreferenceDialog>
  );
}
