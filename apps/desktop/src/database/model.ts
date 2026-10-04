/**
 * Databases are plain pages: `Tasks.md` has `type: database` in its frontmatter and a
 * ```database JSON block describing properties and views. Each row is a sub-page
 * (`Tasks/<Row>.md`) whose property values live in its YAML frontmatter.
 */
import type { RawRow } from "../lib/api";
import { nextColor, type Color } from "../lib/colors";
import { readFrontmatter, splitNote } from "../lib/frontmatter";

export type PropType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "created_time"
  | "last_edited_time";

export type SelectOption = { name: string; color: Color };
export type NumberFormat = "number" | "comma" | "percent" | "dollar" | "euro" | "pound" | "rupee" | "yen";

export type Property = { name: string; type: PropType; options?: SelectOption[]; format?: NumberFormat };

export type Sort = { property: string; direction: "asc" | "desc" };
export type FilterOp =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "before"
  | "after"
  | "checked"
  | "unchecked";
export type Filter = { property: string; op: FilterOp; value?: string };

export type ViewType = "table" | "board" | "list" | "gallery" | "calendar";
export type Calc =
  | "none"
  | "count_all"
  | "count_values"
  | "count_empty"
  | "count_not_empty"
  | "count_unique"
  | "percent_empty"
  | "percent_not_empty"
  | "sum"
  | "average"
  | "median"
  | "min"
  | "max"
  | "range"
  | "checked"
  | "unchecked"
  | "percent_checked"
  | "earliest"
  | "latest"
  | "date_range";

export type View = {
  id: string;
  name: string;
  type: ViewType;
  sorts?: Sort[];
  filters?: Filter[];
  /** Property order for this view; the title column is always first. */
  order?: string[];
  hidden?: string[];
  widths?: Record<string, number>;
  calcs?: Record<string, Calc>;
  groupBy?: string;
  dateProperty?: string;
  wrap?: boolean;
};

export type Schema = {
  /** The title column's name, when it isn't "Name" (e.g. Notion's "Source"). */
  title?: string;
  properties: Property[];
  views: View[];
};

export type Row = {
  path: string;
  title: string;
  icon?: string;
  frontmatter: string;
  values: Record<string, unknown>;
  body: string;
  created: number;
  modified: number;
};

export const TITLE = "Name";
export const titleProperty: Property = { name: TITLE, type: "title" };
/** The title column of a database: "Name" unless the schema names it. */
const titleOf = (schema: Schema): Property => (schema.title ? { name: schema.title, type: "title" } : titleProperty);

export const TYPE_LABELS: Record<PropType, string> = {
  title: "Title",
  text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi-select",
  status: "Status",
  date: "Date",
  checkbox: "Checkbox",
  url: "URL",
  email: "Email",
  created_time: "Created time",
  last_edited_time: "Last edited time",
};

export const ADDABLE_TYPES: PropType[] = [
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "created_time",
  "last_edited_time",
];

export const VIEW_LABELS: Record<ViewType, string> = {
  table: "Table",
  board: "Board",
  list: "List",
  gallery: "Gallery",
  calendar: "Calendar",
};

const FENCE = /```database[ \t]*\n([\s\S]*?)\n```/;

export const newId = () => Math.random().toString(36).slice(2, 9);

export function defaultSchema(): Schema {
  return {
    properties: [
      {
        name: "Status",
        type: "status",
        options: [
          { name: "Not started", color: "gray" },
          { name: "In progress", color: "blue" },
          { name: "Done", color: "green" },
        ],
      },
      { name: "Tags", type: "multi_select", options: [] },
    ],
    views: [{ id: newId(), name: "Table", type: "table" }],
  };
}

export function parseSchema(body: string): Schema {
  const m = FENCE.exec(body);
  try {
    const parsed = m ? JSON.parse(m[1]) : {};
    const views: View[] = Array.isArray(parsed.views) && parsed.views.length ? parsed.views : [{ id: "table", name: "Table", type: "table" }];
    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : undefined;
    return { ...(title && { title }), properties: Array.isArray(parsed.properties) ? parsed.properties : [], views };
  } catch {
    return { properties: [], views: [{ id: "table", name: "Table", type: "table" }] };
  }
}

/** Writes the schema back into the page body, keeping any text around the block. */
export function writeSchema(body: string, schema: Schema): string {
  const block = "```database\n" + JSON.stringify(schema, null, 2) + "\n```";
  return FENCE.test(body) ? body.replace(FENCE, () => block) : `${body.trimEnd()}${body.trim() ? "\n\n" : ""}${block}\n`;
}

/** The database page body without its schema block, i.e. its description. */
export const descriptionOf = (body: string) => body.replace(FENCE, "").trim();

