import { Extension, type Editor as CoreEditor } from "@tiptap/core";
import type { NestedOptions } from "@tiptap/extension-drag-handle";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { NodeRangeSelection } from "@tiptap/extension-node-range";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState, type Editor as TiptapEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  GripVertical,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Palette,
  Plus,
  Quote,
  RefreshCw,
  SquareCode,
  Strikethrough,
  Trash2,
  Type,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { MenuDivider, MenuItem, MenuSection, Popover } from "../components/Popover";
import { COLORS, bgColor, colorLabel, textColor } from "../lib/colors";
import { wantsNewTab } from "../lib/nav";
import { Callout, CodeBlock, ColorMark, Column, ColumnList, DatabaseEmbed, ImageBlock, Toggle } from "./blocks";
import { normalizeMarkdown } from "./markdown";
import { MentionSuggestion, PageLinkSuggestion, SlashCommand, type PageActions, type PageLinkOptions } from "./suggestions";
import { WikiLink } from "./WikiLink";

type Props = PageLinkOptions & {
  initial: string;
  page: PageActions;
  onChange: (markdown: string) => void;
  /** A page link was clicked; `newTab` for ⌘/Ctrl-click. */
  onOpenLink: (target: string, newTab: boolean) => void;
};

type TurnInto = { id: string; label: string; icon: ReactNode; active: (e: CoreEditor) => boolean; run: (e: CoreEditor) => void };

const inWrapper = (e: CoreEditor) => ["listItem", "taskItem", "blockquote", "callout", "details", "heading"].some((n) => e.isActive(n));

/** Block conversions shared by the block menu, the bubble menu and Cmd+Opt shortcuts. */
export const TURN_INTO: TurnInto[] = [
  { id: "text", label: "Text", icon: <Type size={16} />, active: (e) => e.isActive("paragraph") && !inWrapper(e), run: (e) => e.chain().focus().clearNodes().run() },
  { id: "h1", label: "Heading 1", icon: <Heading1 size={16} />, active: (e) => e.isActive("heading", { level: 1 }), run: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 1 }).run() },
  { id: "h2", label: "Heading 2", icon: <Heading2 size={16} />, active: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 2 }).run() },
  { id: "h3", label: "Heading 3", icon: <Heading3 size={16} />, active: (e) => e.isActive("heading", { level: 3 }), run: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 3 }).run() },
  { id: "todo", label: "To-do list", icon: <ListTodo size={16} />, active: (e) => e.isActive("taskList"), run: (e) => e.chain().focus().clearNodes().toggleTaskList().run() },
  { id: "bullet", label: "Bulleted list", icon: <List size={16} />, active: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().clearNodes().toggleBulletList().run() },
  { id: "number", label: "Numbered list", icon: <ListOrdered size={16} />, active: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().clearNodes().toggleOrderedList().run() },
  { id: "toggle", label: "Toggle list", icon: <ChevronRight size={16} />, active: (e) => e.isActive("details"), run: (e) => e.chain().focus().clearNodes().setDetails().run() },
  { id: "code", label: "Code", icon: <SquareCode size={16} />, active: (e) => e.isActive("codeBlock"), run: (e) => e.chain().focus().clearNodes().toggleCodeBlock().run() },
  { id: "quote", label: "Quote", icon: <Quote size={16} />, active: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().clearNodes().toggleBlockquote().run() },
  { id: "callout", label: "Callout", icon: <Lightbulb size={16} />, active: (e) => e.isActive("callout"), run: (e) => e.chain().focus().clearNodes().wrapIn("callout").run() },
];

/** Block shortcuts: ⌘⌥0–8 turn into, ⌘D duplicates the current block, ⌘⇧H highlights. */
const BlockKeys = Extension.create({
  name: "blockKeys",
  addKeyboardShortcuts() {
    const by = (id: string) => () => (TURN_INTO.find((t) => t.id === id)!.run(this.editor), true);
    return {
      "Mod-Alt-0": by("text"),
      "Mod-Alt-1": by("h1"),
      "Mod-Alt-2": by("h2"),
      "Mod-Alt-3": by("h3"),
      "Mod-Alt-4": by("todo"),
      "Mod-Alt-5": by("bullet"),
      "Mod-Alt-6": by("number"),
      "Mod-Alt-7": by("toggle"),
      "Mod-Alt-8": by("code"),
      "Mod-d": () => {
        const { $from } = this.editor.state.selection;
        if ($from.depth < 1) return false;
        return this.editor.chain().insertContentAt($from.after(1), $from.node(1).toJSON()).run();
      },
      "Mod-Shift-h": () => this.editor.chain().focus().setColor({ bg: "yellow" }).run(),
    };
  },
});

