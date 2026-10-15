/**
 * Where Finance keeps its data: ordinary Betelgeuse databases under a "Finance" page, so it can
 * be read and edited like any page (on the phone too, and by AI agents), synced row by row with
 * git, and kept if the plugin is ever removed. This file defines them, creates them, and finds them.
 */
import type { PageMeta, PluginContext } from "@betelgeuse/plugin-api";
import { ACCOUNT_TYPES, ASSET_TYPES, INVESTMENT_TYPES, LIABILITY_TYPES, TX_TYPES } from "./model";

export const DB_KEYS = ["accounts", "transactions", "categories", "holdings", "items", "snapshots"] as const;
export type DbKey = (typeof DB_KEYS)[number];
export type Dbs = Record<DbKey, string>;

/** What Finance saves with the workspace (synced like the pages). */
export type Config = { root?: string; dbs?: Partial<Dbs>; currency?: string };

export const DB_TITLES: Record<DbKey, string> = {
  accounts: "Accounts",
  transactions: "Transactions",
  categories: "Categories",
  holdings: "Investments",
  items: "Assets and liabilities",
  snapshots: "Net worth",
};
const DB_ICONS: Record<DbKey, string> = {
  accounts: "lucide:Landmark:blue",
  transactions: "lucide:ArrowLeftRight:orange",
  categories: "lucide:Shapes:purple",
  holdings: "lucide:ChartLine:green",
  items: "lucide:Scale:brown",
  snapshots: "lucide:ChartArea:blue",
};

// ---------- currency ----------

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "AED", "CHF", "CNY", "NZD", "ZAR", "BRL", "SEK"] as const;

/** The database number format closest to a currency (databases know a few symbols). */
function numberFormat(currency: string) {
  return ({ INR: "rupee", USD: "dollar", AUD: "dollar", CAD: "dollar", SGD: "dollar", NZD: "dollar", EUR: "euro", GBP: "pound", JPY: "yen", CNY: "yen" } as Record<string, string>)[currency] ?? "comma";
}

/** A guess from the computer's locale, for a first setup. */
export function defaultCurrency(): string {
  const region = (Intl.DateTimeFormat().resolvedOptions().locale.split("-")[1] ?? "").toUpperCase();
  const byRegion: Record<string, string> = { IN: "INR", US: "USD", GB: "GBP", JP: "JPY", AU: "AUD", CA: "CAD", SG: "SGD", AE: "AED", CH: "CHF", CN: "CNY", NZ: "NZD", ZA: "ZAR", BR: "BRL", SE: "SEK" };
  const euro = ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "IE", "PT", "FI", "GR"];
  return byRegion[region] ?? (euro.includes(region) ? "EUR" : "USD");
}

// ---------- schemas ----------

type Option = { name: string; color: string };
type Prop = { name: string; type: string; options?: Option[]; format?: string; database?: string; limit?: "one" };
const COLORS = ["blue", "purple", "green", "yellow", "red", "orange", "pink", "brown", "gray"];
const options = (names: readonly string[], colors: string[] = COLORS): Option[] => names.map((name, i) => ({ name, color: colors[i % colors.length] }));
const id = () => Math.random().toString(36).slice(2, 9);
const money = (name: string, currency: string): Prop => ({ name, type: "number", format: numberFormat(currency) });
const link = (to: string): string => `[[${to.replace(/\.md$/, "")}]]`;

