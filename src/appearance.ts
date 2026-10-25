import { eq } from "drizzle-orm";
import type { MinerAppearance } from "../shared/contracts.js";
import type { AppDatabase } from "./database.js";
import { miners } from "./schema.js";

export const MAX_ICON_LENGTH = 90000;
export function saveAppearance(
  store: AppDatabase,
  id: string,
  appearance: MinerAppearance,
) {
  const { customIcon } = appearance;
  if (customIcon !== null) {
    // Only bounded PNGs are stored; SVG and remote URLs are never accepted.
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      customIcon,
    );
    const bytes = match ? Buffer.from(match[1], "base64") : Buffer.alloc(0);
    if (
      customIcon.length > MAX_ICON_LENGTH ||
      bytes.length > 65536 ||
      bytes.length < 45 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.readUInt32BE(16) < 1 ||
      bytes.readUInt32BE(16) > 256 ||
      bytes.readUInt32BE(20) < 1 ||
      bytes.readUInt32BE(20) > 256 ||
      bytes.toString("ascii", bytes.length - 8, bytes.length - 4) !== "IEND"
    ) {
      throw Object.assign(
        new Error("Upload a PNG icon up to 256 × 256 pixels and 64 KB."),
        { statusCode: 400 },
      );
    }
  }
  const result = store.db
    .update(miners)
    .set(appearance)
    .where(eq(miners.id, id))
    .run();
  if (!result.changes)
    throw Object.assign(new Error("Device not found"), { statusCode: 404 });
  return { id, ...appearance };
}
