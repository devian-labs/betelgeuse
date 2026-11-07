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
    const doc = parseDocument(frontmatter);
    // One malformed value (an unquoted colon, a stray dash) shouldn't spoil the rest.
    if (doc.errors.length) return readLeniently(frontmatter);
    const value = doc.toJS();
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  } catch {
    return {};
  }
}

/**
 * Reads frontmatter that has YAML errors one top-level entry at a time (a line starting a key, plus
 * the indented lines under it), so one malformed value doesn't spoil the others. A value YAML can't
 * read, like `Idea: "Wrong video": on a call` or `Goal: - Recursion`, is kept as the text written.
 */
function readLeniently(frontmatter: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const entries: string[][] = [];
  for (const line of frontmatter.split(/\r?\n/)) {
    if (/^[^\s#-][^:]*:/.test(line) || !entries.length) entries.push([line]);
    else entries[entries.length - 1].push(line);
  }
  for (const lines of entries) {
    const m = /^([^\s#-][^:]*):(.*)$/.exec(lines[0]);
    if (!m) continue;
    const key = m[1].trim();
    const doc = parseDocument(lines.join("\n"));
    const value = doc.errors.length ? undefined : (doc.toJS() as Record<string, unknown> | null)?.[key];
    out[key] = value !== undefined ? value : [m[2], ...lines.slice(1)].join("\n").trim();
  }
  return out;
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Sets (or, for empty values, removes) top-level keys while preserving the rest of the
 * YAML — comments, ordering and formatting included. Lists are written in `[a, b]` style.
 */
export function patchFrontmatter(frontmatter: string, patch: Record<string, unknown>): string {
  let doc: Document = frontmatter.trim() ? parseDocument(frontmatter) : new Document({});
  // YAML with errors can't be written back as is: start from the values as read (malformed lines
  // recovered as text), which also repairs it.
  if (doc.errors.length) doc = new Document(readFrontmatter(frontmatter));
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

/** A page's file name without `.md`: its id among its siblings, and what `[[links]]` name. */
export const fileTitle = (path: string) => path.replace(/^.*\//, "").replace(/\.md$/, "");

/**
 * A page's name: its `title` frontmatter when it has one (pages in one place may share a name,
 * their files numbered "Salary 2.md"), else its file name.
 */
export function pageTitle(path: string, frontmatter: string): string {
  const t = getString(readFrontmatter(frontmatter), "title")?.trim();
  return t || fileTitle(path);
}