/** Everything that defines the document and its Markdown form (shared with the round-trip tests). */
export function contentExtensions() {
  return [
    StarterKit.configure({
      underline: false, // no Markdown syntax for it
      codeBlock: false,
      link: { openOnClick: false, autolink: true },
      dropcursor: { color: "var(--blue)", width: 3 },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    ImageBlock,
    CodeBlock,
    ColorMark,
    Callout,
    Toggle,
    DetailsSummary,
    DetailsContent,
    ColumnList,
    Column,
    DatabaseEmbed,
    Markdown.configure({ indentation: { style: "space", size: 2 } }),
    WikiLink,
  ];
}

export function Editor({ initial, onChange, onOpenLink, getNotes, createPage, page }: Props) {
  const editor = useEditor({
    extensions: [
      ...contentExtensions(),
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node, editor: e }) => {
          if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
          if (node.type.name === "detailsSummary") return "Toggle";
          return e.isEmpty ? "Write something, or press '/' for commands…" : "Press '/' for commands";
        },
      }),
      BlockKeys,
      SlashCommand.configure({ page }),
      PageLinkSuggestion.configure({ getNotes, createPage }),
      MentionSuggestion.configure({ getNotes, createPage }),
    ],
    content: initial,
    contentType: "markdown",
    onUpdate: ({ editor }) => onChange(normalizeMarkdown(editor.getMarkdown())),
    editorProps: {
      attributes: { class: "betelgeuse-prose", spellcheck: "true" },
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name !== "wikiLink") return false;
        event.preventDefault();
        onOpenLink(node.attrs.target, wantsNewTab(event));
        return true;
      },
    },
  });

  if (!editor) return null;

  return (
    <>
      <BlockHandle editor={editor} />
      <FormatMenu editor={editor} />
      <EditorContent editor={editor} />
    </>
  );
}

// ---------- block handle ----------

