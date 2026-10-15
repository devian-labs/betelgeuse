import { Button } from "@betelgeuse/plugin-api/ui";
import { FileUp, Plus, Receipt, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { dayLabel, money } from "../format";
import { monthOf, today, type Transaction, type TxType } from "../model";
import { useFinance } from "../store";
import { Card, Empty, inputClass, MonthPicker, Select } from "../ui";
import { TxRow } from "./common";

export function Transactions({ month, setMonth, onEdit, onAdd, onImport }: { month: string; setMonth: (m: string) => void; onEdit: (t: Transaction) => void; onAdd: () => void; onImport: () => void }) {
  const { data, currency } = useFinance();
  const [allTime, setAllTime] = useState(false);
  const [account, setAccount] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState<"" | TxType>("");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.transactions.filter(
      (t) =>
        (allTime || monthOf(t.date) === month) &&
        (!account || t.account === account || t.to === account) &&
        (!category || (category === "none" ? !t.category && t.type !== "Transfer" : t.category === category)) &&
        (!type || t.type === type) &&
        (!q || t.name.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q))),
    );
  }, [data.transactions, allTime, month, account, category, type, query]);

  const totalIn = shown.filter((t) => t.type === "Income").reduce((s, t) => s + t.amount, 0);
  const totalOut = shown.filter((t) => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
  const days = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of shown) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
    return [...groups];
  }, [shown]);
  const now = today();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {allTime ? <span className="min-w-32 px-2 text-sm font-medium text-ink">All time</span> : <MonthPicker month={month} onChange={setMonth} />}
        <button onClick={() => setAllTime((v) => !v)} className="h-7 rounded-full border border-line px-2.5 text-xs text-muted hover:bg-hover hover:text-ink">
          {allTime ? "By month" : "All time"}
        </button>
        <Select value={account} onChange={(e) => setAccount(e.target.value)} className="!w-40">
          <option value="">All accounts</option>
          {data.accounts.map((a) => (
            <option key={a.key} value={a.key}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="!w-44">
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {data.categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value as "" | TxType)} className="!w-32">
          <option value="">All types</option>
          <option>Expense</option>
          <option>Income</option>
          <option>Transfer</option>
          <option>Invest</option>
          <option>Redeem</option>
        </Select>
        <label className="relative min-w-40 flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search descriptions, notes, tags" className={`${inputClass} pl-8`} />
        </label>
        <Button icon={<FileUp size={14} />} onClick={onImport}>
          Import
        </Button>
        <Button variant="primary" icon={<Plus size={14} />} onClick={onAdd}>
          Add
        </Button>
      </div>

      <div className="flex gap-6 text-sm text-muted">
        <span>
          {shown.length} transaction{shown.length === 1 ? "" : "s"}
        </span>
        <span>
          In <span className="font-medium text-ink tabular-nums">{money(totalIn, currency)}</span>
        </span>
        <span>
          Out <span className="font-medium text-ink tabular-nums">{money(totalOut, currency)}</span>
        </span>
      </div>

      <Card className="!p-2">
        {days.length ? (
          days.map(([date, txs]) => {
            const spent = txs.filter((t) => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
            return (
              <div key={date} className="mb-2 last:mb-0">
                <div className="flex items-center gap-2 px-2 pt-2 pb-1 text-xs font-medium text-muted">
                  <span className="flex-1">
                    {dayLabel(date)}
                    {date > now && <span className="ml-2 rounded bg-hover px-1.5 py-0.5 text-[10px] text-faint">Scheduled</span>}
                  </span>
                  {spent > 0 && <span className="tabular-nums">−{money(spent, currency)}</span>}
                </div>
                {txs.map((t) => (
                  <TxRow key={t.path} tx={t} data={data} currency={currency} onOpen={onEdit} />
                ))}
              </div>
            );
          })
        ) : (
          <Empty
            icon={<Receipt size={20} />}
            title={data.transactions.length ? "Nothing matches" : "No transactions yet"}
            action={
              !data.transactions.length && (
                <Button variant="primary" icon={<Plus size={14} />} onClick={onAdd}>
                  Add a transaction
                </Button>
              )
            }
          >
            {data.transactions.length ? "Try another month or fewer filters." : "Add what you spend and earn, or import a statement (CSV) from your bank."}
          </Empty>
        )}
      </Card>
    </div>
  );
}
