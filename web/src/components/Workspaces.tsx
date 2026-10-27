import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronDown,
  Eye,
  EyeOff,
  FolderOpen,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import type {
  Device,
  Workspace,
  WorkspacesResponse,
} from "../../../shared/contracts";
import { usePrivacy } from "./Privacy";
import { Button } from "./ui/button";
const storageKey = "bitaxe-fleet-workspace";
export const workspaceField = (id: string) => `workspace:${id}:name`;
interface WorkspaceContextValue {
  workspaceId: string;
  active: Workspace | undefined;
  workspaces: Workspace[];
  demo: boolean;
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
  retry: () => void;
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [requested, setRequested] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || "default";
    } catch {
      return "default";
    }
  });
  const result = useQuery({
    queryKey: ["workspaces"],
    queryFn: async (): Promise<WorkspacesResponse> => {
      const response = await fetch("/api/workspaces");
      if (!response.ok)
        throw new Error("Could not load workspaces. Please try again.");
      return response.json();
    },
    refetchInterval: 15000,
  });
  const workspaces = result.data?.workspaces ?? [];
  const active =
    workspaces.find((item) => item.id === requested) ??
    workspaces.find(
      (item) => item.id === (result.data?.defaultWorkspaceId ?? "default"),
    );
  function select(id: string) {
    setRequested(id);
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      /* Keep selection usable without storage. */
    }
  }
  useEffect(() => {
    if (
      result.data &&
      !result.isFetching &&
      active &&
      !workspaces.some((item) => item.id === requested)
    )
      select(active.id);
  }, [result.data, result.isFetching, requested, active?.id]);
  return (
    <WorkspaceContext.Provider
      value={{
        workspaceId: active?.id ?? requested,
        active,
        workspaces,
        demo: result.data?.demo === true,
        loading: result.isPending,
        error: result.isError && !result.data ? result.error.message : null,
        select,
        retry: () => {
          void result.refetch();
        },
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceProvider is required");
  return context;
}
async function write(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Fleet-Request": "1" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Could not update workspace.");
  return result;
}
export function WorkspaceSwitcher({ onSelected }: { onSelected?: () => void }) {
  const context = useWorkspace();
  const privacy = usePrivacy();
  const client = useQueryClient();
  const listId = useId();
  const [expanded, setExpanded] = useState(true);
  const inputId = useId();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await write(
        editing
          ? `/api/workspaces/${encodeURIComponent(editing)}`
          : "/api/workspaces",
        editing ? "PATCH" : "POST",
        { name: name.trim() },
      );
      await client.invalidateQueries({ queryKey: ["workspaces"] });
      if (!editing) {
        context.select(result.id);
        setOpen(false);
      }
      setEditing(null);
      setName("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save workspace.",
      );
    } finally {
      setPending(false);
    }
  }
  async function remove(id: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await write(`/api/workspaces/${encodeURIComponent(id)}`, "DELETE", {});
      if (id === context.workspaceId) context.select("default");
      setDeleting(null);
      if (editing === id) {
        setEditing(null);
        setName("");
      }
      await client.invalidateQueries({ queryKey: ["workspaces"] });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not delete workspace.",
      );
      await client.invalidateQueries({ queryKey: ["workspaces"] });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="workspace-switcher">
      <div className="workspace-section-heading">
        <button
          type="button"
          className="workspace-expand-toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown size={15} className={expanded ? "" : "collapsed"} />
          <span>WORKSPACES</span>
        </button>
        {!context.demo && (
          <Dialog.Root
            open={open}
            onOpenChange={(value) => {
              if (pending) return;
              setOpen(value);
              if (value) {
                setName("");
                setEditing(null);
                setError("");
                setDeleting(null);
              }
            }}
          >
            <Dialog.Trigger asChild>
              <Button
                variant="ghost"
                className="workspace-manage-trigger"
                title="Manage workspaces"
                aria-label="Manage workspaces"
              >
                <Settings size={16} aria-hidden="true" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="dialog-content add-miner-dialog">
                <div className="dialog-top">
                  <Dialog.Title>Workspaces</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      aria-label="Close workspaces"
                    >
                      <X size={20} />
                    </Button>
                  </Dialog.Close>
                </div>
                <Dialog.Description>
                  Group miners by location or coin. Each miner belongs to one
                  workspace.
                </Dialog.Description>
                <div className="workspace-list">
                  {context.workspaces.map((item, index) => (
                    <div key={item.id}>
                      <Button
                        variant={
                          item.id === context.workspaceId ? "outline" : "ghost"
                        }
                        disabled={pending}
                        onClick={() => {
                          context.select(item.id);
                          setOpen(false);
                        }}
                      >
                        <FolderOpen size={16} />
                        <span>
                          {privacy.text(
                            workspaceField(item.id),
                            item.name,
                            `Workspace ${index + 1}`,
                          )}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Rename ${privacy.text(workspaceField(item.id), item.name, `workspace ${index + 1}`)}`}
                        disabled={
                          pending || privacy.isHidden(workspaceField(item.id))
                        }
                        onClick={() => {
                          setEditing(item.id);
                          setName(item.name);
                          setError("");
                        }}
                      >
                        <Pencil size={15} />
                      </Button>
                      {item.id !== "default" && (
                        <Button
                          variant="ghost"
                          aria-label={`Delete ${privacy.text(workspaceField(item.id), item.name, `workspace ${index + 1}`)}`}
                          title={
                            item.minerCount
                              ? "Move all miners before deleting"
                              : "Delete empty workspace"
                          }
                          disabled={
                            pending || item.minerCount > 0 || privacy.all
                          }
                          onClick={() => {
                            setDeleting(item.id);
                            setError("");
                          }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {deleting && (
                  <div
                    className="workspace-delete-confirm"
                    role="group"
                    aria-label="Confirm workspace deletion"
                  >
                    <p>
                      Delete{" "}
                      {privacy.text(
                        workspaceField(deleting),
                        context.workspaces.find((item) => item.id === deleting)
                          ?.name ?? "workspace",
                        "hidden workspace",
                      )}
                      ? Its collection settings will be removed.
                    </p>
                    <div className="dialog-actions">
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setDeleting(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() => void remove(deleting)}
                      >
                        {pending ? "Deleting…" : "Delete workspace"}
                      </Button>
                    </div>
                  </div>
                )}
                <p className="workspace-delete-help">
                  Only empty workspaces can be deleted. Move miners from Inspect
                  first. The default workspace cannot be deleted.
                </p>
                {error && (
                  <p role="alert" className="notice warning">
                    {error}
                  </p>
                )}
                {privacy.all ? (
                  <p className="notice">
                    Turn off Screenshot privacy to create or rename workspaces.
                  </p>
                ) : (
                  <form
                    className="add-miner-form workspace-name-form"
                    onSubmit={save}
                  >
                    <label htmlFor={inputId}>
                      {editing ? "Workspace name" : "New workspace name"}
                    </label>
                    <input
                      id={inputId}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      type={privacy.anyHidden ? "password" : "text"}
                      required
                      maxLength={64}
                      autoComplete="off"
                      disabled={pending}
                      placeholder="Location A or Bitcoin"
                    />
                    <p>
                      New miners are added to the selected workspace. Move
                      existing miners from Inspect.
                    </p>
                    <div className="dialog-actions">
                      {editing && (
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            setEditing(null);
                            setName("");
                            setError("");
                          }}
                        >
                          Cancel rename
                        </Button>
                      )}
                      <Button type="submit" disabled={pending || !name.trim()}>
                        {!editing && <Plus size={16} />}
                        {pending
                          ? "Saving…"
                          : editing
                            ? "Save name"
                            : "Create workspace"}
                      </Button>
                    </div>
                  </form>
                )}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>
      <div id={listId} className="workspace-navigation-list" hidden={!expanded}>
        {context.loading && <p role="status">Loading workspaces…</p>}
        {context.workspaces.map((item, index) => {
          const key = workspaceField(item.id);
          const hidden = privacy.isHidden(key);
          const label = privacy.text(key, item.name, `Workspace ${index + 1}`);
          return (
            <div key={item.id} className="workspace-navigation-row">
              <button
                type="button"
                className="workspace-navigation-item"
                aria-current={
                  item.id === context.workspaceId ? "true" : undefined
                }
                onClick={() => {
                  context.select(item.id);
                  onSelected?.();
                }}
              >
                <FolderOpen size={16} />
                <span>{label}</span>
              </button>
              <button
                type="button"
                className="privacy-value-toggle"
                disabled={privacy.all}
                aria-label={`${hidden ? "Reveal" : "Hide"} ${label} workspace name`}
                aria-pressed={hidden}
                onClick={() => privacy.toggle(key)}
              >
                {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function MoveMiner({
  device,
  onMoved,
}: {
  device: Device;
  onMoved: () => void;
}) {
  const context = useWorkspace();
  const privacy = usePrivacy();
  const client = useQueryClient();
  const id = useId();
  const [target, setTarget] = useState(
      device.workspaceId ?? context.workspaceId,
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function move(event: React.FormEvent) {
    event.preventDefault();
    if (pending || target === device.workspaceId) return;
    setPending(true);
    setError("");
    try {
      await write(
        `/api/miners/${encodeURIComponent(device.id)}/workspace`,
        "PATCH",
        { workspaceId: target },
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["fleet"] }),
        client.invalidateQueries({ queryKey: ["fleet-trends"] }),
        client.invalidateQueries({ queryKey: ["workspaces"] }),
      ]);
      onMoved();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not move miner.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="workspace-assignment" onSubmit={move}>
      <label htmlFor={id}>Workspace</label>
      <div>
        <select
          id={id}
          aria-label="Move miner to workspace"
          value={target}
          disabled={pending || privacy.all}
          onChange={(event) => setTarget(event.target.value)}
        >
          {context.workspaces.map((item, index) => (
            <option key={item.id} value={item.id}>
              {privacy.text(
                workspaceField(item.id),
                item.name,
                `Workspace ${index + 1}`,
              )}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          disabled={
            pending ||
            privacy.all ||
            target === (device.workspaceId ?? context.workspaceId)
          }
        >
          {pending ? "Moving…" : "Move miner"}
        </Button>
      </div>
      <p>
        History and preferences move with this miner. Collection continues
        across all workspaces.
      </p>
      {error && (
        <p role="alert" className="notice warning">
          {error}
        </p>
      )}
    </form>
  );
}
