/**
 * Finance's data and arithmetic, with no UI: the rows of the Finance databases read into typed
 * records, and everything worked out from them (balances, budgets, cash flow, net worth,
 * investment returns). Amounts are plain numbers in the workspace's currency.
 */

// ---------- records ----------

export const ACCOUNT_TYPES = ["Bank account", "Credit card", "Cash", "Wallet", "Loan", "Investment account"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
/** Accounts that hold what you owe: their balance is entered, and shown, as a positive amount due. */
export const OWED: ReadonlySet<string> = new Set(["Credit card", "Loan"]);

/** Invest moves money from an account into an investment; Redeem brings it back (a sale, a maturity). */
export const TX_TYPES = ["Expense", "Income", "Transfer", "Invest", "Redeem"] as const;
export type TxType = (typeof TX_TYPES)[number];

export const INVESTMENT_TYPES = [
  "Stocks",
  "Mutual funds",
  "ETFs",
  "Fixed deposits",
  "Retirement (PPF, EPF, NPS, 401k)",
  "Bonds",
  "Gold",
  "Crypto",
  "Real estate",
  "Other",
] as const;

export const ASSET_TYPES = ["Property", "Vehicle", "Gold & jewellery", "Cash at home", "Money owed to you", "Other asset"] as const;
export const LIABILITY_TYPES = ["Home loan", "Car loan", "Personal loan", "Education loan", "Money you owe", "Other liability"] as const;

/** Every record knows its row: `key` is the row's file name, which links (relations) name. */
type RowRef = { key: string; path: string; name: string };

export type Account = RowRef & { type: AccountType; institution: string; opening: number; limit: number | null; archived: boolean };
export type Transaction = RowRef & {
  date: string;
  amount: number;
  type: TxType;
  account: string | null;
  /** Transfers: the account the money went to (a card payment, a savings move, a loan payment). */
  to: string | null;
  /** Invest and Redeem: the investment the money went into or came out of. */
  holding: string | null;
  category: string | null;
  tags: string[];
  notes: string;
};
export type Category = RowRef & { kind: "Expense" | "Income"; group: string; budget: number; archived: boolean };
export type Holding = RowRef & { type: string; invested: number; value: number; units: number | null; account: string | null; updated: string | null; closed: boolean };
export type Item = RowRef & { kind: "Asset" | "Liability"; type: string; value: number; updated: string | null };
export type Snapshot = RowRef & { date: string; assets: number; liabilities: number; netWorth: number };

export type Data = {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  holdings: Holding[];
  items: Item[];
  snapshots: Snapshot[];
};

/** A database row as the plugin API gives it. */
export type RawRow = { path: string; title: string; properties: Record<string, unknown> };

// ---------- reading rows ----------

export const rowKey = (path: string) => path.replace(/^.*\//, "").replace(/\.md$/, "");

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseNumber(v) : null;
  return n !== null && Number.isFinite(n) ? n : 0;
};
const optNum = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(num(v)) ? num(v) : null);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : Array.isArray(v) ? String(v[0] ?? "") : "");
const bool = (v: unknown) => v === true || v === "true" || v === "yes";
/** Dates are stored `YYYY-MM-DD` (or a full ISO date-time). */
const day = (v: unknown): string | null => {
  const s = v instanceof Date ? isoDay(v) : str(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
/** The row a relation links to, by its key: `[[Finance/Accounts/HDFC]]` or `[[HDFC]]` → `HDFC`. */
export function linkKey(v: unknown): string | null {
  const first = Array.isArray(v) ? v[0] : v;
  if (typeof first !== "string" || !first.trim()) return null;
  const m = /\[\[([^\]|#]+)/.exec(first);
  const target = (m ? m[1] : first).trim();
  return target.replace(/^.*\//, "").replace(/\.md$/, "") || null;
}
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split(/,\s*/) : []);
const ref = (r: RawRow): RowRef => ({ key: rowKey(r.path), path: r.path, name: r.title });
const oneOf = <T extends string>(values: readonly T[], v: unknown, fallback: T): T => (values.includes(str(v) as T) ? (str(v) as T) : fallback);

export function parseData(raw: { accounts: RawRow[]; transactions: RawRow[]; categories: RawRow[]; holdings: RawRow[]; items: RawRow[]; snapshots: RawRow[] }): Data {
  return {
    accounts: raw.accounts.map((r) => ({
      ...ref(r),
      type: oneOf(ACCOUNT_TYPES, r.properties.Type, "Bank account"),
      institution: str(r.properties.Institution),
      opening: num(r.properties["Opening balance"]),
      limit: optNum(r.properties["Credit limit"]),
      archived: bool(r.properties.Archived),
    })),
    transactions: raw.transactions
      .map((r) => ({
        ...ref(r),
        date: day(r.properties.Date) ?? "",
        amount: Math.abs(num(r.properties.Amount)),
        type: oneOf(TX_TYPES, r.properties.Type, "Expense"),
        account: linkKey(r.properties.Account),
        to: linkKey(r.properties["To account"]),
        holding: linkKey(r.properties.Investment),
        category: linkKey(r.properties.Category),
        tags: list(r.properties.Tags),
        notes: str(r.properties.Notes),
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)),
    categories: raw.categories.map((r) => ({
      ...ref(r),
      kind: str(r.properties.Kind) === "Income" ? "Income" : "Expense",
      group: str(r.properties.Group),
      budget: num(r.properties["Monthly budget"]),
      archived: bool(r.properties.Archived),
    })),
    holdings: raw.holdings.map((r) => ({
      ...ref(r),
      type: str(r.properties.Type) || "Other",
      invested: num(r.properties.Invested),
      value: num(r.properties["Current value"]),
      units: optNum(r.properties.Units),
      account: linkKey(r.properties.Account),
      updated: day(r.properties.Updated),
      closed: bool(r.properties.Closed),
    })),
    items: raw.items.map((r) => ({
      ...ref(r),
      kind: str(r.properties.Kind) === "Liability" ? "Liability" : "Asset",
      type: str(r.properties.Type),
      value: Math.abs(num(r.properties.Value)),
      updated: day(r.properties.Updated),
    })),
    snapshots: raw.snapshots
      .map((r) => ({
        ...ref(r),
        date: day(r.properties.Date) ?? "",
        assets: num(r.properties.Assets),
        liabilities: num(r.properties.Liabilities),
        netWorth: num(r.properties["Net worth"]),
      }))
      .filter((s) => s.date)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ---------- dates ----------

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => isoDay(new Date());
/** `2026-10` for `2026-10-15`. */
export const monthOf = (date: string) => date.slice(0, 7);
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** The `n` months ending with `last`, oldest first. */
export const monthsEnding = (last: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(last, i - n + 1));
export const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

// ---------- balances ----------

/**
 * Each account's balance on `asOf` (later, scheduled transactions don't count yet). Positive is
 * money you have; for cards and loans it's negative, what you owe. Expenses and income move one
 * account; a transfer takes from one and adds to the other, so paying a card or a loan EMI from
 * the bank reduces what's owed.
 */
export function balances(data: Data, asOf = today()): Map<string, number> {
  const out = new Map<string, number>(data.accounts.map((a) => [a.key, OWED.has(a.type) ? -Math.abs(a.opening) : a.opening]));
  const add = (key: string | null, delta: number) => key && out.has(key) && out.set(key, out.get(key)! + delta);
  for (const t of data.transactions) {
    if (!t.date || t.date > asOf) continue;
    if (t.type === "Expense" || t.type === "Invest") add(t.account, -t.amount);
    else if (t.type === "Income" || t.type === "Redeem") add(t.account, t.amount);
    else {
      add(t.account, -t.amount);
      add(t.to, t.amount);
    }
  }
  return out;
}

/** What an account shows: its balance, or for cards and loans the amount due and (cards) how much of the limit is used. */
export function accountState(account: Account, balance: number) {
  const owed = OWED.has(account.type);
  const due = owed ? Math.max(0, -balance) : 0;
  return { balance, owed, due, utilisation: owed && account.limit ? due / account.limit : null };
}

// ---------- months ----------

export type MonthSummary = {
  month: string;
  income: number;
  expense: number;
  /** Income minus spending. */
  saved: number;
  /** Share of income kept, or null without income. */
  rate: number | null;
  /** Spending by category key ("" for uncategorised). */
  byCategory: Map<string, number>;
  incomeByCategory: Map<string, number>;
  /** Put into investments, less what was taken out (part of what was saved, not spending). */
  invested: number;
  count: number;
};

export function monthSummary(data: Data, month: string): MonthSummary {
  let income = 0;
  let expense = 0;
  let count = 0;
  let invested = 0;
  const byCategory = new Map<string, number>();
  const incomeByCategory = new Map<string, number>();
  for (const t of data.transactions) {
    if (monthOf(t.date) !== month || t.type === "Transfer") continue;
    if (t.type === "Invest" || t.type === "Redeem") {
      invested += t.type === "Invest" ? t.amount : -t.amount;
      count++;
      continue;
    }
    count++;
    const map = t.type === "Expense" ? byCategory : incomeByCategory;
    map.set(t.category ?? "", (map.get(t.category ?? "") ?? 0) + t.amount);
    if (t.type === "Expense") expense += t.amount;
    else income += t.amount;
  }
  return { month, income, expense, saved: income - expense, rate: income > 0 ? (income - expense) / income : null, byCategory, incomeByCategory, invested, count };
}

export function cashflow(data: Data, months: string[]) {
  return months.map((m) => {
    const s = monthSummary(data, m);
    return { month: m, income: s.income, expense: s.expense };
  });
}

export type BudgetLine = { category: Category | null; budget: number; spent: number; share: number | null };

/**
 * A month's budget: each expense category with a budget or with spending, budgeted ones first
 * (most used first), then unbudgeted spending, then what wasn't categorised.
 */
export function budget(data: Data, month: string) {
  const s = monthSummary(data, month);
  const lines: BudgetLine[] = data.categories
    .filter((c) => c.kind === "Expense" && (!c.archived || s.byCategory.has(c.key)))
    .map((c) => {
      const spent = s.byCategory.get(c.key) ?? 0;
      return { category: c, budget: c.budget, spent, share: c.budget > 0 ? spent / c.budget : null };
    })
    .filter((l) => l.budget > 0 || l.spent > 0)
    .sort((a, b) => Number(b.budget > 0) - Number(a.budget > 0) || (b.share ?? 0) - (a.share ?? 0) || b.spent - a.spent);
  const known = new Set(data.categories.map((c) => c.key));
  const loose = [...s.byCategory].filter(([k]) => !known.has(k)).reduce((sum, [, v]) => sum + v, 0);
  if (loose > 0) lines.push({ category: null, budget: 0, spent: loose, share: null });
  const budgeted = lines.reduce((sum, l) => sum + l.budget, 0);
  const spentInBudget = lines.filter((l) => l.budget > 0).reduce((sum, l) => sum + l.spent, 0);
  return { summary: s, lines, budgeted, spent: s.expense, spentInBudget, left: budgeted - spentInBudget };
}

// ---------- investments, with what's logged as transactions ----------

/**
 * Investments as they stand on `asOf`, with Invest and Redeem transactions counted in:
 * - invested: what's entered on the investment, plus money put in, less money taken out;
 * - value: the value last entered, plus money put in or taken out after that day (all of it,
 *   when no value date is set: an investment started from a transaction).
 */
export function effectiveHoldings(data: Data, asOf = today()): Holding[] {
  const flows = new Map<string, Transaction[]>();
  for (const t of data.transactions) {
    if ((t.type !== "Invest" && t.type !== "Redeem") || !t.holding || !t.date || t.date > asOf) continue;
    flows.set(t.holding, [...(flows.get(t.holding) ?? []), t]);
  }
  return data.holdings.map((h) => {
    const txs = flows.get(h.key);
    if (!txs) return h;
    let invested = h.invested;
    let value = h.value;
    for (const t of txs) {
      const sign = t.type === "Invest" ? 1 : -1;
      invested += sign * t.amount;
      if (!h.updated || t.date > h.updated) value += sign * t.amount;
    }
    return { ...h, invested: Math.max(0, invested), value: Math.max(0, value) };
  });
}

/**
 * What to save when an investment is edited. The screen shows it with its Invest and Redeem
 * transactions counted in (`effectiveHoldings`); what's saved leaves them out again, or the next
 * read would count them twice. A changed value is a valuation as of `asOf`, which already has the
 * transactions up to then in it.
 */
export function holdingEdit(
  data: Data,
  shown: Holding | undefined,
  input: { invested: number | null; value: number | null },
  asOf = today(),
): { invested: number; value: number; updated: string | null } {
  const invested = input.invested ?? 0;
  if (!shown) return { invested, value: input.value ?? invested, updated: asOf };
  const saved = data.holdings.find((h) => h.path === shown.path) ?? shown;
  const fromTransactions = shown.invested - saved.invested;
  const revalued = input.value !== null && input.value !== shown.value;
  return {
    invested: Math.max(0, invested - fromTransactions),
    value: revalued ? input.value! : saved.value,
    updated: revalued ? asOf : saved.updated,
  };
}

// ---------- net worth ----------

export type NetWorth = {
  assets: number;
  liabilities: number;
  net: number;
  /** Where it comes from, for the breakdown. */
  parts: { cash: number; investmentAccounts: number; investments: number; otherAssets: number; cards: number; loans: number; otherLiabilities: number };
};

/** Net worth on `asOf` (pass the same day the balances were worked out for). */
export function netWorth(data: Data, bal = balances(data), asOf = today()): NetWorth {
  const parts = { cash: 0, investmentAccounts: 0, investments: 0, otherAssets: 0, cards: 0, loans: 0, otherLiabilities: 0 };
  for (const a of data.accounts) {
    const b = bal.get(a.key) ?? 0;
    if (a.type === "Credit card") parts.cards += Math.max(0, -b);
    else if (a.type === "Loan") parts.loans += Math.max(0, -b);
    else if (b < 0) parts.otherLiabilities += -b; // an overdrawn account
    else if (a.type === "Investment account") parts.investmentAccounts += b;
    else parts.cash += b;
  }
  for (const h of effectiveHoldings(data, asOf)) if (!h.closed) parts.investments += h.value;
  for (const i of data.items) {
    if (i.kind === "Asset") parts.otherAssets += i.value;
    else parts.otherLiabilities += i.value;
  }
  const assets = parts.cash + parts.investmentAccounts + parts.investments + parts.otherAssets;
  const liabilities = parts.cards + parts.loans + parts.otherLiabilities;
  return { assets, liabilities, net: assets - liabilities, parts };
}

/** Whether this month's snapshot is missing, or out of date (off by more than rounding). */
export function snapshotDue(data: Data, nw: NetWorth, month = monthOf(today())): Snapshot | "new" | null {
  const current = data.snapshots.find((s) => monthOf(s.date) === month);
  if (!current) return data.accounts.length || data.holdings.length || data.items.length ? "new" : null;
  const off = (a: number, b: number) => Math.abs(a - b) > 0.5;
  return off(current.assets, nw.assets) || off(current.liabilities, nw.liabilities) || off(current.netWorth, nw.net) ? current : null;
}

// ---------- investments ----------

export function investments(data: Data) {
  const open = effectiveHoldings(data).filter((h) => !h.closed);
  const invested = open.reduce((s, h) => s + h.invested, 0);
  const value = open.reduce((s, h) => s + h.value, 0);
  const byType = new Map<string, { value: number; invested: number }>();
  for (const h of open) {
    const t = byType.get(h.type) ?? { value: 0, invested: 0 };
    byType.set(h.type, { value: t.value + h.value, invested: t.invested + h.invested });
  }
  return {
    holdings: open,
    invested,
    value,
    gain: value - invested,
    gainShare: invested > 0 ? (value - invested) / invested : null,
    byType: [...byType].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.value - a.value),
  };
}

// ---------- CSV import ----------

/** Splits CSV text into rows of cells (quoted cells may hold commas, quotes and line breaks). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/** Reads a statement's date in the common shapes: 2026-10-05, 05/10/2026 (day first unless `monthFirst`), 5 Oct 2026. */
export function parseDate(s: string, monthFirst = false): string | null {
  const t = s.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return monthFirst ? valid(y, +m[1], +m[2]) : valid(y, +m[2], +m[1]);
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : isoDay(d);
}
function valid(y: number, m: number, d: number): string | null {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? isoDay(date) : null;
}

/** Reads an amount like "1,234.50", "(200)", "-₹ 450", "Rs. 450 Dr"; negative for money out. */
export function parseAmount(s: string): number | null {
  const t = s.trim();
  const n = parseNumber(t.replace(/^[-(]\s*/, ""));
  if (n === null) return null;
  const negative = /^-|^\(.*\)$|\bdr\.?$/i.test(t) || /-\s*$/.test(t);
  return negative ? -Math.abs(n) : n;
}

/**
 * A number as people write it: "1,234.56", "1,00,000", "1.234,56", "12,50", "₹ 1 200", "Rs.450".
 * The last separator is the decimal point when both kinds appear; a lone comma is one unless three
 * digits follow it ("1,234"); a lone dot always is. Anything before the first digit (a currency) is
 * skipped. Null when there's no number.
 */
export function parseNumber(s: string): number | null {
  let t = s.trim();
  const negative = t.startsWith("-");
  if (negative) t = t.slice(1).trimStart();
  if (/^[.,]\d/.test(t)) t = "0" + t;
  const m = /\d[\d.,'\s]*/.exec(t);
  if (!m) return null;
  const digits = m[0].replace(/['\s]/g, "").replace(/[.,]+$/, "");
  const dot = digits.lastIndexOf(".");
  const comma = digits.lastIndexOf(",");
  const lone = (i: number) => digits.indexOf(digits[i]) === i;
  let decimal = -1;
  if (dot >= 0 && comma >= 0) decimal = Math.max(dot, comma);
  else if (dot >= 0 && lone(dot)) decimal = dot;
  else if (comma >= 0 && lone(comma) && digits.length - comma - 1 !== 3) decimal = comma;
  const whole = (decimal < 0 ? digits : digits.slice(0, decimal)).replace(/[.,]/g, "");
  const n = Number(decimal < 0 ? whole : `${whole}.${digits.slice(decimal + 1)}`);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/**
 * Which row of a statement is its header: statements often start with lines about the account
 * ("Statement Date : 15/10/2026"), so the first row naming both a date and an amount column, else
 * the first naming a date.
 */
export function statementHeader(rows: string[][]): number {
  const names = (r: string[], re: RegExp) => r.some((c) => re.test(c.trim()));
  const dated = (r: string[]) => r.filter((c) => c.trim()).length >= 2 && names(r, /date/i);
  const both = rows.findIndex((r) => dated(r) && names(r, /amount|amt|debit|credit|withdrawal|deposit|\bdr\b|\bcr\b|paid (in|out)|money (in|out)/i));
  if (both >= 0) return both;
  return Math.max(0, rows.findIndex((r) => r.some((c) => /date/i.test(c))));
}
