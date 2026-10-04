/**
 * Notion-style blocks, each with a Markdown form that other tools can still read:
 *   colours    <span data-color="red" data-bg="yellow">text</span>
 *   callout    > [!yellow] 💡            (Obsidian callout syntax)
 *   toggle     <details><summary>…</summary> … </details>
 *   columns    <div class="columns"><div class="column"> … </div></div>
 *   database   ![[Tasks]]               (Obsidian embed syntax)
 */
import { PageIcon, assetUrl } from "../components/PageIcon";
import { Mark, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Details } from "@tiptap/extension-details";
import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Check, ChevronDown, Copy, FileText, Image as ImageIcon, WrapText } from "lucide-react";
import { common, createLowlight } from "lowlight";
import { useEffect, useState } from "react";
import { IconPicker } from "../components/IconPicker";
import { MenuItem, Popover } from "../components/Popover";
import { DatabaseView } from "../database/DatabaseView";
import { COLORS, bgColor, textColor } from "../lib/colors";
import { resolveWikiLink } from "../lib/tree";
import { useVault } from "../lib/vault";

const isColor = (c: unknown): c is string => typeof c === "string" && (COLORS as readonly string[]).includes(c);

// ---------- text colour ----------

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    color: {
      /** Merges text and/or background colour into the selection; "default" clears that part. */
      setColor: (attrs: { color?: string; bg?: string }) => ReturnType;
    };
  }
}

const KEEP_COLOR = "keepColor";

const SPAN = /^<span((?:\s+data-(?:color|bg)="[a-z]+")+)\s*>([\s\S]*?)<\/span>/;

export const ColorMark = Mark.create({
  name: "color",
  addAttributes() {
    return {
      color: { default: null, parseHTML: (el) => el.getAttribute("data-color") },
      bg: { default: null, parseHTML: (el) => el.getAttribute("data-bg") },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-color]" }, { tag: "span[data-bg]" }];
  },
  renderHTML({ mark }) {
    const { color, bg } = mark.attrs;
    const style = [textColor(color) && `color: ${textColor(color)}`, bgColor(bg) && `background: ${bgColor(bg)}`].filter(Boolean).join("; ");
    return ["span", { "data-color": color, "data-bg": bg, style, class: bg ? "has-bg" : undefined }, 0];
  },
  addCommands() {
    return {
      setColor:
        (attrs) =>
        ({ editor, commands, tr }) => {
          tr.setMeta(KEEP_COLOR, true);
          const current = editor.getAttributes("color");
          const next = { ...current, ...attrs };
          const clean = {
            color: next.color && next.color !== "default" ? next.color : null,
            bg: next.bg && next.bg !== "default" ? next.bg : null,
          };
          return clean.color || clean.bg ? commands.setMark(this.name, clean) : commands.unsetMark(this.name);
        },
    };
  },
  // Pressing Enter starts the next block without the previous block's colour.
  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: new PluginKey("colorNotInherited"),
        appendTransaction: (trs, oldState, state) => {
          if (!trs.some((t) => t.docChanged) || trs.some((t) => t.getMeta(KEEP_COLOR))) return null;
          const { $from, empty } = state.selection;
          const stored = state.storedMarks;
          const freshBlock = empty && $from.parent.isTextblock && $from.parent.content.size === 0 && state.doc.content.size > oldState.doc.content.size;
          if (!freshBlock || !stored?.some((m) => m.type === type)) return null;
          return state.tr.setStoredMarks(stored.filter((m) => m.type !== type));
        },
      }),
    ];
  },
  markdownTokenizer: {
    name: "color",
    level: "inline",
    start: (src: string) => src.indexOf("<span data-"),
    tokenize(src, _tokens, lexer) {
      const m = SPAN.exec(src);
      if (!m) return undefined;
      const attr = (k: string) => new RegExp(`data-${k}="([a-z]+)"`).exec(m[1])?.[1] ?? null;
      return { type: "color", raw: m[0], color: attr("color"), bg: attr("bg"), tokens: lexer.inlineTokens(m[2]) };
    },
  },
  parseMarkdown: (token, h) => h.applyMark("color", h.parseInline(token.tokens ?? []), { color: token.color, bg: token.bg }),
  renderMarkdown: (node, h) => {
    const { color, bg } = node.attrs ?? {};
    const attrs = `${color ? ` data-color="${color}"` : ""}${bg ? ` data-bg="${bg}"` : ""}`;
    return `<span${attrs}>${h.renderChildren(node)}</span>`;
  },
});

