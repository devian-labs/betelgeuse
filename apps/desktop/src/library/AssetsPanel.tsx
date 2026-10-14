import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ChevronRight, Clapperboard, ExternalLink, Folder, FolderOpen, FolderPlus, Layers, Library, Link2, TriangleAlert, Unlink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type Asset, type LibraryStatus } from "../lib/api";
import { getString, readFrontmatter } from "../lib/frontmatter";
import { channelNoise, homeFolder, suggestFolders } from "../lib/pipeline";
import { formatBytes, formatDuration, LIBRARY_PATH, showInLibrary, useStudio } from "../lib/studio";
import { useVault } from "../lib/vault";
import { PreviewOverlay, Thumb } from "./LibraryView";

const OPEN_KEY = "assets-panel-open";

/** A library folder id for an absolute path, if it's inside one of the library folders. */
function idFor(path: string, roots: LibraryStatus["roots"]) {
  const clean = path.replace(/\\/g, "/").replace(/\/+$/, "");
  for (const r of roots) {
    const base = r.path.replace(/\\/g, "/").replace(/\/+$/, "");
    if (clean === base) return r.name;
    if (clean.startsWith(`${base}/`)) return `${r.name}/${clean.slice(base.length + 1)}`;
  }
  return null;
}

/**
 * A production's files, at the top of its page: its project folder in the library, grouped by
 * sub-folder, with buttons to open the project or the folder. Without a folder yet, offers to
 * create one from the template or link an existing one.
 */
