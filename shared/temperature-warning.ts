/** Format the server's high-temperature warning for the workspace display unit. */
export function formatTemperatureWarning(reason: string, unit: "C" | "F") {
  if (unit === "C") return reason;
  const match =
    /^High chip temperature: (\d+(?:\.\d+)?) °C \(warning at (\d+(?:\.\d+)?) °C\)\.$/.exec(
      reason,
    );
  if (!match) return reason;
  const value = (Number(match[1]) * 9) / 5 + 32;
  const threshold = (Number(match[2]) * 9) / 5 + 32;
  return `High chip temperature: ${value.toFixed(1)} °F (warning at ${Number(threshold.toFixed(1))} °F).`;
}
