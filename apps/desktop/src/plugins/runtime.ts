/**
 * The plugin runtime: finds the plugins this machine has, loads the ones the workspace has turned
 * on, gives each a `PluginContext`, and keeps what they register (views, sidebar items, settings,
 * page panels, commands, search) in one store the app's slots render from.
 *
 * A plugin's `main.js` is CommonJS. It's evaluated with a `require` that only hands out the modules
 * the app shares (React, ReactDOM, the plugin API and its UI kit), so plugins stay small and share
 * the app's React. Everything a plugin registers is tracked and disposed when it's turned off.
 */
import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { confirm, open as openDialog } from "@tauri-apps/plugin-dialog";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JSXRuntime from "react/jsx-runtime";
import { useSyncExternalStore } from "react";
import type {
  Command,
  Disposable,
  LibraryProgress,
  LibraryStatus,
  MediaLibrary,
  PagePanel,
  Permission,
  PluginContext,
  PluginManifest,
  SearchProvider,
  SettingsSection,
  SidebarItem,
  Store,
  ViewDefinition,
  Workspace,
} from "@betelgeuse/plugin-api";
import { api } from "../lib/api";
import { joinNote, patchFrontmatter, readFrontmatter, splitNote } from "../lib/frontmatter";
import { parseSchema } from "../database/model";
import { open as openExternal } from "../lib/links";
import * as kit from "./ui";

export const API_VERSION = 1;

type PluginInfo = { manifest: Record<string, unknown>; id: string; dir: string; source: "installed" | "dev" };

export type PluginStatus = "off" | "active" | "error" | "incompatible" | "loading";
export type PluginState = {
  id: string;
  manifest: PluginManifest;
  source: "installed" | "dev";
  enabled: boolean;
  status: PluginStatus;
  /** Why it failed or can't run. */
  problem?: string;
};

type Owned<T> = T & { pluginId: string };
export type Contributions = {
  views: Owned<ViewDefinition & { id: string }>[];
  sidebar: Owned<SidebarItem>[];
  settings: Owned<SettingsSection & { key: string }>[];
  pagePanels: Owned<PagePanel & { permissions: Permission[] }>[];
  commands: Owned<Command & { key: string }>[];
  search: Owned<SearchProvider>[];
};

/** What the app lends the runtime: navigation and messages. Set by App. */
export type Host = {
  openPath: (path: string, options?: { newTab?: boolean }) => void;
  toast: (message: string) => void;
  /** Opens Settings at a section (`plugin:<key>` for a plugin's own). */
  openSettings: (section: string) => void;
};

/** Tabs show a plugin's view when their "path" is `@plugin/<plugin id>/<view id>`. */
export const viewPath = (pluginId: string, viewId: string) => `@plugin/${pluginId}/${viewId}`;
export const parseViewPath = (path: string) => {
  const m = /^@plugin\/([a-z0-9-]+)\/(.+)$/.exec(path);
  return m ? { pluginId: m[1], viewId: m[2] } : null;
};

// ------------------------------------------------------------------------------------------------
// Store

let plugins: PluginState[] = [];
let contributions: Contributions = { views: [], sidebar: [], settings: [], pagePanels: [], commands: [], search: [] };
let host: Host | null = null;
let appVersion = "0.0.0";
const disposers = new Map<string, Disposable[]>();
const deactivators = new Map<string, () => void | Promise<void>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export const usePlugins = () => useSyncExternalStore(subscribe, () => plugins);
export const useContributions = () => useSyncExternalStore(subscribe, () => contributions);
export const setHost = (h: Host) => (host = h);

function setPlugin(id: string, patch: Partial<PluginState>) {
  plugins = plugins.map((p) => (p.id === id ? { ...p, ...patch } : p));
  emit();
}

function add<K extends keyof Contributions>(kind: K, item: Contributions[K][number]): Disposable {
  contributions = { ...contributions, [kind]: [...contributions[kind], item] };
  emit();
  const d = {
    dispose: () => {
      contributions = { ...contributions, [kind]: (contributions[kind] as unknown[]).filter((x) => x !== item) };
      emit();
    },
  };
  disposers.get(item.pluginId)?.push(d);
  return d;
}

// ------------------------------------------------------------------------------------------------
// Versions