// ---------- callout ----------

const CALLOUT = /^> ?\[!([a-z]+)\][ \t]*([^\n]*)(?:\n|$)((?:>[^\n]*(?:\n|$))*)/;

/** Prefixes every line with `> `, using a bare `>` for blank lines. */
const quote = (text: string) => text.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      icon: { default: "💡", parseHTML: (el) => el.getAttribute("data-icon") },
      color: { default: "gray", parseHTML: (el) => el.getAttribute("data-color") },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "", "data-icon": node.attrs.icon, "data-color": node.attrs.color }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src: string) => src.search(/^> ?\[!/m),
    tokenize(src, _tokens, lexer) {
      const m = CALLOUT.exec(src);
      if (!m) return undefined;
      const inner = m[3].replace(/\n$/, "").split("\n").map((l) => l.replace(/^> ?/, "")).join("\n");
      return { type: "callout", raw: m[0], color: m[1], icon: m[2].trim(), tokens: lexer.blockTokens(inner) };
    },
  },
  parseMarkdown: (token, h) => {
    const content = h.parseChildren(token.tokens ?? []);
    return {
      type: "callout",
      attrs: { color: isColor(token.color) ? token.color : "gray", icon: token.icon || "💡" },
      content: content.length ? content : [{ type: "paragraph" }],
    };
  },
  renderMarkdown: (node, h) => `> [!${node.attrs?.color ?? "gray"}] ${node.attrs?.icon ?? "💡"}\n${quote(h.renderChildren(node.content ?? [], "\n\n"))}`,
});

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const [picking, setPicking] = useState(false);
  const color = node.attrs.color === "default" ? null : node.attrs.color;
  return (
    <NodeViewWrapper className="callout" style={{ background: color ? bgColor(color) : undefined }} data-plain={!color || undefined}>
      <div contentEditable={false} className="callout-icon relative">
        <button onClick={() => setPicking(true)} className="grid size-6 place-items-center rounded hover:bg-hover">
          <PageIcon icon={node.attrs.icon} size={20} />
        </button>
        {picking && (
          <IconPicker
            current={node.attrs.icon}
            onClose={() => setPicking(false)}
            onPick={(icon) => {
              setPicking(false);
              updateAttributes({ icon: icon ?? "💡" });
            }}
          />
        )}
      </div>
      <NodeViewContent className="callout-content" />
    </NodeViewWrapper>
  );
}

// ---------- toggle ----------

function takeDetails(src: string) {
  const head = /^<details( open)?>[ \t]*\n?[ \t]*<summary>([\s\S]*?)<\/summary>[ \t]*(?:\n|$)/.exec(src);
  if (!head) return undefined;
  let depth = 1;
  const tag = /<details(?: open)?>|<\/details>/g;
  tag.lastIndex = head[0].length;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(src))) {
    depth += m[0] === "</details>" ? -1 : 1;
    if (depth === 0) {
      const end = m.index + m[0].length;
      const raw = src.slice(0, end) + (src[end] === "\n" ? "\n" : "");
      return { raw, open: !!head[1], summary: head[2].trim(), inner: src.slice(head[0].length, m.index).trim() };
    }
  }
  return undefined;
}

export const Toggle = Details.extend({
  markdownTokenizer: {
    name: "details",
    level: "block",
    start: (src: string) => src.indexOf("<details"),
    tokenize(src, _tokens, lexer) {
      const d = takeDetails(src);
      if (!d) return undefined;
      return { type: "details", raw: d.raw, open: d.open, summaryTokens: lexer.inlineTokens(d.summary), tokens: lexer.blockTokens(d.inner) };
    },
  },
  parseMarkdown: (token, h) => {
    const content = h.parseChildren(token.tokens ?? []);
    return {
      type: "details",
      attrs: { open: token.open },
      content: [
        { type: "detailsSummary", content: h.parseInline(token.summaryTokens ?? []) },
        { type: "detailsContent", content: content.length ? content : [{ type: "paragraph" }] },
      ],
    };
  },
  renderMarkdown: (node, h) => {
    const [summary, body] = (node.content ?? []) as JSONContent[];
    const inner = body ? h.renderChildren(body.content ?? [], "\n\n").trim() : "";
    return `<details${node.attrs?.open ? " open" : ""}>\n<summary>${summary ? h.renderChildren(summary) : ""}</summary>\n\n${inner}\n\n</details>`;
  },
}).configure({ persist: true });