export function AssetsPanel({ title, frontmatter, onPatch }: { title: string; frontmatter: string; onPatch: (values: Record<string, unknown>) => void }) {
  const { status, version } = useStudio();
  const { openPage } = useVault();
  const pipeline = status?.settings.pipeline;
  const fm = readFrontmatter(frontmatter);
  const folder = pipeline ? getString(fm, pipeline.folderProperty)?.replace(/\/+$/, "") || null : null;
  const channel = pipeline ? getString(fm, pipeline.channelProperty) ?? null : null;
  const [open, setOpen] = useState(localStorage.getItem(OPEN_KEY) !== "closed");
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [subfolders, setSubfolders] = useState<string[]>([]);
  const [exists, setExists] = useState(true);
  const [suggestions, setSuggestions] = useState<{ id: string; score: number }[]>([]);
  const [preview, setPreview] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => localStorage.setItem(OPEN_KEY, open ? "open" : "closed"), [open]);

  // The folder's files (re-read when the library changes).
  useEffect(() => {
    if (!folder) return setAssets(null);
    let live = true;
    api.librarySearch({ folder, sort: "modified", limit: 2000 }).then((r) => live && setAssets(r.hits));
    api.libraryFolderExists(folder).then((e) => live && setExists(e));
    api.librarySubfolders(folder).then((s) => live && setSubfolders(s)).catch(() => live && setSubfolders([]));
    return () => {
      live = false;
    };
  }, [folder, version]);

  // No folder yet: look for one whose name matches the title.
  const home = pipeline ? homeFolder(pipeline, channel) : null;
  useEffect(() => {
    if (folder || !status?.roots.length) return setSuggestions([]);
    let live = true;
    api.libraryFolders().then((all) => {
      const scope = all.map(([id]) => id).filter((id) => !home || id.startsWith(`${home}/`));
      live && setSuggestions(suggestFolders(title, scope, 0.5, pipeline ? channelNoise(pipeline, channel) : []).slice(0, 3));
    });
    return () => {
      live = false;
    };
  }, [folder, title, home, status?.roots.length, version]);

  const groups = useMemo(() => {
    const m = new Map<string, Asset[]>();
    for (const s of subfolders) m.set(s, []);
    for (const a of assets ?? []) {
      const rest = a.id.slice(folder!.length + 1);
      const key = rest.includes("/") ? rest.slice(0, rest.indexOf("/")) : "";
      m.set(key, [...(m.get(key) ?? []), a]);
    }
    // Loose files first, then the sub-folders in name order (the template's numbering, if any).
    return [...m.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, undefined, { numeric: true })));
  }, [assets, subfolders, folder]);

  if (!status?.settings.enabled || !pipeline) return null;

  const project = (assets ?? []).filter((a) => a.kind === "project").sort((a, b) => b.modified - a.modified)[0];
  const footage = (assets ?? []).filter((a) => a.kind === "video").reduce((s, a) => s + (a.duration ?? 0), 0);
  const size = (assets ?? []).reduce((s, a) => s + a.size, 0);

  const create = async () => {
    setError(null);
    if (!home) return setError(channel ? `Choose where ${channel}'s project folders go in Settings → Creator Studio.` : "Choose a default project folder in Settings → Creator Studio.");
    try {
      const id = await api.libraryCreateFolder(home, title, pipeline.template);
      onPatch({ [pipeline.folderProperty]: id });
    } catch (e) {
      setError(String(e));
    }
  };
  const choose = async () => {
    setError(null);
    const dir = await openDialog({ directory: true, title: `Project folder for ${title}`, defaultPath: status.roots[0]?.path });
    if (typeof dir !== "string") return;
    const id = idFor(dir, status.roots);
    if (!id) return setError("That folder isn't in the Library. Add its drive or parent folder in Settings → Creator Studio first.");
    onPatch({ [pipeline.folderProperty]: id });
  };
  const library = () => {
    if (!folder) return;
    showInLibrary(folder);
    openPage(LIBRARY_PATH);
  };

  return (
    <div className="mt-5 rounded-lg border border-line">
      <div className="flex h-10 items-center gap-2 px-3 text-sm">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight size={14} className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`} />
          <Clapperboard size={15} className="shrink-0 text-muted" />
          <span className="font-medium">Assets</span>
          {folder && assets && (
            <span className="truncate text-xs text-faint">
              {assets.length.toLocaleString()} files · {formatBytes(size)}
              {footage > 0 ? ` · ${formatDuration(footage)} of video` : ""}
            </span>
          )}
        </button>
        {folder && (
          <>
            {project && (
              <PanelButton icon={<Layers size={13} />} label="Open project" title={project.name} onClick={() => api.libraryOpen(project.id)} />
            )}
            <PanelButton icon={<FolderOpen size={13} />} label="Folder" title="Open the folder" onClick={() => api.libraryOpen(folder)} />
            <PanelButton icon={<Library size={13} />} label="Library" title="Show in the Library" onClick={library} />
          </>
        )}
      </div>

      {open && (
        <div className="border-t border-line px-3 pt-2 pb-3">
          {!folder ? (
            <div className="flex flex-col gap-2 py-1">
              <p className="text-[13px] text-muted">No project folder yet. Footage, audio, graphics and exports for this production will show here.</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <PanelButton primary icon={<FolderPlus size={13} />} label="Create project folder" title={home ? `${home}/${title}` : undefined} onClick={create} />
                <PanelButton icon={<Folder size={13} />} label="Choose folder…" onClick={choose} />
              </div>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint">
                  Looks like:
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onPatch({ [pipeline.folderProperty]: s.id })}
                      title={`Link ${s.id}`}
                      className="flex max-w-80 items-center gap-1 rounded-md border border-line px-2 py-0.5 text-muted hover:bg-hover hover:text-ink"
                    >
                      <Link2 size={12} />
                      <span className="truncate">{s.id.slice(s.id.lastIndexOf("/") + 1)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : !exists ? (
            <div className="flex flex-wrap items-center gap-2 py-1 text-[13px] text-muted">
              <TriangleAlert size={14} className="text-[var(--c-orange-text)]" />
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs">{folder}</span> isn't there. Was it moved, or is its drive unplugged?
              </span>
              <PanelButton icon={<Folder size={13} />} label="Choose folder…" onClick={choose} />
              <PanelButton icon={<Unlink size={13} />} label="Unlink" onClick={() => onPatch({ [pipeline.folderProperty]: null })} />
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-1.5 text-xs text-faint">
                <span className="truncate font-mono" title={folder}>
                  {folder}
                </span>
                <button onClick={() => onPatch({ [pipeline.folderProperty]: null })} title="Unlink this folder (the files stay)" className="ml-1 hover:text-ink">
                  <Unlink size={12} />
                </button>
              </div>
              {groups.length === 0 && <p className="py-2 text-[13px] text-faint">The folder is empty.</p>}
              {groups.map(([name, files]) => (
                <Group key={name || "."} name={name} files={files} onPreview={setPreview} onOpenFolder={() => api.libraryOpen(name ? `${folder}/${name}` : folder)} />
              ))}
            </>
          )}
          {error && <p className="mt-2 text-xs text-[var(--c-red-text)]">{error}</p>}
        </div>
      )}
      {preview && <PreviewOverlay asset={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Group({ name, files, onPreview, onOpenFolder }: { name: string; files: Asset[]; onPreview: (a: Asset) => void; onOpenFolder: () => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, 8);
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-1 flex items-center gap-1.5 text-xs">
        <button onClick={onOpenFolder} className="flex items-center gap-1.5 font-medium text-muted hover:text-ink" title="Open in Finder">
          <Folder size={12} className="text-faint" />
          {name || "In the folder"}
        </button>
        <span className="text-faint">{files.length ? files.length : "Empty"}</span>
        {files.length > 8 && (
          <button onClick={() => setAll((v) => !v)} className="ml-auto text-faint hover:text-ink">
            {all ? "Show less" : `Show all ${files.length}`}
          </button>
        )}
      </div>
      {files.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
          {shown.map((a) => (
            <button
              key={a.id}
              onClick={() => onPreview(a)}
              onDoubleClick={() => api.libraryOpen(a.id)}
              title={`${a.name}\nClick to preview, double-click to open`}
              className="group min-w-0 rounded-md p-1 text-left hover:bg-hover"
            >
              <div className="relative aspect-video overflow-hidden rounded bg-side">
                <Thumb asset={a} />
                {a.duration ? <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 text-[9px] text-white tabular-nums">{formatDuration(a.duration)}</span> : null}
              </div>
              <div className="mt-1 truncate text-[11px] text-muted">{a.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PanelButton({ icon, label, title, onClick, primary }: { icon: React.ReactNode; label: string; title?: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs ${primary ? "bg-[var(--accent)] font-medium text-white hover:opacity-90" : "border border-line text-muted hover:bg-hover hover:text-ink"}`}
    >
      {icon}
      {label}
      {label === "Open project" && <ExternalLink size={11} className="opacity-60" />}
    </button>
  );
}
