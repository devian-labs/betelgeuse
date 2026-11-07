import { createContext, useContext } from "react";
import type { AiPolicy, NoteMeta } from "./api";
import { wantsNewTab, type OpenOptions } from "./nav";

/** App-wide vault actions, available to editor node views and database views. */
export type VaultContextValue = {
  notes: NoteMeta[];
  /** Bumped whenever files change on disk. */
  refreshKey: number;
  /** Opens a page in the current tab, or a new one with `{ newTab: true }`. */
  openPage: (path: string, opts?: OpenOptions) => void;
  /** Opens a page in the side peek panel, as clicking a database row does. */
  peek: (path: string) => void;
  createPage: (parent: string | null, title?: string) => Promise<string>;
  refresh: () => Promise<NoteMeta[]>;
  /**
   * After a rename (the file and its sub-pages moved, links rewritten across the vault): follows
   * the new paths in tabs, Recents, Favorites and the peek panel, and reloads every open page and
   * database so none of them shows, or saves back, the old names.
   */
  renamed: (oldPath: string, newPath: string) => Promise<void>;
  aiPolicy: AiPolicy;
  /** Shows or hides a page from AI agents (writes its `ai` frontmatter). */
  setPageAi: (path: string, visible: boolean) => Promise<void>;
};

export const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const v = useContext(VaultContext);
  if (!v) throw new Error("useVault outside VaultContext");
  return v;
}

/** How the database view around a row opens its pages: in the side peek, or as the full page. */
export const OpenRowsIn = createContext<"peek" | "full">("peek");

/**
 * Clicking a database row opens it as its view says (the side peek unless set to full page);
 * ⌘/Ctrl-click (or middle-click) opens it in a new tab.
 */
export function useOpenRow() {
  const { peek, openPage } = useVault();
  const mode = useContext(OpenRowsIn);
  return (path: string, e: { metaKey: boolean; ctrlKey: boolean; button?: number }) =>
    wantsNewTab(e) ? openPage(path, { newTab: true }) : mode === "full" ? openPage(path) : peek(path);
}
