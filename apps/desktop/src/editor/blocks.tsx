/**
 * Rich blocks, each with a Markdown form that other tools can still read:
 *   colours    <span data-color="red" data-bg="yellow">text</span>
 *   callout    > [!yellow] 💡            (Obsidian callout syntax)
 *   toggle     <details><summary>…</summary> … </details>
 *   columns    <div class="columns"><div class="column"> … </div></div>
 *   database   ![[Tasks]]               (Obsidian embed syntax)
 */
import { PageIcon, assetUrl } from "../components/PageIcon";
import { Mark, Node, mergeAttributes, type JSONContent, type NodeViewRendererProps } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Details } from "@tiptap/extension-details";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Check, ChevronDown, Copy, FileText, Image as ImageIcon, Maximize2, Trash2, WrapText, X } from "lucide-react";
import { createPortal } from "react-dom";
import { common, createLowlight } from "lowlight";
import { createContext, useContext, useEffect, useState } from "react";
import { IconPicker } from "../components/IconPicker";
import { MenuItem, Popover } from "../components/Popover";
import { DatabaseView } from "../database/DatabaseView";
import { api } from "../lib/api";
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

/**
 * Splits a callout's first line into its icon and a title, as in Obsidian's `> [!note] Title`:
 * `🎬 Studio` is the icon 🎬 and the title "Studio"; a line without a leading icon is all title.
 */
function calloutHead(line: string): { icon: string; title: string } {
  const [first = "", ...rest] = line.trim().split(/\s+/);
  const isIcon = /^(lucide:|\.assets\/|https?:\/\/)/.test(first) || /^\p{Extended_Pictographic}/u.test(first);
  return isIcon ? { icon: first, title: rest.join(" ") } : { icon: "", title: line.trim() };
}

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
      const { icon, title } = calloutHead(m[2]);
      const body = m[3].replace(/\n$/, "").split("\n").map((l) => l.replace(/^> ?/, "")).join("\n");
      // A title on the first line opens the callout as a bold line, so it reads as one rather than
      // crowding the icon.
      const inner = title ? `**${title}**${body ? `\n\n${body}` : ""}` : body;
      return { type: "callout", raw: m[0], color: m[1], icon, tokens: lexer.blockTokens(inner) };
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
  // The stock view flips its open/closed look on events and can fall out of step with the saved
  // `open` (e.g. when a page opens with the cursor in a toggle): each click then flips it twice
  // and seems to do nothing. Here the look always follows `open`.
  addNodeView() {
    const make = this.parent!() as (props: NodeViewRendererProps) => NodeView;
    return (props) => {
      const view = make(props);
      const dom = view.dom as HTMLElement;
      const sync = (node: PMNode) => {
        const open = !!node.attrs.open;
        dom.classList.toggle("is-open", open);
        dom.querySelector(':scope > div > [data-type="detailsContent"]')?.toggleAttribute("hidden", !open);
      };
      setTimeout(() => sync(props.node)); // after the stock view's own first toggle
      const update = view.update?.bind(view);
      return {
        ...view,
        update: (node, decorations, inner) => {
          const ok = update ? update(node, decorations, inner) : false;
          if (ok) sync(node);
          return ok;
        },
      };
    };
  },
  addKeyboardShortcuts() {
    const base = this.parent?.() ?? {};
    return {
      ...base,
      // Backspace at the start of a toggle's title turns it back into text, its contents following.
      Backspace: (props) => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;
        if (empty && $from.parent.type.name === "detailsSummary" && $from.parentOffset === 0) {
          const depth = $from.depth - 1;
          const details = $from.node(depth);
          const pos = $from.before(depth);
          const blocks: PMNode[] = [state.schema.nodes.paragraph.create(null, details.child(0).content)];
          details.child(1).forEach((n) => {
            if (!(n.type.name === "paragraph" && n.content.size === 0 && details.child(1).childCount === 1)) blocks.push(n);
          });
          const tr = state.tr.replaceWith(pos, pos + details.nodeSize, blocks);
          view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView());
          return true;
        }
        return base.Backspace?.(props) ?? false;
      },
    };
  },
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