const parse = (v: string) => (v.replace(/^v/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0).concat([0, 0, 0]).slice(0, 3)) as [number, number, number];
const cmp = (a: string, b: string) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

/** Whether `version` satisfies a range like ">=0.4.0 <1.0.0", "^0.4.0", "~0.4.1", "0.4.x" or "*". */
export function satisfies(version: string, range: string): boolean {
  return range
    .split("||")
    .some((alt) =>
      alt
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .every((c) => {
          if (c === "*" || c === "x") return true;
          const m = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(c)!;
          const [op, v] = [m[1] ?? "=", m[2]];
          if (/[x*]/.test(v)) {
            const parts = v.split(".");
            return parts.every((p, i) => p === "x" || p === "*" || parse(version)[i] === Number(p));
          }
          const d = cmp(version, v);
          const [M, mi] = parse(v);
          switch (op) {
            case ">=": return d >= 0;
            case "<=": return d <= 0;
            case ">": return d > 0;
            case "<": return d < 0;
            case "^": return d >= 0 && (M > 0 ? parse(version)[0] === M : parse(version)[1] === mi);
            case "~": return d >= 0 && parse(version)[0] === M && parse(version)[1] === mi;
            default: return d === 0;
          }
        }),
    );
}

/** Why a plugin can't run here, or null. */
export function incompatibility(m: PluginManifest, version = appVersion): string | null {
  if (!m.id || !m.name || !m.version) return "Its manifest is missing an id, name or version.";
  if (String(m.engines?.api ?? "") !== String(API_VERSION)) return `It's made for plugin API ${m.engines?.api ?? "?"}; this app has API ${API_VERSION}.`;
  if (m.engines?.betelgeuse && !satisfies(version, m.engines.betelgeuse)) return `It needs Betelgeuse ${m.engines.betelgeuse}; this is ${version}.`;
  if (m.platforms && !m.platforms.includes("desktop")) return "It isn't made for the desktop app.";
  return null;
}

// ------------------------------------------------------------------------------------------------
// Loading

/** Modules plugins can `require`. Anything else must be bundled into the plugin. */
const SHARED: Record<string, unknown> = {
  react: React,
  "react-dom": ReactDOM,
  "react-dom/client": ReactDOMClient,
  "react/jsx-runtime": JSXRuntime,
  "@betelgeuse/plugin-api": { API_VERSION, definePlugin: <T,>(p: T) => p },
  "@betelgeuse/plugin-api/ui": kit,
};

/** Loads the plugins for a workspace (after opening or switching it). */
export async function loadWorkspace(path: string) {
  void path; // the backend already knows the open workspace
  await unloadAll();
  appVersion = await getVersion().catch(() => appVersion);
  await refreshList();
  await migrateBuiltInStudio();
  for (const p of plugins) if (p.enabled && p.status === "off") await activate(p.id);
  void checkForUpdates();
}

/** The library plugin's id; it was "creator-studio" before it was renamed Media Library. */
const MEDIA_LIBRARY = "media-library";
const OLD_ID = "creator-studio";

/**
 * One-time moves for the media library:
 * - from the built-in feature (switched on in `.betelgeuse/studio.json`) to the plugin, carrying
 *   its pipeline settings into the plugin's data;
 * - from the plugin's first name (creator-studio) to media-library: the workspace's plugin list,
 *   its data, and the old installed copy.
 */
async function migrateBuiltInStudio() {
  type Legacy = { settings: { enabled: boolean; ignore: string[]; thumbnails: boolean; pipeline?: { database?: string | null } } };
  const id = MEDIA_LIBRARY;
  const enabled = await invoke<string[]>("plugins_enabled").catch((): string[] => []);
  const data = await invoke<Record<string, unknown>>("plugin_data_get", { id, scope: "workspace" });
  let changed = false;

  if (enabled.includes(OLD_ID)) {
    const old = await invoke<Record<string, unknown>>("plugin_data_get", { id: OLD_ID, scope: "workspace" });
    if (!data.pipeline && old.pipeline) await invoke("plugin_data_set", { id, scope: "workspace", value: { ...data, ...old } });
    await invoke("plugins_set_enabled", { ids: [...enabled.filter((x) => x !== OLD_ID), id] });
    if (plugins.some((p) => p.id === OLD_ID && p.source === "installed")) await invoke("plugin_uninstall", { id: OLD_ID }).catch(() => {});
    changed = true;
  }

  const legacy = await invoke<Legacy>("library_status").catch(() => null);
  if (legacy?.settings.enabled) {
    if (!data.pipeline && legacy.settings.pipeline?.database) {
      await invoke("plugin_data_set", { id, scope: "workspace", value: { ...data, pipeline: legacy.settings.pipeline } });
    }
    // The workspace now uses the plugin: it starts when it's here, and Settings offers it when it isn't.
    const now = await invoke<string[]>("plugins_enabled").catch((): string[] => []);
    if (!now.includes(id)) await invoke("plugins_set_enabled", { ids: [...now, id] });
    await invoke("library_set_settings", { settings: { ...legacy.settings, enabled: false } });
    changed = true;
  }

  if (!changed) return;
  await refreshList();
  if (!plugins.some((p) => p.id === id)) host?.toast("The Library is now the Media Library plugin. Install it in Settings → Plugins to keep using it.");
}

