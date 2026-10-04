import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Document, isMap, parseDocument } from "yaml";

const exec = promisify(execFile);

export type NoteMeta = { path: string; title: string; icon?: string; tags: string[]; type?: string; order?: number; modified: string };
export type Frontmatter = Record<string, unknown>;
export type FrontmatterPatch = Record<string, unknown>;

/** Splits `---` YAML frontmatter from the Markdown body. */
export function splitNote(content: string): { frontmatter: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/.exec(content);
  return m ? { frontmatter: m[1], body: content.slice(m[0].length) } : { frontmatter: "", body: content };
}

/** Parses YAML frontmatter; malformed YAML reads as empty rather than throwing. */
export function parseFrontmatter(raw: string): Frontmatter {
  if (!raw.trim()) return {};
  try {
    const v = parseDocument(raw).toJS();
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Patches top-level keys, preserving the rest of the YAML (comments, order, formatting). */
export function patchFrontmatter(raw: string, patch: FrontmatterPatch): string {
  const doc: Document = raw.trim() ? parseDocument(raw) : new Document({});
  if (!isMap(doc.contents)) throw new Error("Frontmatter is not a YAML mapping");
  for (const [key, value] of Object.entries(patch)) {
    if (isEmpty(value)) doc.delete(key);
    else doc.set(key, doc.createNode(value, { flow: Array.isArray(value) }));
  }
  return doc.contents.items.length ? doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd() : "";
}

export function joinNote(frontmatter: string, body: string): string {
  return frontmatter.trim() ? `---\n${frontmatter.trim()}\n---\n${body}` : body;
}

export function wikilinks(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g)].map((m) => m[1].trim());
}

export const titleOf = (rel: string) => path.posix.basename(rel, ".md");
const childrenDir = (rel: string) => rel.replace(/\.md$/, "");

