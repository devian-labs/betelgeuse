import { Button } from "@betelgeuse/plugin-api/ui";
import { CircleAlert, Pencil, Plus, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Meter, meterState } from "../charts";
import { money, percent } from "../format";
import { budget, daysInMonth, monthOf, today, type BudgetLine, type Category } from "../model";
import { setProperties, useFinance } from "../store";
import { Card, MonthPicker, Stat } from "../ui";

export function Budget({ month, setMonth, onEditCategory, onAddCategory }: { month: string; setMonth: (m: string) => void; onEditCategory: (c: Category) => void; onAddCategory: () => void }) {
  const { data, currency } = useFinance();
  const b = useMemo(() => budget(data, month), [data, month]);
  const s = b.summary;
  const isNow = month === monthOf(today());
  const daysLeft = isNow ? daysInMonth(month) - Number(today().slice(8)) + 1 : 0;
  const budgeted = b.lines.filter((l) => l.budget > 0);
  const unbudgeted = b.lines.filter((l) => l.budget === 0);
  const unused = data.categories.filter((c) => c.kind === "Expense" && !c.archived && c.budget === 0 && !s.byCategory.has(c.key));

  // Needs / wants / savings, as shares of income (the 50/30/20 way of looking at a month).
  const groups = useMemo(() => {
    const by = new Map<string, number>();
    for (const l of b.lines) {
      const g = l.category?.group || "Other";
      by.set(g, (by.get(g) ?? 0) + l.spent);
    }
    return ["Needs", "Wants", "Savings", "Other"].filter((g) => by.get(g)).map((g) => ({ group: g, spent: by.get(g)! }));
  }, [b.lines]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <span className="flex-1" />
        <Button icon={<Plus size={14} />} onClick={onAddCategory}>
          Add category
        </Button>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Budgeted" value={b.budgeted ? money(b.budgeted, currency) : "—"} />
          <Stat label="Spent" value={money(s.expense, currency)} note={b.budgeted ? `${money(b.spentInBudget, currency)} of it budgeted` : undefined} />
          <Stat
            label={b.left >= 0 ? "Left" : "Over"}
            value={b.budgeted ? money(Math.abs(b.left), currency) : "—"}
            note={isNow && b.budgeted && b.left > 0 ? `${money(b.left / daysLeft, currency)} a day for ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : undefined}
          />
          <Stat label="Saved" value={money(s.saved, currency)} note={s.rate !== null ? `${percent(s.rate)} of ${money(s.income, currency)} income` : "No income this month"} />
        </div>
        {b.budgeted > 0 && (
          <div className="mt-4">
            <Meter share={b.spentInBudget / b.budgeted} height={8} />
          </div>
        )}
        {s.income > 0 && groups.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3 text-xs text-muted">
            {groups.map((g) => (
              <span key={g.group}>
                {g.group} <span className="font-medium text-ink">{percent(g.spent / s.income)}</span> of income
              </span>
            ))}
            {s.rate !== null && (
              <span>
                Kept <span className="font-medium text-ink">{percent(s.rate)}</span>
              </span>
            )}
          </div>
        )}
      </Card>

      <Card title="Budgets" action={<span className="text-xs text-muted">Click an amount to change it</span>}>
        {budgeted.length ? (
          <div className="divide-y divide-[var(--line)]">
            {budgeted.map((l) => (
              <Line key={l.category!.key} line={l} currency={currency} onEdit={onEditCategory} />
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted">No budgets yet. Give categories a monthly amount below, and see how each month is going.</p>
        )}
      </Card>

      {(unbudgeted.length > 0 || unused.length > 0) && (
        <Card title="Not budgeted">
          {unbudgeted.length > 0 && (
            <div className="divide-y divide-[var(--line)]">
              {unbudgeted.map((l) => (
                <Line key={l.category?.key ?? "none"} line={l} currency={currency} onEdit={onEditCategory} />
              ))}
            </div>
          )}
          {unused.length > 0 && (
            <div className={unbudgeted.length ? "mt-3 border-t border-line pt-3" : ""}>
              <div className="mb-2 text-xs text-muted">No spending this month and no budget. Click one to give it a budget:</div>
              <div className="flex flex-wrap gap-1.5">
                {unused.map((c) => (
                  <button key={c.key} onClick={() => onEditCategory(c)} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:bg-hover hover:text-ink">
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {s.incomeByCategory.size > 0 && (
        <Card title="Income">
          {[...s.incomeByCategory]
            .sort((x, y) => y[1] - x[1])
            .map(([key, v]) => (
              <div key={key} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="flex-1 text-ink">{data.categories.find((c) => c.key === key)?.name ?? "Other income"}</span>
                <span className="text-ink tabular-nums">{money(v, currency)}</span>
              </div>
            ))}
        </Card>
      )}
    </div>
  );
}

function Line({ line, currency, onEdit }: { line: BudgetLine; currency: string; onEdit: (c: Category) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const c = line.category;
  const state = line.share !== null ? meterState(line.share) : null;
  const save = async () => {
    setEditing(false);
    const n = Number(draft.replace(/[, ]/g, ""));
    if (!c || !Number.isFinite(n) || n === line.budget) return;
    await setProperties(c.path, { "Monthly budget": n > 0 ? n : null });
  };
  return (
    <div className="group flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5">
      <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm text-ink">{c?.name ?? "Uncategorised"}</span>
          {c && (
            <button onClick={() => onEdit(c)} aria-label="Edit category" className="grid size-5 place-items-center rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-hover">
              <Pencil size={11} />
            </button>
          )}
        </div>
        {c?.group && <div className="text-xs text-faint">{c.group}</div>}
      </div>
      {/* The meter sits between the name and the amounts; on a phone, under them. */}
      <div className="order-last w-full sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">{line.budget > 0 ? <Meter share={line.share!} /> : line.spent > 0 ? <div className="hidden h-1.5 sm:block" /> : null}</div>
      <div className="shrink-0 text-right text-sm tabular-nums sm:w-36">
        {state === "over" && (
          <span className="mr-1.5 inline-flex items-center gap-0.5 text-xs text-ink sm:hidden">
            <CircleAlert size={12} style={{ color: "var(--fin-critical)" }} /> over
          </span>
        )}
        <span className="text-ink">{money(line.spent, currency)}</span>
        <span className="text-muted"> / </span>
        {editing ? (
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-20 rounded border border-line bg-surface px-1 text-right text-sm text-ink outline-none focus:border-[var(--accent)]"
          />
        ) : (
          <button disabled={!c} onClick={() => (setDraft(line.budget ? String(line.budget) : ""), setEditing(true))} className="rounded px-1 text-muted enabled:hover:bg-hover enabled:hover:text-ink">
            {line.budget ? money(line.budget, currency) : "set"}
          </button>
        )}
      </div>
      <div className="hidden w-32 shrink-0 text-right text-xs sm:block">
        {state === "over" ? (
          <span className="inline-flex items-center gap-1 text-ink">
            <CircleAlert size={12} style={{ color: "var(--fin-critical)" }} /> Over by {money(line.spent - line.budget, currency)}
          </span>
        ) : state === "warning" ? (
          <span className="inline-flex items-center gap-1 text-ink">
            <TriangleAlert size={12} style={{ color: "var(--fin-warning)" }} /> {money(line.budget - line.spent, currency)} left
          </span>
        ) : line.budget > 0 ? (
          <span className="text-muted">{money(line.budget - line.spent, currency)} left</span>
        ) : null}
      </div>
    </div>
  );
}
