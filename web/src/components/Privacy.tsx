import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
interface PrivacyState {
  all: boolean;
  hidden: string[];
}
const storageKey = "bitaxe-fleet-privacy";
const eventName = "fleet-privacy-change";
const initial = JSON.stringify({ all: false, hidden: [] });
let fallback = initial;
let memoryOnly = false;
function snapshot() {
  if (memoryOnly) return fallback;
  try {
    return localStorage.getItem(storageKey) ?? initial;
  } catch {
    memoryOnly = true;
    return fallback;
  }
}
function parse(raw: string): PrivacyState {
  try {
    const value = JSON.parse(raw);
    return {
      all: value?.all === true,
      hidden: Array.isArray(value?.hidden)
        ? value.hidden.filter(
            (key: unknown): key is string => typeof key === "string",
          )
        : [],
    };
  } catch {
    return { all: false, hidden: [] };
  }
}
function save(state: PrivacyState) {
  fallback = JSON.stringify(state);
  try {
    localStorage.setItem(storageKey, fallback);
  } catch {
    memoryOnly = true;
  }
  window.dispatchEvent(new Event(eventName));
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(eventName, listener);
  };
}
interface Privacy {
  all: boolean;
  anyHidden: boolean;
  isHidden: (key: string) => boolean;
  text: (key: string, value: string, hiddenText?: string) => string;
  toggle: (key: string) => void;
  toggleAll: () => void;
}
const PrivacyContext = createContext<Privacy | null>(null);
export const deviceField = (id: string, field: string) =>
  `device:${id}:${field}`;
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => initial);
  const state = useMemo(() => parse(raw), [raw]);
  const isHidden = (key: string) => state.all || state.hidden.includes(key);
  const value: Privacy = {
    all: state.all,
    anyHidden: state.all || state.hidden.length > 0,
    isHidden,
    text: (key, value, hiddenText = "Hidden") =>
      isHidden(key) ? hiddenText : value,
    toggle: (key) => {
      const current = parse(snapshot());
      if (current.all) return;
      save({
        ...current,
        hidden: current.hidden.includes(key)
          ? current.hidden.filter((item) => item !== key)
          : [...current.hidden, key],
      });
    },
    toggleAll: () => {
      const current = parse(snapshot());
      save({ ...current, all: !current.all });
    },
  };
  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}
export function usePrivacy() {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error("PrivacyProvider is required");
  return context;
}
export function SensitiveValue({
  fieldKey,
  value,
  label,
  hiddenText = "Hidden",
}: {
  fieldKey: string;
  value: string | number | null | undefined;
  label: string;
  hiddenText?: string;
}) {
  const privacy = usePrivacy();
  if (value == null || value === "") return <>—</>;
  const hidden = privacy.isHidden(fieldKey);
  const action = `${hidden ? "Reveal" : "Hide"} ${label}`;
  return (
    <span className="sensitive-value" data-private-field={label}>
      <bdi
        className={hidden ? "sensitive-text masked-value" : "sensitive-text"}
      >
        {hidden ? hiddenText : value}
      </bdi>
      <button
        type="button"
        className="privacy-value-toggle"
        onClick={() => privacy.toggle(fieldKey)}
        disabled={privacy.all}
        aria-label={action}
        aria-pressed={hidden}
        title={
          privacy.all
            ? "Turn off Screenshot privacy to reveal individual values"
            : action
        }
      >
        {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </span>
  );
}
export function PrivacyToggle() {
  const privacy = usePrivacy();
  return (
    <Button
      size="sm"
      variant={privacy.all ? "outline" : "ghost"}
      className="privacy-toggle"
      onClick={privacy.toggleAll}
      aria-pressed={privacy.all}
      aria-label="Screenshot privacy"
      title={
        privacy.all
          ? "Screenshot privacy is on. Turn off to restore your individual visibility choices."
          : "Hide sensitive values across the dashboard for screenshots"
      }
    >
      {privacy.all ? <ShieldCheck size={16} /> : <EyeOff size={16} />}
      <span className="privacy-toggle-label">
        Screenshot privacy{privacy.all ? " · On" : ""}
      </span>
    </Button>
  );
}

export function PrivateConnectionDetails({
  id,
  value,
}: {
  id: string;
  value: string;
}) {
  const privacy = usePrivacy();
  const key = deviceField(id, "status");
  // Errors are free text and can repeat any of the individually hidden values.
  if (privacy.anyHidden && !privacy.isHidden(key))
    return <bdi className="masked-value">Connection details hidden</bdi>;
  return (
    <SensitiveValue fieldKey={key} value={value} label="connection details" />
  );
}
