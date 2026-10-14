import { open as openDialog, confirm } from "@tauri-apps/plugin-dialog";
import { ArrowUpCircle, BookOpen, CircleAlert, Download, FolderInput, LoaderCircle, Puzzle, RefreshCw, ShieldCheck, Trash2, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { open } from "../lib/links";
import {
  autoUpdates,
  describePermission,
  incompatibility,
  installFromFolder,
  installFromStore,
  loadStore,
  refreshList,
  reload,
  setAutoUpdates,
  setEnabled,
  uninstall,
  updateFor,
  useMissing,
  usePlugins,
  useStore,
  type PluginState,
  type StoreEntry,
} from "./runtime";
import type { PluginManifest } from "@betelgeuse/plugin-api";
import { Switch } from "./ui";

export const PLUGIN_DOCS = "https://betelgeuse.devianlabs.com/docs/plugins/";
const BUILD_DOCS = "https://betelgeuse.devianlabs.com/docs/developers/plugins/";

/** Asks before installing: what the plugin is and what it may do. */
async function approve(entry: StoreEntry) {
  const perms = entry.permissions.length ? `\n\nIt will be able to:\n${entry.permissions.map((p) => `• ${describePermission(p)}`).join("\n")}` : "";
  return confirm(`Install ${entry.name} ${entry.version}${entry.author ? ` by ${entry.author}` : ""}?${perms}`, { title: "Install plugin", okLabel: "Install" });
}

/** Settings → Plugins: installed plugins (on or off for this workspace) and the store. */
export function PluginsSection() {
  const [tab, setTab] = useState<"installed" | "browse">("installed");
  const plugins = usePlugins();
  const missing = useMissing();
  const { index, error } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [auto, setAuto] = useState(autoUpdates());

  useEffect(() => {
    if (!index) loadStore();
  }, [index]);

  const run = async (key: string, f: () => Promise<unknown>) => {
    setBusy(key);
    setProblem(null);
    try {
      await f();
    } catch (e) {
      setProblem(String(e));
    } finally {
      setBusy(null);
    }
  };
  const install = (entry: StoreEntry) => run(entry.id, async () => (await approve(entry)) && installFromStore(entry.id));
  const fromFolder = async () => {
    const dir = await openDialog({ directory: true, title: "Choose a built plugin folder (the one with betelgeuse-plugin.json)" });
    if (typeof dir === "string") await run("folder", () => installFromFolder(dir));
  };
  const updates = plugins.map((p) => [p, updateFor(p, index)] as const).filter((x): x is [PluginState, StoreEntry] => !!x[1]);
  const needed = missing.map((id) => ({ id, entry: index?.plugins.find((e) => e.id === id) ?? null }));

  return (
    <>
      <div className="mb-4 border-b border-line pb-3">
        <h2 className="text-lg font-semibold text-ink">Plugins</h2>
        <p className="mt-0.5 text-sm text-muted">Add features to Betelgeuse. Plugins are installed on this computer and turned on for each workspace.</p>
      </div>

      <div className="mb-4 flex gap-1 text-sm">
        {(["installed", "browse"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 ${tab === t ? "bg-hover font-medium text-ink" : "text-muted hover:bg-hover"}`}>
            {t === "installed" ? `Installed${plugins.length ? ` (${plugins.length})` : ""}` : "Browse"}
            {t === "installed" && updates.length > 0 && <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 text-[11px] text-white">{updates.length}</span>}
          </button>
        ))}
      </div>

      {needed.length > 0 && (
        <div className="mb-3 rounded-lg border border-line bg-[var(--accent-soft)] px-3 py-2.5 text-sm">
          <div className="font-medium text-ink">This workspace uses {needed.length === 1 ? "a plugin" : "plugins"} that aren't on this computer</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {needed.map(({ id, entry }) =>
              entry ? (
                <button
                  key={id}
                  onClick={() => install(entry)}
                  disabled={!!busy}
                  className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {busy === id ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />} Install {entry.name}
                </button>
              ) : (
                <span key={id} className="text-xs text-muted">
                  {id} (not in the store{error ? ", which can't be reached right now" : ""})
                </span>
              ),
            )}
          </div>
        </div>
      )}

      {tab === "installed" ? (
        <>
          {plugins.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
              <Puzzle size={26} className="mx-auto mb-2 text-faint" />
              <div className="text-sm font-medium text-ink">No plugins yet</div>
              <div className="mt-1 text-xs text-muted">
                <button onClick={() => setTab("browse")} className="text-[var(--blue)] hover:underline">
                  Browse the plugin store
                </button>{" "}
                to add features.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)] rounded-lg border border-line">
              {plugins.map((p) => (
                <PluginRow key={p.id} plugin={p} update={updateFor(p, index)} busy={busy === p.id} onUpdate={() => run(p.id, () => installFromStore(p.id))} />
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={fromFolder} disabled={!!busy} className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-muted hover:bg-hover hover:text-ink disabled:opacity-50">
              {busy === "folder" ? <LoaderCircle size={14} className="animate-spin" /> : <FolderInput size={14} />}
              Install from folder…
            </button>
            <button onClick={() => (refreshList(), loadStore(true))} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted hover:bg-hover hover:text-ink">
              <RefreshCw size={14} /> Check for updates
            </button>
            <span className="flex-1" />
            <label className="flex items-center gap-2 text-xs text-muted">
              Update automatically
              <Switch checked={auto} onChange={(on) => (setAutoUpdates(on), setAuto(on))} label="Update plugins automatically" />
            </label>
          </div>
        </>
      ) : (
        <Browse index={index} error={error} installed={plugins} busy={busy} onInstall={install} />
      )}

      {problem && <p className="mt-3 text-xs text-[var(--c-red-text)]">{problem}</p>}

      <div className="mt-5 flex gap-4 border-t border-line pt-3 text-xs text-muted">
        <button onClick={() => open(PLUGIN_DOCS)} className="flex items-center gap-1.5 hover:text-ink">
          <BookOpen size={13} /> About plugins
        </button>
        <button onClick={() => open(BUILD_DOCS)} className="flex items-center gap-1.5 hover:text-ink">
          <Puzzle size={13} /> Build a plugin
        </button>
      </div>
    </>
  );
}

function Browse({
  index,
  error,
  installed,
  busy,
  onInstall,
}: {
  index: ReturnType<typeof useStore>["index"];
  error: string | null;
  installed: PluginState[];
  busy: string | null;
  onInstall: (e: StoreEntry) => void;
}) {
  if (!index) {
    return error ? (
      <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
        <WifiOff size={22} className="mx-auto mb-2 text-faint" />
        Couldn't reach the plugin store.
        <div className="mt-1 text-xs text-faint">{error}</div>
        <button onClick={() => loadStore(true)} className="mt-3 rounded-md border border-line px-3 py-1 text-xs hover:bg-hover">
          Try again
        </button>
      </div>
    ) : (
      <div className="py-10 text-center text-sm text-faint">
        <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" /> Loading the plugin store…
      </div>
    );
  }
  return (
    <>
      {index.stale && <p className="mb-2 text-xs text-faint">Showing the last list we had: the store can't be reached right now.</p>}
      {index.plugins.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No plugins in the store yet.</p>
      ) : (
        <div className="divide-y divide-[var(--line)] rounded-lg border border-line">
          {index.plugins.map((e) => {
            const have = installed.find((p) => p.id === e.id);
            const blocked = incompatibility(e as unknown as PluginManifest);
            return (
              <div key={e.id} className="flex items-start gap-3 px-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-hover text-lg">{e.icon || <Puzzle size={16} className="text-faint" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-ink">{e.name}</span>
                    <span className="text-xs text-faint">{e.version}</span>
                  </div>
                  {e.description && <div className="mt-0.5 text-xs text-muted">{e.description}</div>}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-faint">
                    {e.author && <span>{e.author}</span>}
                    {e.size > 0 && <span>{Math.max(1, Math.round(e.size / 1024))} KB</span>}
                    {e.homepage && (
                      <button onClick={() => open(e.homepage)} className="hover:text-ink">
                        Learn more
                      </button>
                    )}
                  </div>
                  {e.permissions.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                      {e.permissions.map((x) => (
                        <li key={x} className="flex items-center gap-1.5">
                          <ShieldCheck size={11} className="text-faint" /> {describePermission(x)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {blocked && <div className="mt-1.5 text-xs text-[var(--c-orange-text)]">{blocked}</div>}
                </div>
                {have ? (
                  <span className="shrink-0 text-xs text-faint">{have.source === "dev" ? "Development copy" : "Installed"}</span>
                ) : (
                  <button
                    onClick={() => onInstall(e)}
                    disabled={!!busy || !!blocked}
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {busy === e.id ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />} Install
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function PluginRow({ plugin: p, update, busy, onUpdate }: { plugin: PluginState; update: StoreEntry | null; busy: boolean; onUpdate: () => void }) {
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
            {(p.status === "loading" || busy) && <LoaderCircle size={12} className="animate-spin text-faint" />}
          </div>
          {m.description && <div className="mt-0.5 text-xs text-muted">{m.description}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
            {m.author && <span>{m.author}</span>}
            {perms.length > 0 && (
              <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 hover:text-ink">
                <ShieldCheck size={12} /> {perms.length} {perms.length === 1 ? "permission" : "permissions"}
              </button>
            )}
            {update && (
              <button onClick={onUpdate} disabled={busy} className="flex items-center gap-1 font-medium text-[var(--accent)] hover:underline">
                <ArrowUpCircle size={12} /> Update to {update.version}
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
