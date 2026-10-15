/**
 * Finance's charts, drawn in SVG. Colors come from the `--fin-*` series slots in styles.css (one
 * fixed slot per series, stepped for light and dark); text always uses the app's ink colors.
 * Every chart has a hover readout, and its numbers are also shown in the tables beside it.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { compact, money, monthLabel, shortDate } from "./format";

/** The width of the box a chart draws in, kept up to date as the window resizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round axis values: 0, 25K, 50K… covering `min`–`max` in about `count` steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** A column with a 4px rounded data end and a square foot on the baseline. */
function column(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x + 12), width - 188);
  return (
    <div className="pointer-events-none absolute z-10 w-44 rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-[var(--shadow-pop)]" style={{ left, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

/** A tooltip row: value first (it's what the reader came for), then the series with its line key. */
function Readout({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="font-semibold text-ink tabular-nums">{value}</span>
      <span className="truncate text-muted">{label}</span>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={i.line ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

const PAD = { top: 12, right: 12, bottom: 26, left: 52 };

// ---------- cash flow: income and spending per month ----------

export function CashflowChart({ data, currency, height = 220, onPick }: { data: { month: string; income: number; expense: number }[]; currency: string; height?: number; onPick?: (month: string) => void }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const ticks = niceTicks(0, max);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, data.length);
  const bar = Math.min(18, Math.max(3, (band - 10) / 2));
  // Month names need about 32px each; on a narrow screen, every second (or third) one.
  const labelEvery = Math.max(1, Math.ceil(32 / Math.max(1, band)));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const series = [
    { key: "income" as const, label: "Income", color: "var(--fin-1)" },
    { key: "expense" as const, label: "Spending", color: "var(--fin-2)" },
  ];
  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Income and spending by month">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--faint)] text-[11px] tabular-nums">
                {compact(t, currency)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            return (
              <g key={d.month} opacity={hover === null || hover === i ? 1 : 0.55}>
                {series.map((s, k) => {
                  const v = d[s.key];
                  const x = cx - bar - 1 + k * (bar + 2);
                  return v > 0 ? <path key={s.key} d={column(x, y(v), bar, y(0) - y(v))} fill={s.color} /> : null;
                })}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-[var(--faint)] text-[11px]">
                    {monthLabel(d.month, true)}
                  </text>
                )}
                <rect
                  x={cx - band / 2}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  className={onPick ? "cursor-pointer" : ""}
                  onPointerEnter={() => setHover(i)}
                  onClick={() => onPick?.(d.month)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={PAD.left + band * hover + band / 2} y={PAD.top} width={width}>
          <div className="mb-1 font-medium text-ink">{monthLabel(data[hover].month)}</div>
          <Readout color="var(--fin-1)" label="Income" value={money(data[hover].income, currency)} />
          <Readout color="var(--fin-2)" label="Spending" value={money(data[hover].expense, currency)} />
          <div className="mt-1 border-t border-line pt-1">
            <Readout label={data[hover].income >= data[hover].expense ? "Saved" : "Overspent"} value={money(Math.abs(data[hover].income - data[hover].expense), currency)} />
          </div>
        </Tooltip>
      )}
    </div>
  );
}

// ---------- a value over time (net worth) ----------

export function TrendChart({ points, currency, height = 220, label = "Net worth" }: { points: { date: string; value: number }[]; currency: string; height?: number; label?: string }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
  const plotW = Math.max(0, width - PAD.left - PAD.right - 56); // room for the end label
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length < 2 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join("");
  const area = points.length > 1 ? `${line}L${x(points.length - 1)},${y(Math.max(lo, 0))}L${x(0)},${y(Math.max(lo, 0))}Z` : "";
  const last = points.length - 1;
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 64))));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left) / Math.max(1, box.width);
    setHover(Math.max(0, Math.min(last, Math.round(rel * last))));
  };

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${label} over time`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line-strong)" : "var(--line)"} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--faint)] text-[11px] tabular-nums">
                {compact(t, currency)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % every === 0 || i === last ? (
              <text key={p.date} x={x(i)} y={height - 8} textAnchor="middle" className="fill-[var(--faint)] text-[11px]">
                {monthLabel(p.date.slice(0, 7), true)}
              </text>
            ) : null,
          )}
          {area && <path d={area} fill="var(--fin-1)" opacity={0.1} />}
          <path d={line} fill="none" stroke="var(--fin-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--line-strong)" />}
          {points.length > 0 && (
            <>
              <circle cx={x(hover ?? last)} cy={y(points[hover ?? last].value)} r={5} fill="var(--fin-1)" stroke="var(--surface)" strokeWidth={2} />
              <text x={x(last) + 10} y={y(points[last].value)} dy="0.32em" className="fill-[var(--ink)] text-[12px] font-semibold tabular-nums">
                {compact(points[last].value, currency)}
              </text>
            </>
          )}
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerEnter={onMove} />
        </svg>
      )}
      {hover !== null && points[hover] && (
        <Tooltip x={x(hover)} y={y(points[hover].value) - 40} width={width}>
          <div className="mb-0.5 text-muted">{shortDate(points[hover].date)}</div>
          <Readout color="var(--fin-1)" label={label} value={money(points[hover].value, currency)} />
        </Tooltip>
      )}
    </div>
  );
}

// ---------- shares of a whole (allocation) ----------

/** A single bar split into shares (2px gaps between them), with a legend listing each one's value. */
export function ShareBar({ parts: all, currency }: { parts: { label: string; value: number; color: string }[]; currency: string }) {
  const [hover, setHover] = useState<string | null>(null);
  // Nothing in a share: not in the bar, nor listed as 0%.
  const parts = all.filter((p) => p.value > 0);
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return null;
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Allocation">
        {parts.map((p) =>
          p.value > 0 ? (
            <div
              key={p.label}
              title={`${p.label}: ${money(p.value, currency)}`}
              onPointerEnter={() => setHover(p.label)}
              onPointerLeave={() => setHover(null)}
              className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(p.value / total) * 100}%`, background: p.color, opacity: hover && hover !== p.label ? 0.45 : 1 }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <div key={p.label} className={`flex items-center gap-2 text-sm ${hover && hover !== p.label ? "opacity-60" : ""}`} onPointerEnter={() => setHover(p.label)} onPointerLeave={() => setHover(null)}>
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate text-ink">{p.label}</span>
            <span className="text-muted tabular-nums">{((p.value / total) * 100).toFixed(0)}%</span>
            <span className="w-28 text-right text-ink tabular-nums">{money(p.value, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- progress against a limit (budgets, card limits) ----------

export type MeterState = "ok" | "warning" | "over";
export const meterState = (share: number): MeterState => (share > 1 ? "over" : share >= 0.85 ? "warning" : "ok");

export function Meter({ share, height = 6 }: { share: number; height?: number }) {
  const state = meterState(share);
  const fill = state === "over" ? "var(--fin-critical)" : state === "warning" ? "var(--fin-warning)" : "var(--fin-1)";
  return (
    <div className="w-full overflow-hidden rounded-full bg-[var(--fin-track)]" style={{ height }} role="meter" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: fill }} />
    </div>
  );
}

/** Fixed series slots for categories of a kind (investment types, asset types): by position in `all`, never by rank. */
export function slotColor(name: string, all: readonly string[]) {
  const i = all.indexOf(name);
  return i >= 0 && i < 8 ? `var(--fin-${i + 1})` : "var(--fin-other)";
}
