/**
 * Plugins on the phone. The plugin runtime is the desktop app's own (it loads plugins, gives them
 * their API and collects what they add); this file gives it a phone to live in: screens for
 * plugin views and settings, rows on Home, and Settings → Plugins, where plugins are installed from
 * the store and turned on.
 *
 * A plugin says where it runs (`platforms` in its manifest; desktop when it doesn't say). Only
 * the ones made for the phone install and load here; the others are listed as desktop only. They
 * come from the store, so new plugins and their updates never need a new version of the app.
 */
import { listen } from "@tauri-apps/api/event";
import { ArrowUpCircle, ChevronRight, Download, LoaderCircle, Monitor, Puzzle, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@desktop/lib/api";
import { isQuietWrite } from "@desktop/lib/quiet";
import {
  describePermission,
  incompatibility,
  installFromStore,
  loadStore,
  loadWorkspace,
  parseViewPath,
  setEnabled,
  setHost,
  setPlatform,
  uninstall,
  updateFor,
  useContributions,
  useMissing,
  usePlugins,
  useStore,
  viewPath,
  type PluginState,
  type StoreEntry,
} from "@desktop/plugins/runtime";
import { PluginSettingsSection, PluginView } from "@desktop/plugins/slots";
import type { PluginManifest } from "@betelgeuse/plugin-api";
import { useMobile, type Route } from "./mobile";
import { Confirm, Switch, TopBar } from "./ui";

/**
 * Starts the plugin runtime for the phone: loads the workspace's plugins, lets them open pages,
 * their views and settings, and refreshes the app when pages change (a plugin's writes, a sync).
 */
export function usePluginRuntime({ go, toast, refresh }: { go: (r: Route) => void; toast: (message: string) => void; refresh: () => void }) {
  const latest = useRef({ go, toast, refresh });
  latest.current = { go, toast, refresh };
  useEffect(() => {
    setPlatform("mobile");
    setHost({
      openPath: (path) => latest.current.go(path.startsWith("@plugin/") ? { name: "plugin", path } : { name: "page", path }),
      toast: (message) => latest.current.toast(message),
      openSettings: (section) => latest.current.go(section?.startsWith("plugin:") ? { name: "plugin-settings", key: section.slice(7) } : { name: "plugins" }),
    });
    api
      .currentVault()
      .then((v) => loadWorkspace(v.path))
      .catch((e) => console.error("plugins", e));
    // Pages changed: one refresh once things settle. Saves while typing (quiet) don't count.
    let timer: number | undefined;
    const un = listen<string[]>("vault-changed", (e) => {
      if (e.payload.length && e.payload.every(isQuietWrite)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => latest.current.refresh(), 300);
    });
    return () => {
      window.clearTimeout(timer);
      void un.then((f) => f());
    };
  }, []);
}

// ---------- a plugin's view, full screen ----------

export function PluginScreen({ path }: { path: string }) {
  const m = useMobile();
  const { views } = useContributions();
  const ref = parseViewPath(path);
  const view = ref && views.find((v) => v.pluginId === ref.pluginId && v.id === ref.viewId);
  return (
    <div className="screen-in safe-top flex h-full flex-col bg-surface">
      <TopBar
        onBack={m.back}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid size-5 shrink-0 place-items-center text-muted">{view?.icon ?? <Puzzle size={16} />}</span>
            <span className="truncate">{view?.title ?? "Plugin"}</span>
          </span>
        }
      />
      <div className="safe-bottom flex min-h-0 flex-1">
        <PluginView path={path} onOpenSettings={() => m.go({ name: "plugins" })} />
      </div>
    </div>
  );
}

/** Plugins' sidebar items, as rows on Home (the desktop shows them at the top of the sidebar). */
export function PluginHomeRows() {
  const m = useMobile();
  const { sidebar } = useContributions();
  if (!sidebar.length) return null;
  return (
    <div className="mb-2">
      {sidebar.map((item) => (
        <button
          key={`${item.pluginId}:${item.id}`}
          onClick={() => (item.view ? m.go({ name: "plugin", path: viewPath(item.pluginId, item.view) }) : item.onClick?.())}
          className="flex h-11 w-full items-center gap-2.5 rounded-lg pl-2 text-left text-[15px] text-ink active:bg-hover"
        >
          <span className="grid size-6 place-items-center text-muted">{item.icon ?? <Puzzle size={17} />}</span>
          <span className="flex-1 truncate">{item.title}</span>
          <ChevronRight size={16} className="mr-2 text-faint" />
        </button>
      ))}
    </div>
  );
}

// ---------- Settings → Plugins ----------