function BlockHandle({ editor }: { editor: TiptapEditor }) {
  const target = useRef<{ node: PMNode; pos: number } | null>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; node: PMNode; pos: number } | null>(null);
  // Nudges the handle beside the block's first line (and left of list markers). Applied straight to
  // the element in the same tick the handle moves; a React state update would land a frame later
  // and make the handle visibly jump twice when moving between blocks.
  const inner = useRef<HTMLDivElement>(null);

  const addBelow = () => {
    const t = target.current;
    if (!t) return;
    const empty = t.node.type.name === "paragraph" && t.node.content.size === 0;
    if (empty) {
      editor.chain().focus().setTextSelection(t.pos + 1).insertContent("/").run();
    } else {
      const at = t.pos + t.node.nodeSize;
      editor.chain().insertContentAt(at, { type: "paragraph", content: [{ type: "text", text: "/" }] }).setTextSelection(at + 2).focus().run();
    }
  };

  return (
    <>
      <DragHandle
        editor={editor}
        nested={NESTED}
        onNodeChange={({ node, pos }) => {
          target.current = node ? { node, pos } : null;
          const dom = node ? (editor.view.nodeDOM(pos) as HTMLElement | null) : null;
          const { x, y } = dom instanceof HTMLElement ? handleOffset(dom, node!.type.name) : { x: 0, y: 0 };
          if (inner.current) inner.current.style.transform = `translate(${-x}px, ${y}px)`;
        }}
      >
        <div ref={inner} className="flex items-center pr-1">
          <button onClick={addBelow} title="Click to add below" className="grid h-6 w-6 place-items-center rounded text-faint hover:bg-hover hover:text-muted">
            <Plus size={17} />
          </button>
          <div
            role="button"
            title="Drag to move · Click to open menu"
            onClick={(e) => target.current && setMenu({ el: e.currentTarget, ...target.current })}
            className="block-grip grid h-6 w-[18px] cursor-grab place-items-center rounded text-faint hover:bg-hover hover:text-muted"
          >
            <GripVertical size={16} />
          </div>
        </div>
      </DragHandle>
      {menu && <BlockMenu editor={editor} {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}

const HANDLE_HEIGHT = 24;

const NESTED: NestedOptions = {
  // A column on its own isn't a block you'd move; its contents are.
  rules: [{ id: "noBareColumns", evaluate: ({ node }) => (node.type.name === "column" ? 1000 : 0) }],
};

/** Blocks with a left bar, icon or arrow: handles for blocks inside them sit outside the decoration. */
const DECORATED = 'blockquote, .callout, [data-type="details"]';

/**
 * Where to nudge the block handle so it sits beside the block's first line of text:
 * down to that line's centre, and (for bullets/numbers) left of the list marker.
 */
function handleOffset(dom: HTMLElement, type: string): { x: number; y: number } {
  // Outermost quote/callout/toggle around this block, else (for list items) the list itself,
  // whose left padding holds the bullet or number.
  let anchor: HTMLElement | null = null;
  for (let el = dom.parentElement; el && !el.classList.contains("ProseMirror"); el = el.parentElement) {
    if (el.matches(DECORATED)) anchor = el;
  }
  if (!anchor && type === "listItem") anchor = dom.parentElement;
  const x = anchor ? Math.max(0, dom.getBoundingClientRect().left - anchor.getBoundingClientRect().left) : 0;
  // The first line of text: the block itself, or e.g. the <p> inside a list item, to-do or callout.
  const line = dom.matches("p, h1, h2, h3, h4, h5, h6, pre, summary") ? dom : (dom.querySelector<HTMLElement>("p, h1, h2, h3, h4, h5, h6, pre, summary") ?? dom);
  const style = getComputedStyle(line);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || HANDLE_HEIGHT;
  const top = line.getBoundingClientRect().top - dom.getBoundingClientRect().top + (parseFloat(style.paddingTop) || 0);
  return { x, y: Math.max(0, Math.round(top + lineHeight / 2 - HANDLE_HEIGHT / 2)) };
}

const NODE_LABELS: Record<string, string> = {
  paragraph: "Text",
  bulletList: "Bulleted list",
  orderedList: "Numbered list",
  taskList: "To-do list",
  details: "Toggle list",
  codeBlock: "Code",
  blockquote: "Quote",
  callout: "Callout",
  columnList: "Columns",
  databaseEmbed: "Database",
  table: "Table",
  image: "Image",
  horizontalRule: "Divider",
};

function BlockMenu({ editor, el, node, pos, onClose }: { editor: TiptapEditor; el: HTMLElement; node: PMNode; pos: number; onClose: () => void }) {
  const [sub, setSub] = useState<{ kind: "turn" | "color"; el: HTMLElement } | null>(null);
  const [query, setQuery] = useState("");
  const selectBlock = () => {
    const from = pos + 1;
    const to = Math.max(from, pos + node.nodeSize - 1);
    editor.chain().focus().setTextSelection({ from, to }).run();
  };
  const finish = (fn: () => void) => {
    fn();
    onClose();
  };
  const q = query.toLowerCase();
  const show = (label: string) => label.toLowerCase().includes(q);
  const label = node.type.name === "heading" ? `Heading ${node.attrs.level}` : NODE_LABELS[node.type.name] ?? node.type.name;

  return (
    <Popover anchor={el} onClose={onClose} className="w-64 p-1">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search actions…"
        className="mb-1 h-7 w-full rounded-md border border-line bg-side px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
      />
      <MenuSection label={label} />
      {show("Turn into") && (
        <MenuItem icon={<RefreshCw size={15} />} label="Turn into" right={<ChevronRight size={14} className="text-faint" />} onClick={(e) => setSub({ kind: "turn", el: e.currentTarget })} />
      )}
      {show("Color") && (
        <MenuItem icon={<Palette size={15} />} label="Color" right={<ChevronRight size={14} className="text-faint" />} onClick={(e) => setSub({ kind: "color", el: e.currentTarget })} />
      )}
      <MenuDivider />
      {show("Duplicate") && (
        <MenuItem icon={<Copy size={15} />} label="Duplicate" hint="⌘D" onClick={() => finish(() => editor.chain().insertContentAt(pos + node.nodeSize, node.toJSON()).run())} />
      )}
      {show("Delete") && (
        <MenuItem
          icon={<Trash2 size={15} />}
          label="Delete"
          hint="Del"
          danger
          onClick={() => finish(() => editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run())}
        />
      )}

      {sub?.kind === "turn" && (
        <Popover anchor={sub.el} placement="right-start" onClose={() => setSub(null)} className="w-56 p-1">
          {TURN_INTO.map((t) => (
            <MenuItem
              key={t.id}
              icon={t.icon}
              label={t.label}
              onClick={() =>
                finish(() => {
                  selectBlock();
                  t.run(editor);
                })
              }
            />
          ))}
        </Popover>
      )}
      {sub?.kind === "color" && (
        <ColorList
          anchor={sub.el}
          placement="right-start"
          onClose={() => setSub(null)}
          onPick={(attrs) =>
            finish(() => {
              if (node.type.name === "callout") {
                const color = attrs.bg ?? attrs.color ?? "gray";
                editor.chain().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { ...node.attrs, color }), true)).run();
              } else {
                selectBlock();
                editor.chain().focus().setColor(attrs).setTextSelection(pos + node.nodeSize - 1).run();
              }
            })
          }
        />
      )}
    </Popover>
  );
}