// ---------- columns ----------

function takeColumns(src: string) {
  if (!src.startsWith('<div class="columns">')) return undefined;
  const lines = src.split("\n");
  const columns: string[] = [];
  let i = 1;
  let current: string[] | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (current) {
      if (line === "</div>") {
        columns.push(current.join("\n").trim());
        current = null;
      } else current.push(lines[i]);
    } else if (line === '<div class="column">') current = [];
    else if (line === "</div>") break;
    else if (line !== "") return undefined;
  }
  if (i >= lines.length || columns.length < 2) return undefined;
  const raw = lines.slice(0, i + 1).join("\n") + (i + 1 < lines.length ? "\n" : "");
  return { raw, columns };
}

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML() {
    return [{ tag: "div[data-column]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-column": "", class: "column" }), 0];
  },
});

export const ColumnList = Node.create({
  name: "columnList",
  group: "block",
  content: "column{2,}",
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-columns]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-columns": "", class: "columns" }), 0];
  },
  markdownTokenizer: {
    name: "columnList",
    level: "block",
    start: (src: string) => src.indexOf('<div class="columns">'),
    tokenize(src, _tokens, lexer) {
      const c = takeColumns(src);
      if (!c) return undefined;
      return { type: "columnList", raw: c.raw, columns: c.columns.map((col) => lexer.blockTokens(col)) };
    },
  },
  parseMarkdown: (token, h) => ({
    type: "columnList",
    content: (token.columns as never[][]).map((toks) => {
      const content = h.parseChildren(toks);
      return { type: "column", content: content.length ? content : [{ type: "paragraph" }] };
    }),
  }),
  renderMarkdown: (node, h) =>
    `<div class="columns">\n${((node.content ?? []) as JSONContent[])
      .map((col) => `<div class="column">\n\n${h.renderChildren(col.content ?? [], "\n\n").trim()}\n\n</div>`)
      .join("\n")}\n</div>`,
});

// ---------- embedded database / page ----------

export const DatabaseEmbed = Node.create({
  name: "databaseEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { target: { default: "", parseHTML: (el) => el.getAttribute("data-target") } };
  },
  parseHTML() {
    return [{ tag: "div[data-embed]" }];
  },
  renderHTML({ node }) {
    return ["div", { "data-embed": "", "data-target": node.attrs.target }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(EmbedView, { stopEvent: ({ event }) => !event.type.startsWith("drag"), ignoreMutation: () => true });
  },
  markdownTokenizer: {
    name: "databaseEmbed",
    level: "block",
    start: (src: string) => src.indexOf("![["),
    tokenize(src) {
      const m = /^!\[\[([^\]\n|]+)\]\][ \t]*(?:\n|$)/.exec(src);
      return m ? { type: "databaseEmbed", raw: m[0], target: m[1].trim() } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: "databaseEmbed", attrs: { target: token.target } }),
  renderMarkdown: (node) => `![[${node.attrs?.target}]]`,
});

function EmbedView({ node }: NodeViewProps) {
  const { notes, openPage } = useVault();
  const target = resolveWikiLink(node.attrs.target, notes);
  return (
    <NodeViewWrapper className="my-2" contentEditable={false}>
      {target?.kind === "database" ? (
        <DatabaseView path={target.path} inline />
      ) : (
        <button onClick={() => target && openPage(target.path)} className="flex w-full items-center gap-2 rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-hover">
          {target?.icon ? <PageIcon icon={target.icon} size={18} /> : <FileText size={16} className="text-faint" />}
          <span className={target ? "text-ink" : "text-faint"}>{target ? target.title : `Missing page: ${node.attrs.target}`}</span>
        </button>
      )}
    </NodeViewWrapper>
  );
}

// ---------- code block ----------

export const lowlight = createLowlight(common);

