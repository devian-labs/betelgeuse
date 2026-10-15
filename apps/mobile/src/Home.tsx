import { ChevronRight, CloudOff, Folder, MoreHorizontal, Plus, RefreshCw, Search, Settings, SquarePen, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Logo } from "@desktop/components/Logo";
import type { NoteMeta } from "@desktop/lib/api";
import { useSettings } from "@desktop/lib/settings";
import { buildTree, type TreeNode } from "@desktop/lib/tree";
import { useVault } from "@desktop/lib/vault";
import { useMobile } from "./mobile";
import { NoteIcon } from "./PageSheets";
import { PluginHomeRows } from "./plugins";
import { IconButton, useLongPress } from "./ui";

const EXPANDED = "mobile-expanded";
const readExpanded = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(EXPANDED) ?? "[]"));
  } catch {
    return new Set<string>();
  }
};

/**
 * The page list, laid out like the desktop sidebar: search, Recents, Favorites and the page tree,
 * then Trash and Settings.
 */
export function Home() {
  const { notes, openPage, createPage } = useVault();
  const m = useMobile();
  const settings = useSettings();
  const tree = useMemo(() => buildTree(notes), [notes]);
  const byPath = useMemo(() => new Map(notes.map((n) => [n.path, n])), [notes]);
  const recents = m.recents.map((p) => byPath.get(p)).filter((n): n is NoteMeta => !!n).slice(0, settings.recentRows);
  const favorites = m.favorites.map((p) => byPath.get(p)).filter((n): n is NoteMeta => !!n);
  const [expanded, setExpanded] = useState(readExpanded);
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(EXPANDED, JSON.stringify([...next]));
      } catch {
        /* convenience only */
      }
      return next;
    });

  return (
    <div className="safe-top flex h-full flex-col bg-side">
      <header className="flex h-14 shrink-0 items-center gap-2 pr-2 pl-4">
        <Logo className="size-7 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">Betelgeuse</span>
        <SyncButton />
        <IconButton label="Settings" onClick={() => m.go({ name: "settings" })}>
          <Settings size={21} />
        </IconButton>
        <IconButton label="New page" onClick={() => m.newPage()}>
          <SquarePen size={20} />
        </IconButton>
      </header>

      <div className="shrink-0 px-3 pb-2">
        <button
          onClick={() => m.go({ name: "search" })}
          className="flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-[var(--search-bg)] px-3 text-[15px] text-faint active:bg-hover"
        >
          <Search size={17} />
          Search
        </button>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-2 pb-28">
        <PluginHomeRows />
        {recents.length > 0 && (
          <Section label="Recents">
            {recents.map((n) => (
              <Row key={`r:${n.path}`} note={n} title={n.title} depth={0} onOpen={() => openPage(n.path)} />
            ))}
          </Section>
        )}
        {favorites.length > 0 && (
          <Section label="Favorites">
            {favorites.map((n) => (
              <Row key={`f:${n.path}`} note={n} title={n.title} depth={0} onOpen={() => openPage(n.path)} />
            ))}
          </Section>
        )}
        <Section label="Pages" onAdd={async () => openPage(await createPage(null))}>
          {tree.map((node) => (
            <TreeRow key={node.key} node={node} depth={0} expanded={expanded} onToggle={toggle} />
          ))}
          {tree.length === 0 && <p className="px-3 py-2 text-[15px] text-faint">No pages yet</p>}
          <button onClick={async () => openPage(await createPage(null))} className="flex h-11 w-full items-center gap-2.5 rounded-lg pl-2 text-[15px] text-faint active:bg-hover">
            <span className="grid size-6 place-items-center">
              <Plus size={18} />
            </span>
            Add new
          </button>
        </Section>

        <div className="mt-2 border-t border-line pt-2">
          <PlainRow icon={<Trash2 size={18} />} label="Trash" onClick={() => m.go({ name: "trash" })} />
          <PlainRow icon={<Settings size={18} />} label="Settings" onClick={() => m.go({ name: "settings" })} />
        </div>
      </main>

      <button
        onClick={() => m.newPage()}
        aria-label="New page"
        className="fixed right-5 z-10 grid size-14 place-items-center rounded-full bg-[var(--blue)] text-white shadow-pop active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <SquarePen size={23} />
      </button>
    </div>
  );
}

