// Shared harness for the scripts that drive the real app UI (screenshots.mjs, walkthrough.mjs).
//
// Starts the app's Vite dev server (apps/desktop, port 1420; reuses one that is already running) and
// opens it in the locally installed Chrome through Playwright, with Tauri's IPC replaced by an
// in-memory backend that mirrors the Rust commands in apps/desktop/src-tauri/src (lib.rs, vault.rs, git.rs).
// The workspace is the real seed (apps/desktop/src-tauri/seed) plus a small demo overlay (DEMO below) so the
// app looks like a workspace someone actually uses.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "../../..");
const DESKTOP = join(ROOT, "apps/desktop");
const SEED = join(DESKTOP, "src-tauri/seed");
export const PORT = 1420;
export const URL = `http://localhost:${PORT}/`;
export const VIEWPORT = { width: 1440, height: 900 };

// The app's clock is frozen here so relative times ("Edited 4 minutes ago") and the Roadmap's
// due dates read the same on every run.
export const NOW = new Date("2026-10-04T11:20:00").getTime();
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const VAULT = { name: "Betelgeuse", path: "/Users/maya/Betelgeuse" };
export const ME = "Maya Patel";
export const CLAUDE = "Claude Code via Betelgeuse MCP";
export const CURSOR = "Cursor via Betelgeuse MCP";

// ---------- Workspace ----------

function readSeed() {
  const files = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (name.endsWith(".md")) files[relative(SEED, abs).split(sep).join("/")] = readFileSync(abs, "utf8");
    }
  };
  walk(SEED);
  return files;
}

export const row = (fm, body) => `---\n${fm.trim()}\n---\n${body}\n`;

/** Demo data layered over the seed: more roadmap rows, a well-used Ideas page and two pages hidden from AI. */
export const DEMO = {
  replace: {
    // A few of the Welcome checklist items are done, as they would be after a day of use.
    "Welcome.md": (t) =>
      t
        .replace("- [ ] Type `/` on an empty line", "- [x] Type `/` on an empty line")
        .replace("- [ ] Select some text and give it a colour", "- [x] Select some text and give it a colour")
        .replace("- [ ] Press `⌘K`", "- [x] Press `⌘K`"),
  },
  pages: {
    "Ideas.md": row(
      "icon: 💡\ntags: [ideas]",
      `A scratchpad. Ask an agent to add to it, then check **History** to see exactly what it changed. New here? Start with [[Welcome]].

## Product

- Weekly review template that gathers every page edited this week
- Quick capture from the menu bar, straight into today's journal
- Publish a page as a read-only link

## Agents

- [x] Show agent commits with their own badge in History
- [ ] Let agents suggest an edit instead of committing it
- [ ] Nightly digest of what changed across the workspace

## Reading list

- *Local-first software*, Ink & Switch
- *The Pragmatic Programmer*, the chapter on plain text`,
    ),
    "Journal.md": row("icon: 📓\nai: false", "Daily notes. Hidden from AI agents, along with every entry inside it."),
    "Journal/Week 40.md": row("icon: 🗓️", "- Shipped page history\n- Roadmap review with the team on Thursday"),
    "Ideas/Gift ideas.md": row("icon: 🎁\nai: false", "- Noise-cancelling headphones for Sam\n- Pottery class for Mum"),
    "Roadmap/Calendar view.md": row("Status: Done\nPriority: Medium\nEstimate: 3\nDue: 2026-09-25\nTags: [app]", "Month grid, drag rows between days."),
    "Roadmap/Page history and restore.md": row("Status: Done\nPriority: High\nEstimate: 3\nDue: 2026-09-28\nTags: [git, app]", "Every version of a page, from git."),
    "Roadmap/Hide pages from AI.md": row("Status: Done\nPriority: High\nEstimate: 2\nDue: 2026-09-30\nTags: [agents]", "`ai: false` hides a page and its sub-pages."),
    "Roadmap/Read-only agent access.md": row("Status: In progress\nPriority: Medium\nEstimate: 2\nDue: 2026-10-07\nTags: [agents]", "A `--read-only` flag for the MCP server."),
    "Roadmap/Notion importer.md": row("Status: In progress\nPriority: High\nEstimate: 5\nDue: 2026-10-12\nTags: [app]", "Pages, databases and assets from a Notion export."),
    "Roadmap/Agent suggestions inbox.md": row("Status: Not started\nPriority: Medium\nEstimate: 3\nDue: 2026-10-23\nTags: [agents, app]", "Review agent edits before they land."),
    "Roadmap/Windows and Linux builds.md": row("Status: Not started\nPriority: Low\nEstimate: 5\nDue: 2026-11-06\nTags: [app]", "Signed installers for every platform."),
  },
  // Order of creation; database rows are listed in this order (by due date).
  order: [
    "Welcome.md",
    "Ideas.md",
    "Roadmap.md",
    "Roadmap/Calendar view.md",
    "Roadmap/Page history and restore.md",
    "Roadmap/Hide pages from AI.md",
    "Roadmap/Design the database views.md",
    "Roadmap/Read-only agent access.md",
    "Roadmap/Ship the MCP server.md",
    "Roadmap/Notion importer.md",
    "Roadmap/Sync vault to GitHub.md",
    "Roadmap/Agent suggestions inbox.md",
    "Roadmap/Windows and Linux builds.md",
  ],
  // Minutes since each page was last edited (default: a few days).
  edited: { "Ideas.md": 4, "Roadmap.md": 52, "Welcome.md": 180, "Journal/Week 40.md": 25, "Roadmap/Ship the MCP server.md": 70 },
};

