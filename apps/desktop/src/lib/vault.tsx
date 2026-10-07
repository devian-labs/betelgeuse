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

/** Clicking a database row peeks it; ⌘/Ctrl-click (or middle-click) opens it in a new tab. */
export function useOpenRow() {
  const { peek, openPage } = useVault();
  return (path: string, e: { metaKey: boolean; ctrlKey: boolean; button?: number }) => (wantsNewTab(e) ? openPage(path, { newTab: true }) : peek(path));
}
