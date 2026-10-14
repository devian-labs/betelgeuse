/**
 * The documentation site (/docs): Markdown files rendered at build time.
 *
 * Two sources, one site:
 * - "Using Betelgeuse" is the app's own Welcome guide (apps/desktop/src-tauri/seed), so the docs and
 *   the guide every new workspace starts with can never disagree. Its Betelgeuse-flavoured Markdown
 *   (`[[links]]`, `> [!color] 💡` callouts, column layouts) is translated for the web here.
 * - Everything else (plugins, building plugins) is in docs/content/.
 *
 * The navigation below sets the order; each page's title comes from its frontmatter `title`, else
 * its file name.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Marked } from "marked";

const ROOT = path.resolve(process.cwd(), "../..");
const GUIDE = path.join(ROOT, "apps/desktop/src-tauri/seed");
const CONTENT = path.join(ROOT, "docs/content");

type Entry = { slug: string; file: string; title?: string };
export type Section = { title: string; pages: Entry[] };

const guide = (slug: string, name: string, title?: string): Entry => ({ slug: `guide/${slug}`, file: path.join(GUIDE, "Welcome", `${name}.md`), title: title ?? name });
const content = (slug: string): Entry => ({ slug, file: path.join(CONTENT, `${slug}.md`) });

export const NAV: Section[] = [
  {
    title: "Get started",
    pages: [{ slug: "", file: path.join(CONTENT, "index.md") }, content("install"), { slug: "guide", file: path.join(GUIDE, "Welcome.md"), title: "The Welcome guide" }],
  },
  {
    title: "Using Betelgeuse",
    pages: [
      guide("writing-and-blocks", "Writing and blocks"),
      guide("formatting-and-colours", "Formatting and colours"),
      guide("links-and-backlinks", "Links and backlinks"),
      guide("pages-and-sub-pages", "Pages and sub-pages"),
      guide("getting-around", "Getting around"),
      guide("databases", "Databases"),
      guide("history-and-sync", "History and sync"),
      guide("trash", "Trash"),
      guide("import", "Import"),
      guide("appearance", "Appearance"),
      guide("keyboard-shortcuts", "Keyboard shortcuts"),
      guide("your-files-on-disk", "Your files on disk"),
    ],
  },
  {
    title: "AI agents",
    pages: [guide("connect-your-ai-agents", "Connect your AI agents"), guide("what-ai-agents-can-see", "What AI agents can see")],
  },
  {
    title: "Plugins",
    pages: [content("plugins"), content("plugins/media-library")],
  },
  {
    title: "Build a plugin",
    pages: [
      content("developers/plugins"),
      content("developers/plugins/manifest"),
      content("developers/plugins/api"),
      content("developers/plugins/ui"),
      content("developers/plugins/publishing"),
    ],
  },
];

export const ALL = NAV.flatMap((s) => s.pages);

export type Doc = { slug: string; title: string; description: string; html: string; headings: { id: string; text: string; level: number }[]; section: string };

const split = (text: string) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {} as Record<string, string>, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length) };
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");

export const href = (slug: string) => (slug ? `/docs/${slug}/` : "/docs/");

/** Guide pages link with `[[Title]]`; on the web they go to that page's docs URL, if it has one. */
function wikiTarget(target: string) {
  const name = target.split("#")[0].split("/").pop()!.trim().toLowerCase();
  const hit = ALL.find((e) => (e.title ?? "").toLowerCase() === name || path.basename(e.file, ".md").toLowerCase() === name);
  return hit ? href(hit.slug) : null;
}

const CALLOUT_COLORS = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]);

/** Betelgeuse Markdown → web Markdown/HTML. Code (fenced or inline) is left exactly as written. */
function translate(source: string) {
  const code: string[] = [];
  const body = source.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => `\u0000${code.push(m) - 1}\u0000`);
  return (
    body
      // An embedded database (`![[Roadmap]]`) is live in the app; on the web, say what's there.
      .replace(/^!\[\[([^\]|]+)\]\][ \t]*$/gm, (_, target: string) =>
        `<div class="callout callout-gray"><span class="callout-icon">🗂️</span><div class="callout-body">\n\nIn the app, the **${target.split("/").pop()}** database is shown here, live.\n\n</div></div>`,
      )
      // [[Target|label]] and [[Target]]
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => {
        const text = label ?? target.split("/").pop()!;
        const url = wikiTarget(target);
        return url ? `[${text}](${url})` : `**${text}**`;
      })
      // Callouts: a quote whose first line is `[!color] icon`.
      .replace(/^> \[!([a-z]+)\][ \t]*(.*)\n((?:>.*(?:\n|$))*)/gm, (_, color: string, icon: string, rest: string) => {
        const inner = rest.replace(/^> ?/gm, "");
        const tone = CALLOUT_COLORS.has(color) ? color : "gray";
        return `<div class="callout callout-${tone}"><span class="callout-icon">${icon || "💡"}</span><div class="callout-body">\n\n${inner}\n\n</div></div>\n`;
      })
      // Column widths the app stores for tables.
      .replace(/<!-- table widths:[^>]*-->/g, "")
      .replace(/\u0000(\d+)\u0000/g, (_, i: string) => code[Number(i)])
  );
}

export function loadDoc(slug: string): Doc | null {
  const entry = ALL.find((e) => e.slug === slug);
  if (!entry) return null;
  const { meta, body } = split(readFileSync(entry.file, "utf8"));
  const title = meta.title ?? entry.title ?? path.basename(entry.file, ".md");
  const headings: Doc["headings"] = [];
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(text);
        if (depth === 2 || depth === 3) headings.push({ id, text: text.replace(/<[^>]+>/g, ""), level: depth });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${text}</a></h${depth}>\n`;
      },
      link({ href: url, title: t, tokens }) {
        const text = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(url);
        return `<a href="${url}"${t ? ` title="${t}"` : ""}${external ? ' rel="noopener" target="_blank"' : ""}>${text}</a>`;
      },
    },
  });
  const html = md.parse(translate(body)) as string;
  const description = meta.description ?? body.replace(/^#.*$/gm, "").replace(/[[\]*_`>#!-]/g, "").replace(/\s+/g, " ").trim().slice(0, 155);
  const section = NAV.find((s) => s.pages.includes(entry))!.title;
  return { slug, title, description, html, headings, section };
}

/** The pages before and after, for the footer. */
export function neighbours(slug: string) {
  const i = ALL.findIndex((e) => e.slug === slug);
  const title = (e?: Entry) => e && (loadDoc(e.slug)?.title ?? e.slug);
  return {
    prev: i > 0 ? { slug: ALL[i - 1].slug, title: title(ALL[i - 1])! } : null,
    next: i < ALL.length - 1 ? { slug: ALL[i + 1].slug, title: title(ALL[i + 1])! } : null,
  };
}

/** Titles for the navigation. */
export function navTitles() {
  return NAV.map((s) => ({ title: s.title, pages: s.pages.map((e) => ({ slug: e.slug, title: loadDoc(e.slug)?.title ?? e.slug })) }));
}

/** Where to edit a page on GitHub. */
export function sourcePath(slug: string) {
  const e = ALL.find((x) => x.slug === slug);
  return e ? path.relative(ROOT, e.file) : null;
}
