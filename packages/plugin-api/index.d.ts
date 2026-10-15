/**
 * The Betelgeuse plugin API, version 1.
 *
 * A plugin is a CommonJS bundle (`main.js`) that exports `activate(ctx)` (and optionally
 * `deactivate()`), plus a manifest, `betelgeuse-plugin.json`. Build it with the preset in
 * `@betelgeuse/plugin-api/vite`. React, ReactDOM and this package are provided by the app at run
 * time, so plugins don't bundle them.
 *
 * Everything a plugin registers returns a `Disposable`. Things registered through `ctx` are
 * disposed automatically when the plugin is turned off, so a plugin leaves no trace.
 */
import type { ComponentType, ReactNode } from "react";

/** The plugin API version this package describes. Plugins declare it in `engines.api`. */
export declare const API_VERSION: 1;

/** Identity helper that gives `activate` its types: `export const { activate } = definePlugin({ activate(ctx) {…} })`. */
export declare function definePlugin<T extends Plugin>(plugin: T): T;

export interface Plugin {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

// ------------------------------------------------------------------------------------------------
// Manifest

/** `betelgeuse-plugin.json`. */
export interface PluginManifest {
  /** Lowercase letters, digits and dashes; unique in the registry. */
  id: string;
  name: string;
  /** Semver. */
  version: string;
  description?: string;
  author?: string;
  /** An emoji, shown in the plugin list. */
  icon?: string;
  homepage?: string;
  engines: {
    /** Semver range of Betelgeuse versions, e.g. ">=0.4.0 <1.0.0". */
    betelgeuse: string;
    /** Plugin API major version: "1". */
    api: string;
  };
  /** Where it runs. Defaults to ["desktop"]. */
  platforms?: ("desktop" | "mobile")[];
  /** Defaults to "main.js". */
  main?: string;
  /** Optional stylesheet, e.g. "styles.css". */
  styles?: string;
  /** What the plugin may do. Shown before installing; the API enforces it. */
  permissions?: Permission[];
  /** Kept out of the plugin store (examples, internal tools). */
  private?: boolean;
}

export type Permission =
  /** List and read pages and database rows. */
  | "workspace:read"
  /** Create pages and change their content and properties. */
  | "workspace:write"
  /** Open web links and files in other apps. */
  | "shell:open"
  /** Index folders the person picks and preview their files (`ctx.library`). */
  | "library"
  /** `ctx.http.fetch` to this host, e.g. "network:api.unsplash.com". */
  | `network:${string}`;

// ------------------------------------------------------------------------------------------------
// Context

export interface Disposable {
  dispose(): void;
}

export interface PluginContext {
  readonly manifest: PluginManifest;
  readonly app: AppInfo;

  /** Tab views: full-height screens opened in tabs, like pages. */
  readonly views: Views;
  /** Items in the sidebar's top group. */
  readonly sidebar: Sidebar;
  /** A section in Settings. */
  readonly settings: SettingsSections;
  /** Panels on pages, below the properties. */
  readonly pagePanels: PagePanels;
  /** Commands in ⌘K. */
  readonly commands: Commands;
  /** Result groups in ⌘K search. */
  readonly search: SearchProviders;

  /** Saved data: `workspace` syncs with the notes (git); `local` stays on this computer. */
  readonly storage: { readonly workspace: Store; readonly local: Store };
  /** Messages and dialogs. */
  readonly ui: Ui;

  /** Pages and databases. Present with the "workspace:read" permission. */
  readonly workspace?: Workspace;
  /** Present with the "shell:open" permission. */
  readonly shell?: Shell;
  /** Present with at least one "network:<host>" permission; only those hosts are allowed. */
  readonly http?: Http;
  /** The media library: index folders, search files, previews. Present with the "library" permission. */
  readonly library?: MediaLibrary;