// ---------- tables ----------

/**
 * Column widths dragged in the editor are kept in a comment just above the table, which other
 * Markdown apps ignore: `<!-- table widths: 160, 0, 240 -->` (0 for a column left to fit its text).
 */
const WIDTHS = /^<!-- table widths: ([\d, ]+) -->[ \t]*\n/;
const base = Table.config;

export const WidthTable = Table.extend({
  markdownTokenizer: {
    name: "table",
    level: "block",
    start: (src: string) => {
      const comment = src.search(/^<!-- table widths:/m);
      const table = (base.markdownTokenizer!.start as (src: string) => number)(src);
      return comment >= 0 && (table < 0 || comment < table) ? comment : table;
    },
    tokenize(src, tokens, helper) {
      const m = WIDTHS.exec(src);
      const rest = m ? src.slice(m[0].length) : src;
      if (!m) return base.markdownTokenizer!.tokenize(src, tokens, helper);
      // The stock tokenizer only takes tables needing pipe escapes and leaves the rest to marked's.
      const token = base.markdownTokenizer!.tokenize(rest, tokens, helper) ?? helper.blockTokens(rest)[0];
      if (token?.type !== "table") return undefined;
      return { ...token, raw: m[0] + token.raw, widths: m[1].split(",").map((w) => Number(w.trim()) || 0) };
    },
  },
  parseMarkdown(token, h) {
    const table = this.parent!(token, h) as JSONContent;
    const widths = token.widths as number[] | undefined;
    if (widths?.some((w) => w > 0)) {
      for (const row of table.content ?? []) {
        row.content?.forEach((cell, i) => {
          if (widths[i] > 0) cell.attrs = { ...cell.attrs, colwidth: [widths[i]] };
        });
      }
    }
    return table;
  },
  renderMarkdown(node, h, ctx) {
    const md = this.parent!(node, h, ctx) as string;
    const first = ((node.content ?? []) as JSONContent[])[0]?.content ?? [];
    const widths = first.map((c) => (c.attrs?.colwidth as number[] | null)?.[0] ?? 0);
    // Straight above the table, after the blank lines the serializer puts before it (and only once,
    // should this run on output that already has it).
    const lead = /^\n*/.exec(md)![0];
    if (!widths.some((w) => w > 0) || md.startsWith("<!-- table widths", lead.length)) return md;
    return `${lead}<!-- table widths: ${widths.join(", ")} -->\n${md.slice(lead.length)}`;
  },
});

// ---------- columns ----------

/** `<div class="column">`, optionally with its share of the row: `data-width="0.8"` (Notion's ratio). */
const COLUMN_OPEN = /^<div class="column"(?: data-width="(\d*\.?\d+)")?>$/;

function takeColumns(src: string) {
  if (!src.startsWith('<div class="columns">')) return undefined;
  const lines = src.split("\n");
  const columns: string[] = [];
  const widths: (number | null)[] = [];
  let i = 1;
  let current: string[] | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    const open = current ? null : COLUMN_OPEN.exec(line);
    if (current) {
      if (line === "</div>") {
        columns.push(current.join("\n").trim());
        current = null;
      } else current.push(lines[i]);
    } else if (open) {
      current = [];
      widths.push(open[1] ? Number(open[1]) : null);
    } else if (line === "</div>") break;
    else if (line !== "") return undefined;
  }
  if (i >= lines.length || columns.length < 2) return undefined;
  const raw = lines.slice(0, i + 1).join("\n") + (i + 1 < lines.length ? "\n" : "");
  return { raw, columns, widths };
}

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  addAttributes() {
    return {
      // Share of the row (e.g. 0.8); columns without one split the row evenly.
      width: {
        default: null,
        parseHTML: (el) => (el.dataset.width ? Number(el.dataset.width) || null : null),
        renderHTML: (attrs) => (attrs.width ? { "data-width": attrs.width, style: `flex-grow: ${attrs.width}` } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-column]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-column": "", class: "column" }), 0];
  },
});

/** How close (px) to the border between two columns the pointer must be to resize them. */
const GRAB = 6;
/** Narrowest a column can be dragged (px). */
const MIN_COLUMN = 80;

