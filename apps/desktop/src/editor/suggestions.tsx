import { Extension, type Editor, type Range } from "@tiptap/core";
import { PageIcon } from "../components/PageIcon";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import {
  CalendarDays,
  ChevronRight,
  Columns2,
  Columns3,
  Columns4,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Plus,
  Quote,
  SquareCode,
  Table,
  Table2,
  Type,
  Database,
} from "lucide-react";
import type { ReactNode } from "react";
import type { NoteMeta } from "../lib/api";
import { COLORS, bgColor, colorLabel, textColor } from "../lib/colors";
import { SuggestionMenu, type MenuHandle, type MenuItem } from "./SuggestionMenu";

type Action = {
  id: string;
  title: string;
  hint?: string;
  icon: ReactNode;
  section?: string;
  keywords?: string;
  shortcut?: string;
  action: (editor: Editor, range: Range) => void;
};

/** Renders a suggestion popup under the caret, flipping above it near the bottom of the window. */
function popup(empty: string): SuggestionOptions<Action>["render"] {
  return () => {
    let renderer: ReactRenderer<MenuHandle> | null = null;
    const host = document.createElement("div");
    host.className = "fixed z-50";

    const toMenu = (props: { items: Action[]; command: (a: Action) => void }): MenuItem[] =>
      props.items.map((a) => ({ ...a, run: () => props.command(a) }));

    const place = (rect?: DOMRect | null) => {
      if (!rect) return;
      const below = window.innerHeight - rect.bottom > 380;
      host.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
      host.style.top = below ? `${rect.bottom + 6}px` : "";
      host.style.bottom = below ? "" : `${window.innerHeight - rect.top + 6}px`;
    };

    return {
      onStart: (props) => {
        renderer = new ReactRenderer(SuggestionMenu, { props: { items: toMenu(props), empty }, editor: props.editor });
        host.append(renderer.element);
        document.body.append(host);
        place(props.clientRect?.());
      },
      onUpdate: (props) => {
        renderer?.updateProps({ items: toMenu(props), empty });
        place(props.clientRect?.());
      },
      onKeyDown: ({ event }) => {
        if (event.key === "Escape") {
          host.remove();
          return true;
        }
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit: () => {
        renderer?.destroy();
        host.remove();
      },
    };
  };
}

const run = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

/** Applies a colour to the whole current block, and keeps it for text typed next. */
export function colorBlock(editor: Editor, attrs: { color?: string; bg?: string }) {
  const { $from } = editor.state.selection;
  const from = $from.start();
  const to = $from.end();
  if (from === to) return editor.chain().focus().setColor(attrs).run();
  editor.chain().focus().setTextSelection({ from, to }).setColor(attrs).setTextSelection(to).run();
}

const columns = (n: number) => ({
  type: "columnList",
  content: Array.from({ length: n }, () => ({ type: "column", content: [{ type: "paragraph" }] })),
});

export type PageActions = {
  /** Creates a sub-page of the current page and returns its vault path. */
  createSubpage: () => Promise<string>;
  /** Creates a database under the current page and returns its vault path. */
  createDatabase: () => Promise<string>;
};

const section = (name: string, items: Action[]): Action[] => items.map((a) => ({ ...a, section: name }));

const stem = (path: string) => path.replace(/\.md$/, "");

function blocks(page: PageActions): Action[] {
  const basic: Action[] = section("Basic blocks", [
    { id: "text", title: "Text", icon: <Type size={18} />, keywords: "paragraph plain", action: (e, r) => run(e, r).setParagraph().run() },
    {
      id: "page",
      title: "Page",
      hint: "Embed a sub-page inside this page",
      icon: <FileText size={18} />,
      keywords: "subpage",
      action: (e, r) => {
        run(e, r).run();
        void page.createSubpage().then((path) =>
          e.chain().focus().insertContent([{ type: "wikiLink", attrs: { target: stem(path).split("/").pop() } }, { type: "text", text: " " }]).run(),
        );
      },
    },
    { id: "todo", title: "To-do list", icon: <ListTodo size={18} />, keywords: "task checkbox", shortcut: "[]", action: (e, r) => run(e, r).toggleTaskList().run() },
    { id: "h1", title: "Heading 1", icon: <Heading1 size={18} />, keywords: "title big", shortcut: "#", action: (e, r) => run(e, r).setNode("heading", { level: 1 }).run() },
    { id: "h2", title: "Heading 2", icon: <Heading2 size={18} />, keywords: "subtitle", shortcut: "##", action: (e, r) => run(e, r).setNode("heading", { level: 2 }).run() },
    { id: "h3", title: "Heading 3", icon: <Heading3 size={18} />, shortcut: "###", action: (e, r) => run(e, r).setNode("heading", { level: 3 }).run() },
    { id: "table", title: "Table", icon: <Table size={18} />, keywords: "grid simple", action: (e, r) => run(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: "bullet", title: "Bulleted list", icon: <List size={18} />, keywords: "ul unordered", shortcut: "-", action: (e, r) => run(e, r).toggleBulletList().run() },
    { id: "number", title: "Numbered list", icon: <ListOrdered size={18} />, keywords: "ol ordered", shortcut: "1.", action: (e, r) => run(e, r).toggleOrderedList().run() },
    { id: "toggle", title: "Toggle list", icon: <ChevronRight size={18} />, keywords: "details collapse expand", action: (e, r) => run(e, r).setDetails().run() },
    { id: "quote", title: "Quote", icon: <Quote size={18} />, keywords: "blockquote", shortcut: ">", action: (e, r) => run(e, r).toggleBlockquote().run() },
    { id: "divider", title: "Divider", icon: <Minus size={18} />, keywords: "hr rule line", shortcut: "---", action: (e, r) => run(e, r).setHorizontalRule().run() },
    { id: "callout", title: "Callout", icon: <Lightbulb size={18} />, keywords: "note info warning tip", action: (e, r) => run(e, r).wrapIn("callout").run() },
    { id: "page-link", title: "Link to page", icon: <FileText size={18} />, keywords: "wiki mention", shortcut: "[[", action: (e, r) => run(e, r).insertContent("[[").run() },
  ]);

  const inline: Action[] = [
    {
      id: "date",
      title: "Date or reminder",
      icon: <CalendarDays size={18} />,
      keywords: "today now",
      section: "Inline",
      action: (e, r) => run(e, r).insertContent(new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) + " ").run(),
    },
  ];

  const database: Action[] = section("Database", [
    {
      id: "db-inline",
      title: "Database – Inline",
      hint: "Table, board, calendar… inside this page",
      icon: <Table2 size={18} />,
      keywords: "table board kanban calendar gallery list",
      action: (e, r) => {
        run(e, r).run();
        // Leave the cursor on a new line below rather than selecting the embedded database.
        void page.createDatabase().then((path) =>
          e.chain().focus().insertContent([{ type: "databaseEmbed", attrs: { target: stem(path) } }, { type: "paragraph" }]).run(),
        );
      },
    },
    {
      id: "db-page",
      title: "Database – Full page",
      hint: "Create a database as a sub-page",
      icon: <Database size={18} />,
      keywords: "table board kanban",
      action: (e, r) => {
        run(e, r).run();
        void page.createDatabase().then((path) =>
          e.chain().focus().insertContent([{ type: "wikiLink", attrs: { target: stem(path).split("/").pop() } }, { type: "text", text: " " }]).run(),
        );
      },
    },
  ]);

  const media: Action[] = section("Media", [
    {
      id: "image",
      title: "Image",
      hint: "Embed an image from a link",
      icon: <Image size={18} />,
      keywords: "picture photo",
      action: (e, r) => run(e, r).insertContent({ type: "image", attrs: { src: "" } }).run(),
    },
    { id: "code", title: "Code", icon: <SquareCode size={18} />, keywords: "snippet pre", shortcut: "```", action: (e, r) => run(e, r).toggleCodeBlock().run() },
  ]);

  const layout: Action[] = section("Layout", [
    { id: "col2", title: "2 columns", icon: <Columns2 size={18} />, keywords: "layout side", action: (e, r) => run(e, r).insertContent(columns(2)).run() },
    { id: "col3", title: "3 columns", icon: <Columns3 size={18} />, keywords: "layout", action: (e, r) => run(e, r).insertContent(columns(3)).run() },
    { id: "col4", title: "4 columns", icon: <Columns4 size={18} />, keywords: "layout", action: (e, r) => run(e, r).insertContent(columns(4)).run() },
  ]);

  const swatch = (c: string, bg: boolean) => (
    <span
      className="grid size-full place-items-center rounded-[5px] text-[15px] font-medium"
      style={{ color: bg ? undefined : textColor(c), background: bg ? bgColor(c) : undefined }}
    >
      A
    </span>
  );
  const colors: Action[] = section("Colors", [
    ...COLORS.map((c) => ({
      id: `color-${c}`,
      title: c === "default" ? "Default" : colorLabel(c),
      icon: swatch(c, false),
      keywords: "color text",
      action: (e: Editor, r: Range) => (run(e, r).run(), colorBlock(e, { color: c })),
    })),
    ...COLORS.filter((c) => c !== "default").map((c) => ({
      id: `bg-${c}`,
      title: `${colorLabel(c)} background`,
      icon: swatch(c, true),
      keywords: "color highlight background",
      action: (e: Editor, r: Range) => (run(e, r).run(), colorBlock(e, { bg: c })),
    })),
  ]);

  return [...basic, ...inline, ...database, ...media, ...layout, ...colors];
}

export const SlashCommand = Extension.create<{ page: PageActions }>({
  name: "slashCommand",
  addOptions() {
    return { page: { createSubpage: async () => "", createDatabase: async () => "" } };
  },
  addProseMirrorPlugins() {
    const all = blocks(this.options.page);
    return [
      Suggestion<Action>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        startOfLine: false,
        allow: ({ state, range }) => {
          // Only at the start of a line or after whitespace (never mid-URL), and not in code.
          const before = state.doc.textBetween(Math.max(0, range.from - 1), range.from, "\n", " ");
          return (before === "" || /\s/.test(before)) && state.selection.$from.parent.type.name !== "codeBlock";
        },
        items: ({ query }) => {
          const q = query.toLowerCase().trim();
          if (!q) return all.filter((a) => a.section !== "Colors" || a.id === "color-red" || a.id === "bg-yellow");
          return all.filter((b) => `${b.title} ${b.keywords ?? ""} ${b.section}`.toLowerCase().includes(q)).slice(0, 30);
        },
        command: ({ editor, range, props }) => props.action(editor, range),
        render: popup("No results"),
      }),
    ];
  },
});

