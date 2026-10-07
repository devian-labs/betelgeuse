import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  anchor: HTMLElement | DOMRect | null;
  onClose: () => void;
  children: ReactNode;
  placement?: "bottom-start" | "bottom-end" | "right-start";
  className?: string;
};

/** Floating panel anchored to an element, kept inside the window; closes on outside click or Escape. */
export function Popover({ anchor, onClose, children, placement = "bottom-start", className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor;
    const { width, height } = ref.current.getBoundingClientRect();
    let left = placement === "bottom-end" ? a.right - width : placement === "right-start" ? a.right + 4 : a.left;
    let top = placement === "right-start" ? a.top : a.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, (placement === "right-start" ? a.bottom : a.top - 4) - height);
    if (left + width > window.innerWidth - 8) left = placement === "right-start" ? a.left - width - 4 : window.innerWidth - width - 8;
    setPos({ left: Math.max(8, left), top });
  }, [anchor, placement, children]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      // Clicks inside a nested popover (rendered in its own portal) don't close the parent.
      if ((t as HTMLElement).closest?.("[data-popover]")) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", down));
    document.addEventListener("keydown", key, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [onClose]);

  if (!anchor) return null;
  return createPortal(
    <div
      ref={ref}
      data-popover
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      className={`fixed z-[60] rounded-lg border border-line bg-raised text-sm shadow-pop ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

/** A menu row. */
export function MenuItem({
  icon,
  label,
  hint,
  active,
  danger,
  onClick,
  right,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  active?: boolean;
  danger?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  right?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-hover ${
        danger ? "hover:text-[var(--c-red-text)]" : "text-ink"
      } ${active ? "bg-hover" : ""}`}
    >
      {icon && <span className="grid w-5 shrink-0 place-items-center text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-xs text-faint">{hint}</span>}
      {right}
    </button>
  );
}

export const MenuSection = ({ label }: { label: string }) => (
  <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-faint">{label}</div>
);

export const MenuDivider = () => <div className="my-1 h-px bg-line" />;
