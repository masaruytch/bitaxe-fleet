import { SensitiveValue, deviceField } from "./Privacy";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  Gauge,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { CompatibilityList } from "./Compatibility";
import { MinerRegistrationForm, type AddedMiner } from "./AddMinerDialog";
type Step = "welcome" | "compatibility" | "miner" | "done";
export function CreateFleetWizard({
  demo = false,
  autoOpen = false,
  hideTrigger = false,
}: {
  demo?: boolean;
  autoOpen?: boolean;
  hideTrigger?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen),
    [step, setStep] = useState<Step>(autoOpen ? "miner" : "welcome"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [miner, setMiner] = useState<AddedMiner | null>(null);
  const close = () => {
    if (busy) return;
    setOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("setup")) {
      url.searchParams.delete("setup");
      window.history.replaceState(null, "", url);
    }
  };
  async function connect() {
    setError("");
    if (!demo) {
      setStep("miner");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/fleet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Fleet-Request": "1" },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "Could not prepare your fleet. Please try again.",
        );
      const destination = new URL(result.url);
      if (!["http:", "https:"].includes(destination.protocol))
        throw new Error("The fleet address is not valid.");
      destination.searchParams.set("setup", "1");
      window.location.assign(destination.href);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not create your fleet.",
      );
      setBusy(false);
    }
  }
  const title = {
    welcome: "Create your fleet",
    compatibility: "Check your miner",
    miner: "Add your first miner",
    done: "Your fleet is ready",
  }[step];
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        if (value) {
          setStep("welcome");
          setError("");
          setMiner(null);
          setOpen(true);
        } else close();
      }}
    >
      {!hideTrigger && (
        <Dialog.Trigger asChild>
          <Button>
            Create your fleet
            <ArrowRight size={15} />
          </Button>
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content setup-dialog">
          <div className="dialog-top">
            <div>
              <span className="eyebrow">WELCOME TO BITAXE FLEET</span>
              <Dialog.Title>{title}</Dialog.Title>
            </div>
            <Button
              variant="ghost"
              aria-label="Close fleet setup"
              onClick={close}
              disabled={busy}
            >
              <X size={19} />
            </Button>
          </div>
          <Dialog.Description>
            {step === "welcome"
              ? "A clear view of your miners, together in one dashboard."
              : step === "compatibility"
                ? "Check compatibility and make sure your miner is reachable before connecting."
                : step === "miner"
                  ? "Enter your miner’s local IP address. We’ll verify the connection before you add it."
                  : "Your first miner is connected. Fresh readings will arrive as monitoring continues."}
          </Dialog.Description>
          <ol className="setup-steps" aria-label="Setup progress">
            {["Welcome", "Compatibility", "Connect"].map((label, index) => (
              <li
                key={label}
                aria-current={
                  index ===
                  (step === "welcome" ? 0 : step === "compatibility" ? 1 : 2)
                    ? "step"
                    : undefined
                }
              >
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          {step === "welcome" && (
            <>
              <div className="setup-benefits">
                <div>
                  <Cpu size={20} />
                  <div>
                    <strong>Your miners, at a glance</strong>
                    <p>
                      Track hashrate, temperature, power, and best difficulty
                      across your fleet.
                    </p>
                  </div>
                </div>
                <div>
                  <Gauge size={20} />
                  <div>
                    <strong>See trends over time</strong>
                    <p>
                      By default, readings refresh every 30 seconds and history
                      is kept for 24 hours.
                    </p>
                  </div>
                </div>
                <div>
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Monitoring only</strong>
                    <p>
                      Pool settings, restarts, and firmware stay in your miner’s
                      AxeOS interface.
                    </p>
                  </div>
                </div>
              </div>
              {demo && (
                <p className="setup-hint">
                  Your own fleet starts empty. The simulated miners stay in the
                  demo preview.
                </p>
              )}
              <div className="dialog-actions">
                <Button variant="ghost" onClick={close}>
                  {demo ? "Keep exploring" : "Not now"}
                </Button>
                <Button onClick={() => setStep("compatibility")}>
                  Continue
                  <ArrowRight size={15} />
                </Button>
              </div>
            </>
          )}
          {step === "compatibility" && (
            <>
              <CompatibilityList />
              <p className="setup-hint">
                Have the miner powered on and connected to your network. Use the
                private IPv4 address shown in AxeOS or your router. The computer
                running this dashboard must be able to reach it.
              </p>
              {error && (
                <div className="notice warning" role="alert">
                  {error}
                </div>
              )}
              <div className="dialog-actions">
                <Button
                  variant="ghost"
                  onClick={() => setStep("welcome")}
                  disabled={busy}
                >
                  Back
                </Button>
                <Button
                  onClick={() => {
                    void connect();
                  }}
                  disabled={busy}
                >
                  {busy ? "Preparing your fleet…" : "Add my first miner"}
                  <ArrowRight size={15} />
                </Button>
              </div>
            </>
          )}
          {step === "miner" && (
            <MinerRegistrationForm
              onBusyChange={setBusy}
              onCancel={close}
              onAdded={(device) => {
                setMiner(device);
                setStep("done");
              }}
            />
          )}
          {step === "done" && (
            <>
              <div className="setup-success">
                <CheckCircle2 size={40} />
                <h3>
                  <SensitiveValue
                    fieldKey={deviceField(miner?.id ?? "registration", "name")}
                    value={miner?.name}
                    label="miner name"
                  />{" "}
                  is connected
                </h3>
                <p>{miner?.ip}</p>
                <p>
                  Your dashboard starts with the first reading. Trends will
                  build as new data arrives.
                </p>
              </div>
              <div className="dialog-actions">
                <Button onClick={close}>
                  View my fleet
                  <ArrowRight size={15} />
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