export const LANGUAGES: [string, string][] = [
  ["", "Plain text"],
  ["bash", "Bash"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["css", "CSS"],
  ["diff", "Diff"],
  ["go", "Go"],
  ["graphql", "GraphQL"],
  ["xml", "HTML / XML"],
  ["ini", "INI / TOML"],
  ["java", "Java"],
  ["javascript", "JavaScript"],
  ["json", "JSON"],
  ["kotlin", "Kotlin"],
  ["lua", "Lua"],
  ["makefile", "Makefile"],
  ["markdown", "Markdown"],
  ["objectivec", "Objective-C"],
  ["php", "PHP"],
  ["python", "Python"],
  ["r", "R"],
  ["ruby", "Ruby"],
  ["rust", "Rust"],
  ["scss", "SCSS"],
  ["shell", "Shell"],
  ["sql", "SQL"],
  ["swift", "Swift"],
  ["typescript", "TypeScript"],
  ["yaml", "YAML"],
];

const ALIASES: Record<string, string> = { js: "javascript", ts: "typescript", sh: "bash", zsh: "bash", py: "python", rs: "rust", html: "xml", yml: "yaml", toml: "ini", jsx: "javascript", tsx: "typescript" };

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight, defaultLanguage: null, enableTabIndentation: true });

function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const lang = ALIASES[node.attrs.language] ?? node.attrs.language ?? "";
  const label = LANGUAGES.find(([id]) => id === lang)?.[1] ?? (lang || "Plain text");

  return (
    <NodeViewWrapper className="code-block group/code">
      <div contentEditable={false} className="code-toolbar">
        <button onClick={(e) => setMenu(e.currentTarget)} className="flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-hover">
          {label} <ChevronDown size={12} />
        </button>
        <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/code:opacity-100">
          <button onClick={() => setWrap((w) => !w)} className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover ${wrap ? "text-ink" : ""}`}>
            <WrapText size={12} /> Wrap
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(node.textContent);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
          </button>
        </span>
      </div>
      <pre className={wrap ? "wrap" : ""}>
        <NodeViewContent<"code"> as="code" className={lang ? `language-${lang}` : undefined} />
      </pre>
      {menu && (
        <Popover anchor={menu} onClose={() => (setMenu(null), setQuery(""))} className="w-56 p-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a language…"
            className="mb-1 h-7 w-full rounded-md border border-line bg-side px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
          />
          <div className="max-h-64 overflow-y-auto">
            {LANGUAGES.filter(([, name]) => name.toLowerCase().includes(query.toLowerCase())).map(([id, name]) => (
              <MenuItem
                key={id || "plain"}
                label={name}
                right={id === lang ? <Check size={14} className="text-muted" /> : null}
                onClick={() => {
                  updateAttributes({ language: id || null });
                  setMenu(null);
                  setQuery("");
                }}
              />
            ))}
          </div>
        </Popover>
      )}
    </NodeViewWrapper>
  );
}

// ---------- image ----------

export const ImageBlock = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

function ImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [link, setLink] = useState("");
  if (!node.attrs.src) {
    return (
      <NodeViewWrapper contentEditable={false} className="my-1">
        <div className="rounded-md bg-side p-3">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted">
            <ImageIcon size={16} /> Add an image
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) updateAttributes({ src: link.trim() });
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && deleteNode()}
              placeholder="Paste the image link…"
              className="h-8 min-w-0 flex-1 rounded-md border border-line bg-raised px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
            />
            <button className="h-8 rounded-md bg-[var(--blue)] px-3 text-sm font-medium text-white">Embed image</button>
          </form>
        </div>
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper className={`my-1 ${selected ? "rounded ring-2 ring-[var(--blue)]/50" : ""}`}>
      <AssetImg src={node.attrs.src} alt={node.attrs.alt ?? ""} />
    </NodeViewWrapper>
  );
}

/** Images can point into the workspace's `.assets/` folder, which the webview can't load directly. */
function AssetImg({ src, alt }: { src: string; alt: string }) {
  const local = src.startsWith(".assets/");
  const [url, setUrl] = useState(local ? null : src);
  useEffect(() => {
    if (!local) return setUrl(src);
    let alive = true;
    assetUrl(src).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [src, local]);
  return url ? <img src={url} alt={alt} className="max-w-full rounded-sm" draggable={false} /> : <div className="h-24 animate-pulse rounded-sm bg-hover" />;
}
