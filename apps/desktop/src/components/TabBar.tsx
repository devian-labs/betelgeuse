import { ChevronLeft, ChevronRight, ChevronsRight, FileText, PanelLeft, Puzzle, Plus, Table2, X } from "lucide-react";
import { useState } from "react";
import type { NoteMeta } from "../lib/api";
import { PageIcon } from "./PageIcon";
import { parseViewPath, useContributions } from "../plugins/runtime";
import { MenuDivider, MenuItem, Popover } from "./Popover";

type Props = {
  tabs: { id: number; path: string }[];
  active: number;
  notes: NoteMeta[];
  /** Leave room for the window's traffic lights (sidebar closed). */
  inset: boolean;
  onSelect: (i: number) => void;
  onClose: (i: number) => void;
  onCloseOthers: (i: number) => void;
  onCloseRight: (i: number) => void;
  onNew: () => void;
  onBack?: () => void;
  onForward?: () => void;
  /** Shown while the sidebar is closed: opens it, and hovering peeks it. */
  onShowSidebar?: () => void;
  onPeekSidebar?: () => void;
};

/**
 * The tab strip, always shown above the page: back / forward, one tab per open page, and +.
 * The active tab takes the page's colour so it reads as part of the page below it.
 */
export function TabBar(props: Props) {
  const { tabs, active, notes, inset, onSelect, onClose, onNew, onBack, onForward, onShowSidebar, onPeekSidebar } = props;
  // Right-clicking a tab: which one, and where.
  const [menu, setMenu] = useState<{ i: number; at: DOMRect } | null>(null);
  const { views } = useContributions();
  const run = (f: (i: number) => void) => () => (menu && f(menu.i), setMenu(null));
  return (
    <div
      data-tauri-drag-region
      className={`flex h-10 shrink-0 items-stretch border-b border-line bg-side transition-[padding] duration-[280ms] ease-[cubic-bezier(0.2,0,0,1)] ${inset ? "pl-[80px]" : ""}`}
    >
      <div data-tauri-drag-region className="flex shrink-0 items-center gap-0.5 border-r border-line px-2">
        {onShowSidebar && (
          <button
            onClick={onShowSidebar}
            onMouseEnter={onPeekSidebar}
            title="Open sidebar (⌘\)"
            className="group/menu grid size-7 place-items-center rounded-md text-muted hover:bg-hover"
          >
            <PanelLeft size={16} className="group-hover/menu:hidden" />
            <ChevronsRight size={16} className="hidden group-hover/menu:block" />
          </button>
        )}
        <button onClick={onBack} disabled={!onBack} title="Back (⌘[)" className="grid size-7 place-items-center rounded-md text-muted enabled:hover:bg-hover disabled:opacity-35">
          <ChevronLeft size={17} />
        </button>
        <button onClick={onForward} disabled={!onForward} title="Forward (⌘])" className="grid size-7 place-items-center rounded-md text-muted enabled:hover:bg-hover disabled:opacity-35">
          <ChevronRight size={17} />
        </button>
      </div>

      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-stretch overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {tabs.map((tab, i) => {
          const note = notes.find((n) => n.path === tab.path);
          const plugin = parseViewPath(tab.path);
          const view = plugin && views.find((v) => v.pluginId === plugin.pluginId && v.id === plugin.viewId);
          const title = plugin ? (view?.title ?? plugin.viewId) : (note?.title ?? tab.path.split("/").pop()!.replace(/\.md$/, ""));
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
              onContextMenu={(e) => (e.preventDefault(), setMenu({ i, at: new DOMRect(e.clientX, e.clientY, 0, 0) }))}
              className={`group/tab relative flex w-60 min-w-28 shrink cursor-default items-center gap-2 border-r border-line pr-1.5 pl-3.5 text-[13px] ${
                // The active tab covers the strip's bottom border, joining the page below.
                on ? "-mb-px bg-surface text-ink" : "text-muted hover:bg-hover hover:text-ink"
              }`}
            >
              <span className="grid size-4 shrink-0 place-items-center text-faint">
                {plugin ? (view?.icon ?? <Puzzle size={14} />) : note?.icon ? <PageIcon icon={note.icon} size={15} /> : note?.kind === "database" ? <Table2 size={14} /> : <FileText size={14} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {/* A lone tab can't be closed: there would be no page left to show. */}
              {tabs.length > 1 && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onClose(i)}
                  title="Close tab"
                  className="grid size-5 shrink-0 place-items-center rounded text-faint opacity-0 group-hover/tab:opacity-100 hover:bg-hover hover:text-ink"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}
        <button onClick={onNew} title="New tab (⌘T)" className="grid w-10 shrink-0 place-items-center text-muted hover:bg-hover hover:text-ink">
          <Plus size={16} />
        </button>
        <div data-tauri-drag-region className="min-w-4 flex-1" />
      </div>

      {menu && (
        <Popover anchor={menu.at} onClose={() => setMenu(null)} className="w-52 p-1">
          <MenuItem icon={<Plus size={15} />} label="New tab" hint="⌘T" onClick={run(onNew)} />
          {tabs.length > 1 && (
            <>
              <MenuDivider />
              <MenuItem icon={<X size={15} />} label="Close tab" onClick={run(onClose)} />
              <MenuItem icon={<span />} label="Close other tabs" onClick={run(props.onCloseOthers)} />
              {menu.i < tabs.length - 1 && <MenuItem icon={<span />} label="Close tabs to the right" onClick={run(props.onCloseRight)} />}
            </>
          )}
        </Popover>
      )}
    </div>
  );
}