export type PageLinkOptions = {
  getNotes: () => NoteMeta[];
  createPage: (title: string) => Promise<string>;
};

const insertLink = (editor: Editor, range: Range, target: string) =>
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent([{ type: "wikiLink", attrs: { target } }, { type: "text", text: " " }])
    .run();

function pageItems(query: string, { getNotes, createPage }: PageLinkOptions, withDates: boolean): Action[] {
  const q = query.replace(/\]+$/, "").trim();
  const notes = getNotes();
  const items: Action[] = [];
  if (withDates) {
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    };
    for (const [label, offset] of [["Today", 0], ["Tomorrow", 1], ["Yesterday", -1]] as const) {
      if (!q || label.toLowerCase().startsWith(q.toLowerCase())) {
        items.push({
          id: `date-${label}`,
          title: label,
          hint: day(offset),
          icon: <CalendarDays size={18} />,
          section: "Date",
          action: (e, r) => e.chain().focus().deleteRange(r).insertContent(`${day(offset)} `).run(),
        });
      }
    }
  }
  items.push(
    ...notes
      .filter((n) => n.title.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.modified - a.modified)
      .slice(0, 8)
      .map((n) => ({
        id: n.path,
        title: n.title,
        hint: n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : undefined,
        icon: n.icon ? <PageIcon icon={n.icon} size={16} /> : <FileText size={18} />,
        section: "Link to page",
        action: (e: Editor, r: Range) => insertLink(e, r, n.title),
      })),
  );
  if (q && !notes.some((n) => n.title.toLowerCase() === q.toLowerCase())) {
    items.push({
      id: "__create",
      title: `New page "${q}"`,
      icon: <Plus size={18} />,
      section: "Create",
      action: (e, r) => void createPage(q).then((title) => insertLink(e, r, title)),
    });
  }
  return items;
}

