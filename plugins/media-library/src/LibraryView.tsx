import {
  AudioLines,
  Box,
  ChevronRight,
  Clapperboard,
  Clock,
  CloudOff,
  Copy,
  ExternalLink,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid2x2,
  Hash,
  Image as ImageIcon,
  Layers,
  LayoutList,
  PanelLeftClose,
  PanelLeftOpen,
  Library,
  PenTool,
  RefreshCw,
  Search,
  Settings,
  Star,
  Tag,
  Type,
  Video,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useViewport, visibleRows } from "./virtual";
import { MenuDivider, MenuItem, Popover } from "@betelgeuse/plugin-api/ui";
import type { Asset, AssetKind, LibraryQuery, LibraryResult, MetaPatch } from "@betelgeuse/plugin-api";
import { library, openPage } from "./host";
import { labelColor, tagColor } from "./colors";
import { KIND_LABELS, KIND_ORDER, formatBytes, formatDuration, formatResolution, useLibraryRequest, useStudio } from "./store";
import { productionOf, useProductions, type Production } from "./pipeline";

type List = "recent" | "favorites" | "untagged" | null;
type Sort = NonNullable<LibraryQuery["sort"]>;

export const KIND_ICONS: Record<AssetKind, ReactNode> = {
  video: <Video size={15} />,
  audio: <AudioLines size={15} />,
  image: <ImageIcon size={15} />,
  raw: <ImageIcon size={15} />,
  design: <PenTool size={15} />,
  project: <Layers size={15} />,
  font: <Type size={15} />,
  document: <FileText size={15} />,
  other: <File size={15} />,
};

/** Formats the webview can show or play straight from disk. */
const PLAYABLE = new Set(["mp4", "mov", "m4v", "webm", "mp3", "m4a", "aac", "wav", "flac", "ogg", "opus"]);
const VIEWABLE = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "heic"]);

const store = {
  get: (k: string) => localStorage.getItem(`library:${k}`),
  set: (k: string, v: string) => localStorage.setItem(`library:${k}`, v),
};

