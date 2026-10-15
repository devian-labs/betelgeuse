/** Money, percentages and dates, written the way the person's locale writes them. */

/** Rupee amounts read best grouped in lakhs and crores (1,00,000), whatever the computer's locale. */
const localeFor = (currency: string) => (currency === "INR" ? "en-IN" : undefined);
const cache = new Map<string, Intl.NumberFormat>();
function fmt(currency: string, options: Intl.NumberFormatOptions) {
  const k = currency + JSON.stringify(options);
  let f = cache.get(k);
  if (!f) {
    try {
      f = new Intl.NumberFormat(localeFor(currency), { style: "currency", currency, ...options });
    } catch {
      f = new Intl.NumberFormat(undefined, options);
    }
    cache.set(k, f);
  }
  return f;
}

/** ₹1,23,456 · $1,234.50 · −₹200 (pennies only below a thousand, where they matter). */
export function money(n: number, currency: string, { sign = false }: { sign?: boolean } = {}) {
  const decimals = Math.abs(n) < 1000 && Math.round(n) !== n ? 2 : 0;
  const s = fmt(currency, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(n));
  return `${n < 0 ? "−" : sign && n > 0 ? "+" : ""}${s}`;
}

/** ₹1.2L · $12K: for axes and tight places. */
export function compact(n: number, currency: string) {
  const s = fmt(currency, { notation: "compact", maximumFractionDigits: Math.abs(n) >= 100 ? 1 : 0 }).format(Math.abs(n));
  return `${n < 0 ? "−" : ""}${s}`;
}

export const percent = (share: number, { sign = false } = {}) =>
  `${share < 0 ? "−" : sign && share > 0 ? "+" : ""}${Math.abs(share * 100).toFixed(Math.abs(share) < 0.1 && share !== 0 ? 1 : 0)}%`;

/** "Oct 2026" (or "Oct" when `short`). */
export function monthLabel(month: string, short = false) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, short ? { month: "short" } : { month: "long", year: "numeric" });
}

/** "Today", "Yesterday", "Mon, 5 Oct" (with the year when it isn't this year). */
export function dayLabel(iso: string, now = new Date()) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - date.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days === -1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(y !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