/** Re-reads which plugins are installed and enabled, keeping running ones as they are. */
export async function refreshList() {
  const [found, enabled] = await Promise.all([invoke<PluginInfo[]>("plugins_list"), invoke<string[]>("plugins_enabled").catch((): string[] => [])]);
  missing = enabled.filter((id) => !found.some((f) => f.id === id));
  plugins = found.map((f) => {
    const manifest = f.manifest as unknown as PluginManifest;
    const existing = plugins.find((p) => p.id === f.id);
    const problem = incompatibility(manifest);
    return {
      id: f.id,
      manifest,
      source: f.source,
      enabled: enabled.includes(f.id),
      status: existing?.status === "active" || existing?.status === "error" ? existing.status : problem ? "incompatible" : "off",
      problem: problem ?? (existing?.status === "error" ? existing.problem : undefined),
    };
  });
  emit();
}

async function unloadAll() {
  for (const p of plugins) if (p.status === "active") await deactivate(p.id);
}

export async function setEnabled(id: string, on: boolean) {
  const ids = plugins.filter((p) => (p.id === id ? on : p.enabled)).map((p) => p.id);
  await invoke("plugins_set_enabled", { ids });
  setPlugin(id, { enabled: on });
  if (on) await activate(id);
  else await deactivate(id);
}

/** Restarts a plugin with fresh code (after installing a new version, or in development). */
export async function reload(id: string) {
  await deactivate(id);
  await refreshList();
  if (plugins.find((p) => p.id === id)?.enabled) await activate(id);
}

// ------------------------------------------------------------------------------------------------
// The plugin store

export type StoreEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon: string;
  homepage: string;
  engines: PluginManifest["engines"];
  platforms: string[];
  permissions: string[];
  size: number;
};
export type StoreIndex = { plugins: StoreEntry[]; fetched: number; stale: boolean };

let store: StoreIndex | null = null;
let storeError: string | null = null;
const storeListeners = new Set<() => void>();
const storeSubscribe = (l: () => void) => (storeListeners.add(l), () => storeListeners.delete(l));
const storeEmit = () => storeListeners.forEach((l) => l());
export const useStore = () => ({ index: useSyncExternalStore(storeSubscribe, () => store), error: useSyncExternalStore(storeSubscribe, () => storeError) });

export async function loadStore(refresh = false) {
  try {
    store = await invoke<StoreIndex>("plugin_store_index", { refresh });
    storeError = null;
  } catch (e) {
    storeError = String(e);
  }
  storeEmit();
  return store;
}

/** A newer version in the store that this app can run, if there is one. */
export function updateFor(p: PluginState, index = store): StoreEntry | null {
  const entry = index?.plugins.find((e) => e.id === p.id);
  if (!entry || p.source !== "installed" || cmp(entry.version, p.manifest.version) <= 0) return null;
  return incompatibility(entry as unknown as PluginManifest) ? null : entry;
}

/** Installs (or updates) a plugin from the store, turns it on for this workspace and starts it. */
export async function installFromStore(id: string) {
  await invoke<string>("plugin_store_install", { id });
  await deactivate(id);
  await refreshList();
  const p = plugins.find((x) => x.id === id);
  if (p && !p.enabled) await setEnabled(id, true);
  else await activate(id);
}

