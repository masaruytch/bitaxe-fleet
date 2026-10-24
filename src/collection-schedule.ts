import { setTimeout } from "node:timers/promises";
/** Re-read settings while waiting so both shorter and longer intervals apply live. */
export async function waitForNextCollection(
  readInterval: () => number,
  signal: AbortSignal,
  options: {
    now?: () => number;
    sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  } = {},
) {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    (async (milliseconds, signal) => {
      await setTimeout(milliseconds, undefined, { signal });
    });
  const completedAt = now();
  while (!signal.aborted) {
    const remaining = completedAt + readInterval() * 1000 - now();
    if (remaining <= 0) return;
    await sleep(Math.min(1000, remaining), signal);
  }
}
