/**
 * The workspace's rules, over a repository's files instead of a folder. A note `A/B.md` is the
 * sub-page of `A.md`, exactly as in crates/betelgeuse-core/src/vault.rs: keep the two in step, so a
 * page created, renamed or deleted here looks the same as one handled by the desktop or phone app.
 */
export type NoteMeta = {
  path: string;
  title: string;
  icon: string | null;
  tags: string[];
  kind: string | null;
  ai: boolean | null;
  order: number | null;
  modified: number;
  created: number;
};
export type Row = { path: string; title: string; content: string; modified: number; created: number };
export type SearchHit = { path: string; title: string; icon: string | null; snippet: string; score: number };
export type TrashItem = { id: string; title: string; icon: string | null; original: string; deleted: number; pages: number };

/** The workspace's files, in memory. Text is read directly; other files only move around. */
export interface Files {
  paths(): string[];
  has(path: string): boolean;
  /** A text file's contents, or undefined if it's missing or not text. */
  read(path: string): string | undefined;
  write(path: string, text: string): void;
  remove(path: string): void;
  /** Moves a file of any kind. */
  move(from: string, to: string): void;
  times(path: string): { modified: number; created: number };
}

export const TRASH = ".trash";
const TRASH_DAYS = 30;
const MAX_NAME_BYTES = 200;
const CONFIG = ".betelgeuse/config.json";

const bytes = (s: string) => new TextEncoder().encode(s).length;

export function resolve(rel: string): string {
  const safe = rel.length > 0 && !rel.startsWith("/") && rel.split("/").every((c) => c !== "" && c !== "." && c !== ".." && !c.includes("\\"));
  if (!safe) throw new Error(`invalid note path: ${rel}`);
  return rel;
}

export const isMarkdownPage = (path: string) => path.endsWith(".md") && path.split("/").every((c) => !c.startsWith(".") && c !== "node_modules");
export const markdownFiles = (files: Files) => files.paths().filter(isMarkdownPage);

export function titleOf(rel: string) {
  const file = rel.slice(rel.lastIndexOf("/") + 1);
  return file.endsWith(".md") ? file.slice(0, -3) : file;
}
export const childrenDir = (parent: string) => (parent.endsWith(".md") ? parent.slice(0, -3) : parent);
const dirOf = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");

/** Splits `---\n...\n---` frontmatter from the body. Returns ["", content] when absent. */
export function splitFrontmatter(content: string): [string, string] {
  const start = content.startsWith("---\r\n") ? 5 : content.startsWith("---\n") ? 4 : -1;
  if (start < 0) return ["", content];
  let offset = start;
  while (offset <= content.length) {
    const next = content.indexOf("\n", offset);
    const end = next < 0 ? content.length : next + 1;
    if (content.slice(offset, end).trimEnd() === "---") return [content.slice(start, offset), content.slice(end)];
    if (next < 0) break;
    offset = end;
  }
  return ["", content];
}

const unquote = (v: string) => {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) return t.slice(1, -1);
  return t;
};
const splitKey = (line: string): [string, string] | null => {
  const i = line.indexOf(":");
  return i < 0 ? null : [line.slice(0, i), line.slice(i + 1)];
};

export function fmValue(fm: string, key: string): string | null {
  for (const l of fm.split("\n")) {
    const kv = splitKey(l);
    if (kv && kv[0].trim() === key && kv[1].trim()) return unquote(kv[1]);
  }
  return null;
}
export function fmBool(fm: string, key: string): boolean | null {
  const v = fmValue(fm, key)?.toLowerCase();
  return v === "true" || v === "yes" ? true : v === "false" || v === "no" ? false : null;
}
export function fmNumber(fm: string, key: string): number | null {
  const v = fmValue(fm, key);
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function fmList(fm: string, key: string): string[] {
  const lines = fm.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = splitKey(lines[i]);
    if (!kv || kv[0].trim() !== key) continue;
    const v = kv[1].trim();
    if (v.startsWith("[") && v.endsWith("]")) return v.slice(1, -1).split(",").map(unquote).filter(Boolean);
    if (v) return [unquote(v)];
    const out: string[] = [];
    for (let k = i + 1; k < lines.length; k++) {
      const item = lines[k].trimStart();
      if (!item.startsWith("- ")) break;
      out.push(unquote(item.slice(2)));
    }
    return out;
  }
  return [];
}

