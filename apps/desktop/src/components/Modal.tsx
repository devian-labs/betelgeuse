import { useEffect, type ReactNode } from "react";

export function Modal({ onClose, children, className = "" }: { onClose: () => void; children: ReactNode; className?: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[12vh] dark:bg-black/50" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full overflow-hidden rounded-xl border border-line bg-raised shadow-pop ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
