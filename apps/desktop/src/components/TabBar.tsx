import { FileText, Plus, Table2, X } from "lucide-react";
import type { NoteMeta } from "../lib/api";
import { PageIcon } from "./PageIcon";

type Props = {
  tabs: { id: number; path: string }[];
  active: number;
  notes: NoteMeta[];
  /** Leave room for the window's traffic lights (sidebar closed). */
  inset: boolean;
  onSelect: (i: number) => void;
  onClose: (i: number) => void;
  onNew: () => void;
};

/** Notion's tab strip: shown once a second tab is open (⌘-click a link, or ⌘T). */
export function TabBar({ tabs, active, notes, inset, onSelect, onClose, onNew }: Props) {
  return (
    <div
      data-tauri-drag-region
      className={`flex h-10 shrink-0 items-end gap-0.5 border-b border-line px-2 transition-[padding] duration-[280ms] ease-[cubic-bezier(0.2,0,0,1)] ${inset ? "pl-[88px]" : ""}`}
    >
      {tabs.map((tab, i) => {
        const note = notes.find((n) => n.path === tab.path);
        const title = note?.title ?? tab.path.split("/").pop()!.replace(/\.md$/, "");
        const on = i === active;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={on}
            title={title}
            onMouseDown={(e) => e.button === 0 && onSelect(i)}
            // Middle-click closes, like a browser tab.
            onAuxClick={(e) => e.button === 1 && (e.preventDefault(), onClose(i))}
            className={`group/tab relative -mb-px flex h-8 min-w-0 max-w-[220px] flex-1 cursor-default items-center gap-1.5 rounded-t-lg border border-b-0 pr-1 pl-2.5 text-[13px] ${
              on ? "border-line bg-surface text-ink" : "border-transparent text-muted hover:bg-hover"
            }`}
          >
            <span className="grid size-4 shrink-0 place-items-center text-faint">
              {note?.icon ? <PageIcon icon={note.icon} size={15} /> : note?.kind === "database" ? <Table2 size={14} /> : <FileText size={14} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onClose(i)}
              title="Close tab"
              className={`grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-hover hover:text-ink ${on ? "" : "opacity-0 group-hover/tab:opacity-100"}`}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
      <button onClick={onNew} title="New tab (⌘T)" className="mb-1 grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-hover">
        <Plus size={15} />
      </button>
    </div>
  );
}
