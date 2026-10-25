import { usePrivacy } from "./Privacy";
import { Cpu } from "lucide-react";
import type { Device } from "../../../shared/contracts";

export function DeviceIcon({
  device,
}: {
  device: Pick<Device, "coin" | "icon" | "customIcon">;
}) {
  const privacy = usePrivacy();
  const customIcon = privacy.all ? null : device.customIcon;
  const preset = device.icon ?? device.coin;
  return (
    <div
      className={`device-icon coin-icon ${customIcon ? "custom-icon" : (preset ?? "")}`}
      aria-label={
        customIcon
          ? "Custom device icon"
          : preset
            ? `${preset} icon`
            : "Device icon"
      }
    >
      {customIcon ? (
        <img src={customIcon} alt="" />
      ) : preset === "BTC" || preset === "BCH" ? (
        <span aria-hidden="true">₿</span>
      ) : preset === "DGB" ? (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M10 7h8c12 0 9 18-3 18H7l2-8H5l1-3h4l1-4H7l1-3m6 4-3 10h4c7 0 9-10 2-10Z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <Cpu size={18} />
      )}
    </div>
  );
}
