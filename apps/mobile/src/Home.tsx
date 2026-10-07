import { ChevronRight, FileText, Plus, Search, Table2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageIcon } from "@desktop/components/PageIcon";
import { api, type NoteMeta, type SearchHit } from "@desktop/lib/api";
import { buildTree, type TreeNode } from "@desktop/lib/tree";
import { useVault } from "@desktop/lib/vault";
import { readRecents } from "./recents";

/** The page list: search, recently opened pages and the whole page tree. */
export function Home({ onNew }: { onNew: () => void }) {
  const { notes, openPage } = useVault();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const tree = useMemo(() => buildTree(notes), [notes]);
  const recents = useMemo(() => readRecents().map((p) => notes.find((n) => n.path === p)).filter((n): n is NoteMeta => !!n).slice(0, 5), [notes]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return setHits(null);
    const timer = window.setTimeout(() => api.search(q).then(setHits).catch(() => setHits([])), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="safe-top flex h-full flex-col">
      <header className="px-4 pt-4 pb-2">
        <h1 className="text-[28px] leading-tight font-bold">Betelgeuse</h1>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-[var(--search-bg)] px-3 ring-1 ring-[var(--line)]">
          <Search size={17} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" className="grid size-6 place-items-center text-faint">
              <X size={16} />
            </button>
          )}
        </label>
      </header>

      <main className="safe-bottom min-h-0 flex-1 overflow-y-auto px-2 pb-28">
        {hits ? (
          <Section label={hits.length ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : "No pages found"}>
            {hits.map((h) => (
              <button key={h.path} onClick={() => openPage(h.path)} className="block w-full rounded-lg px-3 py-2.5 text-left active:bg-hover">
                <span className="flex items-center gap-2 font-medium">
                  {h.icon ? <PageIcon icon={h.icon} size={18} /> : <FileText size={17} className="text-faint" />}
                  <span className="truncate">{h.title}</span>
                </span>
                {h.snippet && <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{h.snippet}</span>}
              </button>
            ))}
          </Section>
        ) : (
          <>
            {recents.length > 0 && (
              <Section label="Recent">
                {recents.map((n) => (
                  <Row key={n.path} note={n} title={n.title} depth={0} onOpen={() => openPage(n.path)} />
                ))}
              </Section>
            )}
            <Section label="Pages">
              {tree.map((node) => (
                <TreeRow key={node.key} node={node} depth={0} />
              ))}
            </Section>
          </>
        )}
      </main>

      <button
        onClick={onNew}
        aria-label="New page"
        className="fixed right-5 grid size-14 place-items-center rounded-full bg-[var(--blue)] text-white shadow-lg active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <Plus size={26} />
      </button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h2 className="px-3 pb-1 text-xs font-medium tracking-wide text-faint uppercase">{label}</h2>
      {children}
    </section>
  );
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const { openPage } = useVault();
  const [open, setOpen] = useState(false);
  // A database's sub-pages are its rows: they show in the database itself, not in the tree.
  const isDb = node.note?.kind === "database";
  const children = isDb ? [] : node.children;
  return (
    <>
      <Row
        note={node.note}
        title={node.title}
        depth={depth}
        expandable={children.length > 0}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onOpen={() => (node.note ? openPage(node.note.path) : setOpen((o) => !o))}
      />
      {open && children.map((c) => <TreeRow key={c.key} node={c} depth={depth + 1} />)}
    </>
  );
}

function Row({
  note,
  title,
  depth,
  expandable,
  open,
  onToggle,
  onOpen,
}: {
  note: NoteMeta | null;
  title: string;
  depth: number;
  expandable?: boolean;
  open?: boolean;
  onToggle?: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex h-11 items-center rounded-lg active:bg-hover" style={{ paddingLeft: depth * 18 }}>
      <button
        onClick={onToggle}
        disabled={!expandable}
        aria-label={open ? "Collapse" : "Expand"}
        className="grid h-full w-8 shrink-0 place-items-center text-faint disabled:invisible"
      >
        <ChevronRight size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      <button onClick={onOpen} className="flex h-full min-w-0 flex-1 items-center gap-2.5 pr-3 text-left text-[15px]">
        <span className="grid size-6 shrink-0 place-items-center text-faint">
          {note?.icon ? <PageIcon icon={note.icon} size={19} /> : note?.kind === "database" ? <Table2 size={17} /> : <FileText size={17} />}
        </span>
        <span className="truncate">{title}</span>
      </button>
    </div>
  );
}
