import { WorkspaceSwitcher } from "./Workspaces";
import { version } from "../../../package.json";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  BookOpen,
  Cpu,
  LayoutDashboard,
  Menu,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import { SettingsDialog } from "./FleetPreferences";
import { PrivacyToggle } from "./Privacy";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
export const repositoryUrl = "https://github.com/masaruytch/bitaxe-fleet";
export function MainNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main navigation">
      <NavLink to="/" end onClick={onNavigate}>
        <LayoutDashboard size={17} />
        Overview
      </NavLink>
      <NavLink to="/devices" onClick={onNavigate}>
        <Server size={17} />
        Devices
      </NavLink>
    </nav>
  );
}
export function RepositoryLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <section className="repository-section" aria-label="About Bitaxe Fleet">
      <span className="nav-label">About Bitaxe Fleet</span>
      <NavLink
        className="repository-link"
        to="/compatibility"
        onClick={onNavigate}
      >
        <ShieldCheck size={18} />
        <span>Compatibility</span>
      </NavLink>
      <NavLink className="repository-link" to="/readme" onClick={onNavigate}>
        <BookOpen size={18} />
        <span>README</span>
      </NavLink>
      <a
        className="repository-link"
        href={repositoryUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.87 10.91.58.11.79-.25.79-.55v-2.14c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A11 11 0 0 1 12 6.04c.98 0 1.96.13 2.88.39 2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.77 1.06.77 2.14v3.15c0 .3.21.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
        </svg>
        <span>GitHub repository</span>
        <ArrowUpRight size={15} />
      </a>
      <p className="app-version">Version {version}</p>
    </section>
  );
}
export function MobileNavigation({ demo }: { demo: boolean }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  return (
    <header className="mobile-header">
      <NavLink
        to="/"
        className="mobile-brand"
        aria-label="Bitaxe Fleet overview"
      >
        <span className="brand-symbol">
          <Cpu size={21} />
        </span>
        <span>Bitaxe Fleet</span>
      </NavLink>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <Button
            variant="ghost"
            className="mobile-menu-trigger"
            aria-label="Open navigation menu"
          >
            <Menu size={23} />
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="mobile-menu-overlay" />
          <Dialog.Content className="mobile-menu-panel">
            <div className="mobile-menu-heading">
              <Dialog.Title>Menu</Dialog.Title>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  className="mobile-menu-close"
                  aria-label="Close navigation menu"
                >
                  <X size={22} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Fleet pages, settings, display preferences, and the GitHub
              repository.
            </Dialog.Description>
            <WorkspaceSwitcher onSelected={() => setOpen(false)} />
            <MainNavigation onNavigate={() => setOpen(false)} />
            <section
              className="mobile-menu-preferences"
              aria-labelledby="mobile-preferences-label"
            >
              <h3 id="mobile-preferences-label">PREFERENCES</h3>
              {!demo && <SettingsDialog />}
              <PrivacyToggle />
              <div className="mobile-theme-row">
                <span>Appearance</span>
                <ThemeToggle />
              </div>
            </section>
            <RepositoryLink onNavigate={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  );
}