const AUTO_UPDATE = "plugins:autoUpdate";
export const autoUpdates = () => localStorage.getItem(AUTO_UPDATE) !== "off";
export const setAutoUpdates = (on: boolean) => localStorage.setItem(AUTO_UPDATE, on ? "on" : "off");

/** In the background after start-up: fetch the store's list and update plugins (if allowed). */
async function checkForUpdates() {
  const index = await loadStore();
  if (!index || !autoUpdates()) return;
  for (const p of plugins) {
    const u = updateFor(p, index);
    if (!u) continue;
    try {
      await installFromStore(p.id);
      host?.toast(`${u.name} updated to ${u.version}`);
    } catch (e) {
      console.error(`[plugin ${p.id}] update`, e);
    }
  }
}

/** Plugins this workspace has turned on that aren't installed on this computer. */
let missing: string[] = [];
export const useMissing = () => useSyncExternalStore(subscribe, () => missing);

export async function installFromFolder(dir: string) {
  const id = await invoke<string>("plugin_install_folder", { path: dir });
  await deactivate(id);
  await refreshList();
  const p = plugins.find((x) => x.id === id);
  if (p && !p.enabled) await setEnabled(id, true);
  else await activate(id);
  return id;
}

export async function uninstall(id: string) {
  await setEnabled(id, false);
  await invoke("plugin_uninstall", { id });
  await refreshList();
}

export async function activate(id: string) {
  const p = plugins.find((x) => x.id === id);
  if (!p || p.status === "active" || p.status === "loading") return;
  const problem = incompatibility(p.manifest);
  if (problem) return setPlugin(id, { status: "incompatible", problem });
  setPlugin(id, { status: "loading", problem: undefined });
  disposers.set(id, []);
  try {
    const main = p.manifest.main ?? "main.js";
    const code = await invoke<string>("plugin_file", { id, file: main });
    const module: { exports: Record<string, unknown> } = { exports: {} };
    const require = (name: string) => {
      if (name in SHARED) return SHARED[name];
      throw new Error(`requires "${name}", which Betelgeuse doesn't provide: bundle it into the plugin`);
    };
    new Function("require", "module", "exports", `${code}\n//# sourceURL=betelgeuse-plugin://${id}/${main}`)(require, module, module.exports);
    const exp = (module.exports.activate ? module.exports : module.exports.default) as { activate?: (ctx: PluginContext) => unknown; deactivate?: () => unknown } | undefined;
    if (typeof exp?.activate !== "function") throw new Error("main.js doesn't export activate(ctx)");

    if (p.manifest.styles) {
      const css = await invoke<string>("plugin_file", { id, file: p.manifest.styles }).catch(() => "");
      if (css) {
        const style = document.createElement("style");
        style.dataset.plugin = id;
        style.textContent = css;
        document.head.append(style);
        disposers.get(id)!.push({ dispose: () => style.remove() });
      }
    }

    await exp.activate(makeContext(p));
    if (exp.deactivate) deactivators.set(id, exp.deactivate as () => void);
    setPlugin(id, { status: "active" });
  } catch (e) {
    console.error(`[plugin ${id}]`, e);
    disposeAll(id);
    setPlugin(id, { status: "error", problem: e instanceof Error ? e.message : String(e) });
  }
}

export async function deactivate(id: string) {
  const p = plugins.find((x) => x.id === id);
  if (!p || (p.status !== "active" && p.status !== "error")) return;
  try {
    await deactivators.get(id)?.();
  } catch (e) {
    console.error(`[plugin ${id}] deactivate`, e);
  }
  deactivators.delete(id);
  disposeAll(id);
  setPlugin(id, { status: "off", problem: undefined });
}

function disposeAll(id: string) {
  for (const d of (disposers.get(id) ?? []).reverse()) {
    try {
      d.dispose();
    } catch (e) {
      console.error(`[plugin ${id}] dispose`, e);
    }
  }
  disposers.delete(id);
}

/** Records a plugin crash in a view or panel, so Settings → Plugins shows it. */
export function reportCrash(id: string, error: unknown) {
  console.error(`[plugin ${id}]`, error);
  setPlugin(id, { problem: error instanceof Error ? error.message : String(error) });
}

// ------------------------------------------------------------------------------------------------
// The media library service

/** Plugins currently using the library; it scans and watches while there's at least one. */
const libraryUsers = new Set<string>();
const thumbs = new Map<string, Promise<string | null>>();

