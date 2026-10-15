import type { Editor as TiptapEditor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  Bold,
  ChevronDown,
  Code,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListTodo,
  Plus,
  Redo2,
  Strikethrough,
  Type,
  Undo2,
} from "lucide-react";
import { useEffect, useReducer, useState, type ReactNode } from "react";
import { MenuItem, Popover } from "@desktop/components/Popover";
import { BlockMenu, TURN_INTO, type MenuAt } from "@desktop/editor/Editor";

/** Height of the bar, which the page keeps clear of. */
export const TOOLBAR_HEIGHT = 46;

/**
 * Formatting bar above the on-screen keyboard while the page text is being edited: what the
 * desktop app does with the block handle, the selection menu and keyboard shortcuts.
 */
export function EditorToolbar({ editorRef, editorKey, onOpenLink }: { editorRef: { current: TiptapEditor | null }; editorKey: number; onOpenLink: (target: string) => void }) {
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [focused, setFocused] = useState(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [turnInto, setTurnInto] = useState<HTMLElement | null>(null);
  const [blockMenu, setBlockMenu] = useState<MenuAt | null>(null);
  const keyboard = useKeyboardInset();

  // The editor exists once its component has mounted (and is replaced when the page reloads).
  useEffect(() => {
    let frame = 0;
    const find = () => (editorRef.current ? setEditor(editorRef.current) : (frame = requestAnimationFrame(find)));
    find();
    return () => cancelAnimationFrame(frame);
  }, [editorRef, editorKey]);

  useEffect(() => {
    if (!editor) return;
    const focus = () => setFocused(true);
    const blur = () => setFocused(false);
    setFocused(editor.isFocused);
    editor.on("focus", focus);
    editor.on("blur", blur);
    editor.on("transaction", rerender);
    return () => {
      editor.off("focus", focus);
      editor.off("blur", blur);
      editor.off("transaction", rerender);
    };
  }, [editor]);

  if (!editor || (!focused && !turnInto && !blockMenu)) return null;

  /** Types `text` at the cursor (after a space when it follows a word), which opens that menu. */
  const trigger = (text: string) => {
    const { $from } = editor.state.selection;
    const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset);
    editor
      .chain()
      .focus()
      .insertContent(before && !/\s/.test(before) ? ` ${text}` : text)
      .run();
  };
  const listItem = editor.isActive("taskItem") ? "taskItem" : "listItem";
  const inList = editor.isActive("listItem") || editor.isActive("taskItem");

  const openBlockMenu = (el: HTMLElement) => {
    const sel = editor.state.selection;
    if (sel instanceof NodeSelection) return setBlockMenu({ el, node: sel.node, pos: sel.from });
    const { $from } = sel;
    if ($from.depth < 1) return;
    setBlockMenu({ el, node: $from.node(1), pos: $from.before(1) });
  };

  return (
    <>
      <div
        className="editor-toolbar fixed inset-x-0 z-40 flex items-center border-t border-line bg-raised"
        style={{ bottom: keyboard, height: TOOLBAR_HEIGHT, paddingBottom: keyboard ? 0 : "env(safe-area-inset-bottom)" }}
        // Taps here must not take the cursor out of the page.
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto px-1 [scrollbar-width:none]">
          <Tool label="Insert block" onClick={() => trigger("/")}>
            <Plus size={21} />
          </Tool>
          <Tool label="Turn into" onClick={(el) => setTurnInto(el)}>
            <Type size={19} />
          </Tool>
          <Tool label="Block actions" onClick={openBlockMenu}>
            <GripVertical size={19} />
          </Tool>
          <Sep />
          <Tool label="To-do list" active={editor.isActive("taskList")} onClick={() => TURN_INTO.find((t) => t.id === "todo")!.run(editor)}>
            <ListTodo size={20} />
          </Tool>
          <Tool label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => TURN_INTO.find((t) => t.id === "bullet")!.run(editor)}>
            <List size={20} />
          </Tool>
          <Tool label="Indent" disabled={!inList || !editor.can().sinkListItem(listItem)} onClick={() => editor.chain().focus().sinkListItem(listItem).run()}>
            <IndentIncrease size={19} />
          </Tool>
          <Tool label="Outdent" disabled={!inList} onClick={() => editor.chain().focus().liftListItem(listItem).run()}>
            <IndentDecrease size={19} />
          </Tool>
          <Sep />
          <Tool label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={18} strokeWidth={2.6} />
          </Tool>
          <Tool label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={18} />
          </Tool>
          <Tool label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough size={18} />
          </Tool>
          <Tool label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code size={18} />
          </Tool>
          <Tool label="Link to a page" onClick={() => trigger("[[")}>
            <Link2 size={19} />
          </Tool>
          <Sep />
          <Tool label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 size={19} />
          </Tool>
          <Tool label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 size={19} />
          </Tool>
        </div>
        <button aria-label="Done editing" onClick={() => editor.commands.blur()} className="grid h-full w-12 shrink-0 place-items-center border-l border-line text-muted active:bg-hover">
          <ChevronDown size={22} />
        </button>
      </div>

      {turnInto && (
        <Popover anchor={turnInto} onClose={() => setTurnInto(null)} className="w-60 p-1">
          {TURN_INTO.map((t) => (
            <MenuItem
              key={t.id}
              icon={t.icon}
              label={t.label}
              active={t.active(editor)}
              onClick={() => {
                setTurnInto(null);
                t.run(editor);
              }}
            />
          ))}
        </Popover>
      )}
      {blockMenu && <BlockMenu editor={editor} {...blockMenu} onOpenLink={onOpenLink} onClose={() => setBlockMenu(null)} />}
    </>
  );
}

function Tool({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: (el: HTMLElement) => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={(e) => onClick(e.currentTarget)}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg disabled:opacity-30 active:bg-hover ${active ? "bg-hover text-[var(--blue)]" : "text-ink"}`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-6 w-px shrink-0 bg-line" />;

/**
 * How far the on-screen keyboard reaches up from the bottom of the window. iOS covers the page with
 * it (only the visual viewport shrinks); Android usually resizes the window instead, leaving 0.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
