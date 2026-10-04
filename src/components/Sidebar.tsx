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
import { useState, type ReactNode } from "react";
import type { NoteMeta, RepoStatus, VaultInfo } from "../lib/api";
import type { TreeNode } from "../lib/tree";
import { aiAccess } from "../lib/ai";
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

  const rowProps = { ...p, onMenu: (note: NoteMeta, el: HTMLElement) => setMenu({ note, el }) };

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

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {favorites.length > 0 && (
          <Section label="Favorites">
            {favorites.map((n) => (
              <TreeRow key={`fav-${n.path}`} node={{ key: `fav:${n.path}`, note: n, title: n.title, children: [] }} depth={0} {...rowProps} />
            ))}
          </Section>
        )}
        <Section>
          {p.tree.map((node) => (
            <TreeRow key={node.key} node={node} depth={0} {...rowProps} />
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

function TreeRow({ node, depth, ...p }: Props & { node: TreeNode; depth: number; onMenu: (n: NoteMeta, el: HTMLElement) => void }) {
  const { aiPolicy } = useVault();
  const open = p.expanded.has(node.key);
  const active = node.note?.path === p.openPath;
  const isDb = node.note?.kind === "database";
  // Database rows live in the database, not the sidebar, just like Notion.
  const children = isDb ? [] : node.children;

  const icon = node.note?.icon ? (
    <PageIcon icon={node.note.icon} size={16} />
  ) : isDb ? (
    <Table2 size={16} />
  ) : node.note ? (
    <FileText size={16} />
  ) : (
    <Folder size={16} />
  );

  return (
    <div>
      <div
        onClick={() => (node.note ? p.onOpen(node.note.path) : p.onToggle(node.key))}
        style={{ paddingLeft: 4 + depth * 12 }}
        className={`group/row my-px flex h-[30px] cursor-pointer items-center gap-1 rounded-md pr-1 text-sm ${active ? "bg-hover font-medium text-ink" : "text-muted hover:bg-hover"}`}
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
      {open && children.map((c) => <TreeRow key={c.key} {...p} node={c} depth={depth + 1} />)}
      {open && !children.length && node.note && !isDb && (
        <div style={{ paddingLeft: 30 + depth * 12 }} className="py-1 text-xs text-faint">
          No pages inside
        </div>
      )}
    </div>
  );
}
