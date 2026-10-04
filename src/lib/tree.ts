import type { NoteMeta } from "./api";
import { compareSiblings, orderOf } from "./order";

export type TreeNode = {
  /** Folder path the node's children live in (`A/B` for `A/B.md`). */
  key: string;
  note: NoteMeta | null;
  title: string;
  children: TreeNode[];
};

/** Builds the page tree: `A/B.md` nests under `A.md`, or under a plain folder `A` if there is no such note. */
export function buildTree(notes: NoteMeta[]): TreeNode[] {
  const root: TreeNode = { key: "", note: null, title: "", children: [] };
  const byKey = new Map<string, TreeNode>([["", root]]);

  const ensure = (key: string): TreeNode => {
    const existing = byKey.get(key);
    if (existing) return existing;
    const slash = key.lastIndexOf("/");
    const parent = ensure(slash < 0 ? "" : key.slice(0, slash));
    const node: TreeNode = { key, note: null, title: key.slice(slash + 1), children: [] };
    parent.children.push(node);
    byKey.set(key, node);
    return node;
  };

  for (const note of notes) {
    const node = ensure(note.path.replace(/\.md$/, ""));
    node.note = note;
    node.title = note.title;
  }

  // Manual `order` first, then A–Z; plain folders have no file to hold an order.
  const key = (n: TreeNode) => ({ order: orderOf(n.note?.order), title: n.title });
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => compareSiblings(key(a), key(b)));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

/** Ancestors of a note path, for breadcrumbs: `A/B/C.md` -> [`A`, `A/B`]. */
export function ancestorKeys(path: string): string[] {
  const parts = path.replace(/\.md$/, "").split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function resolveWikiLink(target: string, notes: NoteMeta[]): NoteMeta | undefined {
  const t = target.split("#")[0].replace(/\.md$/, "").trim().toLowerCase();
  return (
    notes.find((n) => n.path.replace(/\.md$/, "").toLowerCase() === t) ??
    notes.find((n) => n.title.toLowerCase() === t)
  );
}
