import { createContext, useContext } from "react";
import type { AiPolicy, NoteMeta } from "./api";

/** App-wide vault actions, available to editor node views and database views. */
export type VaultContextValue = {
  notes: NoteMeta[];
  /** Bumped whenever files change on disk. */
  refreshKey: number;
  openPage: (path: string) => void;
  /** Opens a page in the side peek panel, like clicking a Notion database row. */
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