  /** Extra disposables to clean up when the plugin is turned off. */
  readonly subscriptions: Disposable[];
  /** Logs to the developer console, prefixed with the plugin's id. */
  readonly log: (...args: unknown[]) => void;
}

export interface AppInfo {
  /** Betelgeuse's version, e.g. "0.4.0". */
  version: string;
  apiVersion: 1;
  platform: "desktop" | "mobile";
}

/** What shows next to a title: an emoji or text, or a React element (an icon). */
export type Icon = ReactNode;

// ------------------------------------------------------------------------------------------------
// Contribution points

export interface Views {
  register(id: string, view: ViewDefinition): Disposable;
  /** Opens a view of this plugin, in the current tab or a new one. */
  open(id: string, options?: { newTab?: boolean }): void;
}

export interface ViewDefinition {
  title: string;
  icon?: Icon;
  component: ComponentType<ViewProps>;
}

export interface ViewProps {
  /** The tab's view id. */
  viewId: string;
}

export interface Sidebar {
  register(item: SidebarItem): Disposable;
}

export interface SidebarItem {
  id: string;
  title: string;
  icon?: Icon;
  /** Opens this view of the plugin… */
  view?: string;
  /** …or runs this. */
  onClick?: () => void;
}

export interface SettingsSections {
  register(section: SettingsSection): Disposable;
  /** Opens Settings at this plugin's section. */
  open(): void;
}

export interface SettingsSection {
  title: string;
  icon?: Icon;
  component: ComponentType;
}

export interface PagePanels {
  register(panel: PagePanel): Disposable;
}

export interface PagePanel {
  id: string;
  /** Shown only on pages this returns true for (all pages if omitted). */
  when?: (page: PageInfo) => boolean;
  component: ComponentType<{ page: PageInfo }>;
}

/** The page a panel is shown on. */
export interface PageInfo {
  /** Vault path, e.g. "Projects/Launch.md". */
  path: string;
  title: string;
  /** Its properties (frontmatter), as plain values. */
  properties: Record<string, unknown>;
  isDatabase: boolean;
  /** For database rows: the database's path. */
  database: string | null;
  /** Sets or (with null) removes properties. Needs "workspace:write". */
  setProperties(patch: Record<string, unknown>): Promise<void>;
}

export interface Commands {
  register(command: Command): Disposable;
  run(id: string): Promise<void>;
}

export interface Command {
  /** Unique within the plugin. */
  id: string;
  title: string;
  run(): void | Promise<void>;
}

export interface SearchProviders {
  register(provider: SearchProvider): Disposable;
}

export interface SearchProvider {
  id: string;
  /** The group's heading in ⌘K, e.g. "Files". */
  title: string;
  /** Called as the person types (debounced). Return at most a handful of results. */
  search(query: string): Promise<SearchResult[]>;
}

export interface SearchResult {
  id: string;
  title: string;
  detail?: string;
  icon?: Icon;
  run(): void;
}

// ------------------------------------------------------------------------------------------------
// Services

/** A JSON object store. */
export interface Store {
  get<T extends object = Record<string, unknown>>(): Promise<Partial<T>>;
  set(value: object): Promise<void>;
  /** Reads, changes and saves in one go. */
  update<T extends object = Record<string, unknown>>(change: (value: Partial<T>) => Partial<T>): Promise<void>;
}

export interface Ui {
  toast(message: string): void;
  confirm(message: string, options?: { confirmLabel?: string; danger?: boolean }): Promise<boolean>;
}

export interface PageMeta {
  path: string;
  title: string;
  icon: string | null;
  tags: string[];
  /** "database" for databases. */
  kind: string | null;
  modified: number;
  created: number;
}

export interface Workspace {
  /** Every page in the workspace (without content). */
  listPages(): Promise<PageMeta[]>;
  /** A page's properties and Markdown body. */
  readPage(path: string): Promise<{ properties: Record<string, unknown>; body: string }>;
  /** A database's rows, with their properties. */
  databaseRows(path: string): Promise<{ path: string; title: string; properties: Record<string, unknown> }[]>;
  /** A database's properties (columns): name, type, and options for selects. */
  databaseSchema(path: string): Promise<{ name: string; type: string; options?: { name: string; color: string }[] }[]>;
  /** Opens a page in the app. */
  openPage(path: string, options?: { newTab?: boolean }): void;
  /** Called after pages change on disk (any page, by anyone). */
  onChange(listener: () => void): Disposable;