function sanitizeTitle(title: string): string {
  const t = title.replace(/[/\\:*?"<>|#^[\]\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim();
  return !t || t.startsWith(".") ? "Untitled" : t;
}

export class Vault {
  constructor(readonly root: string) {}

  /** Vault-relative POSIX path -> absolute path, refusing anything outside the vault. */
  resolve(rel: string): string {
    const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "");
    const withExt = norm.endsWith(".md") ? norm : `${norm}.md`;
    const parts = withExt.split("/");
    if (path.isAbsolute(norm) || parts.some((p) => p === ".." || p === "." || p === "" || p.startsWith(".git"))) {
      throw new Error(`Invalid note path "${rel}". Use a workspace-relative path such as "Projects/Plan.md".`);
    }
    return path.join(this.root, ...parts);
  }

  rel(abs: string): string {
    return path.relative(this.root, abs).split(path.sep).join("/");
  }

  private async *walk(dir = this.root): AsyncGenerator<string> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* this.walk(abs);
      else if (entry.isFile() && entry.name.endsWith(".md")) yield abs;
    }
  }

  /** Every note on disk, including ones hidden from agents. Only for internal bookkeeping. */
  private async allFiles(): Promise<string[]> {
    const out: string[] = [];
    for await (const f of this.walk()) out.push(this.rel(f));
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  /** Notes agents may see. Everything an agent can reach goes through this. */
  async files(): Promise<string[]> {
    const policy = await this.aiPolicy();
    const all = await this.allFiles();
    const flags = new Map<string, boolean | undefined>();
    await Promise.all(all.map(async (f) => flags.set(f, aiFlag(parseFrontmatter(splitNote(await readFile(this.resolve(f), "utf8")).frontmatter)))));
    return all.filter((f) => isVisible(f, policy, (p) => flags.get(p)));
  }

  // ---------- AI visibility ----------
  // `.betelgeuse/config.json` holds the workspace policy (shared with the desktop app):
  //   "all"    every page is visible unless it or a parent page has `ai: false`
  //   "shared" only pages with `ai: true` on themselves or a parent (and no `ai: false`)

  async aiPolicy(): Promise<"all" | "shared"> {
    try {
      const config = JSON.parse(await readFile(path.join(this.root, ".betelgeuse/config.json"), "utf8"));
      return config?.ai?.policy === "shared" ? "shared" : "all";
    } catch {
      return "all";
    }
  }

  /** True when a note exists on disk but is hidden from agents. */
  async isHidden(rel: string): Promise<boolean> {
    const withExt = rel.endsWith(".md") ? rel : `${rel}.md`;
    return existsSync(this.resolve(withExt)) && !(await this.files()).includes(withExt);
  }

  async meta(rel: string, content?: string): Promise<NoteMeta> {
    const abs = this.resolve(rel);
    const text = content ?? (await readFile(abs, "utf8"));
    const fm = parseFrontmatter(splitNote(text).frontmatter);
    const tags = fm.tags ?? [];
    return {
      path: rel,
      title: titleOf(rel),
      icon: typeof fm.icon === "string" ? fm.icon : undefined,
      type: typeof fm.type === "string" ? fm.type : undefined,
      order: orderOf(fm.order),
      tags: (Array.isArray(tags) ? tags : [tags]).map(String),
      modified: (await stat(abs)).mtime.toISOString(),
    };
  }

  /** Visible notes in sidebar order: each page followed by its sub-pages, siblings by `order` then A–Z. */
  async list(): Promise<NoteMeta[]> {
    return treeOrder(await Promise.all((await this.files()).map((f) => this.meta(f))));
  }

  /** Finds a note by vault path or by title (case-insensitive), the way `[[links]]` resolve. */
  async find(ref: string): Promise<string> {
    const files = await this.files();
    const key = ref.replace(/\.md$/, "").toLowerCase();
    const hit =
      files.find((f) => f.replace(/\.md$/, "").toLowerCase() === key) ??
      files.find((f) => titleOf(f).toLowerCase() === key);
    // Hidden pages are indistinguishable from missing ones, so agents can't probe for them.
    if (!hit) throw new Error(`No note matches "${ref}". Use list_notes or search_notes to find it.`);
    return hit;
  }

  async read(rel: string) {
    const content = await readFile(this.resolve(rel), "utf8");
    const { frontmatter, body } = splitNote(content);
    const visible = await this.files();
    const isHiddenLink = (t: string) => {
      const key = t.replace(/\.md$/, "").toLowerCase();
      return !visible.some((f) => titleOf(f).toLowerCase() === key || f.replace(/\.md$/, "").toLowerCase() === key);
    };
    return {
      ...(await this.meta(rel, content)),
      frontmatter: parseFrontmatter(frontmatter),
      body,
      // Links to hidden (or missing) pages are left out of the structured list.
      links: [...new Set(wikilinks(body))].filter((t) => !isHiddenLink(t)),
      backlinks: (await this.backlinks(rel)).map((b) => b.path),
    };
  }

  async backlinks(rel: string): Promise<NoteMeta[]> {
    const title = titleOf(rel).toLowerCase();
    const stem = childrenDir(rel).toLowerCase();
    const out: NoteMeta[] = [];
    for (const f of await this.files()) {
      if (f === rel) continue;
      const text = await readFile(this.resolve(f), "utf8");
      if (wikilinks(text).some((t) => [title, stem].includes(t.replace(/\.md$/, "").toLowerCase()))) {
        out.push(await this.meta(f, text));
      }
    }
    return out;
  }

  async search(query: string, limit: number) {
    const q = query.trim().toLowerCase();
    const hits: { path: string; title: string; score: number; snippet: string }[] = [];
    for (const f of await this.files()) {
      const text = await readFile(this.resolve(f), "utf8");
      const { frontmatter, body } = splitNote(text);
      const lower = body.toLowerCase();
      const fm = parseFrontmatter(frontmatter);
      const tags = ([] as unknown[]).concat(fm.tags ?? []).map((t) => String(t).toLowerCase());
      const score =
        lower.split(q).length - 1 + (titleOf(f).toLowerCase().includes(q) ? 100 : 0) + (tags.includes(q.replace(/^#/, "")) ? 50 : 0);
      if (!score) continue;
      const i = lower.indexOf(q);
      const snippet =
        i < 0
          ? body.trim().slice(0, 160)
          : `${i > 60 ? "…" : ""}${body.slice(Math.max(0, i - 60), i + q.length + 100).replace(/\s+/g, " ").trim()}…`;
      hits.push({ path: f, title: titleOf(f), score, snippet });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async tags(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const n of await this.list()) for (const t of n.tags) counts[t] = (counts[t] ?? 0) + 1;
    return counts;
  }

  private uniquePath(dir: string, title: string, except?: string): string {
    const join = (name: string) => (dir ? `${dir}/${name}.md` : `${name}.md`);
    let candidate = join(title);
    for (let n = 2; existsSync(this.resolve(candidate)) && candidate !== except; n++) candidate = join(`${title} ${n}`);
    return candidate;
  }

  async create(title: string, body: string, opts: { parent?: string; frontmatter?: FrontmatterPatch }): Promise<string> {
    const dir = opts.parent ? childrenDir(await this.find(opts.parent)) : "";
    const rel = this.uniquePath(dir, sanitizeTitle(title));
    // In "only shared pages" mode, pages an agent creates are shared with agents.
    const shared = (await this.aiPolicy()) === "shared" ? { ai: true } : {};
    await this.write(rel, joinNote(patchFrontmatter("", { ...shared, ...(opts.frontmatter ?? {}) }), body));
    return rel;
  }

  async write(rel: string, content: string) {
    const abs = this.resolve(rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content.endsWith("\n") ? content : `${content}\n`);
  }

  async update(rel: string, opts: { body?: string; mode: "replace" | "append" | "prepend"; frontmatter?: FrontmatterPatch }) {
    const { frontmatter, body } = splitNote(await readFile(this.resolve(rel), "utf8"));
    let next = body;
    if (opts.body !== undefined) {
      if (opts.mode === "replace") next = opts.body;
      else if (opts.mode === "append") next = `${body.replace(/\s*$/, "")}\n\n${opts.body}`;
      else next = `${opts.body}\n\n${body.replace(/^\s*/, "")}`;
    }
    await this.write(rel, joinNote(patchFrontmatter(frontmatter, opts.frontmatter ?? {}), next));
  }

  /** Renames a note and its sub-page folder, rewriting `[[Old]]` links. Returns every path touched. */
  async rename(rel: string, newTitle: string): Promise<{ path: string; touched: string[] }> {
    const dir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel);
    const next = this.uniquePath(dir, sanitizeTitle(newTitle), rel);
    if (next === rel) return { path: rel, touched: [] };
    const touched = [rel, next];
    await rename(this.resolve(rel), this.resolve(next));
    const oldChildren = path.join(this.root, childrenDir(rel));
    if (existsSync(oldChildren)) {
      await rename(oldChildren, path.join(this.root, childrenDir(next)));
      touched.push(childrenDir(rel), childrenDir(next));
    }
    const [from, to] = [titleOf(rel), titleOf(next)];
    // Rewrites links in every page (hidden ones too) so nothing breaks; nothing is returned from them.
    for (const f of await this.allFiles()) {
      const text = await readFile(this.resolve(f), "utf8");
      const updated = text.replace(/\[\[([^\]\n|#]+)([|#][^\]\n]*)?\]\]/g, (m, target: string, rest = "") =>
        target.trim() === from ? `[[${to}${rest}]]` : m,
      );
      if (updated !== text) {
        await writeFile(this.resolve(f), updated);
        touched.push(f);
      }
    }
    return { path: next, touched };
  }

  /**
   * Moves a note (and its sub-pages) to the workspace Trash, where the user can restore it from the
   * app. Same layout as the desktop app: `.trash/<id>/<file>.md` plus `meta.json`.
   */
  async delete(rel: string): Promise<string[]> {
    let id = String(Date.now());
    while (existsSync(path.join(this.root, ".trash", id))) id += "x";
    const dir = path.join(this.root, ".trash", id);
    await mkdir(dir, { recursive: true });
    const file = path.posix.basename(rel);
    await rename(this.resolve(rel), path.join(dir, file));
    const children = path.join(this.root, childrenDir(rel));
    const moved = [rel];
    if (existsSync(children)) {
      await rename(children, path.join(dir, childrenDir(file)));
      moved.push(childrenDir(rel));
    }
    await writeFile(path.join(dir, "meta.json"), JSON.stringify({ original: rel, deleted: Date.now() }));
    return moved;
  }

  // ---------- databases ----------

  /** A database page's schema (properties and views) and its rows with property values. */
  async database(rel: string) {
    const { frontmatter, body } = splitNote(await readFile(this.resolve(rel), "utf8"));
    if (parseFrontmatter(frontmatter).type !== "database") throw new Error(`"${rel}" is not a database`);
    const m = /```database[ \t]*\n([\s\S]*?)\n```/.exec(body);
    const schema = m ? JSON.parse(m[1]) : { properties: [], views: [] };
    const dir = path.join(this.root, childrenDir(rel));
    const rows = [];
    const visible = new Set(await this.files());
    if (existsSync(dir)) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name.startsWith(".")) continue;
        const rowRel = `${childrenDir(rel)}/${entry.name}`;
        if (!visible.has(rowRel)) continue;
        const text = await readFile(this.resolve(rowRel), "utf8");
        const { frontmatter: rfm, body: rbody } = splitNote(text);
        rows.push({ path: rowRel, Name: titleOf(rowRel), ...parseFrontmatter(rfm), _body: rbody.trim().slice(0, 200) });
      }
    }
    return { schema, rows };
  }

  // ---------- git ----------

  private async git(args: string[]): Promise<string> {
    const { stdout } = await exec("git", ["-C", this.root, "-c", "core.quotepath=off", ...args], { maxBuffer: 32 << 20 });
    return stdout;
  }

  async isRepo(): Promise<boolean> {
    return existsSync(path.join(this.root, ".git"));
  }

  /**
   * Commits just the given paths, authored by the agent so its changes stand out
   * in history. Retries briefly if the desktop app is committing at the same time.
   */
  async commit(paths: string[], message: string, agent: string): Promise<string | null> {
    if (!(await this.isRepo())) return null;
    // A pathspec git has never seen (e.g. an uncommitted folder that was moved) would fail the add.
    const known = await Promise.all(
      paths.map(async (p) => existsSync(path.join(this.root, p)) || !!(await this.git(["ls-files", "--", p]).catch(() => "")).trim()),
    );
    paths = paths.filter((_, i) => known[i]);
    if (paths.length === 0) return null;
    const hasIdentity = await this.git(["config", "user.email"]).then((s) => !!s.trim(), () => false);
    const identity = hasIdentity ? [] : ["-c", "user.name=Betelgeuse", "-c", "user.email=betelgeuse@localhost"];
    for (let attempt = 0; ; attempt++) {
      try {
        await this.git(["add", "-A", "--", ...paths]);
        const staged = await this.git(["diff", "--cached", "--name-only", "--", ...paths]);
        if (!staged.trim()) return null;
        await this.git([
          ...identity,
          "commit",
          "--quiet",
          `--author=${agent} via Betelgeuse MCP <mcp@betelgeuse.local>`,
          "-m",
          `mcp: ${message}`,
          "--",
          ...paths,
        ]);
        return (await this.git(["rev-parse", "--short", "HEAD"])).trim();
      } catch (e) {
        if (attempt >= 4 || !String(e).includes("index.lock")) throw e;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }

  async history(rel: string, limit: number) {
    if (!(await this.isRepo())) return [];
    const out = await this.git(["log", "-n", String(limit), "--follow", "--format=%h%x1f%an%x1f%aI%x1f%s", "--", rel]);
    return out
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [rev, author, date, subject] = l.split("\x1f");
        return { rev, author, date, subject };
      });
  }

  async readAt(rel: string, rev: string): Promise<string> {
    if (!/^[\w.^~-]+$/.test(rev) || rev.startsWith("-")) throw new Error(`Invalid revision "${rev}"`);
    const hash = (await this.git(["rev-parse", "--verify", `${rev}^{commit}`])).trim();
    // The note may have had another name at that revision; --follow history records it.
    const log = await this.git(["log", "--follow", "--name-only", "--format=%x1e%H", "--", rel]).catch(() => "");
    const block = log.split("\x1e").find((b) => b.trimStart().startsWith(hash));
    const nameThen = block?.trim().split("\n").slice(1).find(Boolean) ?? rel;
    return this.git(["show", `${hash}:${nameThen}`]);
  }
}

const aiFlag = (fm: Frontmatter): boolean | undefined => {
  const v = fm.ai;
  if (v === true || v === "true" || v === "yes") return true;
  if (v === false || v === "false" || v === "no") return false;
  return undefined;
};

/** Visibility of `rel` from its own and its parent pages' `ai` flags (`A/B.md` is under `A.md`). */
export function isVisible(rel: string, policy: "all" | "shared", flagOf: (rel: string) => boolean | undefined): boolean {
  let shared = false;
  for (let page: string | null = rel; page; page = page.includes("/") ? `${page.slice(0, page.lastIndexOf("/"))}.md` : null) {
    const flag = flagOf(page);
    if (flag === false) return false;
    if (flag === true) shared = true;
  }
  return policy === "all" || shared;
}

/** Frontmatter `order` as a number (a numeric string counts too); anything else is unset. */
function orderOf(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Sorts notes the way the app's sidebar shows them: depth-first, a page before its sub-pages, and
 * siblings by `order` ascending with unordered pages after the ordered ones, A–Z. A folder with no
 * page of its own sorts like an unordered page.
 */
export function treeOrder(notes: NoteMeta[]): NoteMeta[] {
  type Node = { title: string; note?: NoteMeta; children: Map<string, Node> };
  const root: Node = { title: "", children: new Map() };
  for (const note of notes) {
    let node = root;
    for (const part of note.path.replace(/\.md$/, "").split("/")) {
      let child = node.children.get(part);
      if (!child) node.children.set(part, (child = { title: part, children: new Map() }));
      node = child;
    }
    node.note = note;
  }
  const compare = (a: Node, b: Node) => {
    const [x, y] = [a.note?.order, b.note?.order];
    if (x !== undefined && y !== undefined && x !== y) return x - y;
    if (x !== undefined && y === undefined) return -1;
    if (x === undefined && y !== undefined) return 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  };
  const out: NoteMeta[] = [];
  const walk = (node: Node) => {
    for (const child of [...node.children.values()].sort(compare)) {
      if (child.note) out.push(child.note);
      walk(child);
    }
  };
  walk(root);
  return out;
}
