const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "2 minutes ago", "yesterday", … from a unix timestamp in seconds. */
export function timeAgo(seconds: number): string {
  const diff = seconds - Date.now() / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, s] of units) {
    if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), unit);
  }
  return "just now";
}
