import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "bitaxe-fleet-theme";
type Theme = "dark" | "light";

export function initializeTheme() {
  let theme: Theme = "dark";
  try {
    if (localStorage.getItem(storageKey) === "light") theme = "light";
  } catch {
    // The toggle remains usable when browser storage is unavailable.
  }
  applyTheme(theme);
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0c1017" : "#f4f6fa");
}

const themeEvent = "fleet-theme-change";
function subscribeTheme(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      applyTheme(event.newValue === "light" ? "light" : "dark");
      listener();
    }
  };
  window.addEventListener(themeEvent, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(themeEvent, listener);
    window.removeEventListener("storage", onStorage);
  };
}
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    currentTheme,
    () => "dark" as const,
  );
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        applyTheme(next);
        window.dispatchEvent(new Event(themeEvent));
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          // Keep the current session's choice even without persistence.
        }
      }}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
