import type { ReactNode } from "react";
import { Logo } from "@betelgeuse/ui/components/Logo";

/** The centred card the screens before the workspace use. */
export function Card({ title, hint, children, wide }: { title: string; hint?: ReactNode; children?: ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-full items-center justify-center overflow-y-auto bg-surface p-4 text-ink">
      <div className={`w-full ${wide ? "max-w-[520px]" : "max-w-[400px]"} rounded-xl border border-line bg-raised p-7 shadow-sm`}>
        <Logo className="mb-5 size-9" />
        <h1 className="text-xl font-semibold">{title}</h1>
        {hint && <p className="mt-1.5 text-sm leading-relaxed text-muted">{hint}</p>}
        {children && <div className="mt-5 flex flex-col gap-2.5">{children}</div>}
      </div>
    </main>
  );
}