type RawStatus = Omit<LibraryStatus, "options"> & { settings: { enabled: boolean; ignore: string[]; thumbnails: boolean; pipeline: unknown } };

function libraryFor(id: string, track: (d: Disposable) => Disposable): MediaLibrary {
  libraryUsers.add(id);
  invoke("library_set_active", { on: true });
  track({
    dispose: () => {
      libraryUsers.delete(id);
      if (!libraryUsers.size) invoke("library_set_active", { on: false });
    },
  });
  const raw = () => invoke<RawStatus>("library_status");
  const event = <T,>(name: string, listener: (payload: T) => void) => {
    const un = listen<T>(name, (e) => listener(e.payload));
    return track({ dispose: () => void un.then((f) => f()) });
  };
  return {
    status: async () => {
      const { settings, ...rest } = await raw();
      return { ...rest, options: { ignore: settings.ignore, thumbnails: settings.thumbnails } };
    },
    onChange: (listener) => event("library-changed", () => listener()),
    onProgress: (listener) => event<LibraryProgress>("library-progress", listener),
    addFolder: async (path) => {
      const dir = path ?? (await openDialog({ directory: true, title: "Add a library folder" }));
      if (typeof dir === "string") await invoke("library_add_folder", { path: dir });
    },
    removeFolder: (name) => invoke("library_remove_folder", { name }),
    rescan: () => invoke("library_rescan"),
    pickFolder: async (title) => {
      const dir = await openDialog({ directory: true, title });
      return typeof dir === "string" ? dir : null;
    },
    setOptions: async (options) => {
      const { settings } = await raw();
      await invoke("library_set_settings", { settings: { ...settings, ...options } });
    },
    clearCache: async () => {
      await invoke("library_clear_cache");
      thumbs.clear();
    },
    search: (query) => invoke("library_search", { query }),
    folders: () => invoke("library_folders"),
    tags: () => invoke("library_tags"),
    subfolders: (folder) => invoke("library_subfolders", { id: folder }),
    folderExists: (folder) => invoke("library_folder_exists", { id: folder }),
    createFolder: (parent, name, template) => invoke("library_create_folder", { parent, name, template }),
    setMeta: (ids, patch) => invoke("library_set_meta", { ids, patch }),
    thumbnail: ({ id: asset, modified }) => {
      const key = `${asset}@${modified}`;
      let p = thumbs.get(key);
      if (!p) {
        p = invoke<ArrayBuffer>("library_thumbnail", { id: asset })
          .then((buf) => (buf.byteLength ? URL.createObjectURL(new Blob([buf])) : null))
          .catch(() => null);
        thumbs.set(key, p);
      }
      return p;
    },
    fileUrl: ({ path }) => convertFileSrc(path),
    open: (target) => invoke("library_open", { id: target, with: null }),
    reveal: (target) => invoke("library_reveal", { id: target }),
  };
}

// ------------------------------------------------------------------------------------------------
// The context each plugin gets

