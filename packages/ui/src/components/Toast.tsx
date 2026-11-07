import { useEffect } from "react";

export type ToastData = { message: string; action?: { label: string; run: () => void | Promise<void> } };

/** A short-lived message at the bottom of the window, with an optional action such as Undo. */
export function Toast({ message, action, onClose }: ToastData & { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  return (
    <div className="toast fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-raised py-2 pr-2 pl-4 text-sm text-ink shadow-pop">
      <span>{message}</span>
      {action && (
        <button
          onClick={async () => {
            onClose();
            await action.run();
          }}
          className="rounded-md px-2 py-1 font-medium text-[var(--blue)] hover:bg-hover"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
