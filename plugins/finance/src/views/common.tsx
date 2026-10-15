import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { money } from "../format";
import type { Data, Transaction } from "../model";

/** Names by key, for showing what a transaction links to. */
export function useNames(data: Data) {
  return useMemo(() => {
    const accounts = new Map(data.accounts.map((a) => [a.key, a]));
    const categories = new Map(data.categories.map((c) => [c.key, c]));
    const holdings = new Map(data.holdings.map((h) => [h.key, h]));
    const name = <T extends { name: string }>(m: Map<string, T>) => (k: string | null) => (k ? m.get(k)?.name ?? k : "");
    return { accounts, categories, account: name(accounts), category: name(categories), holding: name(holdings) };
  }, [data.accounts, data.categories, data.holdings]);
}

/** One transaction in a list: what, where, and the amount signed by direction. */
export function TxRow({ tx, data, currency, onOpen, showDate }: { tx: Transaction; data: Data; currency: string; onOpen: (t: Transaction) => void; showDate?: boolean }) {
  const names = useNames(data);
  const detail =
    tx.type === "Transfer"
      ? `${names.account(tx.account) || "?"} → ${names.account(tx.to) || "?"}`
      : tx.type === "Invest"
        ? `Invested · ${names.account(tx.account) || "?"} → ${names.holding(tx.holding) || "?"}`
        : tx.type === "Redeem"
          ? `Redeemed · ${names.holding(tx.holding) || "?"} → ${names.account(tx.account) || "?"}`
          : [names.category(tx.category) || (tx.type === "Expense" ? "Uncategorised" : "Income"), names.account(tx.account)].filter(Boolean).join(" · ");
  const icon = {
    Transfer: <ArrowLeftRight size={15} />,
    Income: <ArrowDownLeft size={15} />,
    Expense: <ArrowUpRight size={15} />,
    Invest: <TrendingUp size={15} />,
    Redeem: <TrendingDown size={15} />,
  }[tx.type];
  return (
    <button onClick={() => onOpen(tx)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
      <span className={`grid size-8 shrink-0 place-items-center rounded-full ${tx.type === "Income" ? "bg-accent-soft text-[var(--accent)]" : "bg-hover text-muted"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{tx.name}</span>
        <span className="block truncate text-xs text-muted">
          {showDate && `${tx.date} · `}
          {detail}
          {tx.tags.length > 0 && ` · ${tx.tags.map((t) => `#${t}`).join(" ")}`}
        </span>
      </span>
      <span className={`shrink-0 text-sm font-medium tabular-nums ${tx.type === "Income" ? "text-[var(--fin-up)]" : tx.type === "Expense" ? "text-ink" : "text-muted"}`}>
        {tx.type === "Income" ? "+" : tx.type === "Expense" ? "−" : ""}
        {money(tx.amount, currency)}
      </span>
    </button>
  );
}