/** A top-level string value, reading the double-quoted (JSON-escaped) form `setFmString` writes. */
function fmString(fm: string, key: string): string | null {
  for (const l of fm.split("\n")) {
    const kv = splitKey(l);
    if (!kv || l.startsWith(" ") || l.startsWith("\t") || kv[0].trim() !== key) continue;
    const v = kv[1].trim();
    if (!v) return null;
    try {
      const parsed: unknown = JSON.parse(v);
      if (typeof parsed === "string") return parsed;
    } catch {
      /* not JSON: a plain YAML scalar */
    }
    return unquote(v);
  }
  return null;
}

export function pageTitle(rel: string, fm: string) {
  const t = fmString(fm, "title");
  return t && t.trim() ? t : titleOf(rel);
}

export function setFmString(content: string, key: string, value: string | null): string {
  const [fm, body] = splitFrontmatter(content);
  const lines = (fm ? fm.replace(/\n$/, "").split("\n") : []).filter((l) => {
    const kv = splitKey(l);
    return l.startsWith(" ") || l.startsWith("\t") || !kv || kv[0].trim() !== key;
  });
  if (value !== null) lines.unshift(`${key}: ${JSON.stringify(value)}`);
  if (lines.every((l) => !l.trim())) return body;
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

function cleanTitle(title: string) {
  const cleaned = [...title]
    .map((c) => ('/\\:*?"<>|#^[]'.includes(c) || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  return !cleaned || cleaned.startsWith(".") ? "Untitled" : cleaned;
}

/** A title made safe to use as a file name, cut so ` 99.md` still fits. */
export function sanitizeTitle(title: string) {
  const cleaned = cleanTitle(title);
  if (bytes(cleaned) <= MAX_NAME_BYTES) return cleaned;
  let out = "";
  for (const c of cleaned) {
    if (bytes(out + c) > MAX_NAME_BYTES) break;
    out += c;
  }
  return out.trimEnd();
}

const nameFrom = (title: string) => title.split(/\s+/).filter(Boolean).join(" ") || "Untitled";

export function uniquePath(files: Files, dir: string, title: string, except?: string) {
  const join = (name: string) => (dir ? `${dir}/${name}.md` : `${name}.md`);
  let candidate = join(title);
  for (let n = 2; files.has(candidate) && candidate !== except; n++) candidate = join(`${title} ${n}`);
  return candidate;
}

function required(files: Files, rel: string): string {
  const text = files.read(resolve(rel));
  if (text === undefined) throw new Error(`no such page: ${rel}`);
  return text;
}

function keepName(files: Files, rel: string, name: string) {
  const content = required(files, rel);
  const want = titleOf(rel) !== name ? name : null;
  if (fmString(splitFrontmatter(content)[0], "title") !== want) files.write(rel, setFmString(content, "title", want));
}

function metaFor(files: Files, rel: string): NoteMeta {
  const fm = splitFrontmatter(files.read(rel) ?? "")[0];
  return {
    path: rel,
    title: pageTitle(rel, fm),
    icon: fmValue(fm, "icon"),
    tags: fmList(fm, "tags"),
    kind: fmValue(fm, "type"),
    ai: fmBool(fm, "ai"),
    order: fmNumber(fm, "order"),
    ...files.times(rel),
  };
}

export function listNotes(files: Files): NoteMeta[] {
  return markdownFiles(files)
    .map((p) => metaFor(files, p))
    .sort((a, b) => (a.path.toLowerCase() < b.path.toLowerCase() ? -1 : a.path.toLowerCase() > b.path.toLowerCase() ? 1 : 0));
}

export function databaseRows(files: Files, rel: string): Row[] {
  const dir = `${resolve(childrenDir(rel))}/`;
  const rows = files
    .paths()
    .filter((p) => p.startsWith(dir) && p.endsWith(".md") && !p.slice(dir.length).includes("/") && !p.slice(dir.length).startsWith("."))
    .map((path) => {
      const content = files.read(path) ?? "";
      const fm = splitFrontmatter(content)[0];
      return { row: { path, title: pageTitle(path, fm), content, ...files.times(path) }, order: fmNumber(fm, "order") };
    });
  // Rows with an `order` come first by it; the rest follow in the order they were created.
  rows.sort((a, b) => {
    if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
    if ((a.order === null) !== (b.order === null)) return a.order === null ? 1 : -1;
    if (a.row.created !== b.row.created) return a.row.created - b.row.created;
    const [x, y] = [a.row.title.toLowerCase(), b.row.title.toLowerCase()];
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return rows.map((r) => r.row);
}

export function createNote(files: Files, parent: string | null, title: string): string {
  const name = nameFrom(title);
  const rel = uniquePath(files, parent ? childrenDir(resolve(parent)) : "", sanitizeTitle(name));
  files.write(rel, "");
  keepName(files, rel, name);
  return rel;
}

export function duplicateNote(files: Files, rel: string): string {
  const content = required(files, rel);
  const name = `${pageTitle(rel, splitFrontmatter(content)[0])} copy`;
  const copy = uniquePath(files, dirOf(rel), sanitizeTitle(name));
  files.write(copy, content);
  keepName(files, copy, name);
  return copy;
}

/** Moves a page's file and every file in its sub-page folder. */
function moveTree(files: Files, rel: string, next: string) {
  files.move(rel, next);
  const [from, to] = [`${childrenDir(rel)}/`, `${childrenDir(next)}/`];
  for (const p of files.paths()) if (p.startsWith(from)) files.move(p, to + p.slice(from.length));
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Rewrites the target of every `[[target]]`, `[[target|alias]]` and `[[target#heading]]` `f` maps to a new one. */
function rewriteTargets(text: string, f: (target: string) => string | null): string {
  let out = "";
  let rest = text;
  for (let i = rest.indexOf("[["); i >= 0; i = rest.indexOf("[[")) {
    out += rest.slice(0, i + 2);
    rest = rest.slice(i + 2);
    const m = /[\]|#\n[]/.exec(rest);
    const end = m ? m.index : rest.length;
    const after = rest.slice(end);
    if (after.startsWith("]]") || after.startsWith("|") || after.startsWith("#")) {
      const replaced = f(rest.slice(0, end));
      if (replaced !== null) {
        out += replaced;
        rest = after;
      }
    }
  }
  return out + rest;
}
const rewriteLinks = (text: string, from: string, to: string) => rewriteTargets(text, (t) => (same(t.trim(), from) ? to : null));
const rewriteLinkPaths = (text: string, from: string, to: string) =>
  rewriteTargets(text, (raw) => {
    const t = raw.trim();
    if (same(t, from)) return to;
    return same(t.slice(0, from.length), from) && t.slice(from.length).startsWith("/") ? to + t.slice(from.length) : null;
  });

function rewriteAll(files: Files, change: (text: string) => string) {
  for (const p of markdownFiles(files)) {
    const text = files.read(p);
    if (text === undefined) continue;
    const updated = change(text);
    if (updated !== text) files.write(p, updated);
  }
}

export function renameNote(files: Files, rel: string, newTitle: string): string {
  const name = nameFrom(newTitle);
  if (name === pageTitle(rel, splitFrontmatter(required(files, rel))[0])) return rel;
  const oldTitle = titleOf(rel);
  const stem = sanitizeTitle(name);
  const next = stem === oldTitle ? rel : uniquePath(files, dirOf(rel), stem, rel);
  if (next === rel) {
    keepName(files, rel, name);
    return rel;
  }
  moveTree(files, rel, next);
  // Path links (`[[Areas/Old]]`, as relations name their database) follow too.
  rewriteAll(files, (text) => rewriteLinks(rewriteLinkPaths(text, childrenDir(rel), childrenDir(next)), oldTitle, titleOf(next)));
  keepName(files, next, name);
  return next;
}

export function moveNote(files: Files, rel: string, dest: string): string {
  const destDir = dest.replace(/^\/+|\/+$/g, "");
  const own = childrenDir(rel).toLowerCase();
  if (destDir.toLowerCase() === own || destDir.toLowerCase().startsWith(`${own}/`)) throw new Error("A page can't be moved inside itself.");
  if (dirOf(rel) === destDir) return rel;
  if (destDir) resolve(destDir);
  const title = titleOf(rel);
  const name = pageTitle(rel, splitFrontmatter(required(files, rel))[0]);
  const next = uniquePath(files, destDir, title);
  moveTree(files, rel, next);
  const newTitle = titleOf(next);
  rewriteAll(files, (text) => {
    const moved = rewriteLinkPaths(text, childrenDir(rel), childrenDir(next));
    // Numbered to avoid a page of the same name there ("Plan 2"): title links follow, as on rename.
    return newTitle !== title ? rewriteLinks(moved, title, newTitle) : moved;
  });
  keepName(files, next, name);
  return next;
}

export function deleteNote(files: Files, rel: string, now: number): string {
  if (!files.has(resolve(rel))) throw new Error(`no such page: ${rel}`);
  let id = String(now);
  while (files.paths().some((p) => p.startsWith(`${TRASH}/${id}/`))) id += "x";
  const dir = `${TRASH}/${id}`;
  const file = rel.slice(rel.lastIndexOf("/") + 1);
  moveTree(files, rel, `${dir}/${file}`);
  files.write(`${dir}/meta.json`, JSON.stringify({ original: rel, deleted: now }));
  return id;
}

function trashMeta(files: Files, id: string): { original: string; deleted: number } | null {
  try {
    const meta = JSON.parse(files.read(`${TRASH}/${id}/meta.json`) ?? "");
    return typeof meta.original === "string" && typeof meta.deleted === "number" ? meta : null;
  } catch {
    return null;
  }
}

function trashDir(id: string) {
  if (!/^[a-zA-Z0-9]+$/.test(id)) throw new Error("invalid trash id");
  return `${TRASH}/${id}`;
}

export function listTrash(files: Files, now: number): TrashItem[] {
  const ids = new Set(files.paths().filter((p) => p.startsWith(`${TRASH}/`)).map((p) => p.split("/")[1]));
  const cutoff = now - TRASH_DAYS * 24 * 3600 * 1000;
  const items: TrashItem[] = [];
  for (const id of ids) {
    const meta = trashMeta(files, id);
    if (!meta) continue;
    if (meta.deleted < cutoff) {
      purgeTrash(files, id);
      continue;
    }
    const dir = `${TRASH}/${id}/`;
    const file = meta.original.slice(meta.original.lastIndexOf("/") + 1);
    const fm = splitFrontmatter(files.read(dir + file) ?? "")[0];
    items.push({
      id,
      title: pageTitle(meta.original, fm),
      icon: fmValue(fm, "icon"),
      original: meta.original,
      deleted: meta.deleted,
      pages: files.paths().filter((p) => p.startsWith(dir) && p.endsWith(".md")).length,
    });
  }
  return items.sort((a, b) => b.deleted - a.deleted);
}

export function restoreTrash(files: Files, id: string): string {
  const dir = trashDir(id);
  const meta = trashMeta(files, id);
  if (!meta) throw new Error("this item is no longer in the trash");
  const file = meta.original.slice(meta.original.lastIndexOf("/") + 1);
  const dest = uniquePath(files, dirOf(meta.original), titleOf(meta.original));
  const name = pageTitle(meta.original, splitFrontmatter(files.read(`${dir}/${file}`) ?? "")[0]);
  moveTree(files, `${dir}/${file}`, dest);
  keepName(files, dest, name);
  purgeTrash(files, id);
  return dest;
}

export function purgeTrash(files: Files, id?: string | null) {
  const prefix = id ? `${trashDir(id)}/` : `${TRASH}/`;
  for (const p of files.paths()) if (p.startsWith(prefix)) files.remove(p);
}

/** Yields the target of every `[[target|alias]]` / `[[target#heading]]` link. */
export function wikilinks(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.split("[[").slice(1)) {
    const close = chunk.indexOf("]]");
    if (close < 0) continue;
    const target = chunk.slice(0, close).split(/[|#]/)[0].trim();
    if (target && !target.includes("\n")) out.push(target);
  }
  return out;
}

export function linkMatches(target: string, rel: string) {
  const t = (target.endsWith(".md") ? target.slice(0, -3) : target).toLowerCase();
  return t === titleOf(rel).toLowerCase() || t === childrenDir(rel).toLowerCase();
}

export function backlinks(files: Files, rel: string): NoteMeta[] {
  return markdownFiles(files)
    .filter((p) => p !== rel && wikilinks(files.read(p) ?? "").some((t) => linkMatches(t, rel)))
    .map((p) => metaFor(files, p));
}

function snippetAround(text: string, index: number, length: number) {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 100);
  const s = text.slice(start, end).split(/\s+/).filter(Boolean).join(" ");
  return `${start > 0 ? "…" : ""}${s}${end < text.length ? "…" : ""}`;
}

export function search(files: Files, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const path of markdownFiles(files)) {
    const meta = metaFor(files, path);
    const body = splitFrontmatter(files.read(path) ?? "")[1];
    const lower = body.toLowerCase();
    const bodyHits = lower.split(q).length - 1;
    const score = bodyHits + (meta.title.toLowerCase().includes(q) ? 100 : 0) + (meta.tags.some((t) => t.toLowerCase() === q.replace(/^#+/, "")) ? 50 : 0);
    if (!score) continue;
    const at = lower.indexOf(q);
    const snippet = at >= 0 && lower.length === body.length ? snippetAround(body, at, q.length) : [...body.trim()].slice(0, 140).join("");
    hits.push({ path, title: meta.title, icon: meta.icon, snippet, score });
  }
  hits.sort((a, b) => b.score - a.score || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return hits.slice(0, 50);
}

export function assetPath(name: string, now: number) {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  const rawExt = dot > 0 ? base.slice(dot + 1) : "";
  const ext = rawExt.length > 0 && rawExt.length <= 5 && /^[a-zA-Z0-9]+$/.test(rawExt) ? rawExt.toLowerCase() : "png";
  const stem = [...(dot > 0 ? base.slice(0, dot) : base)].filter((c) => /[a-zA-Z0-9-]/.test(c)).slice(0, 40).join("") || "asset";
  return `.assets/${stem}-${now}.${ext}`;
}

export function aiPolicy(files: Files): "all" | "shared" {
  try {
    return JSON.parse(files.read(CONFIG) ?? "{}")?.ai?.policy === "shared" ? "shared" : "all";
  } catch {
    return "all";
  }
}

export function setAiPolicy(files: Files, policy: string) {
  let config: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(files.read(CONFIG) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed as Record<string, unknown>;
  } catch {
    /* start over */
  }
  config.ai = { policy: policy === "shared" ? "shared" : "all" };
  files.write(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
}

export function aiVisible(files: Files, rel: string, policy: string) {
  let shared = false;
  for (let page: string | null = rel; page; page = page.includes("/") ? `${dirOf(page)}.md` : null) {
    const flag = fmBool(splitFrontmatter(files.read(page) ?? "")[0], "ai");
    if (flag === false) return false;
    if (flag === true) shared = true;
  }
  return policy !== "shared" || shared;
}
