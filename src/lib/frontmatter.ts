import { Document, isMap, parseDocument } from "yaml";

/** Splits a note into its raw YAML frontmatter (without fences) and Markdown body. */
export function splitNote(content: string): { frontmatter: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/.exec(content);
  if (!m) return { frontmatter: "", body: content };
  return { frontmatter: m[1], body: content.slice(m[0].length) };
}

export function joinNote(frontmatter: string, body: string): string {
  const fm = frontmatter.trim();
  return fm ? `---\n${fm}\n---\n${body}` : body;
}

/** Parses frontmatter into plain values; malformed YAML reads as empty rather than throwing. */
export function readFrontmatter(frontmatter: string): Record<string, unknown> {
  if (!frontmatter.trim()) return {};
  try {
    const value = parseDocument(frontmatter).toJS();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Sets (or, for empty values, removes) top-level keys while preserving the rest of the
 * YAML — comments, ordering and formatting included. Lists are written in `[a, b]` style.
 */
export function patchFrontmatter(frontmatter: string, patch: Record<string, unknown>): string {
  const doc: Document = frontmatter.trim() ? parseDocument(frontmatter) : new Document({});
  if (!isMap(doc.contents)) return frontmatter;
  for (const [key, value] of Object.entries(patch)) {
    if (isEmpty(value)) doc.delete(key);
    else doc.set(key, doc.createNode(value, { flow: Array.isArray(value) }));
  }
  if (!doc.contents.items.length) return "";
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd();
}

export const getString = (fm: Record<string, unknown>, key: string): string | undefined => {
  const v = fm[key];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
};

export function frontmatterTags(frontmatter: string): string[] {
  const tags = readFrontmatter(frontmatter).tags;
  return Array.isArray(tags) ? tags.map(String) : typeof tags === "string" ? [tags] : [];
}
