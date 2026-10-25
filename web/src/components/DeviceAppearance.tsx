import { usePrivacy, deviceField } from "./Privacy";
import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import type {
  Device,
  MinerAppearance,
  MiningCoin,
} from "../../../shared/contracts";
import { DeviceIcon } from "./DeviceIcon";
import { Button } from "./ui/button";
const coins: MiningCoin[] = ["BTC", "BCH", "DGB"];
export function DeviceAppearance({ device }: { device: Device }) {
  const privacy = usePrivacy();
  const displayName = privacy.text(
    deviceField(device.id, "name"),
    device.name,
    "hidden miner",
  );
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<MinerAppearance>({
    coin: null,
    icon: null,
    customIcon: null,
  });
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  async function upload(file: File | undefined) {
    if (!file) return;
    const version = ++generation.current;
    setError("");
    setReading(true);
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error("Choose a PNG, JPEG or WebP image up to 5 MB.");
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Your browser could not prepare this image.");
        const side = Math.min(bitmap.width, bitmap.height);
        context.drawImage(
          bitmap,
          (bitmap.width - side) / 2,
          (bitmap.height - side) / 2,
          side,
          side,
          0,
          0,
          128,
          128,
        );
        const customIcon = canvas.toDataURL("image/png");
        if (customIcon.length > 87406)
          throw new Error("Image is too detailed. Choose a simpler image.");
        if (version === generation.current)
          setValue((previous) => ({ ...previous, customIcon }));
      } finally {
        bitmap.close();
      }
    } catch (error) {
      if (version === generation.current)
        setError(
          error instanceof Error ? error.message : "Could not read image.",
        );
    } finally {
      if (version === generation.current) setReading(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/miners/${encodeURIComponent(device.id)}/appearance`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Fleet-Request": "1",
          },
          body: JSON.stringify(value),
        },
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).error ?? "Could not save device appearance.",
        );
      await client.invalidateQueries({ queryKey: ["fleet"] });
      setOpen(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save changes.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        generation.current++;
        setReading(false);
        if (next) {
          setValue({
            coin: coins.includes(device.coin as MiningCoin)
              ? (device.coin as MiningCoin)
              : null,
            icon: coins.includes(device.icon as MiningCoin)
              ? (device.icon as MiningCoin)
              : null,
            customIcon: device.customIcon ?? null,
          });
          setError("");
        }
        setOpen(next);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className="icon-edit-trigger"
          aria-label={`Edit coin and icon for ${displayName}`}
          title="Edit coin and icon"
        >
          <DeviceIcon device={device} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content add-miner-dialog">
          <div className="dialog-top">
            <Dialog.Title>Coin & device icon</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                disabled={pending}
                aria-label="Close coin and icon settings"
              >
                <X size={19} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description>
            Choose a label and icon for {displayName}. This does not change what
            the miner mines.
          </Dialog.Description>
          <form className="add-miner-form" onSubmit={save}>
            <label htmlFor={`coin-${device.id}`}>Mining coin (manual)</label>
            <select
              id={`coin-${device.id}`}
              value={value.coin ?? ""}
              disabled={pending}
              onChange={(event) =>
                setValue({
                  ...value,
                  coin: (event.target.value as MiningCoin) || null,
                })
              }
            >
              <option value="">Unassigned</option>
              {coins.map((coin) => (
                <option key={coin}>{coin}</option>
              ))}
            </select>
            <p>
              DGB refers to SHA-256d mining. Coin labels are maintained
              manually.
            </p>
            <fieldset disabled={pending || reading}>
              <legend>Device icon</legend>
              <div className="icon-presets">
                {[null, ...coins].map((icon) => (
                  <button
                    key={icon ?? "default"}
                    aria-label={
                      icon ? `Use ${icon} icon` : "Use coin default icon"
                    }
                    type="button"
                    aria-pressed={!value.customIcon && value.icon === icon}
                    onClick={() =>
                      setValue({ ...value, icon, customIcon: null })
                    }
                  >
                    <DeviceIcon device={{ coin: value.coin, icon }} />
                    <span>{icon ?? "Coin default"}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="image-upload-label" htmlFor={`icon-${device.id}`}>
              <ImagePlus size={16} /> Upload custom image
            </label>
            <input
              id={`icon-${device.id}`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={pending || reading}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <p>
              PNG, JPEG or WebP, up to 5 MB. Center-cropped and saved as a 128 ×
              128 icon.
            </p>
            <div className="icon-preview">
              <DeviceIcon device={value} />
              <span>Preview · {value.coin ?? "Unassigned"}</span>
              <Button
                type="button"
                variant="ghost"
                disabled={pending || reading}
                onClick={() =>
                  setValue({ ...value, icon: null, customIcon: null })
                }
              >
                Reset icon
              </Button>
            </div>
            {reading && <p role="status">Preparing image…</p>}
            {error && (
              <p className="notice warning" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button variant="ghost" disabled={pending}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending || reading}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