const platformsOf = (m: { platforms?: string[] }) => m.platforms ?? ["desktop"];
const forPhone = (m: { platforms?: string[] }) => platformsOf(m).includes("mobile");

export function PluginsScreen() {
  const m = useMobile();
  const plugins = usePlugins();
  const missing = useMissing();
  const { index, error } = useStore();
  const { settings } = useContributions();
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PluginState | null>(null);
  useEffect(() => void loadStore(), []);

  const run = async (id: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(id);
    try {
      await fn();
      if (done) m.toast({ message: done });
    } catch (e) {
      m.toast({ message: String(e) });
    } finally {
      setBusy(null);
    }
  };
  const install = (e: StoreEntry) => run(e.id, () => installFromStore(e.id), `${e.name} installed`);
  const installedIds = new Set(plugins.map((p) => p.id));
  // Not installed here, and not already listed as used by this workspace.
  const store = (index?.plugins ?? []).filter((e) => !installedIds.has(e.id) && !missing.includes(e.id));
  const phoneStore = store.filter(forPhone);
  const desktopOnly = store.filter((e) => !forPhone(e));

  return (
    <div className="screen-in safe-top flex h-full flex-col bg-side">
      <TopBar
        onBack={m.back}
        title="Plugins"
        children={
          <button onClick={() => run("store", () => loadStore(true))} aria-label="Check the store again" className="grid size-10 place-items-center rounded-full text-muted active:bg-hover">
            <RefreshCw size={18} className={busy === "store" ? "animate-spin" : ""} />
          </button>
        }
      />
      <main className="safe-bottom min-h-0 flex-1 overflow-y-auto px-4 pb-10">
        <p className="px-1 pt-3 text-[13px] leading-relaxed text-muted">
          Plugins add features to Betelgeuse. Those made for the phone install from the store here; new plugins and updates arrive without updating the app.
        </p>

        <Group label="On this phone">
          {plugins.length === 0 && <p className="px-4 py-4 text-[14px] text-muted">None yet. Browse the store below.</p>}
          {plugins.map((p) => (
            <Installed
              key={p.id}
              p={p}
              busy={busy === p.id}
              update={index ? updateFor(p, index) : null}
              onToggle={(on) => run(p.id, () => setEnabled(p.id, on))}
              onUpdate={() => run(p.id, () => installFromStore(p.id), `${p.manifest.name} updated`)}
              onRemove={() => setRemoving(p)}
              onSettings={settings.find((s) => s.pluginId === p.id) ? () => m.go({ name: "plugin-settings", key: settings.find((s) => s.pluginId === p.id)!.key }) : undefined}
            />
          ))}
        </Group>

        {missing.length > 0 && (
          <Group label="Used in this workspace, not on this phone">
            {missing.map((id) => {
              const e = index?.plugins.find((x) => x.id === id);
              return e ? (
                <StoreRow key={id} e={e} busy={busy === id} onInstall={() => install(e)} />
              ) : (
                <div key={id} className="flex min-h-12 items-center gap-3 px-4 py-2 text-[14px] text-muted">
                  <Puzzle size={18} /> {id}
                </div>
              );
            })}
          </Group>
        )}

        <Group label="Plugin store">
          {!index && !error && (
            <div className="flex items-center gap-2 px-4 py-4 text-[14px] text-muted">
              <LoaderCircle size={16} className="animate-spin" /> Loading…
            </div>
          )}
          {error && !index && <p className="px-4 py-4 text-[14px] text-muted">{error}</p>}
          {index && phoneStore.length === 0 && <p className="px-4 py-4 text-[14px] text-muted">You have every plugin made for the phone.</p>}
          {phoneStore.map((e) => (
            <StoreRow key={e.id} e={e} busy={busy === e.id} onInstall={() => install(e)} />
          ))}
        </Group>

        {desktopOnly.length > 0 && (
          <Group label="Desktop only">
            {desktopOnly.map((e) => (
              <StoreRow key={e.id} e={e} busy={false} />
            ))}
          </Group>
        )}
        {index?.stale && <p className="px-1 pt-3 text-xs text-faint">The store couldn't be reached; this is the list from last time.</p>}
      </main>

      {removing && (
        <Confirm
          title={`Uninstall ${removing.manifest.name}?`}
          message="Its code is removed from this phone. What it saved in your workspace stays, for when you install it again."
          action="Uninstall"
          onClose={() => setRemoving(null)}
          onConfirm={() => run(removing.id, () => uninstall(removing.id), `${removing.manifest.name} uninstalled`)}
        />
      )}
    </div>
  );
}

function Installed({
  p,
  busy,
  update,
  onToggle,
  onUpdate,
  onRemove,
  onSettings,
}: {
  p: PluginState;
  busy: boolean;
  update: StoreEntry | null;
  onToggle: (on: boolean) => void;
  onUpdate: () => void;
  onRemove: () => void;
  onSettings?: () => void;
}) {
  const problem = p.problem ?? incompatibility(p.manifest);
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-hover text-xl">{p.manifest.icon || "🧩"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-ink">
            {p.manifest.name} <span className="text-xs font-normal text-faint">{p.manifest.version}</span>
          </div>
          <div className="line-clamp-2 text-[13px] text-muted">{problem ?? p.manifest.description}</div>
        </div>
        <button onClick={() => !problem && onToggle(!p.enabled)} disabled={busy || !!problem} aria-label={p.enabled ? "Turn off" : "Turn on"} className="mt-1 shrink-0 disabled:opacity-40">
          <Switch on={p.enabled && !problem} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-12 text-[13px]">
        {onSettings && p.enabled && (
          <button onClick={onSettings} className="font-medium text-[var(--blue)]">
            Settings
          </button>
        )}
        {update && (
          <button onClick={onUpdate} disabled={busy} className="flex items-center gap-1 font-medium text-[var(--blue)]">
            <ArrowUpCircle size={14} /> Update to {update.version}
          </button>
        )}
        {p.source === "installed" && (
          <button onClick={onRemove} disabled={busy} className="flex items-center gap-1 text-muted">
            <Trash2 size={13} /> Uninstall
          </button>
        )}
        {busy && <LoaderCircle size={14} className="animate-spin text-muted" />}
      </div>
    </div>
  );
}

