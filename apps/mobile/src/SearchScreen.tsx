import { ChevronLeft, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type NoteMeta, type SearchHit } from "@desktop/lib/api";
import { useVault } from "@desktop/lib/vault";
import { parentOf, titleOf, useMobile } from "./mobile";
import { NoteIcon } from "./PageSheets";

/** Finds pages by title and by what's in them; with nothing typed, lists recent pages. */
export function SearchScreen() {
  const { notes, openPage } = useVault();
  const m = useMobile();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return setHits(null);
    const timer = window.setTimeout(() => api.search(q).then(setHits).catch(() => setHits([])), 120);
    return () => window.clearTimeout(timer);
  }, [q]);

  const byPath = useMemo(() => new Map(notes.map((n) => [n.path, n])), [notes]);
  const recents = m.recents.map((p) => byPath.get(p)).filter((n): n is NoteMeta => !!n);
  const exact = !!q && notes.some((n) => n.title.toLowerCase() === q.toLowerCase());

  return (
    <div className="screen-in safe-top flex h-full flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-1 pr-3 pl-1.5">
        <button onClick={m.back} aria-label="Back" className="grid size-10 shrink-0 place-items-center rounded-full text-muted active:bg-hover">
          <ChevronLeft size={26} />
        </button>
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-hover px-3">
          <Search size={17} className="shrink-0 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && hits?.[0] && openPage(hits[0].path)}
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

      <main className="safe-bottom min-h-0 flex-1 overflow-y-auto px-2 pb-10">
        {hits ? (
          <>
            <div className="px-3 pt-2 pb-1 text-xs font-medium text-faint">{hits.length ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : "No pages found"}</div>
            {hits.map((h) => (
              <button key={h.path} onClick={() => openPage(h.path)} className="block w-full rounded-lg px-3 py-2.5 text-left active:bg-hover">
                <span className="flex items-center gap-2.5 text-[15px]">
                  <span className="grid size-6 shrink-0 place-items-center text-faint">
                    <NoteIcon icon={h.icon} kind={byPath.get(h.path)?.kind} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{h.title}</span>
                  {h.path.includes("/") && <span className="max-w-[35%] shrink-0 truncate text-xs text-faint">{byPath.get(parentOf(h.path)!)?.title ?? titleOf(parentOf(h.path)!)}</span>}
                </span>
                {h.snippet && <span className="mt-0.5 line-clamp-2 block pl-[34px] text-[13px] text-muted">{h.snippet}</span>}
              </button>
            ))}
            {!exact && (
              <button onClick={() => m.newPage(q)} className="flex h-12 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[15px] text-muted active:bg-hover">
                <span className="grid size-6 place-items-center text-faint">
                  <Plus size={18} />
                </span>
                <span className="truncate">
                  New page “<span className="text-ink">{q}</span>”
                </span>
              </button>
            )}
          </>
        ) : (
          recents.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-xs font-medium text-faint">Recent</div>
              {recents.map((n) => (
                <button key={n.path} onClick={() => openPage(n.path)} className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[15px] active:bg-hover">
                  <span className="grid size-6 shrink-0 place-items-center text-faint">
                    <NoteIcon icon={n.icon} kind={n.kind} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                </button>
              ))}
            </>
          )
        )}
      </main>
    </div>
  );
}
