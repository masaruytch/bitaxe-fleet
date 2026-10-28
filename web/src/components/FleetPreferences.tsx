import type { TemperatureUnit } from "./temperature";
import { useWorkspace, workspaceField } from "./Workspaces";
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
  const [agentAccessEnabled, setAgentAccessEnabled] = useState(false);
  const [initialAgentAccessEnabled, setInitialAgentAccessEnabled] =
    useState(false);
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>("C");
  const [initialTemperatureUnit, setInitialTemperatureUnit] =
    useState<TemperatureUnit>("C");
  const workspace = useWorkspace();
  const privacy = usePrivacy();
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [initialWorkspaceName, setInitialWorkspaceName] = useState("");
  const [initialInterval, setInitialInterval] = useState("");
  const client = useQueryClient();
  const [open, setOpen] = useState(false),
    [interval, setInterval] = useState(""),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function load() {
    const id = workspace.workspaceId;
    setSettingsWorkspaceId(id);
    setWorkspaceName(workspace.active?.name ?? "");
    setInitialWorkspaceName(workspace.active?.name ?? "");
    setTemperatureUnit(workspace.active?.temperatureUnit ?? "C");
    setInitialTemperatureUnit(workspace.active?.temperatureUnit ?? "C");
    setLoading(true);
    setInterval("");
    setError("");
    setSaved(false);
    try {
      const response = await fetch(
        `/api/settings?workspaceId=${encodeURIComponent(id)}`,
      );
      if (!response.ok)
        throw new Error(
          "Could not load settings. Close and reopen to try again.",
        );
      const data = (await response.json()) as DashboardSettings;
      setInterval(String(data.pollIntervalSeconds));
      setInitialInterval(String(data.pollIntervalSeconds));
      setAgentAccessEnabled(data.agentAccessEnabled);
      setInitialAgentAccessEnabled(data.agentAccessEnabled);
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
      const renamed = workspaceName.trim() !== initialWorkspaceName;
      if (
        !renamed &&
        interval === initialInterval &&
        temperatureUnit === initialTemperatureUnit &&
        agentAccessEnabled === initialAgentAccessEnabled
      ) {
        setSaved(true);
        return;
      }
      const result = await patch<DashboardSettings>(
        `/api/settings?workspaceId=${encodeURIComponent(settingsWorkspaceId)}`,
        {
          ...(interval !== initialInterval
            ? { pollIntervalSeconds: Number(interval) }
            : {}),
          ...(temperatureUnit !== initialTemperatureUnit
            ? { temperatureUnit }
            : {}),
          ...(agentAccessEnabled !== initialAgentAccessEnabled
            ? { agentAccessEnabled }
            : {}),
          ...(renamed
            ? { name: workspaceName.trim(), expectedName: initialWorkspaceName }
            : {}),
        },
      );
      setInterval(String(result.pollIntervalSeconds));
      setInitialInterval(String(result.pollIntervalSeconds));
      if (renamed) setInitialWorkspaceName(workspaceName.trim());
      setInitialTemperatureUnit(temperatureUnit);
      setAgentAccessEnabled(result.agentAccessEnabled);
      setInitialAgentAccessEnabled(result.agentAccessEnabled);
      await client.invalidateQueries({ queryKey: ["workspaces"] });
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
      title="Workspace settings"
      description={
        <>
          Changes apply only to{" "}
          {privacy.text(
            workspaceField(settingsWorkspaceId),
            workspace.workspaces.find((item) => item.id === settingsWorkspaceId)
              ?.name ?? "this workspace",
            "the hidden workspace",
          )}
          .
        </>
      }
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
      <form className="add-miner-form workspace-settings-form" onSubmit={save}>
        <section
          className="workspace-settings-section"
          aria-labelledby="workspace-general-title"
        >
          <div className="workspace-settings-section-heading">
            <h3 id="workspace-general-title">General</h3>
            <p>Identify this workspace in your dashboard.</p>
          </div>
          <label htmlFor="workspace-settings-name">Workspace name</label>
          <input
            id="workspace-settings-name"
            value={workspaceName}
            onChange={(event) => {
              setWorkspaceName(event.target.value);
              setSaved(false);
            }}
            maxLength={64}
            required
            disabled={
              pending ||
              loading ||
              privacy.isHidden(workspaceField(settingsWorkspaceId))
            }
            type={
              privacy.isHidden(workspaceField(settingsWorkspaceId))
                ? "password"
                : "text"
            }
            aria-describedby={
              privacy.isHidden(workspaceField(settingsWorkspaceId))
                ? "workspace-name-help"
                : undefined
            }
          />
          {privacy.isHidden(workspaceField(settingsWorkspaceId)) && (
            <p className="workspace-settings-help" id="workspace-name-help">
              Reveal the workspace name to edit it.
            </p>
          )}
        </section>
        <section
          className="workspace-settings-section"
          aria-labelledby="workspace-monitoring-title"
        >
          <div className="workspace-settings-section-heading">
            <h3 id="workspace-monitoring-title">Monitoring</h3>
            <p>Choose how this workspace collects and displays readings.</p>
          </div>
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
          <p className="workspace-settings-help" id="collection-help">
            Choose 10–3,600 seconds. Changes apply to the running collector
            after saving.
          </p>
          <div className="workspace-settings-temperature">
            <div>
              <span
                className="workspace-settings-label"
                id="temperature-setting-label"
              >
                Temperature unit
              </span>
              <p className="workspace-settings-help">
                Used for readings and charts.
              </p>
            </div>
            <div
              className="temperature-unit-toggle"
              role="group"
              aria-labelledby="temperature-setting-label"
            >
              {(["C", "F"] as const).map((unit) => (
                <button
                  type="button"
                  key={unit}
                  aria-label={`Show temperatures in ${unit === "C" ? "Celsius" : "Fahrenheit"}`}
                  aria-pressed={temperatureUnit === unit}
                  disabled={pending || loading}
                  onClick={() => {
                    setTemperatureUnit(unit);
                    setSaved(false);
                  }}
                >
                  °{unit}
                </button>
              ))}
            </div>
          </div>
        </section>
        <section
          className="workspace-settings-section"
          aria-labelledby="agent-access-label"
        >
          <div className="workspace-settings-section-heading">
            <h3 id="agent-access-label">Agent access</h3>
            <p>Optionally share filtered readings with connected agents.</p>
          </div>
          <label className="agent-access-option">
            <input
              type="checkbox"
              checked={agentAccessEnabled}
              disabled={pending || loading}
              aria-describedby="agent-access-help"
              onChange={(event) => {
                setAgentAccessEnabled(event.target.checked);
                setSaved(false);
              }}
            />
            Enable read-only agent access
          </label>
          <p className="workspace-settings-help" id="agent-access-help">
            Agent setup is separate. Agents with direct API or database access
            can bypass this setting; their providers may receive shared
            readings.
          </p>
        </section>
        {loading && <p role="status">Loading settings…</p>}
        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}
        {saved && (
          <p className="notice" role="status">
            Workspace settings saved.
          </p>
        )}
        <div className="dialog-actions">
          <Dialog.Close asChild>
            <Button variant="ghost" disabled={pending}>
              Close
            </Button>
          </Dialog.Close>
          <Button
            type="submit"
            disabled={pending || loading || !interval || !workspaceName.trim()}
          >
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>
    </PreferenceDialog>
  );
}
