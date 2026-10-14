import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MenuDivider, MenuItem, Popover } from "../components/Popover";
import { api, type Asset, type AssetKind, type LibraryQuery, type LibraryResult } from "../lib/api";
import { labelColor, tagColor } from "../lib/colors";
import {
  KIND_LABELS,
  KIND_ORDER,
  formatBytes,
  formatDuration,
  formatResolution,
  thumbnailUrl,
  useLibraryRequest,
  useStudio,
} from "../lib/studio";
import { productionOf, useProductions, type Production } from "../lib/pipeline";
import { useVault } from "../lib/vault";

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

/** Creator Studio's Library: every file in the library folders, searchable, with previews. */
export function LibraryView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { status, enabled, progress, version } = useStudio();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<AssetKind | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [list, setList] = useState<List>(null);
  const [sort, setSort] = useState<Sort>((store.get("sort") as Sort) ?? "relevance");
  const [mode, setMode] = useState<"grid" | "list">(store.get("mode") === "list" ? "list" : "grid");
  const [size, setSize] = useState(Number(store.get("size")) || 180);
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
    api.librarySubfolders(folder).then((s) => live && setSubfolders(s)).catch(() => live && setSubfolders([]));
    return () => {
      live = false;
    };
  }, [folder, version]);

  useEffect(() => store.set("sort", sort), [sort]);
  useEffect(() => store.set("mode", mode), [mode]);
  useEffect(() => store.set("size", String(size)), [size]);

  const query = useMemo<LibraryQuery>(
    () => ({ text, kinds: kind ? [kind] : [], folder, tags: tag ? [tag] : [], list, sort, desc: sort !== "name" }),
    [text, kind, folder, tag, list, sort],
  );
  const runSearch = useCallback(() => api.librarySearch(query).then(setResult).catch(() => {}), [query]);

  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(runSearch, text ? 120 : 0);
    return () => window.clearTimeout(t);
  }, [enabled, runSearch, text, version]);
  useEffect(() => {
    if (!enabled) return;
    api.libraryFolders().then(setFolders).catch(() => {});
    api.libraryTags().then(setTags).catch(() => {});
  }, [enabled, version]);

  const hits = result?.hits ?? [];
  const byId = useMemo(() => new Map(hits.map((h) => [h.id, h])), [hits]);
  const focused = focus ? byId.get(focus) ?? null : null;
  const chosen = [...selected].map((id) => byId.get(id)).filter((a): a is Asset => !!a);

  const refreshMeta = async (ids: string[], patch: Parameters<typeof api.librarySetMeta>[1]) => {
    await api.librarySetMeta(ids, patch);
    await runSearch();
    api.libraryTags().then(setTags);
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
      const perRow = mode === "grid" ? Math.max(1, Math.floor((document.getElementById("library-grid")?.clientWidth ?? size) / (size + 12))) : 1;
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: perRow, ArrowUp: -perRow }[e.key];
      if (move) {
        e.preventDefault();
        const next = hits[Math.min(hits.length - 1, Math.max(0, i + move))];
        if (next) {
          setFocus(next.id);
          setSelected(new Set([next.id]));
          if (preview) setPreview(next);
          document.querySelector(`[data-asset="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === " ") {
        e.preventDefault();
        setPreview(focused);
      } else if (e.key === "Enter") {
        api.libraryOpen(focused.id);
      } else if (e.key === "Escape") {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, hits, mode, size, preview, menu]);

  if (!status) return <div className="flex-1" />;
  if (!enabled) {
    return (
      <Empty icon={<Library size={28} />} title="Creator Studio is off">
        Turn it on in Settings to search your footage, photos, audio and project files from here.
        <button onClick={onOpenSettings} className="mt-4 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white">
          Open Settings
        </button>
      </Empty>
    );
  }
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
      {/* Left: smart lists, kinds, folders, tags. */}
      <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-line px-2 pt-12 pb-4 text-sm">
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

      {/* Middle: search and results. */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 px-3 text-sm">
          <Library size={16} className="text-muted" />
          <span className="font-medium">Library</span>
          <span data-tauri-drag-region className="flex-1" />
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-faint">
              <RefreshCw size={12} className="animate-spin" />
              {progress.phase === "probing" ? `Reading details ${progress.done ?? 0}/${progress.total ?? 0}` : "Scanning…"}
            </span>
          )}
          <IconBtn title="Rescan folders" onClick={() => api.libraryRescan()}>
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
              <button onClick={() => api.libraryOpen(folder)} title="Open in Finder" className="ml-1 grid size-6 place-items-center rounded text-faint hover:bg-hover hover:text-ink">
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
                    onDoubleClick={() => api.libraryOpen(`${folder}/${sf}`)}
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
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md bg-transparent px-1 py-0.5 text-xs text-muted hover:bg-hover">
            <option value="relevance">Relevance</option>
            <option value="modified">Date modified</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="duration">Length</option>
          </select>
          {mode === "grid" && (
            <input type="range" min={120} max={320} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-[var(--accent)]" title="Thumbnail size" />
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
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-8"
          onMouseDown={(e) => e.target === e.currentTarget && setSelected(new Set())}
        >
          {result && !hits.length ? (
            <div className="pt-16 text-center text-sm text-faint">{busy && !status.total ? "Scanning your folders…" : "Nothing matches."}</div>
          ) : mode === "grid" ? (
            <div id="library-grid" className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
              {hits.map((a) => (
                <Tile
                  key={a.id}
                  asset={a}
                  selected={selected.has(a.id)}
                  onClick={(e) => select(a, e)}
                  onOpen={() => api.libraryOpen(a.id)}
                  onMenu={(at) => {
                    const ids = selected.has(a.id) ? [...selected] : [a.id];
                    if (!selected.has(a.id)) (setSelected(new Set([a.id])), setFocus(a.id));
                    setMenu({ at, ids });
                  }}
                />
              ))}
            </div>
          ) : (
            <Table
              hits={hits}
              selected={selected}
              onClick={select}
              onOpen={(a) => api.libraryOpen(a.id)}
              onMenu={(a, at) => {
                const ids = selected.has(a.id) ? [...selected] : [a.id];
                if (!selected.has(a.id)) (setSelected(new Set([a.id])), setFocus(a.id));
                setMenu({ at, ids });
              }}
            />
          )}
        </div>
      </section>

      {/* Right: the inspector. */}
      <aside className="w-80 shrink-0 overflow-y-auto border-l border-line">
        {chosen.length > 1 ? (
          <Bulk assets={chosen} onMeta={(patch) => refreshMeta(chosen.map((a) => a.id), patch)} />
        ) : focused ? (
          <Inspector key={focused.id} asset={focused} production={productionOf(focused.id, productions)} onMeta={(patch) => refreshMeta([focused.id], patch)} onTag={(t) => setTag(t)} onPreview={() => setPreview(focused)} />
        ) : (
          <div className="px-5 pt-16 text-center text-sm text-faint">Select a file to see its details.</div>
        )}
      </aside>

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
  const dir = await openDialog({ directory: true, title: "Add a library folder" });
  if (typeof dir === "string") await api.libraryAddFolder(dir).catch((e) => alert(String(e)));
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
    thumbnailUrl(asset.id, asset.modified).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [asset.id, asset.modified, visible]);
  return url;
}

/** Becomes true once the element has scrolled near the screen, so thumbnails load as needed. */
function useNearScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near] as const;
}

export function Thumb({ asset, visible = true, className = "" }: { asset: Asset; visible?: boolean; className?: string }) {
  const url = useThumb(asset, visible);
  if (url) return <img src={url} alt="" draggable={false} className={`h-full w-full object-contain ${className}`} />;
  return (
    <div className="grid h-full w-full place-items-center text-faint">
      <div className="flex flex-col items-center gap-1.5">
        <span className="scale-150 opacity-70">{KIND_ICONS[asset.kind]}</span>
        <span className="mt-1 text-[10px] font-semibold tracking-wide uppercase">{asset.ext || "file"}</span>
      </div>
    </div>
  );
}

function Tile({ asset, selected, onClick, onOpen, onMenu }: { asset: Asset; selected: boolean; onClick: (e: React.MouseEvent) => void; onOpen: () => void; onMenu: (at: DOMRect) => void }) {
  const [ref, near] = useNearScreen<HTMLButtonElement>();
  // Resting the pointer on a video plays it, muted, in the tile.
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const canPlay = asset.kind === "video" && PLAYABLE.has(asset.ext) && !asset.offline;
  const badge = asset.duration ? formatDuration(asset.duration) : asset.kind !== "image" ? asset.ext.toUpperCase() : "";
  return (
    <button
      ref={ref}
      data-asset={asset.id}
      onClick={onClick}
      onDoubleClick={onOpen}
      onContextMenu={(e) => (e.preventDefault(), onMenu(new DOMRect(e.clientX, e.clientY, 0, 0)))}
      onMouseEnter={() => canPlay && (timer.current = window.setTimeout(() => setPlaying(true), 450))}
      onMouseLeave={() => (window.clearTimeout(timer.current), setPlaying(false))}
      className={`group flex min-w-0 flex-col rounded-lg p-1.5 text-left ${selected ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] ring-1 ring-[var(--accent)]" : "hover:bg-hover"}`}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-side">
        <Thumb asset={asset} visible={near} />
        {playing && <video src={convertFileSrc(asset.path)} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full bg-black object-contain" />}
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
      <div className="mt-1.5 truncate px-0.5 text-[13px] text-ink" title={asset.name}>
        {asset.name}
      </div>
      <div className="truncate px-0.5 text-[11px] text-faint">{[formatResolution(asset.width, asset.height), formatBytes(asset.size)].filter(Boolean).join(" · ")}</div>
    </button>
  );
}

function Table({ hits, selected, onClick, onOpen, onMenu }: { hits: Asset[]; selected: Set<string>; onClick: (a: Asset, e: React.MouseEvent) => void; onOpen: (a: Asset) => void; onMenu: (a: Asset, at: DOMRect) => void }) {
  return (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <thead>
        <tr className="h-8 border-b border-line text-left text-xs text-faint">
          <th className="w-[46%] font-normal">Name</th>
          <th className="font-normal">Kind</th>
          <th className="font-normal">Length</th>
          <th className="font-normal">Size</th>
          <th className="font-normal">Resolution</th>
          <th className="font-normal">Modified</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((a) => (
          <ListRow key={a.id} asset={a} selected={selected.has(a.id)} onClick={(e) => onClick(a, e)} onOpen={() => onOpen(a)} onMenu={(at) => onMenu(a, at)} />
        ))}
      </tbody>
    </table>
  );
}

function ListRow({ asset: a, selected, onClick, onOpen, onMenu }: { asset: Asset; selected: boolean; onClick: (e: React.MouseEvent) => void; onOpen: () => void; onMenu: (at: DOMRect) => void }) {
  const [ref, near] = useNearScreen<HTMLTableRowElement>();
  return (
    <tr
      ref={ref}
      data-asset={a.id}
      onClick={onClick}
      onDoubleClick={onOpen}
      onContextMenu={(e) => (e.preventDefault(), onMenu(new DOMRect(e.clientX, e.clientY, 0, 0)))}
      className={`h-9 cursor-default border-b border-line/50 ${selected ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]" : "hover:bg-hover"}`}
    >
      <td className="pr-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-6 w-10 shrink-0 overflow-hidden rounded bg-side">
            <Thumb asset={a} visible={near} />
          </span>
          <span className="truncate" title={a.id}>
            {a.name}
          </span>
          {a.tags.slice(0, 2).map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
      </td>
      <td className="text-muted">{KIND_LABELS[a.kind]}</td>
      <td className="text-muted tabular-nums">{formatDuration(a.duration)}</td>
      <td className="text-muted tabular-nums">{formatBytes(a.size)}</td>
      <td className="text-muted">{formatResolution(a.width, a.height)}</td>
      <td className="text-muted">{new Date(a.modified).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
    </tr>
  );
}

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
  const src = convertFileSrc(asset.path);
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

function Inspector({ asset: a, production, onMeta, onTag, onPreview }: { asset: Asset; production: Production | null; onMeta: (patch: Parameters<typeof api.librarySetMeta>[1]) => void; onTag: (t: string) => void; onPreview: () => void }) {
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
          <Action icon={<ExternalLink size={13} />} label="Open" onClick={() => api.libraryOpen(a.id)} />
          <Action icon={<FolderOpen size={13} />} label="Reveal" onClick={() => api.libraryReveal(a.id)} />
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

function Bulk({ assets, onMeta }: { assets: Asset[]; onMeta: (patch: Parameters<typeof api.librarySetMeta>[1]) => void }) {
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
        <Action icon={<FolderOpen size={13} />} label="Reveal" onClick={() => assets.slice(0, 10).forEach((a) => api.libraryReveal(a.id))} />
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

function AssetMenu({ at, assets, onClose, onPreview, onMeta }: { at: DOMRect; assets: Asset[]; onClose: () => void; onPreview: (a: Asset) => void; onMeta: (patch: Parameters<typeof api.librarySetMeta>[1]) => void }) {
  const one = assets.length === 1 ? assets[0] : null;
  const run = (f: () => void) => () => (f(), onClose());
  return (
    <Popover anchor={at} onClose={onClose} className="w-56 p-1">
      {one && <MenuItem icon={<ExternalLink size={15} />} label="Open" hint="↵" onClick={run(() => api.libraryOpen(one.id))} />}
      {one && <MenuItem icon={<Box size={15} />} label="Preview" hint="Space" onClick={run(() => onPreview(one))} />}
      <MenuItem icon={<FolderOpen size={15} />} label="Reveal in Finder" onClick={run(() => assets.slice(0, 10).forEach((a) => api.libraryReveal(a.id)))} />
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
        <button onClick={() => api.libraryOpen(asset.id)} className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-white/10">
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
  const { openPage } = useVault();
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
