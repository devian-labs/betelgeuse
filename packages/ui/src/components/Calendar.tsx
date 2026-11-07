import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

/** `YYYY-MM-DD` in local time. */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string | null | undefined) => {
  const m = s && /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Six weeks from the Sunday on or before the month's first day. */
function weeks(month: Date): Date[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - new Date(month.getFullYear(), month.getMonth(), 1).getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2026, 1, 1 + i).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2));

/**
 * A month calendar for picking a day: quick picks (today, yesterday, tomorrow), big round days,
 * today ringed, the chosen day filled, and (with `range`) the days of a range shaded. Arrow keys
 * move between days and Enter picks one.
 */
export function Calendar({
  value,
  onPick,
  range,
  quick = true,
}: {
  value: string | null;
  onPick: (day: string) => void;
  /** Shade the days between `from` and `to` (either may be open). */
  range?: { from?: string; to?: string };
  quick?: boolean;
}) {
  const today = new Date();
  const todayIso = iso(today);
  const start = parse(value) ?? parse(range?.from) ?? parse(range?.to) ?? today;
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const [focus, setFocus] = useState(() => iso(start));
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const goTo = (d: Date) => {
    setFocus(iso(d));
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const f = parse(focus) ?? today;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      goTo(addDays(f, step));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPick(focus);
    }
  };

  const inRange = (d: string) => !!range && (range.from || range.to) && (!range.from || d >= range.from) && (!range.to || d <= range.to);

  return (
    <div className="w-[296px] select-none" onKeyDown={onKey}>
      {quick && (
        <div className="mb-3 flex gap-1.5">
          {[
            ["Today", today],
            ["Yesterday", addDays(today, -1)],
            ["Tomorrow", addDays(today, 1)],
          ].map(([label, d]) => (
            <button
              key={label as string}
              onClick={() => onPick(iso(d as Date))}
              className={`h-7 flex-1 rounded-full border text-xs ${value === iso(d as Date) ? "border-[var(--blue)] bg-accent-soft font-medium text-[var(--blue)]" : "border-line text-muted hover:bg-hover hover:text-ink"}`}
            >
              {label as string}
            </button>
          ))}
        </div>
      )}
      <div className="mb-2 flex items-center gap-1">
        <span className="flex-1 pl-1 text-sm font-semibold text-ink">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button onClick={() => goTo(today)} className="h-7 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-ink">
          Today
        </button>
        <button onClick={() => shift(-1)} aria-label="Previous month" className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink">
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => shift(1)} aria-label="Next month" className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink">
          <ChevronRight size={16} />
        </button>
      </div>
      <div role="grid" tabIndex={0} aria-label="Choose a day" className="grid grid-cols-7 gap-y-0.5 outline-none">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-center text-[11px] font-medium text-faint">
            {w}
          </span>
        ))}
        {weeks(month).map((d) => {
          const day = iso(d);
          const inMonth = d.getMonth() === month.getMonth();
          const chosen = day === value || day === range?.from || day === range?.to;
          const shaded = inRange(day);
          return (
            <div
              key={day}
              className={`flex justify-center ${shaded ? "bg-accent-soft" : ""} ${shaded && day === range?.from ? "rounded-l-full" : ""} ${shaded && day === range?.to ? "rounded-r-full" : ""}`}
            >
              <button
                role="gridcell"
                aria-selected={chosen}
                tabIndex={-1}
                onClick={() => onPick(day)}
                onMouseEnter={() => setFocus(day)}
                className={`grid size-9 place-items-center rounded-full text-[13px] tabular-nums transition-colors ${
                  chosen
                    ? "bg-[var(--blue)] font-semibold text-white"
                    : `${day === todayIso ? "font-semibold text-[var(--blue)] ring-1 ring-[var(--blue)] ring-inset" : inMonth ? "text-ink" : "text-faint"} hover:bg-hover ${day === focus ? "bg-hover" : ""}`
                }`}
              >
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