/**
 * Drag the border between two columns to share their width differently. The grab strip is just
 * left of the gap (the gap itself holds the block handle of the right-hand column); the new
 * shares are saved as each column's `width`.
 */
function columnResizing() {
  let line: HTMLDivElement | null = null;
  // The column whose left border is under the pointer.
  const borderAt = (view: EditorView, e: MouseEvent): HTMLElement | null => {
    for (const list of view.dom.querySelectorAll<HTMLElement>(".columns")) {
      const r = list.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) continue;
      const cols = [...list.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains("column"));
      for (const col of cols.slice(1)) {
        const x = col.getBoundingClientRect().left;
        if (e.clientX >= x - GRAB && e.clientX <= x + 2) return col;
      }
    }
    return null;
  };
  const show = (view: EditorView, col: HTMLElement | null) => {
    view.dom.style.cursor = col ? "col-resize" : "";
    if (!line) return;
    if (!col) return void (line.style.display = "none");
    const list = col.parentElement!.getBoundingClientRect();
    // On the grab strip itself, so the line sits under the pointer.
    const x = col.getBoundingClientRect().left - GRAB / 2 + 1;
    Object.assign(line.style, { display: "block", left: `${x - 1}px`, top: `${list.top}px`, height: `${list.height}px` });
  };

  return new Plugin({
    key: new PluginKey("columnResizing"),
    view() {
      line = document.createElement("div");
      line.className = "column-resize-line";
      document.body.appendChild(line);
      return { destroy: () => (line?.remove(), (line = null)) };
    },
    props: {
      handleDOMEvents: {
        mousemove(view, e) {
          if (e.buttons === 0) show(view, borderAt(view, e));
          return false;
        },
        mouseleave(view) {
          show(view, null);
          return false;
        },
        mousedown(view, e) {
          const right = e.button === 0 ? borderAt(view, e) : null;
          if (!right) return false;
          e.preventDefault();
          const list = right.parentElement!;
          const cols = [...list.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains("column"));
          const at = cols.indexOf(right);
          // The row's columns in the document, and their content widths now.
          const $in = view.state.doc.resolve(view.posAtDOM(cols[0], 0));
          let depth = $in.depth;
          while (depth > 0 && $in.node(depth).type.name !== "columnList") depth--;
          if (!depth) return false;
          const listPos = $in.before(depth);
          const start = cols.map((c) => c.clientWidth - (parseFloat(getComputedStyle(c).paddingLeft) || 0));
          const startX = e.clientX;
          const original = view.state.doc.nodeAt(listPos)!;

          const apply = (widths: number[], history: boolean) => {
            const total = widths.reduce((a, b) => a + b, 0);
            const tr = view.state.tr;
            let pos = listPos + 1;
            view.state.doc.nodeAt(listPos)!.forEach((col, _o, i) => {
              tr.setNodeMarkup(pos, undefined, { ...col.attrs, width: Number((widths[i] / total).toFixed(3)) });
              pos += col.nodeSize;
            });
            if (!history) tr.setMeta("addToHistory", false);
            view.dispatch(tr);
          };
          const widthsFor = (x: number) => {
            const pair = start[at - 1] + start[at];
            const left = Math.min(pair - MIN_COLUMN, Math.max(MIN_COLUMN, start[at - 1] + x - startX));
            return start.map((w, i) => (i === at - 1 ? left : i === at ? pair - left : w));
          };
          // Resizing redraws the columns, so the line follows the column as it is now.
          const current = () => {
            const el = view.nodeDOM(listPos);
            return el instanceof HTMLElement ? (el.querySelectorAll<HTMLElement>(":scope > .column")[at] ?? null) : null;
          };
          let last = start;
          const move = (ev: MouseEvent) => {
            last = widthsFor(ev.clientX);
            apply(last, false);
            show(view, current());
          };
          const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            document.body.style.removeProperty("cursor");
            document.body.style.removeProperty("user-select");
            // One undo step for the whole drag: back to where it started, then the result.
            const tr = view.state.tr.replaceWith(listPos, listPos + view.state.doc.nodeAt(listPos)!.nodeSize, original);
            view.dispatch(tr.setMeta("addToHistory", false));
            if (last !== start) apply(last, true);
            show(view, null);
          };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
          return true;
        },
      },
    },
  });
}

