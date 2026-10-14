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
}

export type Permission =
  /** List and read pages and database rows. */
  | "workspace:read"
  /** Create pages and change their content and properties. */
  | "workspace:write"
  /** Open web links and files in other apps. */
  | "shell:open"
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
  /** Opens a page in the app. */
  openPage(path: string, options?: { newTab?: boolean }): void;
  /** Called after pages change on disk (any page, by anyone). */
  onChange(listener: () => void): Disposable;

  // These need "workspace:write".
  createPage(parent: string | null, title: string): Promise<string>;
  writePage(path: string, body: string): Promise<void>;
  setProperties(path: string, patch: Record<string, unknown>): Promise<void>;
}

export interface Shell {
  openUrl(url: string): Promise<void>;
}

export interface Http {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}
