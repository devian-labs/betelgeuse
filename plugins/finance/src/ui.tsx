/** Building blocks shared by Finance's screens, on top of the app's own components and tokens. */
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { addMonths, monthOf, today } from "./model";
import { monthLabel } from "./format";

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-raised p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex min-h-7 items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold text-ink">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A labelled figure: label, value, and an optional line under it. */
export function Stat({ label, value, note, big }: { label: string; value: ReactNode; note?: ReactNode; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 truncate font-semibold text-ink ${big ? "text-[44px] leading-tight tracking-tight" : "text-xl"}`}>{value}</div>
      {note && <div className="mt-0.5 truncate text-xs text-muted">{note}</div>}
    </div>
  );
}

/** A change: an arrow and the amount in the up or down color (with words, never color alone). */
export function Delta({ value, children, goodWhenUp = true }: { value: number; children: ReactNode; goodWhenUp?: boolean }) {
  if (value === 0) return <span className="text-muted">{children}</span>;
  const good = value > 0 === goodWhenUp;
  return (
    <span className="inline-flex items-center gap-0.5 font-medium" style={{ color: good ? "var(--fin-up)" : "var(--fin-down)" }}>
      {value > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {children}
    </span>
  );
}

export function Dialog({ title, onClose, children, footer, width = 460 }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[data-popover]") && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return createPortal(
    <div className="fin fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 pt-[10vh] pb-8" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="fin-dialog w-full rounded-xl border border-line bg-raised shadow-[var(--shadow-pop)]" style={{ maxWidth: width }}>
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <h2 className="flex-1 text-[15px] font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-muted">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export const inputClass = "h-8 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-[var(--accent)]";

export function Select({ children, className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`${inputClass} ${className}`}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-hover p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`h-7 flex-1 rounded-md px-1.5 text-[13px] sm:px-3 sm:text-sm ${value === o.id ? "bg-raised font-medium text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** ‹ October 2026 › — never past the current month. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const now = monthOf(today());
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(addMonths(month, -1))} aria-label="Previous month" className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover">
        <ChevronLeft size={16} />
      </button>
      <button onClick={() => onChange(now)} title="Back to this month" className="min-w-32 rounded-md px-2 py-1 text-sm font-medium text-ink hover:bg-hover">
        {monthLabel(month)}
      </button>
      <button onClick={() => onChange(addMonths(month, 1))} disabled={month >= now} aria-label="Next month" className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover disabled:opacity-30">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-xl bg-accent-soft text-[var(--accent)]">{icon}</span>
      <div className="text-sm font-semibold text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