/** A plugin in the store: installable when it's made for the phone (and this app version). */
function StoreRow({ e, busy, onInstall }: { e: StoreEntry; busy: boolean; onInstall?: () => void }) {
  const problem = incompatibility(e as unknown as PluginManifest);
  const phone = forPhone(e);
  return (
    <div className={`px-4 py-3 ${phone ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-hover text-xl">{e.icon || "🧩"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-ink">
            {e.name} <span className="text-xs font-normal text-faint">{e.version}</span>
          </div>
          <div className="line-clamp-2 text-[13px] text-muted">{e.description}</div>
        </div>
        {phone && !problem && onInstall ? (
          <button onClick={onInstall} disabled={busy} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[var(--blue)] px-3 text-[13px] font-medium text-white disabled:opacity-60">
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />} Install
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-[12px] text-muted">
            <Monitor size={12} /> {phone ? "Update the app" : "Desktop only"}
          </span>
        )}
      </div>
      {phone && problem && <p className="mt-1.5 pl-12 text-[12px] text-faint">{problem}</p>}
      {phone && !problem && e.permissions.length > 0 && <p className="mt-1.5 pl-12 text-[12px] text-faint">Can {e.permissions.map(describePermission).join(", ").toLowerCase()}.</p>}
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="px-1 pb-1.5 text-xs font-medium text-faint">{label}</h2>
      <div className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-line bg-raised">{children}</div>
    </section>
  );
}

// ---------- a plugin's settings ----------

export function PluginSettingsScreen({ sectionKey }: { sectionKey: string }) {
  const m = useMobile();
  const { settings } = useContributions();
  const s = settings.find((x) => x.key === sectionKey);
  return (
    <div className="screen-in safe-top flex h-full flex-col bg-surface">
      <TopBar onBack={m.back} title={s?.title ?? "Settings"} />
      <main className="safe-bottom min-h-0 flex-1 overflow-y-auto px-4 pb-10">{s ? <PluginSettingsSection sectionKey={sectionKey} /> : <p className="pt-10 text-center text-sm text-muted">This plugin is off.</p>}</main>
    </div>
  );
}

/** Settings rows for plugins' own settings sections (and the Plugins screen). */
export function PluginSettingsRows() {
  const m = useMobile();
  const { settings } = useContributions();
  const plugins = usePlugins();
  const on = plugins.filter((p) => p.enabled && p.status === "active").length;
  return (
    <>
      <button onClick={() => m.go({ name: "plugins" })} className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-hover">
        <Puzzle size={19} className="text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-ink">Plugins</span>
          <span className="block truncate text-[13px] text-muted">{on ? `${on} on · install more from the store` : "Add features from the plugin store"}</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </button>
      {settings.map((s) => (
        <button key={s.key} onClick={() => m.go({ name: "plugin-settings", key: s.key })} className="flex min-h-12 w-full items-center gap-3 px-4 text-left active:bg-hover">
          <span className="grid w-5 place-items-center text-muted">{s.icon ?? <Puzzle size={18} />}</span>
          <span className="flex-1 text-[15px] text-ink">{s.title}</span>
          <ChevronRight size={18} className="text-faint" />
        </button>
      ))}
    </>
  );
}