export const ColumnList = Node.create({
  name: "columnList",
  addKeyboardShortcuts() {
    return {
      // Backspace at the start of a block right below columns would join it into the row as a new
      // column. Instead: an empty block goes, a block with text stays; the cursor moves to the end
      // of the last column.
      Backspace: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== 0 || !$from.parent.isTextblock) return false;
        const blockPos = $from.before($from.depth);
        if (state.doc.resolve(blockPos).nodeBefore?.type.name !== this.name) return false;
        const tr = state.tr;
        if ($from.parent.content.size === 0) tr.delete(blockPos, blockPos + $from.parent.nodeSize);
        // blockPos - 2: inside the last column, at its end.
        view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(blockPos - 2), -1)).scrollIntoView());
        return true;
      },
    };
  },
  group: "block",
  content: "column{2,}",
  defining: true,
  addProseMirrorPlugins() {
    return [columnResizing()];
  },
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
      return { type: "columnList", raw: c.raw, columns: c.columns.map((col) => lexer.blockTokens(col)), widths: c.widths };
    },
  },
  parseMarkdown: (token, h) => ({
    type: "columnList",
    content: (token.columns as never[][]).map((toks, i) => {
      const content = h.parseChildren(toks);
      const width = (token.widths as (number | null)[] | undefined)?.[i] ?? null;
      return { type: "column", attrs: { width }, content: content.length ? content : [{ type: "paragraph" }] };
    }),
  }),
  renderMarkdown: (node, h) =>
    `<div class="columns">\n${((node.content ?? []) as JSONContent[])
      .map((col) => `<div class="column"${col.attrs?.width ? ` data-width="${col.attrs.width}"` : ""}>\n\n${h.renderChildren(col.content ?? [], "\n\n").trim()}\n\n</div>`)
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

/** The vault path of the page an editor shows, for blocks that behave differently by page. */
export const PageContext = createContext<string | null>(null);

function EmbedView({ node }: NodeViewProps) {
  const { notes, openPage } = useVault();
  const page = useContext(PageContext);
  const target = resolveWikiLink(node.attrs.target, notes);
  // A database shown away from home (not on its own page or the page it sits under) is a linked
  // copy: its views and filters belong to this page.
  const parent = target?.path.includes("/") ? `${target.path.slice(0, target.path.lastIndexOf("/"))}.md` : null;
  const home = !page || !target || target.path === page || parent === page;
  const scope = home ? undefined : `[[${page!.replace(/\.md$/, "")}]]`;
  return (
    <NodeViewWrapper className="my-2" contentEditable={false}>
      {target?.kind === "database" ? (
        <DatabaseView path={target.path} inline scope={scope} />
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
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("imageFiles"),
        props: {
          // Image files dropped (e.g. from Finder) or pasted are copied into `.assets/` and embedded.
          handleDrop: (view, event, _slice, moved) => {
            const files = imageFiles(event.dataTransfer);
            if (moved || !files.length) return false;
            event.preventDefault();
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
            insertImages(view, files, at ? at.pos : view.state.selection.from);
            return true;
          },
          handlePaste: (view, event) => {
            const files = imageFiles(event.clipboardData);
            if (!files.length) return false;
            event.preventDefault();
            insertImages(view, files, view.state.selection.from);
            return true;
          },
        },
      }),
    ];
  },
});

function imageFiles(data: DataTransfer | null) {
  return Array.from(data?.files ?? []).filter((f) => f.type.startsWith("image/"));
}

async function insertImages(view: EditorView, files: File[], pos: number) {
  for (const file of files) {
    let src: string;
    try {
      src = await api.saveAsset(file.name || "image.png", [...new Uint8Array(await file.arrayBuffer())]);
    } catch (e) {
      console.error("Couldn't save the image", e);
      continue;
    }
    if (view.isDestroyed) return;
    const { state } = view;
    const at = Math.min(pos, state.doc.content.size);
    const tr = state.tr.replaceRangeWith(at, at, state.schema.nodes.image.create({ src, alt: file.name.replace(/\.\w+$/, "") }));
    view.dispatch(tr);
    // The next image goes right after this one.
    pos = tr.mapping.map(at);
  }
}

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
  return <ImageBlockView src={node.attrs.src} alt={node.attrs.alt ?? ""} selected={selected} onDelete={deleteNode} />;
}

/** An image block: a hover toolbar (view full size, copy, delete); double-click views it too. */
function ImageBlockView({ src, alt, selected, onDelete }: { src: string; alt: string; selected: boolean; onDelete: () => void }) {
  const url = useAssetUrl(src);
  const [viewing, setViewing] = useState(false);
  const [copied, setCopied] = useState(false);
  // Toolbar buttons act on mouse down and keep the editor from treating the press as its own.
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  return (
    <NodeViewWrapper className={`group/img relative my-1 w-fit max-w-full ${selected ? "rounded ring-2 ring-[var(--blue)]/50" : ""}`}>
      {url ? (
        <>
          <img src={url} alt={alt} className="block max-w-full rounded-sm" draggable={false} />
          {/* Covers the photo so WebKit's Live Text can't pick out words in it: a click selects the
              image block, a double-click views it full size. */}
          <div className="absolute inset-0" onDoubleClick={() => setViewing(true)} />
        </>
      ) : (
        <div className="h-24 w-64 animate-pulse rounded-sm bg-hover" />
      )}
      {url && (
        <div
          contentEditable={false}
          className="absolute top-2 right-2 flex items-center gap-0.5 rounded-md border border-line bg-raised/95 p-0.5 opacity-0 shadow-pop transition-opacity group-hover/img:opacity-100"
        >
          <ImgButton title="View full size" onMouseDown={act(() => setViewing(true))}>
            <Maximize2 size={14} />
          </ImgButton>
          <ImgButton
            title={copied ? "Copied" : "Copy image"}
            onMouseDown={act(() =>
              copyImage(url).then(
                () => (setCopied(true), setTimeout(() => setCopied(false), 1200)),
                () => {},
              ),
            )}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </ImgButton>
          <ImgButton title="Delete image" onMouseDown={act(onDelete)}>
            <Trash2 size={14} />
          </ImgButton>
        </div>
      )}
      {viewing && url && <Lightbox url={url} alt={alt} onClose={() => setViewing(false)} />}
    </NodeViewWrapper>
  );
}

const ImgButton = ({ title, onMouseDown, children }: { title: string; onMouseDown: (e: React.MouseEvent) => void; children: React.ReactNode }) => (
  <button title={title} onMouseDown={onMouseDown} className="grid size-7 place-items-center rounded text-muted hover:bg-hover hover:text-ink">
    {children}
  </button>
);

/** The image filling the window over a dimmed page; a click anywhere or Escape closes it. */
function Lightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  return createPortal(
    <div onMouseDown={onClose} className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/85 p-8">
      <img src={url} alt={alt} className="max-h-[88vh] max-w-[92vw] object-contain shadow-2xl select-none" draggable={false} />
      {alt && <div className="max-w-[80vw] truncate text-sm text-white/70">{alt}</div>}
      <button title="Close (Esc)" className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10">
        <X size={18} />
      </button>
    </div>,
    document.body,
  );
}

/** Copies an image as PNG (the type the clipboard takes everywhere). */
async function copyImage(url: string) {
  const blob = await (await fetch(url)).blob();
  const png =
    blob.type === "image/png"
      ? blob
      : await new Promise<Blob>((resolve, reject) => {
          const img = new window.Image(); // (Image here is the editor extension)
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext("2d")!.drawImage(img, 0, 0);
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png");
          };
          img.onerror = reject;
          img.src = url;
        });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/** Images can point into the workspace's `.assets/` folder, which the webview can't load directly. */
function useAssetUrl(src: string) {
  const local = src.startsWith(".assets/");
  const [url, setUrl] = useState<string | null>(local ? null : src);
  useEffect(() => {
    if (!local) return setUrl(src);
    let alive = true;
    assetUrl(src).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [src, local]);
  return url;
}
