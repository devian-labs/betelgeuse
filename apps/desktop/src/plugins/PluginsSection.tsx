import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { BookOpen, CircleAlert, FolderInput, LoaderCircle, Puzzle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { open } from "../lib/links";
import { describePermission, installFromFolder, refreshList, reload, setEnabled, uninstall, usePlugins, type PluginState } from "./runtime";
import { Switch } from "./ui";

export const PLUGIN_DOCS = "https://betelgeuse.devianlabs.com/docs/plugins/";

/** Settings → Plugins: what's installed, on or off for this workspace, and installing more. */
export function PluginsSection() {
  const plugins = usePlugins();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const install = async () => {
    const dir = await openDialog({ directory: true, title: "Choose a built plugin folder (the one with betelgeuse-plugin.json)" });
    if (typeof dir !== "string") return;
    setBusy(true);
    setError(null);
    try {
      await installFromFolder(dir);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-5 border-b border-line pb-3">
        <h2 className="text-lg font-semibold text-ink">Plugins</h2>
        <p className="mt-0.5 text-sm text-muted">Add features to Betelgeuse. Plugins are installed on this computer and turned on for each workspace.</p>
      </div>

      {plugins.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
          <Puzzle size={26} className="mx-auto mb-2 text-faint" />
          <div className="text-sm font-medium text-ink">No plugins yet</div>
          <div className="mt-1 text-xs text-muted">The plugin store is coming. Until then, you can install a plugin you've built from its folder.</div>
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)] rounded-lg border border-line">
          {plugins.map((p) => (
            <PluginRow key={p.id} plugin={p} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={install} disabled={busy} className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-muted hover:bg-hover hover:text-ink disabled:opacity-50">
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <FolderInput size={14} />}
          Install from folder…
        </button>
        <button onClick={() => refreshList()} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted hover:bg-hover hover:text-ink">
          <RefreshCw size={14} /> Refresh
        </button>
        <span className="flex-1" />
        <button onClick={() => open(PLUGIN_DOCS)} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted hover:bg-hover hover:text-ink">
          <BookOpen size={14} /> Make a plugin
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--c-red-text)]">{error}</p>}
    </>
  );
}

function PluginRow({ plugin: p }: { plugin: PluginState }) {
  const [open, setOpen] = useState(false);
  const m = p.manifest;
  const perms = m.permissions ?? [];
  return (
    <div className="px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-hover text-lg">{m.icon || <Puzzle size={16} className="text-faint" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-ink">{m.name}</span>
            <span className="text-xs text-faint">{m.version}</span>
            {p.source === "dev" && <span className="rounded bg-[var(--accent-soft)] px-1.5 text-[11px] text-ink">Development</span>}
            {p.status === "loading" && <LoaderCircle size={12} className="animate-spin text-faint" />}
          </div>
          {m.description && <div className="mt-0.5 text-xs text-muted">{m.description}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
            {m.author && <span>{m.author}</span>}
            {perms.length > 0 && (
              <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 hover:text-ink">
                <ShieldCheck size={12} /> {perms.length} {perms.length === 1 ? "permission" : "permissions"}
              </button>
            )}
            {p.status === "active" && p.source === "dev" && (
              <button onClick={() => reload(p.id)} className="flex items-center gap-1 hover:text-ink" title="Load the latest build">
                <RefreshCw size={12} /> Reload
              </button>
            )}
            {p.source === "installed" && (
              <button onClick={() => uninstall(p.id)} className="flex items-center gap-1 hover:text-[var(--c-red-text)]">
                <Trash2 size={12} /> Uninstall
              </button>
            )}
          </div>
          {open && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted">
              {perms.map((x) => (
                <li key={x}>· {describePermission(x)}</li>
              ))}
            </ul>
          )}
          {p.problem && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-[var(--c-orange-text)]">
              <CircleAlert size={13} className="mt-px shrink-0" />
              <span>{p.problem}</span>
            </div>
          )}
        </div>
        <Switch checked={p.enabled} onChange={(on) => setEnabled(p.id, on)} label={`Turn ${m.name} on for this workspace`} />
      </div>
    </div>
  );
}
