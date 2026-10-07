import {
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronsRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Heart,
  Folder,
  GitCommitHorizontal,
  ExternalLink,
  MoreHorizontal,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings,
  Search,
  SquarePen,
  Star,
  StarOff,
  Table2,
  Trash2,
} from "lucide-react";
import { PageIcon } from "./PageIcon";
import { TrashPanel } from "./TrashPanel";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { NoteMeta, RepoStatus, VaultInfo } from "../lib/api";
import type { TreeNode } from "../lib/tree";
import { aiAccess } from "../lib/ai";
import { LINKS, open as openLink } from "../lib/links";
import { wantsNewTab, type OpenOptions } from "../lib/nav";
import { useSettings } from "../lib/settings";
import { useVault } from "../lib/vault";
import { Logo } from "./Logo";
import { MenuDivider, MenuItem, Popover } from "./Popover";

type Props = {
  vault: VaultInfo;
  tree: TreeNode[];
  notes: NoteMeta[];
  favorites: string[];
  /** Recently opened pages, newest first. */
  recents: string[];
  openPath: string | null;
  expanded: Set<string>;
  status: RepoStatus | null;
  busy: string | null;
  onToggle: (key: string) => void;
  onOpen: (path: string, opts?: OpenOptions) => void;
  onCreate: (parentPath: string | null) => void;
  onDelete: (path: string) => void;
  onDuplicate: (path: string) => void;
  onToggleFavorite: (path: string) => void;
  /** A page was dragged to drop position `gap` among `siblings` (its folder's pages, as shown). */
  onReorder: (path: string, siblings: string[], gap: number) => void;
  /**
   * A page was dragged into another folder `dest` (a page's sub-pages, or "" for the top level):
   * at drop position `gap` among that folder's `siblings`, or (gap null) dropped onto the page.
   */
  onMove: (path: string, dest: string, siblings: string[], gap: number | null) => void;
  onSearch: () => void;
  onSwitchVault: () => void;
  onCommit: () => void;
  onSync: () => void;
  onAgents: () => void;
  onSettings: () => void;
  onImport: () => void;
  onCollapse: () => void;
  /** Docked open (true), or hidden off-screen unless `peeking`. */
  open: boolean;
  /** Floating hover preview shown while closed. */
  peeking: boolean;
  onDock: () => void;
  /** No room needs reserving for the macOS window buttons in fullscreen. */
  fullscreen: boolean;
  onPeekEnd: () => void;
};

const readWidth = () => {
  try {
    return Number(localStorage.getItem("sidebar-width")) || 248;
  } catch {
    return 248;
  }
};