function ColorList({
  anchor,
  placement,
  onPick,
  onClose,
  current,
  only,
}: {
  anchor: HTMLElement;
  placement?: "bottom-start" | "right-start";
  onPick: (attrs: { color?: string; bg?: string }) => void;
  onClose: () => void;
  current?: { color?: string | null; bg?: string | null };
  /** Show just text colours or just backgrounds (the selection toolbar has a button for each). */
  only?: "text" | "bg";
}) {
  return (
    <Popover anchor={anchor} placement={placement} onClose={onClose} className="max-h-[70vh] w-56 overflow-y-auto p-1">
      {only !== "bg" && (
        <>
      <MenuSection label="Text color" />
      {COLORS.map((c) => (
        <MenuItem
          key={`t-${c}`}
          icon={
            <span className="grid size-5 place-items-center rounded border border-line text-sm font-medium" style={{ color: textColor(c) }}>
              A
            </span>
          }
          label={c === "default" ? "Default text" : `${colorLabel(c)} text`}
          right={(current?.color ?? "default") === c ? <span className="text-muted">✓</span> : null}
          onClick={() => onPick({ color: c })}
        />
      ))}
        </>
      )}
      {!only && <MenuDivider />}
      {only !== "text" && (
        <>
      <MenuSection label="Background color" />
      {COLORS.map((c) => (
        <MenuItem
          key={`b-${c}`}
          icon={<span className="size-5 rounded border border-line" style={{ background: bgColor(c) }} />}
          label={c === "default" ? "Default background" : `${colorLabel(c)} background`}
          right={(current?.bg ?? "default") === c ? <span className="text-muted">✓</span> : null}
          onClick={() => onPick({ bg: c })}
        />
      ))}
        </>
      )}
    </Popover>
  );
}

// ---------- selection bubble menu ----------

