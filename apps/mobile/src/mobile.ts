import { createContext, useContext } from "react";
import type { ToastData } from "@desktop/components/Toast";
import type { Sync } from "./sync";

/** The screens. Home is the page list; the others stack on top of it, each a step back can undo. */
export type Route =
  | { name: "home" }
  /** `id` tells screens apart: a renamed or moved page keeps its screen, with the new path. */
  | { name: "page"; path: string; id?: number }
  | { name: "search" }
  | { name: "settings" }
  | { name: "sync" }
  | { name: "trash" }
  /** A plugin's view, by its path: `@plugin/<plugin>/<view>`. */
  | { name: "plugin"; path: string }
  | { name: "plugins" }
  | { name: "plugin-settings"; key: string };

/** What the phone app adds to the shared vault context: its screens, lists and page actions. */
export type MobileApp = {
  favorites: string[];
  /** Recently opened pages, newest first. */
  recents: string[];
  go: (route: Route) => void;
  back: () => void;
  /** A new page in the Inbox (if there is one), opened ready to type. */
  newPage: (title?: string) => Promise<void>;
  toggleFavorite: (path: string) => void;
  /** Moves the page to the Trash, with Undo. */
  deletePage: (path: string) => Promise<void>;
  duplicatePage: (path: string) => Promise<void>;
  /** Moves a page (and its sub-pages) into `dest` (a page's sub-pages, or "" for the top level). */
  movePage: (path: string, dest: string) => Promise<void>;
  /** Opens the page actions sheet (favorite, add inside, move, duplicate, trash…). */
  pageActions: (path: string) => void;
  /** Opens the sheet that moves a page somewhere else. */
  moveSheet: (path: string) => void;
  toast: (t: ToastData) => void;
  /** Syncing with the workspace's git repository. */
  sync: Sync;
  /** Follows a rename: Recents, Favorites and the current screen move to the new path. */
  renamed: (from: string, to: string) => Promise<void>;
};

export const MobileContext = createContext<MobileApp | null>(null);

export function useMobile(): MobileApp {
  const m = useContext(MobileContext);
  if (!m) throw new Error("useMobile outside MobileContext");
  return m;
}

export const titleOf = (path: string) => path.replace(/^.*\//, "").replace(/\.md$/, "");
export const parentOf = (path: string) => (path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}.md` : null);
