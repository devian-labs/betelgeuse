import { Button } from "@betelgeuse/plugin-api/ui";
import { CircleAlert, Landmark, Plus, Receipt, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { CashflowChart, Legend, Meter, meterState, TrendChart } from "../charts";
import { compact, money, monthLabel, percent } from "../format";
import { accountState, balances, budget, cashflow, monthOf, monthsEnding, netWorth, today, type Transaction } from "../model";
import { useFinance } from "../store";
import { Card, Delta, Empty, Stat } from "../ui";
import { TxRow } from "./common";

export type Go = (tab: "transactions" | "budget" | "accounts" | "investments" | "networth", month?: string) => void;

export function Overview({ go, onEdit, onAdd, onAddAccount }: { go: Go; onEdit: (t: Transaction) => void; onAdd: () => void; onAddAccount: () => void }) {
  const { data, currency } = useFinance();
  const month = monthOf(today());
  const bal = useMemo(() => balances(data), [data]);
  const nw = useMemo(() => netWorth(data, bal), [data, bal]);
  const b = useMemo(() => budget(data, month), [data, month]);
  const flow = useMemo(() => cashflow(data, monthsEnding(month, 12)), [data, month]);
  const lastMonth = data.snapshots.filter((s) => monthOf(s.date) < month).at(-1);
  const trend = data.snapshots.map((s) => ({ date: s.date, value: monthOf(s.date) === month ? nw.net : s.netWorth }));
  const s = b.summary;

  if (!data.accounts.length) {
    return (
      <Card>
        <Empty
          icon={<Landmark size={20} />}
          title="Start with your accounts"
          action={
            <Button variant="primary" icon={<Plus size={14} />} onClick={onAddAccount}>
              Add an account
            </Button>
          }
        >
          Add your bank accounts, credit cards, cash and loans with what they hold today. Then every transaction keeps their balances, your budget and your net worth up to date.
        </Empty>
      </Card>
    );
  }

  const cards = data.accounts.filter((a) => !a.archived).map((a) => ({ a, st: accountState(a, bal.get(a.key) ?? 0) }));
  const alerts = b.lines.filter((l) => l.share !== null && meterState(l.share) === "over");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <Card>
          <Stat
            big
            label="Net worth"
            value={money(nw.net, currency)}
            note={
              lastMonth ? (
                <>
                  <Delta value={nw.net - lastMonth.netWorth}>{money(Math.abs(nw.net - lastMonth.netWorth), currency)}</Delta> since {monthLabel(monthOf(lastMonth.date), true)}
                </>
              ) : (
                "Recorded each month from here on"
              )
            }
          />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <Stat label="Assets" value={compact(nw.assets, currency)} />
            <Stat label="Liabilities" value={compact(nw.liabilities, currency)} />
          </div>
          <button onClick={() => go("networth")} className="mt-3 text-xs font-medium text-[var(--accent)] hover:underline">
            See the breakdown
          </button>
        </Card>
        <Card title={monthLabel(month)} action={<span className="text-xs text-muted">{s.count} transactions</span>}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Income" value={money(s.income, currency)} />
            <Stat label="Spent" value={money(s.expense, currency)} />
            <Stat
              label="Saved"
              value={money(s.saved, currency)}
              note={[s.rate !== null && `${percent(s.rate)} of income`, s.invested > 0 && `${money(s.invested, currency)} invested`].filter(Boolean).join(" · ") || undefined}
            />
            <Stat
              label="Budget left"
              value={b.budgeted ? money(b.left, currency) : "—"}
              note={b.budgeted ? `of ${money(b.budgeted, currency)}` : <button onClick={() => go("budget")} className="text-[var(--accent)] hover:underline">Set budgets</button>}
            />
          </div>
          {b.budgeted > 0 && (
            <div className="mt-4">
              <Meter share={b.spentInBudget / b.budgeted} height={8} />
            </div>
          )}
          {alerts.length > 0 && (
            <button onClick={() => go("budget")} className="mt-3 flex items-center gap-1.5 text-xs text-ink hover:underline">
              <CircleAlert size={13} style={{ color: "var(--fin-critical)" }} />
              Over budget: {alerts.map((l) => l.category?.name).join(", ")}
            </button>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.9fr_1.1fr]">
        <Card title="Cash flow" action={<span className="text-xs text-muted">Last 12 months · click a month for its budget</span>}>
          <div className="mb-2">
            <Legend
              items={[
                { label: "Income", color: "var(--fin-1)" },
                { label: "Spending", color: "var(--fin-2)" },
              ]}
            />
          </div>
          <CashflowChart data={flow} currency={currency} onPick={(m) => go("budget", m)} />
        </Card>
        <Card title="Where it went" action={<button onClick={() => go("budget")} className="text-xs text-[var(--accent)] hover:underline">Budget</button>}>
          {b.lines.length ? (
            <div className="space-y-3">
              {b.lines
                .filter((l) => l.spent > 0)
                .sort((x, y) => y.spent - x.spent)
                .slice(0, 6)
                .map((l) => (
                  <div key={l.category?.key ?? "none"}>
                    <div className="mb-1 flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-ink">{l.category?.name ?? "Uncategorised"}</span>
                      <span className="text-ink tabular-nums">{money(l.spent, currency)}</span>
                      {l.budget > 0 && <span className="text-xs text-muted tabular-nums">/ {compact(l.budget, currency)}</span>}
                      {s.income > 0 && <span className="text-xs text-muted tabular-nums">· {percent(l.spent / s.income)} of income</span>}
                    </div>
                    <Meter share={l.budget > 0 ? l.spent / l.budget : l.spent / Math.max(1, s.expense)} />
                  </div>
                ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted">Nothing spent this month yet.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Net worth over time" action={<button onClick={() => go("networth")} className="text-xs text-[var(--accent)] hover:underline">Details</button>}>
          {trend.length > 1 ? (
            <TrendChart points={trend} currency={currency} height={200} />
          ) : (
            <p className="py-10 text-center text-sm text-muted">The trend begins next month: your net worth is saved once a month as you go.</p>
          )}
        </Card>
        <Card title="Accounts" action={<button onClick={() => go("accounts")} className="text-xs text-[var(--accent)] hover:underline">All accounts</button>}>
          <div className="space-y-1">
            {cards.slice(0, 7).map(({ a, st }) => (
              <div key={a.key} className="flex items-center gap-3 py-1">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{a.name}</span>
                  <span className="block text-xs text-muted">{a.type}</span>
                </span>
                {st.owed ? (
                  <span className="text-right">
                    <span className="block text-sm text-ink tabular-nums">{money(st.due, currency)} due</span>
                    {st.utilisation !== null && (
                      <span className="flex items-center justify-end gap-1 text-xs text-muted">
                        {st.utilisation > 0.3 && <TriangleAlert size={11} style={{ color: "var(--fin-warning)" }} />}
                        {percent(st.utilisation)} of limit
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-ink tabular-nums">{money(st.balance, currency)}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Recent transactions"
        action={
          <span className="flex gap-1">
            <Button variant="ghost" icon={<Plus size={14} />} onClick={onAdd}>
              Add
            </Button>
            <Button variant="ghost" onClick={() => go("transactions")}>
              See all
            </Button>
          </span>
        }
      >
        {data.transactions.length ? (
          <div className="-mx-2">
            {data.transactions
              .filter((t) => t.date <= today())
              .slice(0, 8)
              .map((t) => (
                <TxRow key={t.path} tx={t} data={data} currency={currency} onOpen={onEdit} showDate />
              ))}
          </div>
        ) : (
          <Empty icon={<Receipt size={20} />} title="No transactions yet">
            Add what you spend and earn, or import a statement from your bank.
          </Empty>
        )}
      </Card>
    </div>
  );
}