  // These need "workspace:write".
  /** Creates an empty page; returns its path. Pages may share a title (the file is numbered). */
  createPage(parent: string | null, title: string): Promise<string>;
  writePage(path: string, body: string): Promise<void>;
  setProperties(path: string, patch: Record<string, unknown>): Promise<void>;
  /**
   * Renames a page (links to it follow); returns its path, which may change. Since Betelgeuse
   * 0.4.1: check it exists before calling it from a plugin that supports older versions.
   */
  renamePage?(path: string, title: string): Promise<string>;
  /** Moves a page (and its sub-pages) to the Trash, where it can be restored. Since Betelgeuse 0.4.1. */
  deletePage?(path: string): Promise<void>;
}

export interface Shell {
  openUrl(url: string): Promise<void>;
}

export interface Http {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

// ------------------------------------------------------------------------------------------------
// Media library (permission "library")

/**
 * An index of the files in folders the person picks (footage, photos, audio, design and project
 * files), kept up to date as files change, with media details and thumbnails. Files are only read,
 * never moved or uploaded. One library per workspace, shared by the plugins that use it; it scans
 * and watches only while at least one of them is active.
 */
export interface MediaLibrary {
  status(): Promise<LibraryStatus>;
  /** Called when the index changes (files added, changed, details read). */
  onChange(listener: () => void): Disposable;
  /** Called as scanning progresses. */
  onProgress(listener: (progress: LibraryProgress) => void): Disposable;

  /** Asks the person for a folder to add (or adds `path`). */
  addFolder(path?: string): Promise<void>;
  /** Forgets a folder's index; its files aren't touched. */
  removeFolder(name: string): Promise<void>;
  rescan(): Promise<void>;
  /** Shows a folder picker; returns the absolute path, or null if cancelled. */
  pickFolder(title?: string): Promise<string | null>;
  setOptions(options: { ignore?: string[]; thumbnails?: boolean }): Promise<void>;
  clearCache(): Promise<void>;

  search(query: LibraryQuery): Promise<LibraryResult>;
  /** Folders that hold files, with how many: `[id, count]`. */
  folders(): Promise<[string, number][]>;
  tags(): Promise<[string, number][]>;
  /** Sub-folder names of a folder, read from disk. */
  subfolders(id: string): Promise<string[]>;
  folderExists(id: string): Promise<boolean>;
  /** Creates `<parent>/<name>` with the given sub-folders; returns its id. */
  createFolder(parent: string, name: string, subfolders: string[]): Promise<string>;
  /** Tags, rating and notes (saved in the workspace; they follow files that move). */
  setMeta(ids: string[], patch: MetaPatch): Promise<void>;

  /** An object URL for the file's thumbnail, or null when there isn't one. */
  thumbnail(asset: Pick<Asset, "id" | "modified">): Promise<string | null>;
  /** A URL that plays or shows the file itself in `<video>`, `<audio>` or `<img>`. */
  fileUrl(asset: Pick<Asset, "path">): string;
  /** Opens a file or folder (by id) in its app, or reveals it in Finder/Explorer. */
  open(id: string): Promise<void>;
  reveal(id: string): Promise<void>;
}

export type AssetKind = "video" | "audio" | "image" | "raw" | "design" | "project" | "font" | "document" | "other";

export interface Asset {
  /** `<library folder name>/<path inside it>`: the same on every computer. */
  id: string;
  root: string;
  rel: string;
  name: string;
  ext: string;
  kind: AssetKind;
  size: number;
  modified: number;
  created: number;
  width: number | null;
  height: number | null;
  /** Seconds. */
  duration: number | null;
  fps: number | null;
  codec: string | null;
  /** Its folder's drive isn't connected. */
  offline: boolean;
  tags: string[];
  rating: number;
  notes: string;
  /** Absolute path on this computer. */
  path: string;
}

export interface LibraryStatus {
  options: { ignore: string[]; thumbnails: boolean };
  roots: { name: string; path: string; files: number; exists: boolean }[];
  active: boolean;
  scanning: boolean;
  lastScan: number | null;
  total: number;
  ffmpeg: string | null;
  ffprobe: string | null;
  cacheBytes: number;
}

export type LibraryProgress = { phase: "idle" | "scanning" | "probing"; done?: number; total?: number };

export interface LibraryQuery {
  /** Free text plus filters: `goa kind:video duration:>30 #broll ext:psd rating:>=4`. */
  text?: string;
  kinds?: AssetKind[];
  /** Only files under this folder id. */
  folder?: string | null;
  tags?: string[];
  list?: "recent" | "favorites" | "untagged" | null;
  sort?: "relevance" | "modified" | "name" | "size" | "duration";
  desc?: boolean;
  limit?: number;
}

export interface LibraryResult {
  hits: Asset[];
  total: number;
  /** Matches per kind, ignoring the kind filter. */
  kinds: Partial<Record<AssetKind, number>>;
}

export interface MetaPatch {
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  rating?: number;
  notes?: string;
}
