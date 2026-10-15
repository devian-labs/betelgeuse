import { Button } from "@betelgeuse/plugin-api/ui";
import { ChartLine, Clock, Pencil, Plus, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { ShareBar, slotColor } from "../charts";
import { money, percent, shortDate } from "../format";
import { effectiveHoldings, INVESTMENT_TYPES, investments, today, type Holding } from "../model";
import { setProperties, useFinance } from "../store";
import { Card, Delta, Empty, Stat } from "../ui";

/** A value not updated for this long is flagged, so it gets refreshed now and then. */
const STALE_DAYS = 45;
const age = (iso: string | null) => (iso ? Math.round((Date.parse(today()) - Date.parse(iso)) / 86400000) : null);

/** `onInvest` opens the form to put money in (into `holding`, or chosen there). */
export function Investments({ onAdd, onEdit, onInvest }: { onAdd: () => void; onEdit: (h: Holding) => void; onInvest: (holding?: string) => void }) {
  const { data, currency } = useFinance();
  const inv = useMemo(() => investments(data), [data]);
  const closed = useMemo(() => effectiveHoldings(data).filter((h) => h.closed), [data]);

  if (!data.holdings.length) {
    return (
      <Card>
        <Empty icon={<ChartLine size={20} />} title="Track your investments" action={<Button variant="primary" icon={<Plus size={14} />} onClick={onAdd}>Add an investment</Button>}>
          Stocks, mutual funds, deposits, retirement funds, gold, crypto… Enter what you put in and what it's worth now; update the value whenever you check it.
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid min-w-0 flex-1 basis-80 grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Worth now" value={money(inv.value, currency)} />
          <Stat label="Invested" value={money(inv.invested, currency)} />
          <Stat
            label={inv.gain >= 0 ? "Gain" : "Loss"}
            value={money(Math.abs(inv.gain), currency)}
            note={inv.gainShare !== null ? <Delta value={inv.gain}>{percent(inv.gainShare, { sign: true })}</Delta> : undefined}
          />
          <Stat label="Holdings" value={String(inv.holdings.length)} />
        </div>
        <Button icon={<Plus size={14} />} onClick={onAdd}>
          Add investment
        </Button>
        <Button variant="primary" icon={<TrendingUp size={14} />} onClick={() => onInvest()}>
          Invest
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card title="Allocation">
          <ShareBar parts={inv.byType.map((t) => ({ label: t.type, value: t.value, color: slotColor(t.type, INVESTMENT_TYPES) }))} currency={currency} />
        </Card>
        <Card title="By type">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 text-right font-medium">Invested</th>
                <th className="pb-2 text-right font-medium">Worth</th>
                <th className="pb-2 text-right font-medium">Return</th>
              </tr>
            </thead>
            <tbody>
              {inv.byType.map((t) => (
                <tr key={t.type} className="border-t border-line">
                  <td className="py-1.5 text-ink">
                    <span className="mr-2 inline-block size-2.5 rounded-[3px] align-middle" style={{ background: slotColor(t.type, INVESTMENT_TYPES) }} />
                    {t.type}
                  </td>
                  <td className="py-1.5 text-right text-muted tabular-nums">{money(t.invested, currency)}</td>
                  <td className="py-1.5 text-right text-ink tabular-nums">{money(t.value, currency)}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.invested > 0 ? <Delta value={t.value - t.invested}>{percent((t.value - t.invested) / t.invested, { sign: true })}</Delta> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Holdings" action={<span className="text-xs text-muted">Click a value to update it</span>}>
        <HoldingsTable holdings={inv.holdings} currency={currency} onEdit={onEdit} onInvest={onInvest} />
      </Card>
      {closed.length > 0 && (
        <Card title="Sold or closed">
          <HoldingsTable holdings={closed} currency={currency} onEdit={onEdit} onInvest={onInvest} />
        </Card>
      )}
    </div>
  );
}

function HoldingsTable({ holdings, currency, onEdit, onInvest }: { holdings: Holding[]; currency: string; onEdit: (h: Holding) => void; onInvest: (holding: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 text-right font-medium">Invested</th>
            <th className="pb-2 text-right font-medium">Worth now</th>
            <th className="pb-2 text-right font-medium">Return</th>
            <th className="pb-2 text-right font-medium">Updated</th>
            <th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {[...holdings]
            .sort((a, b) => b.value - a.value)
            .map((h) => (
              <Row key={h.path} h={h} currency={currency} onEdit={onEdit} onInvest={onInvest} />
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ h, currency, onEdit, onInvest }: { h: Holding; currency: string; onEdit: (h: Holding) => void; onInvest: (holding: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const days = age(h.updated);
  const gain = h.value - h.invested;
  const save = async () => {
    setEditing(false);
    const n = Number(draft.replace(/[, ]/g, ""));
    if (!draft.trim() || !Number.isFinite(n)) return;
    await setProperties(h.path, { "Current value": n, Updated: today() });
  };
  return (
    <tr className="group border-t border-line">
      <td className="max-w-56 truncate py-2 text-ink">
        {h.name}
        {h.units != null && <span className="ml-1.5 text-xs text-faint">{h.units.toLocaleString()} units</span>}
      </td>
      <td className="py-2 text-muted">{h.type}</td>
      <td className="py-2 text-right text-muted tabular-nums">{money(h.invested, currency)}</td>
      <td className="py-2 text-right tabular-nums">
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
            className="w-28 rounded border border-line bg-surface px-1.5 text-right text-sm text-ink outline-none focus:border-[var(--accent)]"
          />
        ) : (
          <button onClick={() => (setDraft(String(h.value)), setEditing(true))} className="rounded px-1 text-ink hover:bg-hover">
            {money(h.value, currency)}
          </button>
        )}
      </td>
      <td className="py-2 text-right tabular-nums">
        {h.invested > 0 ? (
          <Delta value={gain}>
            {money(Math.abs(gain), currency)} · {percent(gain / h.invested)}
          </Delta>
        ) : (
          "—"
        )}
      </td>
      <td className="py-2 text-right text-xs whitespace-nowrap text-muted">
        {days !== null && days > STALE_DAYS && <Clock size={11} className="mr-1 inline align-[-1px]" style={{ color: "var(--fin-warning)" }} />}
        {h.updated ? shortDate(h.updated) : "—"}
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {!h.closed && (
          <button onClick={() => onInvest(h.key)} aria-label={`Invest more in ${h.name}`} title="Invest more" className="inline-grid size-7 place-items-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-muted">
            <TrendingUp size={13} />
          </button>
        )}
        <button onClick={() => onEdit(h)} aria-label={`Edit ${h.name}`} className="inline-grid size-7 place-items-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-muted">
          <Pencil size={13} />
        </button>
      </td>
    </tr>
  );
}