function makeContext(p: PluginState): PluginContext {
  const id = p.id;
  const perms = new Set(p.manifest.permissions ?? []);
  const own = <T extends object>(item: T) => ({ ...item, pluginId: id });
  const track = (d: Disposable) => (disposers.get(id)?.push(d), d);
  const needs = (perm: Permission) => {
    if (!perms.has(perm)) throw new Error(`Plugin ${id} needs the "${perm}" permission for this.`);
  };

  const store = (scope: "workspace" | "local"): Store => ({
    get: () => invoke("plugin_data_get", { id, scope }),
    set: (value) => invoke("plugin_data_set", { id, scope, value }),
    update: async (change) => {
      const now = await invoke<Record<string, unknown>>("plugin_data_get", { id, scope });
      await invoke("plugin_data_set", { id, scope, value: change(now as never) });
    },
  });

  const workspaceApi: Workspace | undefined = perms.has("workspace:read")
    ? {
        listPages: () => api.listNotes(),
        readPage: async (path) => {
          const { frontmatter, body } = splitNote(await api.readNote(path));
          return { properties: readFrontmatter(frontmatter), body };
        },
        databaseRows: async (path) =>
          (await api.databaseRows(path)).map((r) => ({ path: r.path, title: r.title, properties: readFrontmatter(splitNote(r.content).frontmatter) })),
        databaseSchema: async (path) =>
          parseSchema(splitNote(await api.readNote(path)).body).properties.map((p) => ({
            name: p.name,
            type: p.type,
            options: p.options?.map((o) => ({ name: o.name, color: o.color })),
          })),
        openPage: (path, options) => host?.openPath(path, options),
        onChange: (listener) => {
          let timer: number | undefined;
          const un = listen("vault-changed", () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(listener, 300);
          });
          return track({ dispose: () => (window.clearTimeout(timer), un.then((f) => f())) });
        },
        createPage: async (parent, title) => (needs("workspace:write"), api.createNote(parent, title)),
        writePage: async (path, body) => {
          needs("workspace:write");
          const { frontmatter } = splitNote(await api.readNote(path));
          await api.writeNote(path, joinNote(frontmatter, body));
        },
        setProperties: async (path, patch) => {
          needs("workspace:write");
          const { frontmatter, body } = splitNote(await api.readNote(path));
          await api.writeNote(path, joinNote(patchFrontmatter(frontmatter, patch), body));
        },
      }
    : undefined;

  const hosts = [...perms].filter((x) => x.startsWith("network:")).map((x) => x.slice(8).toLowerCase());
  const allowed = (url: string) => {
    try {
      const h = new URL(url).hostname.toLowerCase();
      return hosts.some((a) => a === h || (a.startsWith("*.") && h.endsWith(a.slice(1))));
    } catch {
      return false;
    }
  };

  return {
    manifest: p.manifest,
    app: { version: appVersion, apiVersion: 1, platform: "desktop" },
    views: {
      register: (viewId, view) => add("views", own({ ...view, id: viewId })),
      open: (viewId, options) => host?.openPath(viewPath(id, viewId), options),
    },
    sidebar: { register: (item) => add("sidebar", own(item)) },
    settings: {
      register: (section) => add("settings", own({ ...section, key: `${id}:${section.title}` })),
      open: () => {
        const mine = contributions.settings.find((x) => x.pluginId === id);
        host?.openSettings(mine ? `plugin:${mine.key}` : "plugins");
      },
    },
    pagePanels: { register: (panel) => add("pagePanels", own({ ...panel, permissions: [...perms] })) },
    commands: {
      register: (command) => add("commands", own({ ...command, key: `${id}.${command.id}` })),
      run: async (commandId) => {
        const c = contributions.commands.find((x) => x.key === (commandId.includes(".") ? commandId : `${id}.${commandId}`));
        if (!c) throw new Error(`No command ${commandId}`);
        await c.run();
      },
    },
    search: { register: (provider) => add("search", own(provider)) },
    storage: { workspace: store("workspace"), local: store("local") },
    ui: {
      toast: (message) => host?.toast(message),
      confirm: (message, options) => confirm(message, { title: p.manifest.name, kind: options?.danger ? "warning" : "info", okLabel: options?.confirmLabel ?? "OK" }),
    },
    workspace: workspaceApi,
    library: perms.has("library") ? libraryFor(id, track) : undefined,
    shell: perms.has("shell:open") ? { openUrl: async (url) => void (await openExternal(url)) } : undefined,
    http: hosts.length
      ? {
          fetch: (url, init) => {
            if (!allowed(url)) return Promise.reject(new Error(`Plugin ${id} may not connect to ${url}: add "network:<host>" to its permissions.`));
            return window.fetch(url, init);
          },
        }
      : undefined,
    subscriptions: new Proxy([] as Disposable[], {
      // Anything pushed here is disposed with the plugin.
      set(target, key, value) {
        if (key !== "length" && value && typeof value.dispose === "function") disposers.get(id)?.push(value);
        return Reflect.set(target, key, value);
      },
    }),
    log: (...args) => console.log(`[plugin ${id}]`, ...args),
  };
}

/** Plain-language descriptions of permissions, for install prompts and Settings. */
export function describePermission(perm: string): string {
  if (perm === "workspace:read") return "Read your pages and databases";
  if (perm === "workspace:write") return "Create and change pages";
  if (perm === "shell:open") return "Open links and files in other apps";
  if (perm === "library") return "Index the folders you choose and preview their files";
  if (perm.startsWith("network:")) return `Connect to ${perm.slice(8)}`;
  return perm;
}
