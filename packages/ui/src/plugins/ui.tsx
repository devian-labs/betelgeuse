/**
 * The UI kit plugins get as `@betelgeuse/plugin-api/ui`: the app's own components, so plugin
 * screens look and behave like the rest of Betelgeuse. Keep these props stable: they're public API.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { MenuDivider, MenuItem, Popover } from "../components/Popover";

export { MenuDivider, MenuItem, Popover };

const VARIANTS = {
  primary: "bg-[var(--accent)] font-medium text-white hover:opacity-90",
  default: "border border-line text-muted hover:bg-hover hover:text-ink",
  ghost: "text-muted hover:bg-hover hover:text-ink",
  danger: "border border-line text-[var(--c-red-text)] hover:bg-hover",
};

export function Button({ variant = "default", icon, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; icon?: ReactNode }) {
  return (
    <button {...rest} className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs disabled:opacity-50 ${VARIANTS[variant]} ${className}`}>
      {icon}
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-[var(--blue)]" : "bg-[var(--line-strong)]"}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`h-8 rounded-md border border-line bg-transparent px-2 text-sm text-ink outline-none placeholder:text-faint focus:border-[var(--line-strong)] ${className}`}
    />
  );
}

export function SettingRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-6 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center px-8 py-16">
      <div className="flex max-w-sm flex-col items-center text-center">
        {icon && <span className="mb-3 text-faint">{icon}</span>}
        <div className="mb-1.5 text-base font-medium text-ink">{title}</div>
        {children && <div className="flex flex-col items-center text-sm text-muted">{children}</div>}
      </div>
    </div>
  );
}