/** `[[` opens a page picker that inserts a wikilink, or creates the page if it does not exist. */
export const PageLinkSuggestion = Extension.create<PageLinkOptions>({
  name: "pageLinkSuggestion",
  addOptions() {
    return { getNotes: () => [], createPage: async (t) => t };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<Action>({
        editor: this.editor,
        pluginKey: new PluginKey("pageLink"),
        char: "[[",
        allowSpaces: true,
        startOfLine: false,
        items: ({ query }) => pageItems(query, this.options, false),
        command: ({ editor, range, props }) => props.action(editor, range),
        render: popup("Type a page name"),
      }),
    ];
  },
});

/** `@` mentions pages and dates. Inserted as `[[links]]` / plain dates. */
export const MentionSuggestion = Extension.create<PageLinkOptions>({
  name: "mentionSuggestion",
  addOptions() {
    return { getNotes: () => [], createPage: async (t) => t };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<Action>({
        editor: this.editor,
        pluginKey: new PluginKey("mention"),
        char: "@",
        allowSpaces: false,
        startOfLine: false,
        allow: ({ state, range }) => {
          const before = state.doc.textBetween(Math.max(0, range.from - 1), range.from, "\n", " ");
          return before === "" || /\s/.test(before); // not in emails
        },
        items: ({ query }) => pageItems(query, this.options, true),
        command: ({ editor, range, props }) => props.action(editor, range),
        render: popup("No pages found"),
      }),
    ];
  },
});
