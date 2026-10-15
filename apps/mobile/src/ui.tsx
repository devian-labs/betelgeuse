import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A panel that slides up from the bottom of the screen: the phone's version of the desktop
 * app's menus and popovers. Tapping outside it, or the Android back button, closes it.
 */
export function Sheet({ onClose, title, children, className = "" }: { onClose: () => void; title?: ReactNode; children: ReactNode; className?: string }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };
  // Back closes the sheet rather than the screen under it: each open sheet adds a history entry
  // (`sheets` counts how many are stacked, so Back closes only the top one).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    let depth = 0;
    let popped = false;
    const pop = (e: PopStateEvent) => {
      if ((e.state?.sheets ?? 0) >= depth) return;
      popped = true;
      onCloseRef.current();
    };
    // A tick later: a sheet mounted and dropped straight away (React's development double mount)
    // then never touches the history, whose Back would land after the next sheet's entry.
    const timer = window.setTimeout(() => {
      depth = (window.history.state?.sheets ?? 0) + 1;
      window.history.pushState({ ...window.history.state, sheets: depth }, "");
      window.addEventListener("popstate", pop);
    });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", pop);
      if (depth && !popped && window.history.state?.sheets === depth) window.history.back();
    };
  }, []);

  return createPortal(
    <div className={`sheet-backdrop fixed inset-0 z-50 flex flex-col justify-end bg-black/30 dark:bg-black/55 ${closing ? "closing" : ""}`} onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`sheet-panel flex max-h-[88vh] flex-col rounded-t-2xl bg-raised text-ink shadow-pop ${closing ? "closing" : ""} ${className}`}
      >
        <div className="flex shrink-0 justify-center pt-2 pb-1">
          <span className="h-1 w-9 rounded-full bg-[var(--line-strong)]" />
        </div>
        {title && <div className="shrink-0 px-5 pt-1 pb-2 text-[15px] font-semibold">{title}</div>}
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Runs `fn` once a sheet that was just closed has left the history (its Back step is undone
 * asynchronously). Without the wait, a screen or sheet opened by `fn` would be undone with it.
 */
export function afterSheet(fn: () => void) {
  if (!window.history.state?.sheets) return void fn();
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", run);
    window.setTimeout(fn);
  };
  window.addEventListener("popstate", run);
  window.setTimeout(run, 400);
}

/** A row in a sheet. */
export function SheetItem({
  icon,
  label,
  hint,
  right,
  danger,
  onClick,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] active:bg-hover ${danger ? "text-[var(--c-red-text)]" : "text-ink"}`}
    >
      {icon && <span className={`grid w-6 shrink-0 place-items-center ${danger ? "" : "text-muted"}`}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-sm text-faint">{hint}</span>}
      {right}
    </button>
  );
}

export const SheetDivider = () => <div className="mx-3 my-1 h-px bg-line" />;

export const SheetLabel = ({ children }: { children: ReactNode }) => <div className="px-3 pt-3 pb-1 text-xs font-medium text-faint">{children}</div>;

/** Asks before something that can't be undone. */
export function Confirm({
  title,
  message,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: string;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="px-3 pt-1 pb-3">
        <div className="text-[17px] font-semibold">{title}</div>
        {message && <p className="mt-1 text-sm leading-relaxed text-muted">{message}</p>}
      </div>
      <button onClick={() => (onClose(), afterSheet(onConfirm))} className="h-12 w-full rounded-xl bg-[var(--c-red-text)] text-[16px] font-medium text-white active:opacity-80">
        {action}
      </button>
      <button onClick={onClose} className="mt-1.5 h-12 w-full rounded-xl text-[16px] font-medium text-ink active:bg-hover">
        Cancel
      </button>
    </Sheet>
  );
}

/** A screen's top bar: Back on the left, a title, and room for buttons on the right. */
export function TopBar({ title, onBack, children }: { title?: ReactNode; onBack: () => void; children?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-0.5 px-1.5">
      <IconButton label="Back" onClick={onBack}>
        <ChevronLeft size={26} />
      </IconButton>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-medium">{title}</div>
      {children}
    </header>
  );
}

export function IconButton({ label, onClick, children, className = "" }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label} className={`grid size-10 shrink-0 place-items-center rounded-full text-muted active:bg-hover ${className}`}>
      {children}
    </button>
  );
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-block h-[26px] w-11 shrink-0 rounded-full align-middle transition-colors ${on ? "bg-[var(--blue)]" : "bg-[var(--line-strong)]"}`}>
      <span className={`absolute top-0.5 left-0.5 size-[22px] rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-[18px]" : ""}`} />
    </span>
  );
}

/**
 * Press-and-hold on touch screens (and right-click), for a row's actions. The tap that ends a
 * long press doesn't also count as a tap on the row.
 */
export function useLongPress(onLongPress: () => void, ms = 450) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const cancel = () => window.clearTimeout(timer.current);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      fired.current = false;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, ms);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 8) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!fired.current) onLongPress();
    },
    /** Wrap the row's tap handler with this, so it skips the tap that ends a long press. */
    tap: (fn: () => void) => () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      fn();
    },
  };
}
