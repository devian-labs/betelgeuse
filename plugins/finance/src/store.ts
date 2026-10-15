/**
 * Finance's live state: the config, the databases' rows (re-read whenever pages change on disk),
 * and the writes the screens make. One shared copy for every Finance screen.
 */
import type { PluginContext, Workspace } from "@betelgeuse/plugin-api";
import { useSyncExternalStore } from "react";
import { balances, monthOf, netWorth, parseData, snapshotDue, today, type Data, type TxType } from "./model";
import { DB_KEYS, defaultCurrency, locate, upgrade, type Config, type DbKey, type Dbs } from "./schema";

let ctx: PluginContext | null = null;
export const setContext = (c: PluginContext | null) => (ctx = c);
export function host(): PluginContext {
  if (!ctx) throw new Error("Finance isn't active");
  return ctx;
}
export const ws = (): Workspace => host().workspace!;

export type State = {
  status: "loading" | "setup" | "ready";
  config: Config;
  dbs: Dbs | null;
  data: Data;
  currency: string;
  error: string | null;
};

const EMPTY: Data = { accounts: [], transactions: [], categories: [], holdings: [], items: [], snapshots: [] };
let state: State = { status: "loading", config: {}, dbs: null, data: EMPTY, currency: defaultCurrency(), error: null };
const listeners = new Set<() => void>();
const emit = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export function useFinance(): State {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}
export const current = () => state;

let loading: Promise<void> | null = null;
/** The Transactions database last brought up to date (once a session). */
let upgraded: string | null = null;
let again = false;

/** Re-reads everything (coalescing calls that arrive while a read is under way). */
export function reload(): Promise<void> {
  if (loading) {
    again = true;
    return loading;
  }
  loading = (async () => {
    try {
      const config = await host().storage.workspace.get<Config>();
      const pages = await ws().listPages();
      const dbs = locate(config, pages);
      if (!dbs) return emit({ status: "setup", config, dbs: null, data: EMPTY, error: null });
      // Found somewhere else (the Finance page was moved or renamed): remember where.
      if (DB_KEYS.some((k) => config.dbs?.[k] !== dbs[k])) {
        const root = dbs.transactions.slice(0, dbs.transactions.lastIndexOf("/")) + ".md";
        await host().storage.workspace.set({ ...config, root, dbs });
      }
      if (upgraded !== dbs.transactions) {
        upgraded = dbs.transactions;
        await upgrade(host(), dbs);
      }
      const rows = await Promise.all(DB_KEYS.map((k) => ws().databaseRows(dbs[k])));
      const raw = Object.fromEntries(DB_KEYS.map((k, i) => [k, rows[i]])) as Record<DbKey, (typeof rows)[number]>;
      const data = parseData(raw);
      emit({ status: "ready", config, dbs, data, currency: config.currency ?? defaultCurrency(), error: null });
      recordSnapshot();
    } catch (e) {
      emit({ error: String(e) });
    } finally {
      loading = null;
      if (again) {
        again = false;
        void reload();
      }
    }
  })();
  return loading;
}

/** Starts following the workspace; returns a stop function. */
export function start(): () => void {
  void reload();
  const sub = ws().onChange(() => void reload());
  return () => sub.dispose();
}

// ---------- net worth history ----------

/**
 * Keeps this month's net worth snapshot current, so the trend has a point for every month the
 * books were open. Past months are left as they were recorded.
 */
function recordSnapshot() {
  // One at a time: creating the page re-reads the books before its Date is set, which would
  // otherwise look like a month with no snapshot yet and start another.
  if (snapshotting) return;
  snapshotting = writeSnapshot()
    // Next time, start over (the page may have been deleted).
    .catch(() => {
      made = null;
    })
    .finally(() => (snapshotting = null));
}
let snapshotting: Promise<void> | null = null;
/** This month's snapshot page once this session made it: a read from before its Date was set doesn't make another. */
let made: { month: string; path: string } | null = null;

async function writeSnapshot() {
  const { data, dbs } = state;
  if (!dbs) return;
  const nw = netWorth(data, balances(data));
  const due = snapshotDue(data, nw);
  if (!due) return;
  const values = { Date: today(), Assets: round(nw.assets), Liabilities: round(nw.liabilities), "Net worth": round(nw.net) };
  const month = monthOf(today());
  let path: string;
  if (due !== "new") path = due.path;
  else if (made?.month === month && made.path.startsWith(dbs.snapshots.replace(/\.md$/, "/"))) path = made.path;
  else {
    path = await ws().createPage(dbs.snapshots, month);
    made = { month, path };
  }
  await ws().setProperties(path, values);
}
const round = (n: number) => Math.round(n * 100) / 100;

// ---------- writes ----------

const link = (key: string | null | undefined) => (key ? [`[[${key}]]`] : null);

export type TxInput = {
  name: string;
  type: TxType;
  amount: number;
  date: string;
  account: string | null;
  to: string | null;
  category: string | null;
  holding: string | null;
  tags: string[];
  notes: string;
};

const txValues = (t: TxInput) => ({
  Date: t.date,
  Amount: Math.abs(t.amount),
  Type: t.type,
  Account: link(t.account),
  "To account": t.type === "Transfer" ? link(t.to) : null,
  Category: t.type === "Expense" || t.type === "Income" ? link(t.category) : null,
  Investment: t.type === "Invest" || t.type === "Redeem" ? link(t.holding) : null,
  Tags: t.tags.length ? t.tags : null,
  Notes: t.notes.trim() || null,
});

const nameFor = (t: TxInput) => t.name.trim() || t.type;

export async function addTransaction(t: TxInput) {
  const path = await ws().createPage(state.dbs!.transactions, nameFor(t));
  await ws().setProperties(path, txValues(t));
  return path;
}

export async function updateTransaction(path: string, oldName: string, t: TxInput) {
  let at = path;
  if (nameFor(t) !== oldName && ws().renamePage) at = await ws().renamePage!(path, nameFor(t));
  await ws().setProperties(at, txValues(t));
}

export const canDelete = () => !!ws().deletePage;
export async function deletePage(path: string) {
  await ws().deletePage?.(path);
}

export async function addRow(db: DbKey, name: string, values: Record<string, unknown>) {
  const path = await ws().createPage(state.dbs![db], name.trim() || "Untitled");
  await ws().setProperties(path, values);
  return path;
}

export async function updateRow(path: string, oldName: string, name: string, values: Record<string, unknown>) {
  let at = path;
  if (name.trim() && name.trim() !== oldName && ws().renamePage) at = await ws().renamePage!(path, name.trim());
  await ws().setProperties(at, values);
}

export const setProperties = (path: string, values: Record<string, unknown>) => ws().setProperties(path, values);
export const openPage = (path: string, newTab = false) => ws().openPage(path, { newTab });

// ---------- opening a form from anywhere (a command, a ⌘K result) ----------

export type FormRequest = "transaction" | "import";
let pending: FormRequest | null = null;
const formListeners = new Set<() => void>();
/** Calls `open` for every request to open a form, including one made before the view existed. */
export function onFormRequest(open: (form: FormRequest) => void) {
  const check = () => {
    if (!pending) return;
    const form = pending;
    pending = null;
    open(form);
  };
  check();
  formListeners.add(check);
  return () => void formListeners.delete(check);
}
export function requestForm(form: FormRequest) {
  pending = form;
  formListeners.forEach((l) => l());
}