export function Sidebar(p: Props) {
  const [width, setWidth] = useState(readWidth);
  const [resizing, setResizing] = useState(false);
  const [menu, setMenu] = useState<{ note: NoteMeta; el: HTMLElement } | null>(null);
  const [trash, setTrash] = useState<HTMLElement | null>(null);
  const changes = p.status?.changes.length ?? 0;
  const byPath = new Map(p.notes.map((n) => [n.path, n]));
  const favorites = p.favorites.map((f) => byPath.get(f)).filter((n): n is NoteMeta => !!n);
  // Recents hold still while the pointer is over the sidebar, so opening a page doesn't move the
  // rows under it; they catch up when the pointer leaves (or right away for pages opened elsewhere).
  const hovering = useRef(false);
  const latestRecents = useRef(p.recents);
  latestRecents.current = p.recents;
  const [shownRecents, setShownRecents] = useState(p.recents);
  useEffect(() => {
    if (!hovering.current) setShownRecents(p.recents);
  }, [p.recents]);
  const recents = shownRecents.map((r) => byPath.get(r)).filter((n): n is NoteMeta => !!n);
  const settings = useSettings();

  const resize = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const start = width;
    let w = start;
    const move = (ev: MouseEvent) => {
      w = Math.min(420, Math.max(200, start + ev.clientX - startX));
      setWidth(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setResizing(false);
      try {
        localStorage.setItem("sidebar-width", String(w));
      } catch {
        /* convenience only */
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const scroller = useRef<HTMLDivElement>(null);
  const drag = useTreeDrag(scroller, p.tree, p.onReorder, p.onMove);
  const rowProps = { ...p, drag, onMenu: (note: NoteMeta, el: HTMLElement) => setMenu({ note, el }) };

  return (
    // The outer box animates its width (pushing the page), while the panel slides in from the
    // left. Closed, the panel can still float out over the page as a hover preview.
    <div
      style={{ width: p.open ? width : 0 }}
      className={`relative h-full shrink-0 ${resizing ? "" : "transition-[width] duration-[280ms] ease-[cubic-bezier(0.2,0,0,1)]"}`}
    >
    <aside
      style={{ width }}
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => {
        hovering.current = false;
        setShownRecents(latestRecents.current);
        if (!p.open) p.onPeekEnd();
      }}
      className={`group/side absolute left-0 flex flex-col bg-side ${resizing ? "" : "transition-[transform,top,bottom,border-radius,box-shadow] duration-[280ms] ease-[cubic-bezier(0.2,0,0,1)]"} ${
        p.open
          ? "inset-y-0 translate-x-0"
          : p.peeking
            ? "top-12 bottom-12 z-40 translate-x-0 overflow-hidden rounded-r-lg border border-l-0 border-line shadow-pop"
            : "top-12 bottom-12 z-40 -translate-x-[110%]"
      }`}
    >
      {/* Top row: window controls live on the left; then the sidebar toggle and new page. */}
      <div data-tauri-drag-region className={`flex h-10 shrink-0 items-center gap-0.5 pr-2 ${p.open && !p.fullscreen ? "pl-[88px]" : "pl-2"}`}>
        {p.open ? (
          <IconButton title="Close sidebar (⌘\\)" onClick={p.onCollapse}>
            <PanelLeft size={16} />
          </IconButton>
        ) : (
          <IconButton title="Lock sidebar open (⌘\\)" onClick={p.onDock}>
            <ChevronsRight size={16} />
          </IconButton>
        )}
        <span data-tauri-drag-region className="flex-1 self-stretch" />
        <IconButton title="New page (⌘N)" onClick={() => p.onCreate(null)}>
          <SquarePen size={15} />
        </IconButton>
      </div>

      <div className="px-2 pb-2">
        <button
          onClick={p.onSearch}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-[var(--search-bg)] px-2.5 text-sm text-faint hover:bg-hover"
        >
          <Search size={15} />
          <span className="flex-1 text-left">Search</span>
          <span className="rounded border border-line px-1 text-[11px] leading-4">⌘K</span>
        </button>
      </div>

      <div ref={scroller} className="relative mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {/* While dragging, rows ignore the pointer so nothing but the drop line reacts to it. */}
        <div className={drag.state ? "pointer-events-none" : ""}>
          {recents.length > 0 && (
            <Section label="Recents" id="recents">
              {/* A fixed height (Settings → Appearance), so opening pages never shifts the tree below;
                  pages past it scroll inside the box. Each row is 30px plus 1px margins. */}
              <div className="overflow-y-auto" style={{ height: settings.recentRows * 32, scrollbarWidth: "thin" }}>
                {recents.map((n) => (
                  <TreeRow key={`recent-${n.path}`} node={{ key: `recent:${n.path}`, note: n, title: n.title, children: [] }} depth={0} parent={null} {...rowProps} />
                ))}
              </div>
            </Section>
          )}
          {favorites.length > 0 && (
            <Section label="Favorites" id="favorites">
              {favorites.map((n) => (
                <TreeRow key={`fav-${n.path}`} node={{ key: `fav:${n.path}`, note: n, title: n.title, children: [] }} depth={0} parent={null} {...rowProps} />
              ))}
            </Section>
          )}
          <Section label="Pages" id="pages" onAdd={() => p.onCreate(null)}>
            {p.tree.map((node) => (
              <TreeRow key={node.key} node={node} depth={0} parent="" {...rowProps} />
            ))}
            {p.tree.length === 0 && <p className="px-2 py-1 text-sm text-faint">No pages yet</p>}
            <button onClick={() => p.onCreate(null)} className="flex h-[30px] w-full items-center gap-1 rounded-md pl-1 text-sm text-faint hover:bg-hover hover:text-muted">
              <span className="grid size-6 place-items-center">
                <Plus size={16} />
              </span>
              Add new
            </button>
          </Section>
          <Section label="Agents">
            <button onClick={p.onAgents} className="flex h-[30px] w-full items-center gap-1 rounded-md pl-1 text-sm text-muted hover:bg-hover">
              <span className="grid size-6 place-items-center text-faint">
                <Bot size={16} />
              </span>
              Connect agents
              <span className="ml-auto mr-1.5 rounded bg-hover px-1.5 text-[10px] font-medium tracking-wide text-faint">MCP</span>
            </button>
          </Section>
        </div>
        {drag.state?.target?.kind === "between" && (
          <div
            data-drop-indicator
            style={{ top: drag.state.target.top - 1, left: drag.state.target.left }}
            className="pointer-events-none absolute right-2 z-10 h-0.5 rounded-full bg-[var(--blue)]"
          />
        )}
        {/* Dropping onto a page makes the dragged one its sub-page. */}
        {drag.state?.target?.kind === "inside" && (
          <div
            data-drop-inside
            style={{ top: drag.state.target.top, height: drag.state.target.height }}
            className="pointer-events-none absolute inset-x-2 z-10 rounded-md bg-[var(--blue)]/15 ring-2 ring-[var(--blue)]/60"
          />
        )}
      </div>
      {drag.state &&
        createPortal(
        <div
          ref={drag.ghost}
          className={`pointer-events-none fixed top-0 left-0 z-50 flex h-[30px] max-w-[240px] items-center gap-1 rounded-md border border-line bg-raised px-1.5 text-sm text-ink shadow-pop ${drag.state.target ? "opacity-90" : "opacity-50"}`}
        >
          <span className="grid size-6 shrink-0 place-items-center text-faint">{rowIcon(drag.state.node)}</span>
          <span className="min-w-0 truncate pr-1">{drag.state.node.title}</span>
        </div>,
        document.body,
      )}

      <div className="px-2 pb-1.5">
        <button onClick={p.onImport} className="flex h-[30px] w-full items-center gap-1 rounded-md pl-1 text-sm text-muted hover:bg-hover">
          <span className="grid size-6 place-items-center text-faint">
            <Download size={16} />
          </span>
          Import
        </button>
        <button onClick={p.onSettings} className="flex h-[30px] w-full items-center gap-1 rounded-md pl-1 text-sm text-muted hover:bg-hover">
          <span className="grid size-6 place-items-center text-faint">
            <Settings size={16} />
          </span>
          Settings
        </button>
        <button onClick={(e) => setTrash(e.currentTarget)} className="flex h-[30px] w-full items-center gap-1 rounded-md pl-1 text-sm text-muted hover:bg-hover">
          <span className="grid size-6 place-items-center text-faint">
            <Trash2 size={16} />
          </span>
          Trash
        </button>
      </div>
      {trash && <TrashPanel anchor={trash} onClose={() => setTrash(null)} />}

      <div className="flex h-12 shrink-0 items-center gap-1 border-t border-line px-2">
        <button
          onClick={p.onSwitchVault}
          title={`${p.vault.path}\nOpen another workspace`}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left hover:bg-hover"
        >
          <Logo className="size-5 shrink-0" />
          <span className="min-w-0 truncate text-sm font-medium text-ink">{p.vault.name}</span>
          <ChevronDown size={14} className="shrink-0 text-faint" />
        </button>
        <IconButton title="Support Betelgeuse" onClick={() => openLink(LINKS.sponsor)}>
          <Heart size={15} />
        </IconButton>
        <IconButton
          title={p.busy ?? (changes ? `${changes} uncommitted change${changes > 1 ? "s" : ""} on ${p.status?.branch} · click to commit (⌘S)` : `All changes committed on ${p.status?.branch ?? "main"}`)}
          onClick={p.onCommit}
        >
          <span className="relative">
            <GitCommitHorizontal size={17} />
            {changes > 0 && (
              <span className="absolute -top-1.5 -right-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[var(--c-red-text)] px-0.5 text-[9px] font-semibold text-white">
                {changes > 9 ? "9+" : changes}
              </span>
            )}
          </span>
        </IconButton>
        {p.status?.has_remote && (
          <IconButton title="Sync with remote (pull and push)" onClick={p.onSync}>
            <RefreshCw size={15} className={p.busy?.startsWith("Sync") ? "animate-spin" : ""} />
          </IconButton>
        )}
      </div>

      {p.open && (
        <span onMouseDown={resize} className="absolute top-0 -right-px z-10 h-full w-1 cursor-col-resize border-r border-line hover:border-r-2 hover:border-[var(--blue)]/50" />
      )}

      {menu && (
        <Popover anchor={menu.el} onClose={() => setMenu(null)} className="w-56 p-1">
          <MenuItem icon={<ExternalLink size={15} />} label="Open in new tab" onClick={() => (p.onOpen(menu.note.path, { newTab: true }), setMenu(null))} />
          <MenuItem
            icon={p.favorites.includes(menu.note.path) ? <StarOff size={15} /> : <Star size={15} />}
            label={p.favorites.includes(menu.note.path) ? "Remove from Favorites" : "Add to Favorites"}
            onClick={() => (p.onToggleFavorite(menu.note.path), setMenu(null))}
          />
          <AiMenuItem path={menu.note.path} onDone={() => setMenu(null)} />
          <MenuItem icon={<Copy size={15} />} label="Duplicate" onClick={() => (p.onDuplicate(menu.note.path), setMenu(null))} />
          <MenuItem icon={<Plus size={15} />} label="Add a page inside" onClick={() => (p.onCreate(menu.note.path), setMenu(null))} />
          <MenuDivider />
          <MenuItem icon={<Trash2 size={15} />} label="Move to Trash" danger onClick={() => (p.onDelete(menu.note.path), setMenu(null))} />
        </Popover>
      )}
    </aside>
    </div>
  );
}

/** A sidebar group; a labelled one folds, and remembers that by `id`. */
function Section({ label, id, children, onAdd }: { label?: string; id?: string; children: ReactNode; onAdd?: () => void }) {
  const key = `section-closed:${id}`;
  const [open, setOpenState] = useState(() => {
    try {
      return !id || localStorage.getItem(key) !== "1";
    } catch {
      return true;
    }
  });
  const setOpen = (f: (o: boolean) => boolean) =>
    setOpenState((o) => {
      const next = f(o);
      try {
        if (id) localStorage.setItem(key, next ? "0" : "1");
      } catch {
        /* convenience only */
      }
      return next;
    });
  if (!label) return <div className="mb-3">{children}</div>;
  return (
    <div className="mb-3">
      <div className="group/sec flex h-7 items-center rounded-md px-2 hover:bg-hover">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 text-left text-xs font-medium text-faint">
          {label}
        </button>
        {onAdd && (
          <button onClick={onAdd} title="Add a page" className="grid size-5 place-items-center rounded text-faint opacity-0 group-hover/sec:opacity-100 hover:bg-hover">
            <Plus size={14} />
          </button>
        )}
      </div>
      {open && children}
    </div>
  );
}

function AiMenuItem({ path, onDone }: { path: string; onDone: () => void }) {
  const { notes, aiPolicy, setPageAi } = useVault();
  const access = aiAccess(path, notes, aiPolicy);
  if (access.source === "parent" && !access.visible) {
    return <MenuItem icon={<EyeOff size={15} />} label="Hidden from AI" hint={`via ${access.from?.title}`} onClick={onDone} />;
  }
  return (
    <MenuItem
      icon={access.visible ? <EyeOff size={15} /> : <Eye size={15} />}
      label={aiPolicy === "shared" ? (access.visible ? "Stop sharing with AI" : "Share with AI agents") : access.visible ? "Hide from AI agents" : "Show to AI agents"}
      onClick={() => (setPageAi(path, !access.visible), onDone())}
    />
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink">
      {children}
    </button>
  );
}

function rowIcon(node: TreeNode) {
  return node.note?.icon ? (
    <PageIcon icon={node.note.icon} size={16} />
  ) : node.note?.kind === "database" ? (
    <Table2 size={16} />
  ) : node.note ? (
    <FileText size={16} />
  ) : (
    <Folder size={16} />
  );
}

type RowProps = Props & {
  node: TreeNode;
  depth: number;
  /** Key of the folder the row sits in ("" at the top level), or null where rows can't be reordered (Favorites). */
  parent: string | null;
  drag: TreeDrag;
  onMenu: (n: NoteMeta, el: HTMLElement) => void;
};

function TreeRow({ node, depth, parent, ...p }: RowProps) {
  const { aiPolicy } = useVault();
  const { sidebarAiBadges: aiBadges } = useSettings();
  const open = p.expanded.has(node.key);
  const active = node.note?.path === p.openPath;
  const isDb = node.note?.kind === "database";
  // Database rows live in the database, not the sidebar.
  const children = isDb ? [] : node.children;
  const reorderable = parent !== null && !!node.note;
  const icon = rowIcon(node);

  return (
    <div data-tree-block={reorderable ? node.key : undefined}>
      <div
        // Drop targets for dragged pages (the page tree only, not Favorites or Recents).
        data-tree-row={parent !== null ? node.key : undefined}
        data-parent={parent ?? undefined}
        data-can-nest={parent !== null && !isDb ? "" : undefined}
        data-open={open && children.length ? "" : undefined}
        onClick={(e) => (node.note ? p.onOpen(node.note.path, { newTab: wantsNewTab(e) }) : p.onToggle(node.key))}
        onAuxClick={(e) => node.note && e.button === 1 && p.onOpen(node.note.path, { newTab: true })}
        onMouseDown={reorderable ? (e) => p.drag.start(e, node, parent) : undefined}
        style={{ paddingLeft: 4 + depth * 12 }}
        className={`group/row my-px flex h-[30px] cursor-pointer items-center gap-1 rounded-md pr-1 text-sm ${active ? "bg-hover font-medium text-ink" : "text-muted hover:bg-hover"} ${p.drag.state?.node.key === node.key && reorderable ? "opacity-40" : ""}`}
      >
        <span className="relative grid size-6 shrink-0 place-items-center text-faint">
          <span className={children.length || !node.note ? "group-hover/row:opacity-0" : ""}>{icon}</span>
          {(children.length > 0 || !node.note) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                p.onToggle(node.key);
              }}
              className="absolute inset-0 grid place-items-center rounded opacity-0 group-hover/row:opacity-100 hover:bg-hover"
            >
              <ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        {aiBadges && node.note && !aiAccess(node.note.path, p.notes, aiPolicy).visible && (
          <span title="Hidden from AI agents" className="shrink-0 text-faint group-hover/row:hidden">
            <EyeOff size={13} />
          </span>
        )}
        {node.note && (
          <span className="hidden shrink-0 items-center group-hover/row:flex" onClick={(e) => e.stopPropagation()}>
            <button title="Delete, duplicate, and more…" onClick={(e) => p.onMenu(node.note!, e.currentTarget)} className="grid size-5 place-items-center rounded text-faint hover:bg-hover hover:text-muted">
              <MoreHorizontal size={14} />
            </button>
            {!isDb && (
              <button title="Add a page inside" onClick={() => p.onCreate(node.note!.path)} className="grid size-5 place-items-center rounded text-faint hover:bg-hover hover:text-muted">
                <Plus size={14} />
              </button>
            )}
          </span>
        )}
      </div>
      {open && children.map((c) => <TreeRow key={c.key} {...p} node={c} depth={depth + 1} parent={node.key} />)}
      {open && !children.length && node.note && !isDb && (
        <div style={{ paddingLeft: 30 + depth * 12 }} className="py-1 text-xs text-faint">
          No pages inside
        </div>
      )}
    </div>
  );
}

// ---------- Drag to reorder ----------
//
// Pointer-driven rather than HTML5 drag and drop, so the drop line, the floating row and Escape
// behave the same in every webview. Drop on a row's upper or lower edge to put the
// page before or after it (in that row's folder, so between top-level rows moves it to the top
// level), or on the middle of a page to make it a sub-page. A drop among its own siblings is a
// reorder (`onReorder`, which writes `order` frontmatter); anywhere else is a move (`onMove`).

type DropTarget =
  /** Drop position `gap` among the pages of folder `parent` ("" is the top level), shown as a line. */
  | { kind: "between"; parent: string; gap: number; top: number; left: number }
  /** Onto page (or folder) `key`, shown by highlighting its row. */
  | { kind: "inside"; key: string; top: number; height: number };
type DragState = { node: TreeNode; target: DropTarget | null };
type TreeDrag = {
  state: DragState | null;
  /** Ref for the floating copy of the row that follows the pointer. */
  ghost: (el: HTMLDivElement | null) => void;
  start: (e: React.MouseEvent, node: TreeNode, parent: string) => void;
};

function findNode(nodes: TreeNode[], key: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.key === key) return n;
    if (key.startsWith(`${n.key}/`)) return findNode(n.children, key);
  }
  return undefined;
}

