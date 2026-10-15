import { Search, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type TrashItem } from "@desktop/lib/api";
import { timeAgo } from "@desktop/lib/time";
import { useVault } from "@desktop/lib/vault";
import { useMobile } from "./mobile";
import { NoteIcon } from "./PageSheets";
import { Confirm, TopBar } from "./ui";

/** Deleted pages, to restore or delete for good. */
export function TrashScreen() {
  const { refresh, openPage } = useVault();
  const m = useMobile();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [purging, setPurging] = useState<TrashItem | "all" | null>(null);

  const load = useCallback(() => api.listTrash().then(setItems).catch(() => setItems([])), []);
  useEffect(() => void load(), [load]);

  const restore = async (item: TrashItem) => {
    const path = await api.restoreTrash(item.id);
    await Promise.all([load(), refresh()]);
    m.toast({ message: `Restored “${item.title}”`, action: { label: "Open", run: () => openPage(path) } });
  };

  const q = query.trim().toLowerCase();
  const shown = (items ?? []).filter((i) => !q || i.title.toLowerCase().includes(q) || i.original.toLowerCase().includes(q));

  return (
    <div className="screen-in safe-top flex h-full flex-col bg-surface">
      <TopBar onBack={m.back} title="Trash">
        {items && items.length > 0 && (
          <button onClick={() => setPurging("all")} className="h-9 shrink-0 rounded-full px-3 text-[15px] font-medium text-[var(--c-red-text)] active:bg-hover">
            Empty
          </button>
        )}
      </TopBar>

      <div className="shrink-0 px-3 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-xl bg-hover px-3">
          <Search size={16} className="shrink-0 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pages in Trash" className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint" />
        </label>
      </div>

      <main className="safe-bottom min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {items && shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center text-[15px] text-muted">
            <Trash2 size={26} className="text-faint" />
            {items.length === 0 ? "Trash is empty" : "No pages match"}
          </div>
        )}
        {shown.map((item) => {
          const parent = item.original.includes("/") ? item.original.slice(0, item.original.lastIndexOf("/")) : null;
          return (
            <div key={item.id} className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-1.5">
              <span className="grid w-6 shrink-0 place-items-center text-faint">
                <NoteIcon icon={item.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-ink">{item.title}</span>
                <span className="block truncate text-xs text-faint">
                  {parent ? `in ${parent} · ` : ""}
                  {timeAgo(item.deleted / 1000)}
                  {item.pages > 1 && ` · ${item.pages - 1} sub-page${item.pages > 2 ? "s" : ""}`}
                </span>
              </span>
              <button onClick={() => restore(item)} aria-label="Restore" className="grid size-10 shrink-0 place-items-center rounded-full text-muted active:bg-hover">
                <Undo2 size={19} />
              </button>
              <button onClick={() => setPurging(item)} aria-label="Delete forever" className="grid size-10 shrink-0 place-items-center rounded-full text-muted active:bg-hover">
                <Trash2 size={19} />
              </button>
            </div>
          );
        })}
        {items && items.length > 0 && <p className="px-3 pt-4 text-center text-xs text-faint">Pages in Trash are deleted after 30 days.</p>}
      </main>

      {purging && (
        <Confirm
          title={purging === "all" ? "Empty Trash?" : `Delete “${purging.title}” forever?`}
          message={
            purging === "all"
              ? "Everything in the Trash is deleted for good."
              : purging.pages > 1
                ? `Its ${purging.pages - 1} sub-page${purging.pages > 2 ? "s go" : " goes"} too. This can't be undone.`
                : "This can't be undone."
          }
          action={purging === "all" ? "Empty Trash" : "Delete forever"}
          onClose={() => setPurging(null)}
          onConfirm={async () => {
            await api.purgeTrash(purging === "all" ? undefined : purging.id);
            load();
          }}
        />
      )}
    </div>
  );
}