export function buildWorkspace() {
  const contents = { ...readSeed() };
  for (const [rel, fn] of Object.entries(DEMO.replace)) contents[rel] = fn(contents[rel]);
  Object.assign(contents, DEMO.pages);
  const rels = Object.keys(contents);
  const rank = (rel) => {
    const i = DEMO.order.indexOf(rel);
    return i < 0 ? DEMO.order.length + rels.indexOf(rel) : i;
  };
  const files = {};
  for (const rel of rels) {
    const created = NOW - 21 * DAY + rank(rel) * 7 * MIN;
    const edited = DEMO.edited[rel] ?? 2 * 24 * 60 + rank(rel) * 37;
    files[rel] = { content: contents[rel], created, modified: NOW - edited * MIN };
  }
  return files;
}

/** Git history of the page shown in the History shot, newest first, with each version's content. */
export function buildHistory(files) {
  const current = files["Ideas.md"].content;
  const versions = [
    { ago: 4 * MIN, author: CLAUDE, subject: "mcp: Group ideas under headings and add a reading list", content: current },
    {
      ago: 38 * MIN,
      author: ME,
      subject: "Update Ideas",
      content: current.replace(/\n## Reading list[\s\S]*$/, "\n").replace("## Product\n\n", "").replace("## Agents\n\n", ""),
    },
    {
      ago: 2 * HOUR + 11 * MIN,
      author: CURSOR,
      subject: "mcp: Add three agent ideas from the planning notes",
      content: row(
        "icon: 💡\ntags: [ideas]",
        "A scratchpad. Ask an agent to add to it, then check **History** to see exactly what it changed. New here? Start with [[Welcome]].\n\n- Weekly review template\n- Quick capture from the menu bar\n- Publish a page as a read-only link\n- [x] Show agent commits with their own badge in History\n- [ ] Let agents suggest an edit instead of committing it\n- [ ] Nightly digest of what changed across the workspace",
      ),
    },
    { ago: 26 * HOUR, author: CLAUDE, subject: "mcp: Link the weekly review idea to Roadmap" },
    { ago: 27 * HOUR, author: ME, subject: "Update Ideas, Roadmap" },
    { ago: 3 * DAY, author: ME, subject: "Restore Ideas to 4be1f07" },
    { ago: 6 * DAY, author: CLAUDE, subject: "mcp: Add a reading list" },
    { ago: 9 * DAY, author: ME, subject: "Update Ideas, Welcome and 2 more" },
    { ago: 21 * DAY, author: "Betelgeuse", subject: "Initialize Betelgeuse workspace" },
  ];
  return commits(versions, current);
}

/**
 * Turns `{ ago, author, subject, content? }` versions (newest first) into git_log entries with
 * stable fake hashes. A version without content has the same content as the newer one above it.
 */
export function commits(versions, current, seed = 0x9e3779b9) {
  const hex = () => {
    let s = "";
    for (let i = 0; i < 40; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      s += ((seed >>> 16) & 15).toString(16);
    }
    return s;
  };
  let last = current;
  return versions.map((v) => {
    const hash = hex();
    last = v.content ?? last;
    return { hash, short: hash.slice(0, 7), author: v.author, timestamp: Math.round((NOW - v.ago) / 1000), subject: v.subject, content: last };
  });
}

// ---------- Mock Tauri backend (runs in the page) ----------

/** Installed with addInitScript, before the app's scripts run. Mirrors src-tauri/src/{lib,vault,git}.rs. */
export function installMockTauri({ files, histories, vault, mcp, git }) {
  // Pages without a history of their own show only the commit that created the workspace.
  const initial = Object.values(histories)[0].slice(-1);
  const store = new Map(Object.entries(files));
  const trash = [];
  let policy = "all";

  // ----- vault.rs helpers -----
  const titleOf = (rel) => {
    const file = rel.split("/").pop();
    return file.endsWith(".md") ? file.slice(0, -3) : file;
  };
  const childrenDir = (rel) => (rel.endsWith(".md") ? rel.slice(0, -3) : rel);
  const splitFrontmatter = (content) => {
    const rest = content.startsWith("---\n") ? content.slice(4) : content.startsWith("---\r\n") ? content.slice(5) : null;
    if (rest === null) return ["", content];
    let offset = 0;
    for (const line of rest.split(/(?<=\n)/)) {
      if (line.trimEnd() === "---") return [rest.slice(0, offset), rest.slice(offset + line.length)];
      offset += line.length;
    }
    return ["", content];
  };
  const unquote = (v) => {
    v = v.trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) || (v.startsWith("'") && v.endsWith("'") && v.length > 1)) return v.slice(1, -1);
    return v;
  };
  const fmValue = (fm, key) => {
    for (const l of fm.split("\n")) {
      const i = l.indexOf(":");
      if (i < 0) continue;
      if (l.slice(0, i).trim() === key && l.slice(i + 1).trim()) return unquote(l.slice(i + 1));
    }
    return null;
  };
  const fmBool = (fm, key) => {
    const v = fmValue(fm, key)?.toLowerCase();
    return v === "true" || v === "yes" ? true : v === "false" || v === "no" ? false : null;
  };
  const fmNumber = (fm, key) => {
    const v = fmValue(fm, key);
    return v !== null && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(v) ? Number(v) : null;
  };
  const fmList = (fm, key) => {
    const lines = fm.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const j = lines[i].indexOf(":");
      if (j < 0 || lines[i].slice(0, j).trim() !== key) continue;
      const v = lines[i].slice(j + 1).trim();
      if (v.startsWith("[") && v.endsWith("]")) return v.slice(1, -1).split(",").map(unquote).filter(Boolean);
      if (v) return [unquote(v)];
      const out = [];
      for (let k = i + 1; k < lines.length && lines[k].trimStart().startsWith("- "); k++) out.push(unquote(lines[k].trimStart().slice(2)));
      return out;
    }
    return [];
  };
  const isNote = (rel) => rel.endsWith(".md") && !rel.split("/").some((p) => p.startsWith(".") || p === "node_modules");
  const meta = (rel) => {
    const f = store.get(rel);
    const [fm] = splitFrontmatter(f.content);
    return {
      path: rel,
      title: titleOf(rel),
      icon: fmValue(fm, "icon"),
      tags: fmList(fm, "tags"),
      kind: fmValue(fm, "type"),
      ai: fmBool(fm, "ai"),
      order: fmNumber(fm, "order"),
      modified: f.modified,
      created: f.created,
    };
  };
  const notes = () => [...store.keys()].filter(isNote).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  const need = (rel) => {
    if (!rel || rel.split("/").some((p) => !p || p === "." || p === "..")) throw `invalid note path: ${rel}`;
    if (!store.has(rel)) throw `No such file or directory (os error 2)`;
    return store.get(rel);
  };
  const write = (rel, content) => {
    const prev = store.get(rel);
    store.set(rel, { content, created: prev?.created ?? Date.now(), modified: Date.now() });
  };
  const sanitize = (title) => {
    const cleaned = [...title].map((c) => ('/\\:*?"<>|#^[]'.includes(c) || c < " " ? " " : c)).join("").split(/\s+/).filter(Boolean).join(" ");
    return !cleaned || cleaned.startsWith(".") ? "Untitled" : cleaned;
  };
  const uniquePath = (dir, title, except) => {
    const join = (name) => (dir ? `${dir}/${name}.md` : `${name}.md`);
    let candidate = join(title);
    for (let n = 2; store.has(candidate) && candidate !== except; n++) candidate = join(`${title} ${n}`);
    return candidate;
  };
  const wikilinks = (text) =>
    text
      .split("[[")
      .slice(1)
      .map((chunk) => {
        const end = chunk.indexOf("]]");
        if (end < 0) return null;
        const target = chunk.slice(0, end).split(/[|#]/)[0].trim();
        return target && !target.includes("\n") ? target : null;
      })
      .filter(Boolean);
  const linkMatches = (target, rel) => {
    const t = (target.endsWith(".md") ? target.slice(0, -3) : target).toLowerCase();
    return t === titleOf(rel).toLowerCase() || t === childrenDir(rel).toLowerCase();
  };
  const moveTree = (from, to) => {
    for (const key of [...store.keys()]) {
      if (key === from || key.startsWith(childrenDir(from) + "/")) {
        const next = key === from ? to : childrenDir(to) + key.slice(childrenDir(from).length);
        store.set(next, store.get(key));
        store.delete(key);
      }
    }
  };
  const snippetAround = (text, i, len) => {
    const start = Math.max(0, i - 60);
    const end = Math.min(text.length, i + len + 100);
    let s = text.slice(start, end).split(/\s+/).filter(Boolean).join(" ");
    if (start > 0) s = "…" + s;
    if (end < text.length) s += "…";
    return s;
  };

  const commands = {
    current_vault: () => vault,
    open_vault: () => vault,
    list_notes: () => notes().map(meta),
    read_note: ({ path }) => need(path).content,
    write_note: ({ path, content }) => void write(path, content),
    create_note: ({ parent, title }) => {
      const rel = uniquePath(parent ? childrenDir(parent) : "", sanitize(title));
      write(rel, "");
      return rel;
    },
    database_rows: ({ path }) => {
      const dir = childrenDir(path) + "/";
      return [...store.keys()]
        .filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes("/") && k.endsWith(".md") && !titleOf(k).startsWith("."))
        .map((k) => ({ path: k, title: titleOf(k), content: store.get(k).content, modified: store.get(k).modified, created: store.get(k).created }))
        .sort((a, b) => a.created - b.created || a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    },
    duplicate_note: ({ path }) => {
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const copy = uniquePath(dir, `${titleOf(path)} copy`);
      write(copy, need(path).content);
      return copy;
    },
    save_asset: ({ name }) => `.assets/${name.replace(/[^A-Za-z0-9.-]/g, "")}`,
    read_asset: ({ path }) => {
      throw `No such file or directory (os error 2): ${path}`;
    },
    rename_note: ({ path, title }) => {
      const oldTitle = titleOf(path);
      const next = sanitize(title);
      if (next === oldTitle) return path;
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const rel = uniquePath(dir, next, path);
      moveTree(path, rel);
      const fin = titleOf(rel);
      for (const [k, f] of store) {
        let t = f.content;
        for (const end of ["]]", "|", "#"]) t = t.split(`[[${oldTitle}${end}`).join(`[[${fin}${end}`);
        if (t !== f.content) store.set(k, { ...f, content: t });
      }
      return rel;
    },
    move_note: ({ path, dest }) => {
      need(path);
      const own = childrenDir(path);
      if (dest === own || dest.startsWith(own + "/")) throw "A page can't be moved inside itself.";
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (dir === dest) return path;
      const rel = uniquePath(dest, titleOf(path));
      moveTree(path, rel);
      const next = childrenDir(rel);
      for (const [k, f] of store) {
        let t = f.content;
        for (const end of ["]]", "|", "#", "/"]) t = t.split(`[[${own}${end}`).join(`[[${next}${end}`);
        if (t !== f.content) store.set(k, { ...f, content: t });
      }
      return rel;
    },
    delete_note: ({ path }) => {
      need(path);
      const id = String(Date.now() + trash.length);
      const pages = [...store.keys()].filter((k) => k === path || k.startsWith(childrenDir(path) + "/"));
      trash.unshift({ id, original: path, deleted: Date.now(), entries: pages.map((k) => [k, store.get(k)]) });
      pages.forEach((k) => store.delete(k));
      return id;
    },
    list_trash: () =>
      trash.map((t) => ({
        id: t.id,
        title: titleOf(t.original),
        icon: fmValue(splitFrontmatter(t.entries[0][1].content)[0], "icon"),
        original: t.original,
        deleted: t.deleted,
        pages: t.entries.length,
      })),
    restore_trash: ({ id }) => {
      const i = trash.findIndex((t) => t.id === id);
      if (i < 0) throw "this item is no longer in the trash";
      const [t] = trash.splice(i, 1);
      const parent = t.original.includes("/") ? t.original.slice(0, t.original.lastIndexOf("/")) : "";
      const dest = uniquePath(parent, titleOf(t.original));
      for (const [k, f] of t.entries) store.set(k === t.original ? dest : childrenDir(dest) + k.slice(childrenDir(t.original).length), f);
      return dest;
    },
    purge_trash: ({ id }) => void trash.splice(0, trash.length, ...(id ? trash.filter((t) => t.id !== id) : [])),
    search_notes: ({ query }) => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return notes()
        .map((rel) => {
          const m = meta(rel);
          const [, body] = splitFrontmatter(store.get(rel).content);
          const lower = body.toLowerCase();
          const bodyHits = lower.split(q).length - 1;
          const score = bodyHits + (m.title.toLowerCase().includes(q) ? 100 : 0) + (m.tags.some((t) => t.toLowerCase() === q.replace(/^#+/, "")) ? 50 : 0);
          if (!score) return null;
          const i = lower.indexOf(q);
          const snippet = i >= 0 ? snippetAround(body, i, q.length) : body.trim().slice(0, 140);
          return { path: rel, title: m.title, icon: m.icon, snippet, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || (a.title < b.title ? -1 : 1))
        .slice(0, 50);
    },
    backlinks: ({ path }) => notes().filter((k) => k !== path && wikilinks(store.get(k).content).some((t) => linkMatches(t, path))).map(meta),
    git_status: () => ({ branch: git.branch, changes: [], has_remote: true }),
    git_commit: () => null,
    git_log: ({ path, limit }) => (histories[path] ?? initial).slice(0, limit ?? 50).map(({ content, ...c }) => c),
    git_show: ({ rev, path }) => {
      const c = histories[path]?.find((h) => h.hash === rev || h.short === rev);
      return c ? c.content : need(path).content;
    },
    git_sync: () => "Already up to date.",
    git_settings: () => ({ ...git }),
    git_set_remote: ({ url }) => void (git.remote_url = url),
    git_set_identity: ({ name, email }) => void Object.assign(git, { user_name: name, user_email: email }),
    git_test_remote: () => "Connected",
    git_publish: () => "Published",
    set_autocommit: () => null,
    get_ai_policy: () => policy,
    set_ai_policy: ({ policy: p }) => void (policy = p === "shared" ? "shared" : "all"),
    import_pages: () => {
      throw "Importing is not available in the screenshot mock";
    },
    mcp_info: () => ({ ...mcp, vault: vault.path }),
  };

  // ----- Tauri internals (see @tauri-apps/api core.js, event.js and mocks.js) -----
  const callbacks = new Map();
  let nextId = 1;
  const listeners = new Map();
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    plugins: { path: { sep: "/", delimiter: ":" } },
    transformCallback(callback, once = false) {
      const id = nextId++;
      callbacks.set(id, (data) => {
        if (once) callbacks.delete(id);
        return callback && callback(data);
      });
      return id;
    },
    unregisterCallback: (id) => callbacks.delete(id),
    runCallback: (id, data) => callbacks.get(id)?.(data),
    callbacks,
    convertFileSrc: (p, protocol = "asset") => `${protocol}://localhost/${encodeURIComponent(p)}`,
    async invoke(cmd, args = {}) {
      if (cmd === "plugin:event|listen") {
        if (!listeners.has(args.event)) listeners.set(args.event, []);
        listeners.get(args.event).push(args.handler);
        return args.handler;
      }
      if (cmd === "plugin:event|unlisten") {
        const l = listeners.get(args.event);
        if (l) listeners.set(args.event, l.filter((h) => h !== args.eventId));
        return null;
      }
      if (cmd === "plugin:event|emit") {
        for (const h of listeners.get(args.event) ?? []) callbacks.get(h)?.({ event: args.event, id: h, payload: args.payload });
        return null;
      }
      if (cmd === "plugin:window|is_fullscreen") return false;
      if (cmd.startsWith("plugin:")) {
        window.__mockLog?.push(`plugin call ${cmd}`);
        return null;
      }
      const fn = commands[cmd];
      if (!fn) {
        window.__mockLog?.push(`unknown command ${cmd}`);
        throw `command ${cmd} not found`;
      }
      try {
        // Structured clone mimics the JSON round trip through the real IPC.
        return structuredClone(await fn(args ?? {}));
      } catch (e) {
        window.__mockLog?.push(`${cmd} failed: ${e}`);
        throw e;
      }
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => callbacks.delete(id) };
  window.__mockLog = [];
}

// ---------- Page setup ----------

// Stills: no transitions or blinking caret, so every shot is deterministic.
const STILL_CSS = `
  *, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }
`;

const BASE_CSS = `
  ::-webkit-scrollbar { display: none; }
  /* WebKit (the macOS app) draws colour emoji opaque whatever the text colour; Chrome applies the
     colour's alpha, which would fade page icons sitting in muted text. Match the real app. */
  span.inline-grid.leading-none { color: #000 !important; }
  #shot-traffic-lights { position: fixed; top: 14px; left: 16px; z-index: 2147483647; display: flex; gap: 8px; pointer-events: none; }
  #shot-traffic-lights span { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 0.5px rgba(0,0,0,.18); }
`;

/** Draws macOS's window buttons where the real app's overlay title bar puts them (trafficLightPosition 16,22). */
function addChrome() {
  const style = document.createElement("style");
  style.textContent = window.__shotCss;
  document.head.append(style);
  const lights = document.createElement("div");
  lights.id = "shot-traffic-lights";
  for (const c of ["#ff5f57", "#febc2e", "#28c840"]) {
    const s = document.createElement("span");
    s.style.background = c;
    lights.append(s);
  }
  document.body.append(lights);
}

/**
 * Opens the app in a new browser context on the mocked backend.
 * `histories` maps a page path to its git_log (see commits()); `still: false` keeps transitions
 * and the text caret for recordings.
 */
export async function openApp(browser, { theme, workspace, histories, localStorage: extra = {}, deviceScaleFactor = 2, still = true }) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor, colorScheme: theme, locale: "en-US" });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  // The dev server has no favicon; the desktop app doesn't need one.
  page.on("console", (m) => m.type() === "error" && !m.location().url.endsWith("/favicon.ico") && problems.push(`console: ${m.text()} ${m.location().url}`));
  page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`));
  // Shift the clock to NOW but keep it running: ProseMirror's input handling compares timestamps,
  // so a frozen clock (page.clock.setFixedTime) swallows key presses.
  await page.addInitScript((now) => {
    const Real = Date;
    const offset = now - Real.now();
    class ShiftedDate extends Real {
      constructor(...args) {
        super(...(args.length ? args : [Real.now() + offset]));
      }
      static now() {
        return Real.now() + offset;
      }
    }
    window.Date = ShiftedDate;
  }, NOW);
  const storage = {
    "betelgeuse-settings": JSON.stringify({ mode: theme, palette: "betelgeuse", accent: "ember", textSize: "default", autocommit: 8 }),
    sidebar: "shown",
    [`favorites:${VAULT.path}`]: JSON.stringify(["Roadmap.md"]),
    ...extra,
  };
  await page.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, storage);
  await page.addInitScript(installMockTauri, {
    files: workspace,
    histories,
    vault: VAULT,
    mcp: { server_path: "/Applications/Betelgeuse.app/Contents/Resources/mcp/betelgeuse-mcp.mjs", built: true, node_path: "/opt/homebrew/bin/node" },
    git: { branch: "main", remote_url: "git@github.com:maya/notes.git", user_name: ME, user_email: "maya@example.com", commits: 214 },
  });
  await page.addInitScript((css) => (window.__shotCss = css), (still ? STILL_CSS : "") + BASE_CSS);
  await page.goto(URL);
  await page.evaluate(addChrome);
  await page.waitForSelector(".betelgeuse-prose, .database-view", { timeout: 20_000 });
  await settle(page);
  return { page, context, problems };
}

/** Problems seen so far: page errors, failed requests, mock commands that failed, and toasts. */
export async function issues(page, problems) {
  const log = await page.evaluate(() => window.__mockLog);
  const toasts = await page.locator(".toast").count();
  return [...problems, ...log, ...(toasts ? ["a toast is showing"] : [])];
}

export async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.mouse.move(1000, 20);
  await page.waitForTimeout(400);
}

// ---------- Dev server ----------

async function reachable() {
  try {
    const res = await fetch(URL);
    return res.ok;
  } catch {
    return false;
  }
}

export async function startVite() {
  if (await reachable()) {
    console.log(`Using the dev server already running on ${URL}`);
    return null;
  }
  const vite = join(ROOT, "node_modules/vite/bin/vite.js");
  if (!existsSync(vite)) throw new Error("Run `npm install` in the repo root first (vite is missing).");
  console.log("Starting the Vite dev server…");
  const child = spawn(process.execPath, [vite, "--port", String(PORT), "--strictPort"], { cwd: DESKTOP, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    if (await reachable()) return child;
    if (child.exitCode !== null) throw new Error(`Vite exited:\n${log}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`Vite did not start on ${URL}:\n${log}`);
}