import type { AiPolicy, NoteMeta } from "./api";

export type AiAccess = {
  visible: boolean;
  /** Why: set on this page, inherited from a parent page, or the workspace default. */
  source: "page" | "parent" | "default";
  /** The parent page the setting comes from, when inherited. */
  from?: NoteMeta;
};

/**
 * Mirrors the MCP server's rule: a page is hidden if it or any parent page has `ai: false`.
 * Under the "shared" policy it must also have `ai: true` on itself or a parent.
 */
export function aiAccess(path: string, notes: NoteMeta[], policy: AiPolicy): AiAccess {
  const byPath = new Map(notes.map((n) => [n.path, n]));
  let shared: NoteMeta | undefined;
  for (let page: string | null = path; page; page = page.includes("/") ? `${page.slice(0, page.lastIndexOf("/"))}.md` : null) {
    const note = byPath.get(page);
    if (note?.ai === false) return { visible: false, source: page === path ? "page" : "parent", from: page === path ? undefined : note };
    if (note?.ai === true && !shared) shared = note;
  }
  if (shared) return { visible: true, source: shared.path === path ? "page" : "parent", from: shared.path === path ? undefined : shared };
  return { visible: policy === "all", source: "default" };
}

/** The frontmatter value that makes a page visible or hidden under `policy` (null = follow the default). */
export const aiValueFor = (visible: boolean, policy: AiPolicy): boolean | null =>
  policy === "all" ? (visible ? null : false) : visible ? true : null;
