/**
 * Relations and rollups, as the desktop app stores them (see apps/desktop/src/database/model.ts):
 * a relation row value is a list of `[[Title]]` links in the row's frontmatter, its property names
 * the related database as `"database": "[[Path/To/Db]]"`, the other side of a two-way relation
 * (`synced`) stores nothing, and rollups are worked out from the related rows.
 */

export type Property = {
  name: string;
  type: string;
  options?: { name: string }[];
  database?: string;
  limit?: "one";
  reverse?: string;
  synced?: string;
  relation?: string;
  target?: string;
  calc?: string;
};

export type Row = Record<string, unknown> & { path: string };

/** The page a link names: `[[Khao|label]]` and plain `Khao` both give `Khao`. */
export function linkTarget(s: string): string {
  const m = /^\s*\[\[([^\]|#]*)(?:[|#][^\]]*)?\]\]\s*$/.exec(s);
  return (m ? m[1] : s).trim();
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === null || v === undefined || v === "" ? [] : [String(v)]);

export const relationTitles = (v: unknown): string[] => asList(v).map(linkTarget).filter(Boolean);

export const isComputed = (p: Property) => p.type === "rollup" || (p.type === "relation" && !!p.synced);

/** Whether a link target names a row, by title or by path. */
export function linksTo(target: string, row: { path: string; title: string }): boolean {
  const t = target.replace(/\.md$/, "").toLowerCase();
  return t === row.title.toLowerCase() || t === row.path.replace(/\.md$/, "").toLowerCase();
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const day = (v: unknown): number | null => {
  const t = typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const round = (n: number) => +n.toFixed(6);
const checked = (v: unknown) => v === true || v === "true" || v === "yes";

/** A rollup over the related rows' values of one property; numbers stay numbers for agents. */
export function rollup(values: unknown[], calc = "show_original"): unknown {
  const filled = values.filter((v) => asList(v).length > 0 || typeof v === "boolean" || typeof v === "number");
  const pct = (n: number) => (values.length ? round((n / values.length) * 100) : 0);
  const nums = values.map(num).filter((n): n is number => n !== null);
  const dates = values.map(day).filter((t): t is number => t !== null).sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  switch (calc) {
    case "show_original":
      return values.flatMap((v): unknown[] => (typeof v === "number" || typeof v === "boolean" ? [v] : relationTitles(v)));
    case "count_all":
      return values.length;
    case "count_values":
      return values.reduce<number>((n, v) => n + asList(v).length, 0);
    case "count_empty":
      return values.length - filled.length;
    case "count_not_empty":
      return filled.length;
    case "count_unique":
      return new Set(values.flatMap(asList)).size;
    case "percent_empty":
      return pct(values.length - filled.length);
    case "percent_not_empty":
      return pct(filled.length);
    case "sum":
      return round(sum);
    case "average":
      return nums.length ? round(sum / nums.length) : null;
    case "median": {
      if (!nums.length) return null;
      const s = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
    }
    case "min":
      return nums.length ? Math.min(...nums) : null;
    case "max":
      return nums.length ? Math.max(...nums) : null;
    case "range":
      return nums.length ? round(Math.max(...nums) - Math.min(...nums)) : null;
    case "checked":
      return values.filter(checked).length;
    case "unchecked":
      return values.filter((v) => !checked(v)).length;
    case "percent_checked":
      return pct(values.filter(checked).length);
    case "earliest":
      return dates.length ? isoDay(dates[0]) : null;
    case "latest":
      return dates.length ? isoDay(dates[dates.length - 1]) : null;
    case "date_range":
      return dates.length > 1 ? Math.round((dates[dates.length - 1] - dates[0]) / 864e5) : null;
    default:
      return null;
  }
}
