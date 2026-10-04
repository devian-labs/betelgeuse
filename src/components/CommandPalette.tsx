import { CornerDownLeft, FileText, Plus, Search } from "lucide-react";
import { PageIcon } from "./PageIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type NoteMeta, type SearchHit } from "../lib/api";
import { Modal } from "./Modal";

type Result = { id: string; title: string; icon: string | null; detail?: string; run: () => void };

export function CommandPalette({
  notes,
  onOpen,
  onCreate,
  onClose,
}: {
  notes: NoteMeta[];
  onOpen: (path: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) return setHits([]);
    const t = setTimeout(() => api.search(query).then(setHits).catch(() => setHits([])), 120);
    return () => clearTimeout(t);
  }, [query]);

  const results: Result[] = useMemo(() => {
    const open = (path: string) => () => (onOpen(path), onClose());
    if (!query.trim()) {
      return [...notes]
        .sort((a, b) => b.modified - a.modified)
        .slice(0, 8)
        .map((n) => ({ id: n.path, title: n.title, icon: n.icon, detail: parentOf(n.path), run: open(n.path) }));
    }
    const out: Result[] = hits.map((h) => ({ id: h.path, title: h.title, icon: h.icon, detail: h.snippet, run: open(h.path) }));
    out.push({ id: "__create", title: `New page "${query.trim()}"`, icon: null, run: () => (onCreate(query.trim()), onClose()) });
    return out;
  }, [query, hits, notes, onOpen, onCreate, onClose]);

  useEffect(() => setActive(0), [results]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Modal onClose={onClose} className="max-w-xl">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} className="text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
            if (e.key === "Enter") results[active]?.run();
          }}
          placeholder="Search pages and their contents…"
          className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
        />
      </div>
      <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
        {!query.trim() && <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-faint">Recent</div>}
        {results.map((r, i) => (
          <button
            key={r.id}
            data-index={i}
            onMouseEnter={() => setActive(i)}
            onClick={r.run}
            className={`flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left ${i === active ? "bg-hover" : ""}`}
          >
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-faint">
              {r.id === "__create" ? <Plus size={16} /> : r.icon ? <PageIcon icon={r.icon} size={17} /> : <FileText size={16} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{r.title}</span>
              {r.detail && <span className="line-clamp-2 text-xs text-muted">{r.detail}</span>}
            </span>
            {i === active && <CornerDownLeft size={14} className="mt-1 shrink-0 text-faint" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : undefined);
