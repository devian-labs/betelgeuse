/**
 * What the shared interface asks of the app it runs in. The desktop and phone apps answer with Tauri
 * (`./tauri`); the web app answers with the browser and a GitHub repository. Nothing else in this
 * package may import `@tauri-apps/*`, so the interface runs anywhere a platform is installed.
 *
 * `invoke` keeps the backend's command names and arguments: lib/api.ts and the plugin runtime talk
 * to whichever backend is installed in the same words.
 */
export type PlatformKind = "desktop" | "mobile" | "web";

/** A newer release, from the desktop app's updater. */
export type AppUpdate = {
  version: string;
  downloadAndInstall: (progress: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void>;
};

export type Platform = {
  kind: PlatformKind;
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
  openUrl: (url: string) => Promise<void>;
  confirm: (message: string, options?: { title?: string; kind?: "info" | "warning" | "error"; okLabel?: string }) => Promise<boolean>;
  message: (message: string, options?: { title?: string; kind?: "info" | "warning" | "error" }) => Promise<void>;
  /** Asks for a folder on this computer, where there is one to ask for. */
  pickFolder: (title: string) => Promise<string | null>;
  /** Asks for a Notion export (a zip or folder) or an Obsidian vault, for the importer. */
  pickImport: (options: { directory: boolean; title: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  version: () => Promise<string>;
  /** A URL the webview can load for a file on this computer. */
  fileUrl: (path: string) => string;
  /** Whether the window hides its own controls (macOS traffic lights); the sidebar makes room otherwise. */
  watchFullscreen?: (changed: (fullscreen: boolean) => void) => () => void;
  /** Self-updating, where the app can replace itself. */
  updates?: { check: () => Promise<AppUpdate | null>; relaunch: () => Promise<void> };
  /** Things that need a computer's files and processes. The interface leaves out what's unavailable. */
  features: {
    /** Local AI agents over MCP. */
    agents: boolean;
    /** Importing from Notion and Obsidian. */
    importer: boolean;
    /** Installing a plugin from a folder. */
    pluginFolders: boolean;
    /** Choosing the git remote and commit author (the web app works on one repository, as its user). */
    gitRemote: boolean;
    /** The window has controls of its own in the sidebar's corner. */
    windowControls: boolean;
  };
  /** Replaces the folder picker when workspaces aren't folders. */
  switchWorkspace?: () => void;
  /** Who's signed in, where that's a thing. */
  account?: { name: string; signOut: () => void | Promise<void> };
  /** Build-time values. */
  env: { dev: boolean; unsplashKey: string };
};

let current: Platform | null = null;

/** Installed once, before the interface renders. */
export function installPlatform(platform: Platform) {
  current = platform;
}

/** The app's platform. Throws if none is installed: nothing calls this while modules load. */
export function platform(): Platform {
  if (!current) throw new Error("No platform installed: call installPlatform() before rendering");
  return current;
}

/** Whether a platform is installed yet (tests load modules without one). */
export const hasPlatform = () => current !== null;

export const invoke = <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
  try {
    return platform().invoke<T>(command, args);
  } catch (e) {
    return Promise.reject(e);
  }
};
export const listen = <T,>(event: string, handler: (event: { payload: T }) => void) => platform().listen<T>(event, handler);