/** Pixels the pointer must travel before a press becomes a drag (so clicks still open pages). */
const THRESHOLD = 4;
/** How far above or below the sibling rows a drop still counts. */
const SLACK = 36;

const sameTarget = (a: DropTarget | null, b: DropTarget | null) => JSON.stringify(a) === JSON.stringify(b);

function useTreeDrag(scroller: RefObject<HTMLDivElement | null>, tree: TreeNode[], onReorder: Props["onReorder"], onMove: Props["onMove"]): TreeDrag {
  const [state, setState] = useState<DragState | null>(null);
  const ghostEl = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const treeRef = useRef(tree);
  treeRef.current = tree;

  const place = () => {
    const el = ghostEl.current;
    if (el) el.style.transform = `translate(${pointer.current.x + 10}px, ${pointer.current.y - 15}px)`;
  };
  const ghost = useCallback((el: HTMLDivElement | null) => {
    ghostEl.current = el;
    place();
  }, []);

  const start = (e: React.MouseEvent, node: TreeNode, parent: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || (e.target as HTMLElement).closest("button")) return;
    const origin = { x: e.clientX, y: e.clientY };
    pointer.current = { ...origin };
    let dragging = false;
    let cancelled = false;
    let target: DropTarget | null = null;
    let frame = 0;

    /** The rows in folder `key` ("" is the top level), as shown; `pages` are the ones with a page. */
    const folder = (key: string) => {
      const all = (key ? findNode(treeRef.current, key)?.children : treeRef.current) ?? [];
      return { all, pages: all.filter((c) => c.note) };
    };
    const ownOrInside = (key: string) => key === node.key || key.startsWith(`${node.key}/`);

    const measure = (): DropTarget | null => {
      const el = scroller.current;
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const { x, y } = pointer.current;
      if (x < box.left || x > box.right) return null;
      const rows = [...el.querySelectorAll<HTMLElement>("[data-tree-row]")];
      if (!rows.length) return null;
      const at = (top: number) => top - box.top + el.scrollTop;
      const indent = (depth: number) => 8 + 4 + depth * 12;
      // Gap `before` (or after) the row `key` among its folder's pages.
      const between = (key: string, parentKey: string, after: boolean, edge: number): DropTarget => {
        const { all } = folder(parentKey);
        const i = all.findIndex((c) => c.key === key);
        const gap = all.slice(0, i + (after ? 1 : 0)).filter((c) => c.note).length;
        return { kind: "between", parent: parentKey, gap, top: at(edge), left: indent(key.split("/").length - 1) };
      };

      const row = rows.find((r) => {
        const b = r.getBoundingClientRect();
        return y >= b.top - 1 && y < b.bottom + 1;
      });
      if (!row) {
        // Just above or below the whole tree: the top level's first or last position.
        const first = rows[0].getBoundingClientRect();
        const lastTop = rows.filter((r) => !r.dataset.parent).at(-1);
        const end = rows.at(-1)!.getBoundingClientRect();
        if (y < first.top && y > first.top - SLACK) return between(rows[0].dataset.treeRow!, "", false, first.top);
        if (lastTop && y > end.bottom && y < end.bottom + SLACK) return between(lastTop.dataset.treeRow!, "", true, end.bottom);
        return null;
      }
      const key = row.dataset.treeRow!;
      const parentKey = row.dataset.parent ?? "";
      const b = row.getBoundingClientRect();
      const share = (y - b.top) / b.height;
      if (ownOrInside(key)) return null;
      const nests = row.dataset.canNest !== undefined;
      if (nests && share > 0.25 && share < 0.75) return { kind: "inside", key, top: at(b.top), height: b.height };
      if (share < 0.5) return between(key, parentKey, false, b.top);
      // Below an expanded page: first among its sub-pages.
      if (nests && row.dataset.open !== undefined) return { kind: "between", parent: key, gap: 0, top: at(b.bottom), left: indent(key.split("/").length) };
      // After the row and everything under it.
      const block = row.parentElement?.getBoundingClientRect() ?? b;
      return between(key, parentKey, true, block.bottom);
    };

    const update = () => {
      place();
      const next = measure();
      if (!sameTarget(next, target)) {
        target = next;
        setState({ node, target });
      }
    };

    // Scrolls the list while the pointer is held near its top or bottom edge.
    const autoscroll = () => {
      const el = scroller.current;
      if (el) {
        const box = el.getBoundingClientRect();
        const zone = 32;
        const speed = pointer.current.y < box.top + zone ? -(box.top + zone - pointer.current.y) / 3 : pointer.current.y > box.bottom - zone ? (pointer.current.y - box.bottom + zone) / 3 : 0;
        if (speed) {
          el.scrollTop += Math.max(-12, Math.min(12, speed));
          update();
        }
      }
      frame = requestAnimationFrame(autoscroll);
    };

    // Ends the drag's visuals; `release` also stops listening for the mouse button.
    const finish = (release = true) => {
      window.removeEventListener("mousemove", move);
      if (release) window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      cancelAnimationFrame(frame);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      setState(null);
    };

    const move = (ev: MouseEvent) => {
      pointer.current = { x: ev.clientX, y: ev.clientY };
      if (!dragging) {
        if (Math.hypot(pointer.current.x - origin.x, pointer.current.y - origin.y) < THRESHOLD) return;
        dragging = true;
        window.getSelection()?.removeAllRanges();
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        frame = requestAnimationFrame(autoscroll);
        target = measure();
        setState({ node, target });
        return;
      }
      update();
    };

    const up = () => {
      const drop = dragging && !cancelled ? target : null;
      finish();
      if (!dragging) return;
      // The release would otherwise click the row under the pointer and open it.
      const swallow = (ev: MouseEvent) => (ev.stopPropagation(), ev.preventDefault());
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      if (!drop || !node.note) return;
      if (drop.kind === "inside") return onMove(node.note.path, drop.key, folder(drop.key).pages.map((s) => s.note!.path), null);
      const siblings = folder(drop.parent).pages.map((s) => s.note!.path);
      if (drop.parent === parent) onReorder(node.note.path, siblings, drop.gap);
      else onMove(node.note.path, drop.parent, siblings, drop.gap);
    };

    const cancel = () => finish();
    // Escape drops nothing; the button release that follows still must not open a page.
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !dragging) return;
      ev.preventDefault();
      ev.stopPropagation();
      cancelled = true;
      finish(false);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
  };

  return { state, ghost, start };
}