export function toRow(raw: RawRow): Row {
  const { frontmatter, body } = splitNote(raw.content);
  const values = readFrontmatter(frontmatter);
  return {
    path: raw.path,
    title: raw.title,
    icon: typeof values.icon === "string" ? values.icon : undefined,
    frontmatter,
    values,
    body,
    created: raw.created,
    modified: raw.modified,
  };
}

export function getValue(row: Row, prop: Property): unknown {
  switch (prop.type) {
    case "title":
      return row.title;
    case "created_time":
      return row.created;
    case "last_edited_time":
      return row.modified;
    default:
      return row.values[prop.name];
  }
}

export const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v === null || v === undefined || v === "" ? [] : [String(v)];

export const asNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

export const asBool = (v: unknown) => v === true || v === "true" || v === "yes";

/** Dates are stored as ISO `YYYY-MM-DD` (or full ISO datetimes); timestamps for system props. */
export function asDate(v: unknown): Date | null {
  if (typeof v === "number") return new Date(v);
  if (v instanceof Date) return v;
  if (typeof v !== "string" || !v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function isEmptyValue(prop: Property, v: unknown): boolean {
  if (prop.type === "checkbox") return !asBool(v);
  if (prop.type === "number") return asNumber(v) === null;
  return asList(v).length === 0;
}

const CURRENCY: Partial<Record<NumberFormat, string>> = { dollar: "USD", euro: "EUR", pound: "GBP", rupee: "INR", yen: "JPY" };

export function formatNumber(n: number, format: NumberFormat = "number"): string {
  if (format === "percent") return `${+(n * 100).toFixed(2)}%`;
  if (format === "comma") return n.toLocaleString();
  const currency = CURRENCY[format];
  if (currency) return n.toLocaleString(undefined, { style: "currency", currency });
  return String(+n.toFixed(6));
}

export function formatDate(d: Date, withTime = false): string {
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return withTime ? `${date} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : date;
}

/** Plain-text rendering of a value, used for search, sorting ties and the calendar. */
export function displayValue(prop: Property, v: unknown): string {
  switch (prop.type) {
    case "number": {
      const n = asNumber(v);
      return n === null ? "" : formatNumber(n, prop.format);
    }
    case "checkbox":
      return asBool(v) ? "Checked" : "";
    case "date":
    case "created_time":
    case "last_edited_time": {
      const d = asDate(v);
      return d ? formatDate(d, prop.type !== "date") : "";
    }
    default:
      return asList(v).join(", ");
  }
}

// ---------- filtering & sorting ----------

export const FILTER_OPS: Record<string, { op: FilterOp; label: string; needsValue: boolean }[]> = {
  text: [
    { op: "contains", label: "Contains", needsValue: true },
    { op: "not_contains", label: "Does not contain", needsValue: true },
    { op: "is", label: "Is", needsValue: true },
    { op: "is_not", label: "Is not", needsValue: true },
    { op: "is_empty", label: "Is empty", needsValue: false },
    { op: "is_not_empty", label: "Is not empty", needsValue: false },
  ],
  number: [
    { op: "eq", label: "=", needsValue: true },
    { op: "neq", label: "≠", needsValue: true },
    { op: "gt", label: ">", needsValue: true },
    { op: "lt", label: "<", needsValue: true },
    { op: "gte", label: "≥", needsValue: true },
    { op: "lte", label: "≤", needsValue: true },
    { op: "is_empty", label: "Is empty", needsValue: false },
    { op: "is_not_empty", label: "Is not empty", needsValue: false },
  ],
  select: [
    { op: "is", label: "Is", needsValue: true },
    { op: "is_not", label: "Is not", needsValue: true },
    { op: "is_empty", label: "Is empty", needsValue: false },
    { op: "is_not_empty", label: "Is not empty", needsValue: false },
  ],
  multi_select: [
    { op: "contains", label: "Contains", needsValue: true },
    { op: "not_contains", label: "Does not contain", needsValue: true },
    { op: "is_empty", label: "Is empty", needsValue: false },
    { op: "is_not_empty", label: "Is not empty", needsValue: false },
  ],
  date: [
    { op: "is", label: "Is", needsValue: true },
    { op: "before", label: "Is before", needsValue: true },
    { op: "after", label: "Is after", needsValue: true },
    { op: "is_empty", label: "Is empty", needsValue: false },
    { op: "is_not_empty", label: "Is not empty", needsValue: false },
  ],
  checkbox: [
    { op: "checked", label: "Is checked", needsValue: false },
    { op: "unchecked", label: "Is not checked", needsValue: false },
  ],
};

export function filterOpsFor(type: PropType) {
  if (type === "number") return FILTER_OPS.number;
  if (type === "select" || type === "status") return FILTER_OPS.select;
  if (type === "multi_select") return FILTER_OPS.multi_select;
  if (type === "date" || type === "created_time" || type === "last_edited_time") return FILTER_OPS.date;
  if (type === "checkbox") return FILTER_OPS.checkbox;
  return FILTER_OPS.text;
}

function matches(row: Row, prop: Property, f: Filter): boolean {
  const v = getValue(row, prop);
  const want = (f.value ?? "").toLowerCase();
  switch (f.op) {
    case "is_empty":
      return isEmptyValue(prop, v);
    case "is_not_empty":
      return !isEmptyValue(prop, v);
    case "checked":
      return asBool(v);
    case "unchecked":
      return !asBool(v);
  }
  if (!f.value) return true; // an unfinished filter doesn't hide anything
  if (prop.type === "number") {
    const n = asNumber(v);
    const w = Number(f.value);
    if (n === null) return f.op === "neq";
    return { eq: n === w, neq: n !== w, gt: n > w, lt: n < w, gte: n >= w, lte: n <= w }[f.op as "eq"] ?? true;
  }
  if (prop.type === "date" || prop.type === "created_time" || prop.type === "last_edited_time") {
    const d = asDate(v);
    if (!d) return false;
    const day = isoDay(d);
    return f.op === "is" ? day === f.value : f.op === "before" ? day < f.value : f.op === "after" ? day > f.value : true;
  }
  const list = asList(v).map((s) => s.toLowerCase());
  const text = list.join(", ");
  switch (f.op) {
    case "contains":
      return prop.type === "multi_select" ? list.includes(want) : text.includes(want);
    case "not_contains":
      return prop.type === "multi_select" ? !list.includes(want) : !text.includes(want);
    case "is":
      return text === want;
    case "is_not":
      return text !== want;
  }
  return true;
}

const sortsAsEmpty = (prop: Property, v: unknown) => prop.type !== "checkbox" && isEmptyValue(prop, v);

/** Compares two non-empty values. */
function compare(prop: Property, a: unknown, b: unknown): number {
  switch (prop.type) {
    case "number":
      return asNumber(a)! - asNumber(b)!;
    case "checkbox":
      return Number(asBool(a)) - Number(asBool(b));
    case "date":
    case "created_time":
    case "last_edited_time":
      return asDate(a)!.getTime() - asDate(b)!.getTime();
    case "select":
    case "status": {
      // Options sort in their defined order, not alphabetically.
      const idx = (v: unknown) => prop.options?.findIndex((o) => o.name === asList(v)[0]) ?? -1;
      return idx(a) - idx(b);
    }
    default:
      return displayValue(prop, a).localeCompare(displayValue(prop, b), undefined, { numeric: true, sensitivity: "base" });
  }
}

export function allProperties(schema: Schema): Property[] {
  return [titleOf(schema), ...schema.properties];
}

export function findProperty(schema: Schema, name: string): Property | undefined {
  return allProperties(schema).find((p) => p.name === name);
}

export function applyView(rows: Row[], schema: Schema, view: View, search: string): Row[] {
  const props = allProperties(schema);
  let out = rows;
  for (const f of view.filters ?? []) {
    const prop = props.find((p) => p.name === f.property);
    if (prop) out = out.filter((r) => matches(r, prop, f));
  }
  const q = search.trim().toLowerCase();
  if (q) out = out.filter((r) => props.some((p) => displayValue(p, getValue(r, p)).toLowerCase().includes(q)));
  const sorts = (view.sorts ?? []).filter((s) => props.some((p) => p.name === s.property));
  if (sorts.length) {
    out = [...out].sort((a, b) => {
      for (const s of sorts) {
        const prop = props.find((p) => p.name === s.property)!;
        const [va, vb] = [getValue(a, prop), getValue(b, prop)];
        const [ea, eb] = [sortsAsEmpty(prop, va), sortsAsEmpty(prop, vb)];
        if (ea || eb) {
          if (ea !== eb) return ea ? 1 : -1; // empties last in either direction, like Notion
          continue;
        }
        const c = compare(prop, va, vb);
        if (c) return s.direction === "asc" ? c : -c;
      }
      return 0;
    });
  }
  return out;
}

/** Visible properties for a view in display order (title first). */
export function visibleProperties(schema: Schema, view: View): Property[] {
  const order = view.order ?? [];
  const props = [...schema.properties].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });
  return [titleOf(schema), ...props.filter((p) => !view.hidden?.includes(p.name))];
}

// ---------- calculations ----------

export const CALC_LABELS: Record<Calc, string> = {
  none: "None",
  count_all: "Count all",
  count_values: "Count values",
  count_empty: "Count empty",
  count_not_empty: "Count not empty",
  count_unique: "Count unique values",
  percent_empty: "Percent empty",
  percent_not_empty: "Percent not empty",
  sum: "Sum",
  average: "Average",
  median: "Median",
  min: "Min",
  max: "Max",
  range: "Range",
  checked: "Checked",
  unchecked: "Unchecked",
  percent_checked: "Percent checked",
  earliest: "Earliest date",
  latest: "Latest date",
  date_range: "Date range",
};

/** Short label shown before the result in the footer, as Notion does. */
export const CALC_SHORT: Partial<Record<Calc, string>> = {
  count_all: "Count",
  count_values: "Values",
  count_empty: "Empty",
  count_not_empty: "Not empty",
  count_unique: "Unique",
  percent_empty: "Empty",
  percent_not_empty: "Not empty",
  sum: "Sum",
  average: "Average",
  median: "Median",
  min: "Min",
  max: "Max",
  range: "Range",
  checked: "Checked",
  unchecked: "Unchecked",
  percent_checked: "Checked",
  earliest: "Earliest",
  latest: "Latest",
  date_range: "Range",
};

export function calcsFor(type: PropType): Calc[][] {
  const count: Calc[] = ["count_all", "count_values", "count_empty", "count_not_empty", "count_unique"];
  const percent: Calc[] = ["percent_empty", "percent_not_empty"];
  if (type === "number") return [["none"], count, percent, ["sum", "average", "median", "min", "max", "range"]];
  if (type === "checkbox") return [["none"], ["count_all", "checked", "unchecked", "percent_checked"]];
  if (type === "date" || type === "created_time" || type === "last_edited_time")
    return [["none"], count, percent, ["earliest", "latest", "date_range"]];
  return [["none"], count, percent];
}

export function calculate(rows: Row[], prop: Property, calc: Calc): string {
  const values = rows.map((r) => getValue(r, prop));
  const filled = values.filter((v) => !isEmptyValue(prop, v));
  const pct = (n: number) => `${rows.length ? +((n / rows.length) * 100).toFixed(1) : 0}%`;
  const nums = values.map(asNumber).filter((n): n is number => n !== null);
  const fmt = (n: number) => formatNumber(n, prop.format);
  const dates = values.map(asDate).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  switch (calc) {
    case "count_all":
      return String(rows.length);
    case "count_values":
      return String(values.reduce<number>((n, v) => n + asList(v).length, 0));
    case "count_empty":
      return String(rows.length - filled.length);
    case "count_not_empty":
      return String(filled.length);
    case "count_unique":
      return String(new Set(values.flatMap(asList)).size);
    case "percent_empty":
      return pct(rows.length - filled.length);
    case "percent_not_empty":
      return pct(filled.length);
    case "sum":
      return fmt(nums.reduce((a, b) => a + b, 0));
    case "average":
      return nums.length ? fmt(nums.reduce((a, b) => a + b, 0) / nums.length) : "—";
    case "median": {
      if (!nums.length) return "—";
      const s = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return fmt(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
    }
    case "min":
      return nums.length ? fmt(Math.min(...nums)) : "—";
    case "max":
      return nums.length ? fmt(Math.max(...nums)) : "—";
    case "range":
      return nums.length ? fmt(Math.max(...nums) - Math.min(...nums)) : "—";
    case "checked":
      return String(values.filter(asBool).length);
    case "unchecked":
      return String(values.filter((v) => !asBool(v)).length);
    case "percent_checked":
      return pct(values.filter(asBool).length);
    case "earliest":
      return dates.length ? formatDate(dates[0]) : "—";
    case "latest":
      return dates.length ? formatDate(dates[dates.length - 1]) : "—";
    case "date_range": {
      if (dates.length < 2) return "—";
      const days = Math.round((dates[dates.length - 1].getTime() - dates[0].getTime()) / 864e5);
      return `${days} day${days === 1 ? "" : "s"}`;
    }
    default:
      return "";
  }
}

// ---------- schema edits ----------

export function uniquePropertyName(schema: Schema, base: string): string {
  const taken = new Set(allProperties(schema).map((p) => p.name.toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
  return name;
}

export function withOption(prop: Property, name: string): { prop: Property; option: SelectOption } {
  const existing = prop.options?.find((o) => o.name === name);
  if (existing) return { prop, option: existing };
  const option = { name, color: nextColor(prop.options?.length ?? 0) };
  return { prop: { ...prop, options: [...(prop.options ?? []), option] }, option };
}

export const isSelectLike = (t: PropType) => t === "select" || t === "status" || t === "multi_select";
export const isReadOnly = (t: PropType) => t === "created_time" || t === "last_edited_time";
