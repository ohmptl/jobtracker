export function formatUtc(value: string) {
  return (
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
export function relativeTime(value: string, now: number) {
  const seconds = (Date.parse(value) - now) / 1000;
  const [divisor, unit]: [number, Intl.RelativeTimeFormatUnit] =
    Math.abs(seconds) >= 86400
      ? [86400, "day"]
      : Math.abs(seconds) >= 3600
        ? [3600, "hour"]
        : [60, "minute"];
  return new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(
    Math.round(seconds / divisor),
    unit,
  );
}
