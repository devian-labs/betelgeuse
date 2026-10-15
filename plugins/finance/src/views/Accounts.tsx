import { Button } from "@betelgeuse/plugin-api/ui";
import { Landmark, Pencil, Plus, TriangleAlert } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Meter } from "../charts";
import { money, percent } from "../format";
import { accountState, balances, monthOf, today, type Account } from "../model";
import type { TxInput } from "../store";
import { useFinance } from "../store";
import { Card, Empty, Stat } from "../ui";

const GROUPS: { title: string; types: string[] }[] = [
  { title: "Bank and cash", types: ["Bank account", "Cash", "Wallet"] },
  { title: "Credit cards", types: ["Credit card"] },
  { title: "Loans", types: ["Loan"] },
  { title: "Investment accounts", types: ["Investment account"] },
];

export function Accounts({ onAdd, onEdit, onPay }: { onAdd: () => void; onEdit: (a: Account) => void; onPay: (preset: Partial<TxInput>) => void }) {
  const { data, currency } = useFinance();
  const bal = useMemo(() => balances(data), [data]);
  const month = monthOf(today());
  const flows = useMemo(() => {
    const m = new Map<string, { in: number; out: number }>();
    const add = (k: string | null, field: "in" | "out", v: number) => k && m.set(k, { ...(m.get(k) ?? { in: 0, out: 0 }), [field]: (m.get(k)?.[field] ?? 0) + v });
    for (const t of data.transactions) {
      if (monthOf(t.date) !== month || t.date > today()) continue;
      if (t.type === "Income" || t.type === "Redeem") add(t.account, "in", t.amount);
      else if (t.type === "Expense" || t.type === "Invest") add(t.account, "out", t.amount);
      else {
        add(t.account, "out", t.amount);
        add(t.to, "in", t.amount);
      }
    }
    return m;
  }, [data.transactions, month]);
  const bank = data.accounts.find((a) => a.type === "Bank account" && !a.archived)?.key ?? null;

  const open = data.accounts.filter((a) => !a.archived);
  const totals = GROUPS.map((g) => ({
    ...g,
    total: open.filter((a) => g.types.includes(a.type)).reduce((s, a) => s + (bal.get(a.key) ?? 0), 0),
  }));

  if (!data.accounts.length) {
    return (
      <Card>
        <Empty icon={<Landmark size={20} />} title="No accounts yet" action={<Button variant="primary" icon={<Plus size={14} />} onClick={onAdd}>Add an account</Button>}>
          Bank accounts, credit cards, cash, wallets, loans and brokerage accounts. Each keeps its own balance as you add transactions.
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid min-w-0 flex-1 basis-80 grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="In the bank and cash" value={money(totals[0].total, currency)} />
          <Stat label="Card bills due" value={money(Math.max(0, -totals[1].total), currency)} />
          <Stat label="Loans outstanding" value={money(Math.max(0, -totals[2].total), currency)} />
          <Stat label="In investment accounts" value={money(totals[3].total, currency)} />
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={onAdd}>
          Add account
        </Button>
      </div>

      {GROUPS.map((g) => {
        const accounts = data.accounts.filter((a) => g.types.includes(a.type)).sort((x, y) => Number(x.archived) - Number(y.archived));
        if (!accounts.length) return null;
        return (
          <Card key={g.title} title={g.title}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {accounts.map((a) => {
                const st = accountState(a, bal.get(a.key) ?? 0);
                const f = flows.get(a.key);
                let body: ReactNode;
                if (a.type === "Credit card") {
                  body = (
                    <>
                      <div className="text-xl font-semibold text-ink tabular-nums">{money(st.due, currency)}</div>
                      <div className="text-xs text-muted">due{a.limit ? ` · ${money(Math.max(0, a.limit - st.due), currency)} available` : ""}</div>
                      {st.utilisation !== null && (
                        <div className="mt-2">
                          <Meter share={st.utilisation} />
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                            {st.utilisation > 0.3 && <TriangleAlert size={11} style={{ color: "var(--fin-warning)" }} />}
                            {percent(st.utilisation)} of {money(a.limit!, currency)} used{st.utilisation > 0.3 ? " · lenders like it under 30%" : ""}
                          </div>
                        </div>
                      )}
                    </>
                  );
                } else if (a.type === "Loan") {
                  body = (
                    <>
                      <div className="text-xl font-semibold text-ink tabular-nums">{money(st.due, currency)}</div>
                      <div className="text-xs text-muted">outstanding{a.opening ? ` of ${money(Math.abs(a.opening), currency)}` : ""}</div>
                      {a.opening > 0 && (
                        <div className="mt-2">
                          <Meter share={1 - st.due / Math.abs(a.opening)} />
                          <div className="mt-1 text-xs text-muted">{percent(1 - st.due / Math.abs(a.opening))} repaid</div>
                        </div>
                      )}
                    </>
                  );
                } else {
                  body = <div className="text-xl font-semibold text-ink tabular-nums">{money(st.balance, currency)}</div>;
                }
                return (
                  <div key={a.key} className={`group rounded-lg border border-line p-3 ${a.archived ? "opacity-60" : ""}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{a.name}</span>
                        <span className="block truncate text-xs text-faint">{[a.institution, a.archived && "Closed"].filter(Boolean).join(" · ") || a.type}</span>
                      </span>
                      <button onClick={() => onEdit(a)} aria-label={`Edit ${a.name}`} className="grid size-7 place-items-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-muted">
                        <Pencil size={13} />
                      </button>
                    </div>
                    {body}
                    <div className="mt-3 flex items-center gap-3 border-t border-line pt-2 text-xs text-muted">
                      <span className="flex-1">
                        This month: <span className="text-ink tabular-nums">+{money(f?.in ?? 0, currency)}</span> / <span className="text-ink tabular-nums">−{money(f?.out ?? 0, currency)}</span>
                      </span>
                      {st.owed && st.due > 0 && !a.archived && (
                        <button
                          onClick={() => onPay({
                              type: "Transfer",
                              account: bank,
                              to: a.key,
                              // A card's whole bill; an EMI is the person's own amount.
                              amount: a.type === "Credit card" ? Math.round(st.due * 100) / 100 : undefined,
                              name: a.type === "Loan" ? `${a.name} EMI` : `${a.name} bill`,
                            })}
                          className="font-medium text-[var(--accent)] hover:underline"
                        >
                          {a.type === "Loan" ? "Pay EMI" : "Pay bill"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