/** The properties and views of each database. `dbs` are the related databases' paths (for relations). */
function schemaFor(key: DbKey, currency: string, dbs: Partial<Dbs>) {
  const table = (extra: Record<string, unknown> = {}) => ({ id: id(), name: "Table", type: "table", ...extra });
  switch (key) {
    case "accounts":
      return {
        properties: [
          { name: "Type", type: "select", options: options(ACCOUNT_TYPES, ["blue", "purple", "green", "yellow", "red", "orange"]) },
          { name: "Institution", type: "text" },
          money("Opening balance", currency),
          money("Credit limit", currency),
          { name: "Archived", type: "checkbox" },
        ],
        views: [table(), { id: id(), name: "By type", type: "board", groupBy: "Type" }],
      };
    case "transactions":
      return {
        properties: [
          { name: "Date", type: "date" },
          money("Amount", currency),
          { name: "Type", type: "select", options: options(TX_TYPES, TX_COLORS) },
          { name: "Account", type: "relation", database: link(dbs.accounts!), limit: "one" },
          { name: "To account", type: "relation", database: link(dbs.accounts!), limit: "one" },
          { name: "Category", type: "relation", database: link(dbs.categories!), limit: "one" },
          { name: "Investment", type: "relation", database: link(dbs.holdings!), limit: "one" },
          { name: "Tags", type: "multi_select", options: [] },
          { name: "Notes", type: "text" },
        ],
        views: [
          table({ name: "All", sorts: [{ property: "Date", direction: "desc" }] }),
          table({ name: "This month", sorts: [{ property: "Date", direction: "desc" }], filters: [{ property: "Date", op: "within", value: "this_month" }] }),
          { id: id(), name: "Calendar", type: "calendar", dateProperty: "Date" },
        ],
      };
    case "categories":
      return {
        properties: [
          { name: "Kind", type: "select", options: options(["Expense", "Income"], ["red", "green"]) },
          { name: "Group", type: "select", options: options(["Needs", "Wants", "Savings", "Income"], ["blue", "purple", "green", "yellow"]) },
          money("Monthly budget", currency),
          { name: "Archived", type: "checkbox" },
        ],
        views: [table(), { id: id(), name: "By group", type: "board", groupBy: "Group" }],
      };
    case "holdings":
      return {
        properties: [
          { name: "Type", type: "select", options: options(INVESTMENT_TYPES) },
          money("Invested", currency),
          money("Current value", currency),
          { name: "Units", type: "number", format: "comma" },
          { name: "Account", type: "relation", database: link(dbs.accounts!), limit: "one" },
          { name: "Updated", type: "date" },
          { name: "Closed", type: "checkbox" },
        ],
        views: [table(), { id: id(), name: "By type", type: "board", groupBy: "Type" }],
      };
    case "items":
      return {
        properties: [
          { name: "Kind", type: "select", options: options(["Asset", "Liability"], ["green", "red"]) },
          { name: "Type", type: "select", options: options([...ASSET_TYPES, ...LIABILITY_TYPES]) },
          money("Value", currency),
          { name: "Updated", type: "date" },
          { name: "Notes", type: "text" },
        ],
        views: [table(), { id: id(), name: "By kind", type: "board", groupBy: "Kind" }],
      };
    case "snapshots":
      return {
        properties: [{ name: "Date", type: "date" }, money("Assets", currency), money("Liabilities", currency), money("Net worth", currency)],
        views: [table({ sorts: [{ property: "Date", direction: "desc" }] })],
      };
  }
}

/** Categories a new setup starts with (renamed, removed or added to freely). */
const STARTER_CATEGORIES: [string, "Expense" | "Income", string][] = [
  ["Housing", "Expense", "Needs"],
  ["Groceries", "Expense", "Needs"],
  ["Utilities & bills", "Expense", "Needs"],
  ["Transport", "Expense", "Needs"],
  ["Health", "Expense", "Needs"],
  ["Insurance", "Expense", "Needs"],
  ["Food & dining", "Expense", "Wants"],
  ["Shopping", "Expense", "Wants"],
  ["Entertainment", "Expense", "Wants"],
  ["Subscriptions", "Expense", "Wants"],
  ["Travel", "Expense", "Wants"],
  ["Personal care", "Expense", "Wants"],
  ["Education", "Expense", "Needs"],
  ["Gifts & donations", "Expense", "Wants"],
  ["Fees & charges", "Expense", "Needs"],
  ["Other", "Expense", "Wants"],
  ["Salary", "Income", "Income"],
  ["Business & freelance", "Income", "Income"],
  ["Interest & dividends", "Income", "Income"],
  ["Refunds & cashback", "Income", "Income"],
  ["Other income", "Income", "Income"],
];

const TX_COLORS = ["red", "green", "blue", "purple", "yellow"];

/**
 * Brings databases made by an earlier version up to date: adds what's missing (the Invest and
 * Redeem types, the Investment column) and leaves everything else as the person has it.
 */
export async function upgrade(ctx: PluginContext, dbs: Dbs) {
  const ws = ctx.workspace!;
  const { body } = await ws.readPage(dbs.transactions);
  const m = /```database[ \t]*\n([\s\S]*?)\n```/.exec(body);
  if (!m) return;
  const schema = JSON.parse(m[1]) as { properties: Prop[] };
  let changed = false;
  const type = schema.properties.find((p) => p.name === "Type" && p.type === "select");
  for (const [i, name] of TX_TYPES.entries()) {
    if (type && !type.options?.some((o) => o.name === name)) {
      type.options = [...(type.options ?? []), { name, color: TX_COLORS[i] }];
      changed = true;
    }
  }
  if (!schema.properties.some((p) => p.name === "Investment")) {
    const at = schema.properties.findIndex((p) => p.name === "Category");
    schema.properties.splice(at < 0 ? schema.properties.length : at + 1, 0, { name: "Investment", type: "relation", database: link(dbs.holdings), limit: "one" });
    changed = true;
  }
  if (changed) await ws.writePage(dbs.transactions, body.replace(m[0], () => schemaBlock(schema).trimEnd()));
}

