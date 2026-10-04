import { ask } from "@tauri-apps/plugin-dialog";
import { FileText, Search, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type TrashItem } from "../lib/api";
import { timeAgo } from "../lib/time";
import { useVault } from "../lib/vault";
import { PageIcon } from "./PageIcon";
import { Popover } from "./Popover";

/** Notion-style Trash: deleted pages with restore and delete-forever. */
export function TrashPanel({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const { refreshKey, refresh, openPage } = useVault();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(() => api.listTrash().then(setItems).catch(() => setItems([])), []);
  useEffect(() => void load(), [load, refreshKey]);

  const restore = async (item: TrashItem) => {
    const path = await api.restoreTrash(item.id);
    await Promise.all([load(), refresh()]);
    openPage(path);
    onClose();
  };

  const purge = async (item?: TrashItem) => {
    const ok = await ask(
      item
        ? `Delete “${item.title}”${item.pages > 1 ? ` and its ${item.pages - 1} sub-page${item.pages > 2 ? "s" : ""}` : ""} forever?\n\nEarlier versions stay in git history.`
        : "Permanently delete everything in the Trash?\n\nEarlier versions stay in git history.",
      { title: item ? "Delete forever" : "Empty Trash", kind: "warning", okLabel: item ? "Delete forever" : "Empty Trash" },
    );
    if (!ok) return;
    await api.purgeTrash(item?.id);
    load();
  };

  const q = query.trim().toLowerCase();
  const shown = (items ?? []).filter((i) => !q || i.title.toLowerCase().includes(q) || i.original.toLowerCase().includes(q));

  return (
    <Popover anchor={anchor} placement="right-start" onClose={onClose} className="flex max-h-[min(520px,70vh)] w-[420px] flex-col">
      <div className="p-2">
        <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-[var(--search-bg)] px-2 focus-within:border-[var(--blue)]">
          <Search size={14} className="text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages in Trash"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {items && shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
            <Trash2 size={22} className="text-faint" />
            {items.length === 0 ? "Trash is empty" : "No pages match"}
          </div>
        )}
        {shown.map((item) => {
          const parent = item.original.includes("/") ? item.original.slice(0, item.original.lastIndexOf("/")) : null;
          return (
            <div key={item.id} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-hover">
              <span className="grid w-5 shrink-0 place-items-center">
                {item.icon ? <PageIcon icon={item.icon} size={16} /> : <FileText size={16} className="text-faint" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{item.title}</span>
                <span className="block truncate text-xs text-faint">
                  {parent ? `in ${parent} · ` : ""}
                  {timeAgo(item.deleted / 1000)}
                  {item.pages > 1 && ` · ${item.pages - 1} sub-page${item.pages > 2 ? "s" : ""}`}
                </span>
              </span>
              <button title="Restore" onClick={() => restore(item)} className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink">
                <Undo2 size={15} />
              </button>
              <button
                title="Delete forever"
                onClick={() => purge(item)}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-[var(--c-red-text)]"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <span className="flex-1 text-xs text-faint">Pages in Trash are deleted after 30 days.</span>
        {items && items.length > 0 && (
          <button onClick={() => purge()} className="rounded-md px-2 py-1 text-xs font-medium text-[var(--c-red-text)] hover:bg-hover">
            Empty Trash
          </button>
        )}
      </div>
    </Popover>
  );
}
