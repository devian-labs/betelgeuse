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
import { useCallback, useRef, useState, type ReactNode, type RefObject } from "react";
import type { NoteMeta, RepoStatus, VaultInfo } from "../lib/api";
import type { TreeNode } from "../lib/tree";
import { aiAccess } from "../lib/ai";
import { nearestGap } from "../lib/order";
import { LINKS, open as openLink } from "../lib/links";
import { useVault } from "../lib/vault";
import { Logo } from "./Logo";
import { MenuDivider, MenuItem, Popover } from "./Popover";

type Props = {
  vault: VaultInfo;
  tree: TreeNode[];
  notes: NoteMeta[];
  favorites: string[];
  openPath: string | null;
  expanded: Set<string>;
  status: RepoStatus | null;
  busy: string | null;
  onToggle: (key: string) => void;
  onOpen: (path: string) => void;
  onCreate: (parentPath: string | null) => void;
  onDelete: (path: string) => void;
  onDuplicate: (path: string) => void;
  onToggleFavorite: (path: string) => void;
  /** A page was dragged to drop position `gap` among `siblings` (its folder's pages, as shown). */
  onReorder: (path: string, siblings: string[], gap: number) => void;
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
  /** Floating hover preview shown while closed, like Notion. */
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
  const favorites = p.favorites.map((f) => p.notes.find((n) => n.path === f)).filter((n): n is NoteMeta => !!n);

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
  const drag = useTreeDrag(scroller, p.tree, p.onReorder);
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
      onMouseLeave={() => !p.open && p.onPeekEnd()}
      className={`group/side absolute left-0 flex flex-col bg-side ${resizing ? "" : "transition-[transform,top,bottom,border-radius,box-shadow] duration-[280ms] ease-[cubic-bezier(0.2,0,0,1)]"} ${
        p.open
          ? "inset-y-0 translate-x-0"
          : p.peeking
            ? "top-12 bottom-12 z-40 translate-x-0 overflow-hidden rounded-r-lg border border-l-0 border-line shadow-pop"
            : "top-12 bottom-12 z-40 -translate-x-[110%]"
      }`}
    >
      {/* Top row: window controls live on the left; sidebar toggle and new page like Notion. */}
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
          {favorites.length > 0 && (
            <Section label="Favorites">
              {favorites.map((n) => (
                <TreeRow key={`fav-${n.path}`} node={{ key: `fav:${n.path}`, note: n, title: n.title, children: [] }} depth={0} parent={null} {...rowProps} />
              ))}
            </Section>
          )}
          <Section>
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
        {drag.state?.target && (
          <div
            data-drop-indicator
            style={{ top: drag.state.target.top - 1, left: drag.state.target.left }}
            className="pointer-events-none absolute right-2 z-10 h-0.5 rounded-full bg-[var(--blue)]"
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

function Section({ label, children, onAdd }: { label?: string; children: ReactNode; onAdd?: () => void }) {
  const [open, setOpen] = useState(true);
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
  const open = p.expanded.has(node.key);
  const active = node.note?.path === p.openPath;
  const isDb = node.note?.kind === "database";
  // Database rows live in the database, not the sidebar, just like Notion.
  const children = isDb ? [] : node.children;
  const reorderable = parent !== null && !!node.note;
  const icon = rowIcon(node);

  return (
    <div data-tree-block={reorderable ? node.key : undefined}>
      <div
        onClick={() => (node.note ? p.onOpen(node.note.path) : p.onToggle(node.key))}
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
        {node.note && !aiAccess(node.note.path, p.notes, aiPolicy).visible && (
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
// behave the same in every webview. Pages can be reordered among their siblings; the drop is
// handed to `onReorder`, which writes the new `order` frontmatter.

type DropTarget = { gap: number; top: number; left: number };
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

function useTreeDrag(scroller: RefObject<HTMLDivElement | null>, tree: TreeNode[], onReorder: Props["onReorder"]): TreeDrag {
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

    const siblings = () => ((parent ? findNode(treeRef.current, parent)?.children : treeRef.current) ?? []).filter((c) => c.note);

    const measure = (): DropTarget | null => {
      const el = scroller.current;
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const blocks = siblings().flatMap((s) => {
        const block = el.querySelector(`[data-tree-block="${CSS.escape(s.key)}"]`);
        return block ? [block.getBoundingClientRect()] : [];
      });
      if (!blocks.length || pointer.current.x < box.left || pointer.current.x > box.right) return null;
      if (pointer.current.y < blocks[0].top - SLACK || pointer.current.y > blocks[blocks.length - 1].bottom + SLACK) return null;
      const gap = nearestGap(blocks, pointer.current.y);
      const edge = gap < blocks.length ? blocks[gap].top : blocks[blocks.length - 1].bottom;
      const depth = node.key.split("/").length - 1;
      // Line up with the rows' content: the list's padding plus the row's indent.
      return { gap, top: edge - box.top + el.scrollTop, left: 8 + 4 + depth * 12 };
    };

    const update = () => {
      place();
      const next = measure();
      if (next?.gap !== target?.gap || next?.top !== target?.top) {
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
      if (drop && node.note) onReorder(node.note.path, siblings().map((s) => s.note!.path), drop.gap);
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
