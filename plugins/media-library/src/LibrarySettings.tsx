import { FolderOpen, FolderPlus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, SettingRow, Switch } from "@betelgeuse/plugin-api/ui";
import { library } from "./host";
import { PipelineSettings } from "./PipelineSettings";
import { formatBytes, refreshStudio, useStudio } from "./store";

/** Settings → Media Library: library folders, previews, what to skip, and the pipeline. */
export function LibrarySettings() {
  const { status, progress } = useStudio();
  const [error, setError] = useState<string | null>(null);
  const [ignore, setIgnore] = useState<string | null>(null);
  if (!status) return null;
  const o = status.options;
  const save = async (patch: Partial<typeof o>) => {
    await library().setOptions(patch);
    await refreshStudio();
  };
  const addFolder = async () => {
    setError(null);
    await library()
      .addFolder()
      .catch((e) => setError(String(e)));
    await refreshStudio();
  };
  const busy = progress.phase !== "idle";

  return (
    <>
      <p className="-mt-2 mb-5 text-sm text-muted">
        A searchable library of your footage, audio, photos and project files, and a production pipeline. Your files stay where they are: Betelgeuse
        only reads them, and nothing is uploaded.
      </p>

      <h3 className="mb-1 text-sm font-semibold text-ink">Library folders</h3>
      <p className="mb-3 text-xs text-muted">
        Folders the Library indexes, including everything inside them. These are remembered on this computer only; tags and notes you add are saved
        in the workspace.
      </p>
      <div className="rounded-lg border border-line">
        {status.roots.map((r) => (
          <div key={r.name} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
            <FolderOpen size={16} className="shrink-0 text-faint" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">{r.name}</div>
              <div className="truncate font-mono text-xs text-muted" title={r.path}>
                {r.path}
              </div>
            </div>
            <span className={`text-xs ${r.exists ? "text-muted" : "text-[var(--c-red-text)]"}`}>{r.exists ? `${r.files.toLocaleString()} files` : "Not found"}</span>
            <button
              title="Remove from the Library (the files aren't touched)"
              onClick={async () => (await library().removeFolder(r.name), refreshStudio())}
              className="grid size-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-ink"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Button onClick={addFolder} icon={<FolderPlus size={14} />}>
            Add folder…
          </Button>
          <Button onClick={() => library().rescan()} icon={<RefreshCw size={14} className={busy ? "animate-spin" : ""} />}>
            Rescan
          </Button>
          <span className="flex-1" />
          <span className="text-xs text-faint">
            {busy
              ? progress.phase === "probing"
                ? `Reading details ${progress.done ?? 0}/${progress.total ?? 0}`
                : "Scanning…"
              : `${status.total.toLocaleString()} files${status.lastScan ? ` · scanned ${new Date(status.lastScan).toLocaleTimeString(undefined, { timeStyle: "short" })}` : ""}`}
          </span>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--c-red-text)]">{error}</p>}

      <div className="mt-4 divide-y divide-[var(--line)]">
        <SettingRow label="Thumbnails" hint={`Previews for videos, photos, PSDs and PDFs, made once and kept in the app's cache (${formatBytes(status.cacheBytes)}).`}>
          <div className="flex items-center gap-3">
            <button onClick={async () => (await library().clearCache(), refreshStudio())} className="text-xs text-muted hover:text-ink hover:underline">
              Clear cache
            </button>
            <Switch checked={o.thumbnails} onChange={(thumbnails) => save({ thumbnails })} label="Thumbnails" />
          </div>
        </SettingRow>
        <SettingRow
          label="Video details"
          hint={
            status.ffprobe ? (
              <>Length, resolution and frame rate are read with ffprobe ({status.ffprobe}).</>
            ) : (
              <>
                Install ffmpeg to see video length, resolution and frame rate (on a Mac: <code className="font-mono">brew install ffmpeg</code>).
              </>
            )
          }
        >
          <span className={`text-xs ${status.ffprobe ? "text-muted" : "text-[var(--c-orange-text)]"}`}>{status.ffprobe ? "ffmpeg found" : "Not installed"}</span>
        </SettingRow>
        <div className="py-3.5">
          <div className="text-sm font-medium text-ink">Skip these files and folders</div>
          <div className="mt-0.5 mb-2 text-xs text-muted">
            One name per line; <code className="font-mono">*</code> matches anything. Caches like Premiere's media cache are skipped by default.
          </div>
          <textarea
            value={ignore ?? o.ignore.join("\n")}
            onChange={(e) => setIgnore(e.target.value)}
            onBlur={() => {
              if (ignore == null) return;
              const list = ignore
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
              setIgnore(null);
              if (list.join("\n") !== o.ignore.join("\n")) save({ ignore: list });
            }}
            rows={6}
            className="w-full resize-y rounded-md border border-line bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--line-strong)]"
          />
        </div>
      </div>
      <PipelineSettings />
    </>
  );
}