const schemaBlock = (schema: object) => "```database\n" + JSON.stringify(schema, null, 2) + "\n```\n";

/**
 * Creates the Finance page and its databases (and starter categories). `onStep` reports progress.
 * Returns the saved config.
 */
export async function setUp(ctx: PluginContext, currency: string, onStep?: (label: string) => void): Promise<Required<Config>> {
  const ws = ctx.workspace!;
  onStep?.("Creating the Finance page");
  const root = await ws.createPage(null, "Finance");
  await ws.setProperties(root, { icon: "💰" });
  const dbs: Partial<Dbs> = {};
  // Accounts, categories and investments first: transactions relate to them.
  for (const key of ["accounts", "categories", "holdings", "transactions", "items", "snapshots"] as DbKey[]) {
    onStep?.(`Creating ${DB_TITLES[key]}`);
    const path = await ws.createPage(root, DB_TITLES[key]);
    dbs[key] = path;
    await ws.setProperties(path, { type: "database", icon: DB_ICONS[key] });
    await ws.writePage(path, schemaBlock(schemaFor(key, currency, dbs)));
  }
  onStep?.("Adding categories");
  for (const [name, kind, group] of STARTER_CATEGORIES) {
    const row = await ws.createPage(dbs.categories!, name);
    await ws.setProperties(row, { Kind: kind, Group: group });
  }
  await ws.writePage(
    root,
    [
      "Your money, in plain databases: the **Finance** view in the sidebar adds the dashboard, budgets, charts and net worth.",
      "",
      `![[${dbs.transactions!.replace(/\.md$/, "")}]]`,
      "",
    ].join("\n"),
  );
  const config = { root, dbs: dbs as Dbs, currency };
  await ctx.storage.workspace.set(config);
  return config;
}

/**
 * Finds the databases again: at their saved paths, or (moved or renamed with their page) as the
 * Finance databases found side by side in one folder: the saved one if they're still there, else
 * the only folder holding all of them. Null when Finance isn't set up.
 */
export function locate(config: Config, pages: PageMeta[]): Dbs | null {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const saved = (key: DbKey) => {
    const path = config.dbs?.[key];
    return path && byPath.get(path)?.kind === "database" ? path : undefined;
  };
  const folders = new Map<string, Partial<Dbs>>();
  for (const p of pages) {
    const key = DB_KEYS.find((k) => DB_TITLES[k] === p.title);
    if (!key || p.kind !== "database") continue;
    const dir = p.path.slice(0, p.path.lastIndexOf("/") + 1);
    const found = folders.get(dir) ?? {};
    found[key] ??= p.path;
    folders.set(dir, found);
  }
  const complete = [...folders].filter(([, found]) => DB_KEYS.every((k) => found[k]));
  const root = config.root?.replace(/\.md$/, "/");
  const group = (complete.find(([dir]) => dir === root) ?? (complete.length === 1 ? complete[0] : undefined))?.[1] ?? (root ? folders.get(root) : undefined);
  const dbs: Partial<Dbs> = {};
  for (const key of DB_KEYS) dbs[key] = saved(key) ?? group?.[key];
  return DB_KEYS.every((k) => dbs[k]) ? (dbs as Dbs) : null;
}

/** Switches the money columns of every database to `currency`'s format. */
export async function applyCurrency(ctx: PluginContext, dbs: Dbs, currency: string) {
  const ws = ctx.workspace!;
  for (const key of DB_KEYS) {
    const { body } = await ws.readPage(dbs[key]);
    const m = /```database[ \t]*\n([\s\S]*?)\n```/.exec(body);
    if (!m) continue;
    const schema = JSON.parse(m[1]) as { properties: Prop[] };
    const money = new Set(["rupee", "dollar", "euro", "pound", "yen", "comma"]);
    let changed = false;
    for (const p of schema.properties) {
      if (p.type === "number" && p.format && money.has(p.format) && p.name !== "Units") {
        p.format = numberFormat(currency);
        changed = true;
      }
    }
    if (changed) await ws.writePage(dbs[key], body.replace(m[0], () => schemaBlock(schema).trimEnd()));
  }
}