/** Syncs now; before sync is set up, opens its setup. A dot marks a sync that failed. */
function SyncButton() {
  const m = useMobile();
  const { status, syncing, error } = m.sync;
  if (!status) return null;
  if (!status.configured) {
    return (
      <IconButton label="Set up sync" onClick={() => m.go({ name: "sync" })}>
        <CloudOff size={20} />
      </IconButton>
    );
  }
  return (
    <IconButton label={syncing ? "Syncing" : "Sync now"} onClick={() => (error ? m.go({ name: "sync" }) : m.sync.sync(true))} className="relative">
      <RefreshCw size={19} className={syncing ? "animate-spin" : ""} />
      {error && !syncing && <span className="absolute top-2 right-2 size-2 rounded-full bg-[var(--c-red-text)]" />}
    </IconButton>
  );
}

function Section({ label, onAdd, children }: { label: string; onAdd?: () => void; children: ReactNode }) {
  return (
    <section className="mb-3">
      <div className="flex h-8 items-center px-3">
        <h2 className="flex-1 text-xs font-medium text-faint">{label}</h2>
        {onAdd && (
          <button onClick={onAdd} aria-label={`Add to ${label}`} className="-mr-1.5 grid size-8 place-items-center rounded-full text-faint active:bg-hover">
            <Plus size={17} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function PlainRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-11 w-full items-center gap-2.5 rounded-lg pl-2 text-[15px] text-muted active:bg-hover">
      <span className="grid size-6 place-items-center text-faint">{icon}</span>
      {label}
    </button>
  );
}

function TreeRow({ node, depth, expanded, onToggle }: { node: TreeNode; depth: number; expanded: Set<string>; onToggle: (key: string) => void }) {
  const { openPage } = useVault();
  const open = expanded.has(node.key);
  return (
    <>
      <Row
        note={node.note}
        title={node.title}
        depth={depth}
        tree
        expandable={node.children.length > 0 || !node.note}
        open={open}
        onToggle={() => onToggle(node.key)}
        onOpen={() => (node.note ? openPage(node.note.path) : onToggle(node.key))}
      />
      {open && node.children.map((c) => <TreeRow key={c.key} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} />)}
      {open && !node.children.length && node.note && (
        <div style={{ paddingLeft: 66 + depth * 16 }} className="py-1.5 text-[13px] text-faint">
          {node.note.kind === "database" ? "No rows" : "No pages inside"}
        </div>
      )}
    </>
  );
}

function Row({
  note,
  title,
  depth,
  tree,
  expandable,
  open,
  onToggle,
  onOpen,
}: {
  note: NoteMeta | null;
  title: string;
  depth: number;
  /** In the page tree: room for the expand arrow, so titles line up. */
  tree?: boolean;
  expandable?: boolean;
  open?: boolean;
  onToggle?: () => void;
  onOpen: () => void;
}) {
  const m = useMobile();
  const { tap, ...press } = useLongPress(() => note && m.pageActions(note.path));
  return (
    <div
      {...press}
      className="no-callout flex h-11 items-center rounded-lg active:bg-hover"
      style={{ paddingLeft: (tree ? 0 : 8) + depth * 16 }}
    >
      {tree && (
        <button onClick={onToggle} disabled={!expandable} aria-label={open ? "Collapse" : "Expand"} className="grid h-full w-8 shrink-0 place-items-center text-faint disabled:invisible">
          <ChevronRight size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      )}
      <button onClick={tap(onOpen)} className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left text-[15px] text-ink">
        <span className="grid size-6 shrink-0 place-items-center text-faint">{note ? <NoteIcon icon={note.icon} kind={note.kind} /> : <Folder size={17} />}</span>
        <span className="truncate">{title}</span>
      </button>
      {note && (
        <button onClick={() => m.pageActions(note.path)} aria-label="Page actions" className="grid h-full w-10 shrink-0 place-items-center text-faint">
          <MoreHorizontal size={18} />
        </button>
      )}
    </div>
  );
}