function FormatMenu({ editor }: { editor: TiptapEditor }) {
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");
  const [open, setOpen] = useState<{ kind: "turn" | "color" | "bg"; el: HTMLElement } | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      color: e.getAttributes("color") as { color?: string; bg?: string },
      block: TURN_INTO.find((t) => t.active(e))?.label ?? "Text",
    }),
  });

  const applyLink = () => {
    const chain = editor.chain().focus().extendMarkRange("link");
    (href.trim() ? chain.setLink({ href: href.trim() }) : chain.unsetLink()).run();
    setLinking(false);
  };

  const marks = [
    { key: "bold", icon: <Bold size={15} strokeWidth={2.5} />, run: () => editor.chain().focus().toggleBold().run(), label: "Bold ⌘B" },
    { key: "italic", icon: <Italic size={15} />, run: () => editor.chain().focus().toggleItalic().run(), label: "Italic ⌘I" },
    { key: "strike", icon: <Strikethrough size={15} />, run: () => editor.chain().focus().toggleStrike().run(), label: "Strikethrough ⌘⇧S" },
    { key: "code", icon: <Code size={15} />, run: () => editor.chain().focus().toggleCode().run(), label: "Inline code ⌘E" },
  ] as const;

  const sep = <span className="mx-0.5 h-5 w-px bg-line" />;

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top-start", offset: 8 }}
      // Text formatting only: not while a block is being dragged, nor for the block selection the
      // drag handle makes (showing it there covers the drop target and cancels the drag).
      shouldShow={({ editor: e, view, state, from, to }) =>
        from !== to &&
        !view.dragging &&
        !(state.selection instanceof NodeSelection) &&
        !(state.selection instanceof NodeRangeSelection) &&
        !e.isActive("codeBlock") &&
        !e.isActive("wikiLink") &&
        !e.isActive("databaseEmbed") &&
        !e.isActive("image")
      }
    >
      <div className="flex h-9 items-center gap-0.5 rounded-lg border border-line bg-raised p-1 text-sm text-ink shadow-pop">
        {linking ? (
          <input
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
              if (e.key === "Escape") setLinking(false);
            }}
            onBlur={() => setLinking(false)}
            placeholder="Paste link, or leave empty to remove"
            className="w-72 bg-transparent px-2 text-sm text-ink outline-none placeholder:text-faint"
          />
        ) : (
          <>
            <button onClick={(e) => setOpen({ kind: "turn", el: e.currentTarget })} className="flex h-7 items-center gap-1 rounded-md px-2 whitespace-nowrap hover:bg-hover">
              {state.block} <ChevronDown size={13} className="text-faint" />
            </button>
            {sep}
            <button
              title="Link"
              onClick={() => {
                setHref(editor.getAttributes("link").href ?? "");
                setLinking(true);
              }}
              className={`flex h-7 items-center gap-1 rounded-md px-2 hover:bg-hover ${state.link ? "text-[var(--blue)]" : ""}`}
            >
              <Link2 size={15} /> Link
            </button>
            {sep}
            {marks.map((b) => (
              <button key={b.key} title={b.label} onClick={b.run} className={`grid size-7 place-items-center rounded-md hover:bg-hover ${state[b.key] ? "text-[var(--blue)]" : ""}`}>
                {b.icon}
              </button>
            ))}
            {sep}
            <button title="Text color" onClick={(e) => setOpen({ kind: "color", el: e.currentTarget })} className="flex h-7 items-center gap-0.5 rounded-md px-1.5 hover:bg-hover">
              <span className="grid size-5 place-items-center text-[15px] font-semibold" style={{ color: textColor(state.color.color) ?? "var(--ink)" }}>
                A
              </span>
              <ChevronDown size={12} className="text-faint" />
            </button>
            <button title="Background color" onClick={(e) => setOpen({ kind: "bg", el: e.currentTarget })} className="flex h-7 items-center gap-0.5 rounded-md px-1.5 hover:bg-hover">
              <span className="relative grid size-5 place-items-center">
                <Highlighter size={15} />
                <span
                  className="absolute -bottom-0.5 left-0.5 h-[3px] w-4 rounded-full border border-line"
                  style={{ background: bgColor(state.color.bg) ?? "transparent" }}
                />
              </span>
              <ChevronDown size={12} className="text-faint" />
            </button>
          </>
        )}
      </div>
      {open?.kind === "turn" && (
        <Popover anchor={open.el} onClose={() => setOpen(null)} className="w-56 p-1">
          <MenuSection label="Turn into" />
          {TURN_INTO.map((t) => (
            <MenuItem
              key={t.id}
              icon={t.icon}
              label={t.label}
              right={state.block === t.label ? <span className="text-muted">✓</span> : null}
              onClick={() => {
                t.run(editor);
                setOpen(null);
              }}
            />
          ))}
        </Popover>
      )}
      {(open?.kind === "color" || open?.kind === "bg") && (
        <ColorList
          anchor={open.el}
          only={open.kind === "color" ? "text" : "bg"}
          current={state.color}
          onClose={() => setOpen(null)}
          onPick={(attrs) => {
            editor.chain().focus().setColor(attrs).run();
            setOpen(null);
          }}
        />
      )}
    </BubbleMenu>
  );
}
