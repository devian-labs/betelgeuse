import { Button } from "@betelgeuse/plugin-api/ui";
import { Pencil, Plus } from "lucide-react";
import { useMemo } from "react";
import { ShareBar, TrendChart } from "../charts";
import { money, monthLabel } from "../format";
import { balances, monthOf, netWorth, today, type Item } from "../model";
import { useFinance } from "../store";
import { Card, Delta, Stat } from "../ui";

export function NetWorthView({ onAddItem, onEditItem }: { onAddItem: (kind: "Asset" | "Liability") => void; onEditItem: (i: Item) => void }) {
  const { data, currency } = useFinance();
  const nw = useMemo(() => netWorth(data, balances(data)), [data]);
  const month = monthOf(today());
  const history = data.snapshots.map((s) => ({ date: s.date, value: monthOf(s.date) === month ? nw.net : s.netWorth }));
  const first = data.snapshots[0];
  const p = nw.parts;

  // Assets and liabilities in the order they read best; one fixed color slot each.
  const assetParts = [
    { label: "Bank and cash", value: p.cash, color: "var(--fin-1)" },
    { label: "Investments", value: p.investments + p.investmentAccounts, color: "var(--fin-3)" },
    { label: "Other assets", value: p.otherAssets, color: "var(--fin-7)" },
  ];
  const liabilityParts = [
    { label: "Card bills", value: p.cards, color: "var(--fin-2)" },
    { label: "Loans", value: p.loans, color: "var(--fin-8)" },
    { label: "Other liabilities", value: p.otherLiabilities, color: "var(--fin-4)" },
  ];
  const items = (kind: "Asset" | "Liability") => data.items.filter((i) => i.kind === kind);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-6 sm:grid-cols-[1.4fr_1fr_1fr]">
          <Stat
            big
            label="Net worth"
            value={money(nw.net, currency)}
            note={
              first && monthOf(first.date) < month ? (
                <>
                  <Delta value={nw.net - first.netWorth}>{money(Math.abs(nw.net - first.netWorth), currency)}</Delta> since {monthLabel(monthOf(first.date))}
                </>
              ) : undefined
            }
          />
          <Stat label="Assets" value={money(nw.assets, currency)} />
          <Stat label="Liabilities" value={money(nw.liabilities, currency)} />
        </div>
      </Card>

      <Card title="Over time">
        {history.length > 1 ? (
          <TrendChart points={history} currency={currency} height={240} />
        ) : (
          <p className="py-10 text-center text-sm text-muted">Your net worth is saved once a month; the chart fills in as months go by.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What you own" action={<Button variant="ghost" icon={<Plus size={14} />} onClick={() => onAddItem("Asset")}>Asset</Button>}>
          {nw.assets > 0 ? <ShareBar parts={assetParts} currency={currency} /> : <p className="text-sm text-muted">Nothing yet.</p>}
          <ItemList items={items("Asset")} currency={currency} onEdit={onEditItem} />
        </Card>
        <Card title="What you owe" action={<Button variant="ghost" icon={<Plus size={14} />} onClick={() => onAddItem("Liability")}>Liability</Button>}>
          {nw.liabilities > 0 ? <ShareBar parts={liabilityParts} currency={currency} /> : <p className="text-sm text-muted">Nothing owed. 🎉</p>}
          <ItemList items={items("Liability")} currency={currency} onEdit={onEditItem} />
        </Card>
      </div>

      {data.snapshots.length > 0 && (
        <Card title="Month by month">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-medium">Month</th>
                <th className="pb-2 text-right font-medium">Assets</th>
                <th className="pb-2 text-right font-medium">Liabilities</th>
                <th className="pb-2 text-right font-medium">Net worth</th>
                <th className="pb-2 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {[...data.snapshots].reverse().map((s, i, all) => {
                const prev = all[i + 1];
                return (
                  <tr key={s.path} className="border-t border-line">
                    <td className="py-1.5 text-ink">{monthLabel(monthOf(s.date))}</td>
                    <td className="py-1.5 text-right text-muted tabular-nums">{money(s.assets, currency)}</td>
                    <td className="py-1.5 text-right text-muted tabular-nums">{money(s.liabilities, currency)}</td>
                    <td className="py-1.5 text-right text-ink tabular-nums">{money(s.netWorth, currency)}</td>
                    <td className="py-1.5 text-right tabular-nums">{prev ? <Delta value={s.netWorth - prev.netWorth}>{money(Math.abs(s.netWorth - prev.netWorth), currency)}</Delta> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function ItemList({ items, currency, onEdit }: { items: Item[]; currency: string; onEdit: (i: Item) => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 border-t border-line pt-2">
      {items.map((i) => (
        <button key={i.path} onClick={() => onEdit(i)} className="group flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm hover:bg-hover">
          <span className="min-w-0 flex-1 truncate text-ink">{i.name}</span>
          <span className="text-xs text-faint">{i.type}</span>
          <span className="w-28 text-right text-ink tabular-nums">{money(i.value, currency)}</span>
          <Pencil size={12} className="text-faint opacity-0 group-hover:opacity-100" />
        </button>
      ))}
    </div>
  );
}