/** The Library: every file in the library folders, searchable, with previews. */
export function LibraryView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { status, progress, version } = useStudio();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<AssetKind | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [list, setList] = useState<List>(null);
  const [sort, setSort] = useState<Sort>((store.get("sort") as Sort) ?? "relevance");
  const [mode, setMode] = useState<"grid" | "list">(store.get("mode") === "list" ? "list" : "grid");
  const [size, setSize] = useState(Number(store.get("size")) || 180);
  // Side panels: widths and whether the left list shows, remembered between sessions.
  const [navWidth, setNavWidth] = useState(Number(store.get("navWidth")) || 224);
  const [inspectorWidth, setInspectorWidth] = useState(Number(store.get("inspectorWidth")) || 320);
  const [navHidden, setNavHidden] = useState(store.get("navHidden") === "1");
  const [result, setResult] = useState<LibraryResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [preview, setPreview] = useState<Asset | null>(null);
  const [menu, setMenu] = useState<{ at: DOMRect; ids: string[] } | null>(null);
  const [folders, setFolders] = useState<[string, number][]>([]);
  const [tags, setTags] = useState<[string, number][]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const productions = useProductions();
  const [subfolders, setSubfolders] = useState<string[]>([]);

  // "Show in Library" from a production page.
  const request = useLibraryRequest();
  useEffect(() => {
    if (!request) return;
    setFolder(request.folder);
    setText("");
    setKind(null);
    setTag(null);
    setList(null);
  }, [request]);

  useEffect(() => {
    if (!folder) return setSubfolders([]);
    let live = true;
    library().subfolders(folder).then((s) => live && setSubfolders(s)).catch(() => live && setSubfolders([]));
    return () => {
      live = false;
    };
  }, [folder, version]);

  useEffect(() => store.set("sort", sort), [sort]);
  useEffect(() => store.set("mode", mode), [mode]);
  useEffect(() => store.set("size", String(size)), [size]);
  useEffect(() => store.set("navWidth", String(navWidth)), [navWidth]);
  useEffect(() => store.set("inspectorWidth", String(inspectorWidth)), [inspectorWidth]);
  useEffect(() => store.set("navHidden", navHidden ? "1" : "0"), [navHidden]);

  const query = useMemo<LibraryQuery>(
    () => ({ text, kinds: kind ? [kind] : [], folder, tags: tag ? [tag] : [], list, sort, desc: sort !== "name", limit: 3000 }),
    [text, kind, folder, tag, list, sort],
  );
  const runSearch = useCallback(() => library().search(query).then(setResult).catch(() => {}), [query]);

  useEffect(() => {
    const t = window.setTimeout(runSearch, text ? 120 : 0);
    return () => window.clearTimeout(t);
  }, [runSearch, text, version]);
  useEffect(() => {
    library().folders().then(setFolders).catch(() => {});
    library().tags().then(setTags).catch(() => {});
  }, [version]);

  const hits = result?.hits ?? [];
  const byId = useMemo(() => new Map(hits.map((h) => [h.id, h])), [hits]);
  const focused = focus ? byId.get(focus) ?? null : null;
  const chosen = [...selected].map((id) => byId.get(id)).filter((a): a is Asset => !!a);

  const closeDetails = () => (setSelected(new Set()), setFocus(null));

  const refreshMeta = async (ids: string[], patch: MetaPatch) => {
    await library().setMeta(ids, patch);
    await runSearch();
    library().tags().then(setTags);
  };

  const select = (a: Asset, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(a.id)) n.delete(a.id);
        else n.add(a.id);
        return n;
      });
    } else if (e.shiftKey && focus) {
      const ids = hits.map((h) => h.id);
      const [i, j] = [ids.indexOf(focus), ids.indexOf(a.id)].sort((x, y) => x - y);
      setSelected(new Set(ids.slice(i, j + 1)));
    } else {
      setSelected(new Set([a.id]));
    }
    setFocus(a.id);
  };

  // The results scroll on their own, rendering only the rows on screen.
  const { el: scroller, ref: scrollerRef, view } = useViewport();
  const cols = gridColumns(view.width - 32, size);

  // One stable handler for every tile and row, so they don't re-render when the view does.
  const actions = useRef({ select, open: (a: Asset) => library().open(a.id), menu: (_a: Asset, _at: DOMRect) => {} });
  actions.current = {
    select,
    open: (a) => library().open(a.id),
    menu: (a, at) => {
      const ids = selected.has(a.id) ? [...selected] : [a.id];
      if (!selected.has(a.id)) (setSelected(new Set([a.id])), setFocus(a.id));
      setMenu({ at, ids });
    },
  };
  const onAction = useCallback<Action>((kind, a, e) => {
    if (kind === "click") actions.current.select(a, e as React.MouseEvent);
    else if (kind === "open") actions.current.open(a);
    else actions.current.menu(a, e as DOMRect);
  }, []);

  /** Scrolls so result `i` is on screen (the rows off screen aren't in the page to scroll to). */
  const reveal = (i: number) => {
    const el = scroller;
    if (!el) return;
    const [top, height] = mode === "grid" ? [Math.floor(i / cols) * gridStride(view.width - 32, size), gridTileHeight(view.width - 32, size)] : [LIST_HEAD + i * LIST_ROW, LIST_ROW];
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + height > el.scrollTop + el.clientHeight) el.scrollTop = top + height - el.clientHeight + 8;
  };


  // Keyboard: ⌘F focuses search; arrows move; Enter opens; Space previews; Escape clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable=true]");
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (typing || menu) return;
      if (preview && (e.key === " " || e.key === "Escape")) {
        e.preventDefault();
        setPreview(null);
        return;
      }
      if (!focused) return;
      const i = hits.findIndex((h) => h.id === focused.id);
      const perRow = mode === "grid" ? cols : 1;
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: perRow, ArrowUp: -perRow }[e.key];
      if (move) {
        e.preventDefault();
        const next = hits[Math.min(hits.length - 1, Math.max(0, i + move))];
        if (next) {
          setFocus(next.id);
          setSelected(new Set([next.id]));
          if (preview) setPreview(next);
          reveal(hits.indexOf(next));
        }
      } else if (e.key === " ") {
        e.preventDefault();
        setPreview(focused);
      } else if (e.key === "Enter") {
        library().open(focused.id);
      } else if (e.key === "Escape") {
        setSelected(new Set());
        setFocus(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, hits, mode, size, preview, menu, cols, view.width]);

  if (!status) return <div className="flex-1" />;
  if (!status.roots.length) {
    return (
      <Empty icon={<FolderPlus size={28} />} title="Add your first library folder">
        Point the Library at the folders where your media already lives, like your footage drive or ~/Studio. Files stay where they are;
        Betelgeuse only reads them.
        <button onClick={addFolder} className="mt-4 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white">
          Add folder…
        </button>
      </Empty>
    );
  }

  const busy = progress.phase !== "idle";
  const allCount = Object.values(result?.kinds ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="flex min-w-0 flex-1">
      {/* Left: smart lists, kinds, folders, tags. Resizable, and can be hidden. */}
      {!navHidden && (
      <div style={{ width: navWidth }} className="relative shrink-0 border-r border-line">
        <Resizer side="right" width={navWidth} min={170} max={420} onResize={setNavWidth} />
      <aside className="flex h-full flex-col overflow-y-auto px-2 pt-12 pb-4 text-sm">
        <Nav icon={<Library size={15} />} label="All files" count={!kind ? allCount : undefined} active={!list && !kind && !folder && !tag} onClick={() => (setList(null), setKind(null), setFolder(null), setTag(null))} />
        <Nav icon={<Clock size={15} />} label="Last 7 days" active={list === "recent"} onClick={() => setList(list === "recent" ? null : "recent")} />
        <Nav icon={<Star size={15} />} label="Favourites" hint="★4+" active={list === "favorites"} onClick={() => setList(list === "favorites" ? null : "favorites")} />
        <Nav icon={<Tag size={15} />} label="Untagged" active={list === "untagged"} onClick={() => setList(list === "untagged" ? null : "untagged")} />

        <Heading>Kinds</Heading>
        {KIND_ORDER.filter((k) => result?.kinds[k]).map((k) => (
          <Nav key={k} icon={KIND_ICONS[k]} label={KIND_LABELS[k]} count={result?.kinds[k]} active={kind === k} onClick={() => setKind(kind === k ? null : k)} />
        ))}

        {productions.some((p) => p.folder) && (
          <>
            <Heading>Productions</Heading>
            <ProductionList productions={productions.filter((p) => p.folder)} active={folder} onPick={(f) => setFolder(folder === f ? null : f)} />
          </>
        )}

        <Heading>Folders</Heading>
        <FolderTree folders={folders} roots={status.roots.map((r) => r.name)} active={folder} onPick={(f) => setFolder(folder === f ? null : f)} />

        {tags.length > 0 && (
          <>
            <Heading>Tags</Heading>
            {tags.map(([t, n]) => (
              <Nav key={t} icon={<Hash size={14} />} label={t} count={n} active={tag === t} onClick={() => setTag(tag === t ? null : t)} />
            ))}
          </>
        )}
      </aside>
      </div>
      )}

      {/* Middle: search and results. */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 px-3 text-sm">
          <IconBtn title={navHidden ? "Show the side list" : "Hide the side list"} onClick={() => setNavHidden((v) => !v)}>
            {navHidden ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </IconBtn>
          <span className="font-medium">Library</span>
          <span data-tauri-drag-region className="flex-1" />
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-faint">
              <RefreshCw size={12} className="animate-spin" />
              {progress.phase === "probing" ? `Reading details ${progress.done ?? 0}/${progress.total ?? 0}` : "Scanning…"}
            </span>
          )}
          <IconBtn title="Rescan folders" onClick={() => library().rescan()}>
            <RefreshCw size={15} />
          </IconBtn>
          <IconBtn title="Library settings" onClick={onOpenSettings}>
            <Settings size={15} />
          </IconBtn>
        </header>

        <div className="flex shrink-0 items-center gap-2 px-4 pb-3">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-[var(--search-bg)] px-3 focus-within:border-[var(--line-strong)]">
            <Search size={15} className="shrink-0 text-faint" />
            <input
              ref={searchRef}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setText(""), e.currentTarget.blur())}
              placeholder="Search files, folders and tags   (try: goa kind:video duration:>30 #broll)"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            {text && (
              <button onClick={() => setText("")} className="text-faint hover:text-ink">
                <X size={14} />
              </button>
            )}
          </label>
        </div>

        {folder && (
          <div className="shrink-0 px-4 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]">
              {folder.split("/").map((seg, i, all) => {
                const id = all.slice(0, i + 1).join("/");
                const last = i === all.length - 1;
                return (
                  <span key={id} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRight size={12} className="text-faint" />}
                    <button onClick={() => setFolder(id)} className={`rounded px-1 py-0.5 hover:bg-hover ${last ? "font-medium text-ink" : "text-muted"}`}>
                      {seg}
                    </button>
                  </span>
                );
              })}
              <button onClick={() => library().open(folder)} title="Open in Finder" className="ml-1 grid size-6 place-items-center rounded text-faint hover:bg-hover hover:text-ink">
                <FolderOpen size={13} />
              </button>
              <button onClick={() => setFolder(null)} title="All folders" className="grid size-6 place-items-center rounded text-faint hover:bg-hover hover:text-ink">
                <X size={13} />
              </button>
              {productionOf(`${folder}/x`, productions)?.folder === folder && <ProductionLink production={productionOf(`${folder}/x`, productions)!} />}
            </div>
            {subfolders.length > 0 && !text && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {subfolders.map((sf) => (
                  <button
                    key={sf}
                    onClick={() => setFolder(`${folder}/${sf}`)}
                    onDoubleClick={() => library().open(`${folder}/${sf}`)}
                    className="flex h-7 max-w-64 items-center gap-1.5 rounded-md border border-line px-2 text-xs text-muted hover:bg-hover hover:text-ink"
                  >
                    <Folder size={13} className="shrink-0 text-faint" />
                    <span className="truncate">{sf}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-xs text-faint">
          {kind && <Chip label={KIND_LABELS[kind]} onClear={() => setKind(null)} />}
          {tag && <Chip label={`#${tag}`} onClear={() => setTag(null)} />}
          <span>
            {result ? `${result.total.toLocaleString()} ${result.total === 1 ? "file" : "files"}` : ""}
            {result && result.total > hits.length ? ` · showing the first ${hits.length}` : ""}
          </span>
          <span className="flex-1" />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="cursor-pointer rounded-md bg-transparent px-1 py-0.5 text-xs text-muted hover:bg-hover">
            <option value="relevance">Relevance</option>
            <option value="modified">Date modified</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="duration">Length</option>
          </select>
          {mode === "grid" && (
            <input type="range" min={120} max={320} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 cursor-pointer accent-[var(--accent)]" title="Thumbnail size" />
          )}
          <div className="flex rounded-md border border-line">
            <button title="Grid" onClick={() => setMode("grid")} className={`grid size-6 place-items-center ${mode === "grid" ? "bg-hover text-ink" : "text-faint"}`}>
              <Grid2x2 size={13} />
            </button>
            <button title="List" onClick={() => setMode("list")} className={`grid size-6 place-items-center ${mode === "list" ? "bg-hover text-ink" : "text-faint"}`}>
              <LayoutList size={13} />
            </button>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-8"
          onMouseDown={(e) => e.target === e.currentTarget && (setSelected(new Set()), setFocus(null))}
        >
          {result && !hits.length ? (
            <div className="pt-16 text-center text-sm text-faint">{busy && !status.total ? "Scanning your folders…" : "Nothing matches."}</div>
          ) : mode === "grid" ? (
            <Grid hits={hits} selected={selected} size={size} view={view} width={view.width - 32} onAction={onAction} />
          ) : (
            <List hits={hits} selected={selected} view={view} onAction={onAction} />
          )}
        </div>
      </section>

      {/* Right: the inspector, while something is selected. */}
      {(chosen.length > 1 || focused) && (
        <div style={{ width: inspectorWidth }} className="relative shrink-0 border-l border-line">
          <Resizer side="left" width={inspectorWidth} min={260} max={640} onResize={setInspectorWidth} />
        <aside className="h-full overflow-y-auto">
          <button
            onClick={closeDetails}
            title="Close (Esc)"
            className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-md bg-black/40 text-white/90 hover:bg-black/60"
          >
            <X size={15} />
          </button>
          {chosen.length > 1 ? (
            <Bulk assets={chosen} onMeta={(patch) => refreshMeta(chosen.map((a) => a.id), patch)} />
          ) : (
            focused && (
              <Inspector key={focused.id} asset={focused} production={productionOf(focused.id, productions)} onMeta={(patch) => refreshMeta([focused.id], patch)} onTag={(t) => setTag(t)} onPreview={() => setPreview(focused)} />
            )
          )}
        </aside>
        </div>
      )}

      {menu && (
        <AssetMenu
          at={menu.at}
          assets={menu.ids.map((id) => byId.get(id)).filter((a): a is Asset => !!a)}
          onClose={() => setMenu(null)}
          onPreview={(a) => setPreview(a)}
          onMeta={(patch) => refreshMeta(menu.ids, patch)}
        />
      )}
      {preview && <PreviewOverlay asset={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

async function addFolder() {
  await library()
    .addFolder()
    .catch((e) => alert(String(e)));
}

// ---------------------------------------------------------------------------------------------

function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div data-tauri-drag-region className="grid flex-1 place-items-center px-8">
      <div className="flex max-w-sm flex-col items-center text-center">
        <span className="mb-3 text-faint">{icon}</span>
        <div className="mb-1.5 text-base font-medium">{title}</div>
        <div className="flex flex-col items-center text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}

const Heading = ({ children }: { children: ReactNode }) => <div className="mt-4 mb-1 px-2 text-[11px] font-medium text-faint">{children}</div>;

function Nav({ icon, label, count, hint, active, onClick }: { icon: ReactNode; label: string; count?: number; hint?: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex h-[30px] w-full shrink-0 items-center gap-2 rounded-md px-2 text-left ${active ? "bg-hover font-medium text-ink" : "text-muted hover:bg-hover"}`}>
      <span className={active ? "text-[var(--accent)]" : "text-faint"}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
      {count != null && <span className="text-xs text-faint tabular-nums">{count.toLocaleString()}</span>}
    </button>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink">
      {children}
    </button>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="flex max-w-60 items-center gap-1 rounded-md bg-hover py-0.5 pr-1 pl-2 text-xs text-ink">
      <span className="truncate">{label}</span>
      <button onClick={onClear} className="text-faint hover:text-ink">
        <X size={12} />
      </button>
    </span>
  );
}

/** Folder tree from the asset ids' directories; children open on the arrow. */
function FolderTree({ folders, roots, active, onPick }: { folders: [string, number][]; roots: string[]; active: string | null; onPick: (f: string) => void }) {
  const counts = useMemo(() => new Map(folders), [folders]);
  const children = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [f] of folders) {
      const i = f.lastIndexOf("/");
      if (i < 0) continue;
      const parent = f.slice(0, i);
      m.set(parent, [...(m.get(parent) ?? []), f]);
    }
    return m;
  }, [folders]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const row = (f: string, depth: number): ReactNode => {
    const kids = children.get(f) ?? [];
    const isOpen = open.has(f);
    return (
      <div key={f}>
        <div
          className={`flex h-[28px] items-center gap-1 rounded-md pr-2 ${active === f ? "bg-hover font-medium text-ink" : "text-muted hover:bg-hover"}`}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          <button
            onClick={() => setOpen((s) => (s.has(f) ? (s.delete(f), new Set(s)) : new Set(s.add(f))))}
            className={`grid size-4 shrink-0 place-items-center text-faint ${kids.length ? "" : "invisible"}`}
          >
            <ChevronRight size={12} className={isOpen ? "rotate-90" : ""} />
          </button>
          <button onClick={() => onPick(f)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {active === f ? <FolderOpen size={14} className="shrink-0 text-[var(--accent)]" /> : <Folder size={14} className="shrink-0 text-faint" />}
            <span className="min-w-0 flex-1 truncate">{f.slice(f.lastIndexOf("/") + 1)}</span>
            <span className="text-[11px] text-faint tabular-nums">{counts.get(f)?.toLocaleString()}</span>
          </button>
        </div>
        {isOpen && kids.map((k) => row(k, depth + 1))}
      </div>
    );
  };
  return <>{roots.filter((r) => counts.has(r)).map((r) => row(r, 0))}</>;
}

// ---------------------------------------------------------------------------------------------
// Results

function useThumb(asset: Asset, visible = true) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    library().thumbnail(asset).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [asset.id, asset.modified, visible]);
  return url;
}

export function Thumb({ asset, visible = true, className = "" }: { asset: Asset; visible?: boolean; className?: string }) {
  const url = useThumb(asset, visible);
  if (url) return <img src={url} alt="" draggable={false} decoding="async" className={`h-full w-full object-contain ${className}`} />;
  return (
    <div className="grid h-full w-full place-items-center text-faint">
      <div className="flex flex-col items-center gap-1.5">
        <span className="scale-150 opacity-70">{KIND_ICONS[asset.kind]}</span>
        <span className="mt-1 text-[10px] font-semibold tracking-wide uppercase">{asset.ext || "file"}</span>
      </div>
    </div>
  );
}

type Action = (kind: "click" | "open" | "menu", asset: Asset, e: React.MouseEvent | DOMRect) => void;

// Grid geometry, fixed so rows can be placed without measuring: a tile is its padding (12), the
// 16:9 thumbnail, and two text lines (6 + 20 + 16); rows are 12 apart.
const GAP = 12;
const gridColumns = (width: number, size: number) => Math.max(1, Math.floor((width + GAP) / (size + GAP)));
function gridTileHeight(width: number, size: number) {
  const cols = gridColumns(width, size);
  const tile = (width - GAP * (cols - 1)) / cols;
  return Math.round(12 + ((tile - 12) * 9) / 16 + 42);
}
const gridStride = (width: number, size: number) => gridTileHeight(width, size) + GAP;

function Grid({ hits, selected, size, view, width, onAction }: { hits: Asset[]; selected: Set<string>; size: number; view: { top: number; height: number }; width: number; onAction: Action }) {
  const cols = gridColumns(width, size);
  const tile = gridTileHeight(width, size);
  const stride = tile + GAP;
  const rows = Math.ceil(hits.length / cols);
  const { first, last } = visibleRows(view, 0, stride, rows);
  return (
    <div className="relative" style={{ height: Math.max(0, rows * stride - GAP) }}>
      <div
        className="absolute inset-x-0 grid"
        style={{ top: first * stride, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: `${tile}px`, gap: GAP }}
      >
        {hits.slice(first * cols, last * cols).map((a) => (
          <Tile key={a.id} asset={a} selected={selected.has(a.id)} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

const Tile = memo(function Tile({ asset, selected, onAction }: { asset: Asset; selected: boolean; onAction: Action }) {
  // Resting the pointer on a video plays it, muted, in the tile.
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const canPlay = asset.kind === "video" && PLAYABLE.has(asset.ext) && !asset.offline;
  const badge = asset.duration ? formatDuration(asset.duration) : asset.kind !== "image" ? asset.ext.toUpperCase() : "";
  return (
    <button
      data-asset={asset.id}
      onClick={(e) => onAction("click", asset, e)}
      onDoubleClick={(e) => onAction("open", asset, e)}
      onContextMenu={(e) => (e.preventDefault(), onAction("menu", asset, new DOMRect(e.clientX, e.clientY, 0, 0)))}
      onMouseEnter={() => canPlay && (timer.current = window.setTimeout(() => setPlaying(true), 450))}
      onMouseLeave={() => (window.clearTimeout(timer.current), setPlaying(false))}
      className={`group flex min-w-0 flex-col overflow-hidden rounded-lg p-1.5 text-left ${selected ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] ring-1 ring-[var(--accent)]" : "hover:bg-hover"}`}
    >
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-md bg-side">
        <Thumb asset={asset} />
        {playing && <video src={library().fileUrl(asset)} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full bg-black object-contain" />}
        {asset.offline && (
          <span title="Drive not connected" className="absolute top-1 right-1 grid size-5 place-items-center rounded bg-black/60 text-white">
            <CloudOff size={11} />
          </span>
        )}
        {badge && <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white tabular-nums">{badge}</span>}
        {asset.rating > 0 && (
          <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-black/60 px-1 text-[10px] text-amber-300">
            <Star size={9} fill="currentColor" />
            {asset.rating}
          </span>
        )}
      </div>
      <div className="mt-1.5 h-5 shrink-0 truncate px-0.5 text-[13px] leading-5 text-ink" title={asset.name}>
        {asset.name}
      </div>
      <div className="h-4 shrink-0 truncate px-0.5 text-[11px] leading-4 text-faint">{[formatResolution(asset.width, asset.height), formatBytes(asset.size)].filter(Boolean).join(" · ")}</div>
    </button>
  );
});

// List geometry: a 32px header, then 36px rows.
const LIST_HEAD = 32;
const LIST_ROW = 36;
const LIST_COLUMNS = "minmax(0, 46fr) minmax(0, 11fr) minmax(0, 9fr) minmax(0, 9fr) minmax(0, 11fr) minmax(0, 14fr)";

function List({ hits, selected, view, onAction }: { hits: Asset[]; selected: Set<string>; view: { top: number; height: number }; onAction: Action }) {
  const { first, last } = visibleRows(view, LIST_HEAD, LIST_ROW, hits.length, 8);
  return (
    <div className="text-[13px]">
      <div className="sticky top-0 z-10 grid h-8 items-center border-b border-line bg-surface text-xs text-faint" style={{ gridTemplateColumns: LIST_COLUMNS }}>
        <span>Name</span>
        <span>Kind</span>
        <span>Length</span>
        <span>Size</span>
        <span>Resolution</span>
        <span>Modified</span>
      </div>
      <div className="relative" style={{ height: hits.length * LIST_ROW }}>
        <div className="absolute inset-x-0" style={{ top: first * LIST_ROW }}>
          {hits.slice(first, last).map((a) => (
            <ListRow key={a.id} asset={a} selected={selected.has(a.id)} onAction={onAction} />
          ))}
        </div>
      </div>
    </div>
  );
}

const ListRow = memo(function ListRow({ asset: a, selected, onAction }: { asset: Asset; selected: boolean; onAction: Action }) {
  return (
    <div
      data-asset={a.id}
      onClick={(e) => onAction("click", a, e)}
      onDoubleClick={(e) => onAction("open", a, e)}
      onContextMenu={(e) => (e.preventDefault(), onAction("menu", a, new DOMRect(e.clientX, e.clientY, 0, 0)))}
      style={{ gridTemplateColumns: LIST_COLUMNS, height: LIST_ROW }}
      className={`box-border grid cursor-default items-center border-b border-line/50 ${selected ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]" : "hover:bg-hover"}`}
    >
      <div className="flex min-w-0 items-center gap-2 pr-3">
        <span className="h-6 w-10 shrink-0 overflow-hidden rounded bg-side">
          <Thumb asset={a} />
        </span>
        <span className="truncate" title={a.id}>
          {a.name}
        </span>
        {a.tags.slice(0, 2).map((t) => (
          <TagPill key={t} tag={t} />
        ))}
      </div>
      <span className="truncate text-muted">{KIND_LABELS[a.kind]}</span>
      <span className="text-muted tabular-nums">{formatDuration(a.duration)}</span>
      <span className="text-muted tabular-nums">{formatBytes(a.size)}</span>
      <span className="truncate text-muted">{formatResolution(a.width, a.height)}</span>
      <span className="truncate text-muted">{new Date(a.modified).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
    </div>
  );
});

const TagPill = ({ tag, onRemove, onClick }: { tag: string; onRemove?: () => void; onClick?: () => void }) => (
  <span className="flex shrink-0 items-center gap-0.5 rounded px-1.5 text-xs leading-5 text-ink" style={{ background: tagColor(labelColor(tag)) }}>
    <button onClick={onClick} disabled={!onClick} className="enabled:hover:underline">
      {tag}
    </button>
    {onRemove && (
      <button onClick={onRemove} className="text-faint hover:text-ink">
        <X size={11} />
      </button>
    )}
  </span>
);

// ---------------------------------------------------------------------------------------------
// Inspector

function Preview({ asset, large }: { asset: Asset; large?: boolean }) {
  const src = library().fileUrl(asset);
  if (asset.kind === "video" && PLAYABLE.has(asset.ext)) {
    return <video key={src} src={src} controls autoPlay={large} className="h-full w-full bg-black object-contain" />;
  }
  if (asset.kind === "audio" && PLAYABLE.has(asset.ext)) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-4">
        <AudioLines size={large ? 64 : 36} className="text-faint" />
        <audio key={src} src={src} controls autoPlay={large} className="w-full" />
      </div>
    );
  }
  if (asset.kind === "image" && VIEWABLE.has(asset.ext)) {
    return <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />;
  }
  return <Thumb asset={asset} />;
}

function Inspector({ asset: a, production, onMeta, onTag, onPreview }: { asset: Asset; production: Production | null; onMeta: (patch: MetaPatch) => void; onTag: (t: string) => void; onPreview: () => void }) {
  const [notes, setNotes] = useState(a.notes);
  const [tagInput, setTagInput] = useState("");
  const details: [string, string][] = [
    ["Kind", `${KIND_LABELS[a.kind]} · ${a.ext.toUpperCase()}`],
    ["Length", formatDuration(a.duration)],
    ["Resolution", a.width && a.height ? `${a.width}×${a.height}` : ""],
    ["Frame rate", a.fps ? `${a.fps} fps` : ""],
    ["Codec", a.codec ?? ""],
    ["Size", formatBytes(a.size)],
    ["Modified", new Date(a.modified).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })],
    ["Created", a.created ? new Date(a.created).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""],
  ];
  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "");
    if (t) onMeta({ addTags: [t] });
    setTagInput("");
  };
  return (
    <div className="flex flex-col pb-6">
      <div className="relative aspect-video w-full shrink-0 bg-side" onDoubleClick={onPreview}>
        <Preview asset={a} />
      </div>
      <div className="px-4 pt-3">
        <div className="text-[15px] font-medium break-words text-ink">{a.name}</div>
        <div className="mt-0.5 text-xs break-all text-faint">{a.id.slice(0, a.id.lastIndexOf("/"))}</div>
        {a.offline && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-hover px-2 py-1.5 text-xs text-muted">
            <CloudOff size={13} /> Its drive isn't connected, so it can't be opened right now.
          </div>
        )}
        {production && (
          <div className="mt-2">
            <ProductionLink production={production} />
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Action icon={<ExternalLink size={13} />} label="Open" onClick={() => library().open(a.id)} />
          <Action icon={<FolderOpen size={13} />} label="Reveal" onClick={() => library().reveal(a.id)} />
          <Action icon={<Copy size={13} />} label="Copy path" onClick={() => navigator.clipboard.writeText(a.path)} />
        </div>

        <div className="mt-4 mb-1 text-[11px] font-medium text-faint">Rating</div>
        <Stars value={a.rating} onChange={(rating) => onMeta({ rating })} />

        <div className="mt-4 mb-1 text-[11px] font-medium text-faint">Tags</div>
        <div className="flex flex-wrap items-center gap-1">
          {a.tags.map((t) => (
            <TagPill key={t} tag={t} onClick={() => onTag(t)} onRemove={() => onMeta({ removeTags: [t] })} />
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") (e.preventDefault(), addTag());
              if (e.key === "Backspace" && !tagInput && a.tags.length) onMeta({ removeTags: [a.tags[a.tags.length - 1]] });
            }}
            onBlur={addTag}
            placeholder={a.tags.length ? "Add" : "Add a tag"}
            className="h-6 min-w-16 flex-1 bg-transparent text-xs outline-none placeholder:text-faint"
          />
        </div>

        <div className="mt-4 mb-1 text-[11px] font-medium text-faint">Notes</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== a.notes && onMeta({ notes })}
          rows={3}
          placeholder="What's in it, where it's from, the licence…"
          className="w-full resize-y rounded-md border border-line bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-faint focus:border-[var(--line-strong)]"
        />

        <div className="mt-4 mb-1 text-[11px] font-medium text-faint">Details</div>
        <dl className="grid grid-cols-[88px_1fr] gap-y-1 text-[13px]">
          {details
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-faint">{k}</dt>
                <dd className="min-w-0 break-words text-muted">{v}</dd>
              </div>
            ))}
        </dl>
      </div>
    </div>
  );
}

function Bulk({ assets, onMeta }: { assets: Asset[]; onMeta: (patch: MetaPatch) => void }) {
  const [tagInput, setTagInput] = useState("");
  const common = assets.reduce<string[]>((acc, a, i) => (i === 0 ? a.tags : acc.filter((t) => a.tags.includes(t))), []);
  const total = assets.reduce((s, a) => s + a.size, 0);
  return (
    <div className="px-4 pt-14">
      <div className="text-[15px] font-medium">{assets.length} files selected</div>
      <div className="text-xs text-faint">{formatBytes(total)}</div>
      <div className="mt-4 mb-1 text-[11px] font-medium text-faint">Rating</div>
      <Stars value={assets.every((a) => a.rating === assets[0].rating) ? assets[0].rating : 0} onChange={(rating) => onMeta({ rating })} />
      <div className="mt-4 mb-1 text-[11px] font-medium text-faint">Tags on all of them</div>
      <div className="flex flex-wrap items-center gap-1">
        {common.map((t) => (
          <TagPill key={t} tag={t} onRemove={() => onMeta({ removeTags: [t] })} />
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tagInput.trim()) {
              onMeta({ addTags: [tagInput.trim().replace(/^#/, "")] });
              setTagInput("");
            }
          }}
          placeholder="Add a tag to all"
          className="h-6 min-w-24 flex-1 bg-transparent text-xs outline-none placeholder:text-faint"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Action icon={<FolderOpen size={13} />} label="Reveal" onClick={() => assets.slice(0, 10).forEach((a) => library().reveal(a.id))} />
        <Action icon={<Copy size={13} />} label="Copy paths" onClick={() => navigator.clipboard.writeText(assets.map((a) => a.path).join("\n"))} />
      </div>
    </div>
  );
}

function Action({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-xs text-muted hover:bg-hover hover:text-ink">
      {icon}
      {label}
    </button>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n === value ? 0 : n)}
          title={n === value ? "Clear rating" : `${n} star${n > 1 ? "s" : ""}`}
          className={(hover || value) >= n ? "text-amber-400" : "text-faint"}
        >
          <Star size={16} fill={(hover || value) >= n ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

function AssetMenu({ at, assets, onClose, onPreview, onMeta }: { at: DOMRect; assets: Asset[]; onClose: () => void; onPreview: (a: Asset) => void; onMeta: (patch: MetaPatch) => void }) {
  const one = assets.length === 1 ? assets[0] : null;
  const run = (f: () => void) => () => (f(), onClose());
  return (
    <Popover anchor={at} onClose={onClose} className="w-56 p-1">
      {one && <MenuItem icon={<ExternalLink size={15} />} label="Open" hint="↵" onClick={run(() => library().open(one.id))} />}
      {one && <MenuItem icon={<Box size={15} />} label="Preview" hint="Space" onClick={run(() => onPreview(one))} />}
      <MenuItem icon={<FolderOpen size={15} />} label="Reveal in Finder" onClick={run(() => assets.slice(0, 10).forEach((a) => library().reveal(a.id)))} />
      <MenuItem icon={<Copy size={15} />} label={one ? "Copy path" : `Copy ${assets.length} paths`} onClick={run(() => navigator.clipboard.writeText(assets.map((a) => a.path).join("\n")))} />
      <MenuDivider />
      {[5, 4, 3, 0].map((n) => (
        <MenuItem key={n} icon={<Star size={15} />} label={n ? "★".repeat(n) : "Clear rating"} onClick={run(() => onMeta({ rating: n }))} />
      ))}
    </Popover>
  );
}

export function PreviewOverlay({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-11 shrink-0 items-center gap-3 px-4 text-sm text-white/80">
        <span className="min-w-0 flex-1 truncate">{asset.name}</span>
        <button onClick={() => library().open(asset.id)} className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-white/10">
          <ExternalLink size={14} /> Open
        </button>
        <button onClick={onClose} className="grid size-7 place-items-center rounded-md hover:bg-white/10" title="Close (Space)">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <Preview asset={asset} large />
      </div>
    </div>,
    document.body,
  );
}

/** Productions with a project folder, for the Library's sidebar. */
function ProductionList({ productions, active, onPick }: { productions: Production[]; active: string | null; onPick: (folder: string) => void }) {
  const [all, setAll] = useState(false);
  const sorted = [...productions].sort((a, b) => a.title.localeCompare(b.title));
  const shown = all ? sorted : sorted.slice(0, 8);
  return (
    <>
      {shown.map((p) => (
        <Nav key={p.path} icon={<Clapperboard size={14} />} label={p.title} active={!!active && active === p.folder} onClick={() => onPick(p.folder!)} />
      ))}
      {sorted.length > 8 && (
        <button onClick={() => setAll((v) => !v)} className="h-7 px-2 text-left text-xs text-faint hover:text-ink">
          {all ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      )}
    </>
  );
}

function ProductionLink({ production }: { production: Production }) {
  return (
    <button
      onClick={() => openPage(production.path)}
      title="Open the production's page"
      className="flex max-w-full items-center gap-1.5 rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs text-ink hover:opacity-90"
    >
      <Clapperboard size={12} className="shrink-0 text-[var(--accent)]" />
      <span className="truncate">{production.title}</span>
      {production.status && <span className="shrink-0 text-faint">· {production.status}</span>}
    </button>
  );
}

/**
 * A drag handle on a panel's edge. `side` is the edge it sits on: "right" grows the panel as the
 * pointer moves right (a left panel), "left" as it moves left (a right panel).
 */
function Resizer({ side, width, min, max, onResize }: { side: "left" | "right"; width: number; min: number; max: number; onResize: (w: number) => void }) {
  const start = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const move = (ev: MouseEvent) => {
      const d = side === "right" ? ev.clientX - x0 : x0 - ev.clientX;
      onResize(Math.round(Math.min(max, Math.max(min, width + d))));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div
      onMouseDown={start}
      onDoubleClick={() => onResize(side === "right" ? 224 : 320)}
      title="Drag to resize; double-click to reset"
      className="absolute inset-y-0 z-20 w-1.5 cursor-col-resize transition-colors hover:bg-[var(--accent)]/40"
      style={{ [side]: -3 }}
    />
  );
}
