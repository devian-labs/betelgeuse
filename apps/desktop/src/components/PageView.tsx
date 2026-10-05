import {
  ArrowUpRight,
  Bot,
  EyeOff,
  Calendar,
  ChevronsRight,
  Copy,
  FileText,
  History,
  Image as ImageIcon,
  KanbanSquare,
  Link2,
  Maximize2,
  MoreHorizontal,
  SmilePlus,
  Star,
  Table2,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { PageIcon } from "./PageIcon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DatabaseView } from "../database/DatabaseView";
import { defaultSchema, writeSchema } from "../database/model";
import { Toggle } from "../database/PropertyMenu";
import { RowProperties } from "../database/RowProperties";
import { createDatabase } from "../database/useDatabase";
import { Editor } from "../editor/Editor";
import { api, type NoteMeta } from "../lib/api";
import { frontmatterTags, joinNote, patchFrontmatter, readFrontmatter, splitNote } from "../lib/frontmatter";
import { timeAgo } from "../lib/time";
import { ancestorKeys, resolveWikiLink } from "../lib/tree";
import { aiAccess, type AiAccess } from "../lib/ai";
import { wantsNewTab } from "../lib/nav";
import { useVault } from "../lib/vault";
import { CoverBox, CoverPicker } from "./Cover";
import { IconPicker } from "./IconPicker";
import { Outline } from "./Outline";
import { MenuDivider, MenuItem, MenuSection, Popover } from "./Popover";

type Props = {
  path: string;
  /** "peek" renders the compact side panel used for database rows. */
  mode?: "page" | "peek";
  historyOpen?: boolean;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onToggleHistory?: () => void;
  onClose?: () => void;
  onRenamed: (oldPath: string, newPath: string) => void;
  onDeleted: (path: string) => void;
  onSaved: () => void;
};

type Doc = { frontmatter: string; body: string };

const titleOf = (path: string) => path.split("/").pop()!.replace(/\.md$/, "");
const parentOf = (path: string) => (path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}.md` : null);

export function PageView(p: Props) {
  const { notes, refreshKey, openPage, peek, createPage, aiPolicy } = useVault();
  const [doc, setDoc] = useState<Doc | "missing" | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [title, setTitle] = useState(titleOf(p.path));
  // The page currently on screen. It only changes once the next page has loaded, so switching
  // pages swaps content in one frame instead of flashing an empty page.
  const [shownPath, setShownPath] = useState(p.path);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<"icon" | "cover" | null>(null);
  const [addingTag, setAddingTag] = useState(false);
  const [backlinks, setBacklinks] = useState<NoteMeta[]>([]);
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const pathRef = useRef(p.path);
  const fm = useRef("");
  const body = useRef("");
  const lastWritten = useRef<string | null>(null);
  const pending = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const onSaved = useRef(p.onSaved);
  onSaved.current = p.onSaved;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!pending.current) return;
    pending.current = false;
    const content = joinNote(fm.current, body.current);
    if (content === lastWritten.current) return setSaving(false);
    lastWritten.current = content;
    await api.writeNote(pathRef.current, content);
    setSaving(false);
    onSaved.current();
  }, []);

  const scheduleSave = useCallback(
    (delay = 400) => {
      pending.current = true;
      setSaving(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    [flush],
  );

  const load = useCallback((content: string) => {
    lastWritten.current = content;
    const parts = splitNote(content);
    fm.current = parts.frontmatter;
    body.current = parts.body;
    setDoc(parts);
    setEditorKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const path = p.path;
    Promise.all([api.readNote(path), api.backlinks(path).catch(() => [])])
      .then(([content, links]) => {
        if (cancelled) return;
        pathRef.current = path; // saves go to this page from now on
        setShownPath(path);
        setTitle(titleOf(path));
        setBacklinks(links);
        load(content);
      })
      .catch(() => {
        if (cancelled) return;
        pathRef.current = path;
        setShownPath(path);
        setDoc("missing");
      });
    return () => {
      cancelled = true;
      void flush(); // save the page we are leaving
    };
  }, [p.path, load, flush]);

  // Pick up edits made outside the editor (agents over MCP, git, database views…).
  useEffect(() => {
    if (refreshKey === 0) return;
    if (!pending.current) {
      api
        .readNote(shownPath)
        .then((c) => {
          if (c === lastWritten.current || pending.current) return;
          const parts = splitNote(c);
          // Frontmatter-only changes (e.g. a property edited in a table) keep the editor mounted.
          if (parts.body === body.current) {
            lastWritten.current = c;
            fm.current = parts.frontmatter;
            setDoc(parts);
          } else load(c);
        })
        .catch(() => setDoc("missing"));
    }
    api.backlinks(shownPath).then(setBacklinks).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on disk changes, not on page switches
  }, [refreshKey, load]);

  const patch = (values: Record<string, unknown>) => {
    fm.current = patchFrontmatter(fm.current, values);
    setDoc({ frontmatter: fm.current, body: body.current });
    scheduleSave(0);
  };

  const path = shownPath;

  const commitTitle = async () => {
    const next = title.trim();
    if (!next || next === titleOf(path)) return setTitle(titleOf(path));
    await flush();
    const oldPath = path;
    const newPath = await api.renameNote(oldPath, next);
    setTitle(titleOf(newPath));
    p.onRenamed(oldPath, newPath);
  };

  const values = useMemo(() => (doc && doc !== "missing" ? readFrontmatter(doc.frontmatter) : {}), [doc]);
  const meta = notes.find((n) => n.path === path);
  // Use this page's live frontmatter (it may not be saved yet) for its own flag.
  const ownAi = values.ai === true || values.ai === false ? values.ai : null;
  const ai = aiAccess(path, notes.map((n) => (n.path === path ? { ...n, ai: ownAi } : n)), aiPolicy);
  const parent = parentOf(path);
  const parentIsDb = !!parent && notes.find((n) => n.path === parent)?.kind === "database";
  const isDb = values.type === "database";

  if (doc === "missing") {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar {...p} path={path} meta={meta} saving={false} onMenu={setMenu} />
        <div className="grid flex-1 place-items-center text-sm text-muted">This page was moved or deleted.</div>
      </div>
    );
  }

  const icon = typeof values.icon === "string" ? values.icon : undefined;
  const cover = typeof values.cover === "string" ? values.cover : undefined;
  const tags = doc ? frontmatterTags(doc.frontmatter) : [];
  const font = values.font === "serif" || values.font === "mono" ? values.font : "default";
  const small = values.small === true;
  const peekMode = p.mode === "peek";
  const fullWidth = values.fullWidth === true || (isDb && !peekMode && values.fullWidth !== false);
  const width = fullWidth ? "max-w-none px-24" : peekMode ? "max-w-none px-12" : "max-w-[708px] px-0";
  const emptyBody = doc && !isDb && !body.current.trim() && !parentIsDb;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar {...p} path={path} meta={meta} saving={saving} onMenu={setMenu} hiddenFromAi={!ai.visible} />

      <div className="relative min-h-0 flex-1">
      {!peekMode && !isDb && <Outline key={`${path}:${editorKey}`} scroller={scroller} />}
      <div ref={scroller} className="h-full overflow-y-auto" data-font={font} data-small={small || undefined}>
        {cover && (
          <CoverBox cover={cover} className="group/cover relative h-[30vh] max-h-[280px] min-h-[160px] w-full">
            <div className="absolute right-4 bottom-3 hidden gap-1 group-hover/cover:flex">
              <button onClick={() => setPicker("cover")} className="rounded-md bg-raised/90 px-2 py-1 text-xs text-muted shadow-sm hover:bg-raised">
                Change cover
              </button>
              <button onClick={() => patch({ cover: null })} className="rounded-md bg-raised/90 px-2 py-1 text-xs text-muted shadow-sm hover:bg-raised">
                Remove
              </button>
            </div>
          </CoverBox>
        )}

        <div className={`mx-auto w-full ${width} ${peekMode ? "pt-6" : cover ? "pt-0" : "pt-20"} pb-[30vh]`}>
          <div className="group/head relative">
            {icon && (
              <button
                onClick={() => setPicker("icon")}
                className={`relative z-10 -ml-1 block rounded-lg p-1 leading-none hover:bg-hover ${cover ? "-mt-[42px]" : ""}`}
              >
                <PageIcon icon={icon} size={peekMode ? 52 : 78} />
              </button>
            )}
            <div className="flex h-8 items-end gap-0.5 text-sm text-faint opacity-0 transition-opacity group-hover/head:opacity-100">
              {!icon && <HeadButton icon={<SmilePlus size={15} />} label="Add icon" onClick={() => setPicker("icon")} />}
              {!cover && <HeadButton icon={<ImageIcon size={15} />} label="Add cover" onClick={() => patch({ cover: "gradient_1" })} />}
              {tags.length === 0 && !addingTag && !isDb && <HeadButton icon={<Tag size={14} />} label="Add tags" onClick={() => setAddingTag(true)} />}
            </div>
            {picker === "icon" && (
              <IconPicker
                current={icon}
                onClose={() => setPicker(null)}
                onPick={(i) => {
                  setPicker(null);
                  patch({ icon: i });
                }}
              />
            )}
            {picker === "cover" && (
              <CoverPicker
                onClose={() => setPicker(null)}
                onPick={(c) => {
                  setPicker(null);
                  patch({ cover: c });
                }}
              />
            )}
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="Untitled"
            className={`page-title w-full bg-transparent leading-[1.2] font-bold text-ink outline-none placeholder:text-[var(--placeholder)] ${peekMode ? "text-[32px]" : "text-[40px]"}`}
          />

          {(tags.length > 0 || addingTag) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Tag size={14} className="mr-1 text-faint" />
              {tags.map((t) => (
                <span key={t} className="group/tag flex items-center gap-0.5 rounded-[3px] bg-[var(--c-gray-tag)] py-0.5 pr-1 pl-1.5 text-[13px] text-ink">
                  {t}
                  <button onClick={() => patch({ tags: tags.filter((x) => x !== t) })} className="opacity-0 group-hover/tag:opacity-60">
                    <X size={11} />
                  </button>
                </span>
              ))}
              <TagInput autoFocus={addingTag} onAdd={(t) => !tags.includes(t) && patch({ tags: [...tags, t] })} onDone={() => setAddingTag(false)} />
            </div>
          )}

          {parentIsDb && doc && (
            <RowProperties dbPath={parent!} rowPath={path} frontmatter={doc.frontmatter} times={{ created: meta?.created ?? 0, modified: meta?.modified ?? 0 }} onPatch={patch} />
          )}

          {isDb ? (
            <div className="mt-4">
              <DatabaseView path={path} />
            </div>
          ) : (
            <div className="relative mt-2">
              {/* relative: the block handle positions against this box, so it scrolls with the text */}
              {doc && (
                <Editor
                  key={`${path}:${editorKey}`}
                  initial={doc.body}
                  onChange={(md) => {
                    body.current = md;
                    scheduleSave();
                  }}
                  onOpenLink={(target, newTab) => {
                    const hit = resolveWikiLink(target, notesRef.current);
                    if (hit) openPage(hit.path, { newTab });
                    else createPage(null, target.split("#")[0]).then(openPage);
                  }}
                  getNotes={() => notesRef.current}
                  createPage={async (t) => titleOf(await createPage(null, t))}
                  page={{
                    createSubpage: () => createPage(path, "Untitled"),
                    createDatabase: () => createDatabase(path),
                  }}
                />
              )}
              {emptyBody && (
                <EmptyPageStarters
                  onDatabase={async (type) => {
                    const schema = defaultSchema();
                    schema.views = [{ ...schema.views[0], type, name: type === "table" ? "Table" : type === "board" ? "Board" : "Calendar" }];
                    if (type === "board") schema.views[0].groupBy = "Status";
                    if (type === "calendar") {
                      schema.properties.push({ name: "Date", type: "date" });
                      schema.views[0].dateProperty = "Date";
                    }
                    fm.current = patchFrontmatter(fm.current, { type: "database" });
                    body.current = writeSchema("", schema);
                    pending.current = true;
                    await flush();
                    load(joinNote(fm.current, body.current));
                  }}
                />
              )}
            </div>
          )}

          {backlinks.length > 0 && !isDb && (
            <section className="mt-16 border-t border-line pt-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-faint">
                <Link2 size={13} /> {backlinks.length} backlink{backlinks.length > 1 ? "s" : ""}
              </h3>
              {backlinks.map((b) => (
                <button
                  key={b.path}
                  onClick={(e) => (wantsNewTab(e) ? openPage(b.path, { newTab: true }) : peekMode ? peek(b.path) : openPage(b.path))}
                  className="group/bl flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-hover"
                >
                  <span className="grid w-5 place-items-center">{b.icon ? <PageIcon icon={b.icon} size={16} /> : <FileText size={15} className="text-faint" />}</span>
                  <span className="flex-1 truncate text-ink">{b.title}</span>
                  <ArrowUpRight size={14} className="text-faint opacity-0 group-hover/bl:opacity-100" />
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
      </div>

      {menu && (
        <PageMenu
          anchor={menu}
          values={values}
          words={body.current.split(/\s+/).filter(Boolean).length}
          meta={meta}
          onClose={() => setMenu(null)}
          onPatch={patch}
          onDuplicate={async () => {
            await flush();
            openPage(await api.duplicateNote(path));
          }}
          onDelete={() => p.onDeleted(path)}
          onCopyPath={() => navigator.clipboard.writeText(`[[${titleOf(path)}]]`)}
          ai={ai}
          onAi={(visible) => {
            // Smallest override: none if the page would already be in that state without its own flag.
            const inherited = aiAccess(path, notes.map((n) => (n.path === path ? { ...n, ai: null } : n)), aiPolicy);
            patch({ ai: inherited.visible === visible ? null : visible });
          }}
          favorite={p.favorite}
          onToggleFavorite={p.onToggleFavorite}
        />
      )}
    </div>
  );
}

function HeadButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-hover hover:text-muted">
      {icon} {label}
    </button>
  );
}

function TopBar(p: Props & { meta?: NoteMeta; saving: boolean; onMenu: (el: HTMLElement) => void; hiddenFromAi?: boolean }) {
  const { notes, openPage } = useVault();
  const crumbs = ancestorKeys(p.path).map((key) => ({ key, title: key.split("/").pop()!, note: notes.find((n) => n.path === `${key}.md`) }));
  const peekMode = p.mode === "peek";

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-1 px-3 text-sm"
    >
      {peekMode ? (
        <div className="flex flex-1 items-center gap-0.5 text-muted">
          <button onClick={p.onClose} title="Close" className="grid size-7 place-items-center rounded-md hover:bg-hover">
            <ChevronsRight size={17} />
          </button>
          <button onClick={() => openPage(p.path)} title="Open as full page" className="grid size-7 place-items-center rounded-md hover:bg-hover">
            <Maximize2 size={15} />
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-0.5 text-ink" data-tauri-drag-region>
          {crumbs.map((c) => (
            <span key={c.key} className="flex min-w-0 items-center gap-0.5">
              <button
                disabled={!c.note}
                onClick={(e) => c.note && openPage(c.note.path, { newTab: wantsNewTab(e) })}
                className="flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 enabled:hover:bg-hover"
              >
                {c.note?.icon && <PageIcon icon={c.note.icon} size={16} />}
                <span className="truncate">{c.title}</span>
              </button>
              <span className="text-faint">/</span>
            </span>
          ))}
          <span className="flex min-w-0 items-center gap-1 px-1.5">
            {p.meta?.icon && <PageIcon icon={p.meta.icon} size={16} />}
            <span className="truncate">{titleOf(p.path)}</span>
          </span>
        </div>
      )}
      {p.hiddenFromAi && (
        <span title="AI agents can't see this page" className="flex shrink-0 items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs text-muted">
          <EyeOff size={12} /> Hidden from AI
        </span>
      )}
      <span className="px-2 text-sm whitespace-nowrap text-faint">
        {p.saving ? "Saving…" : p.meta ? `Edited ${timeAgo(p.meta.modified / 1000)}` : ""}
      </span>
      {!peekMode && (
        <>
          <button
            onClick={p.onToggleHistory}
            title="Page history"
            className={`grid size-7 place-items-center rounded-md ${p.historyOpen ? "bg-hover text-ink" : "text-muted hover:bg-hover"}`}
          >
            <History size={16} />
          </button>
          <button
            onClick={p.onToggleFavorite}
            title={p.favorite ? "Remove from Favorites" : "Add to Favorites"}
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover"
          >
            <Star size={16} className={p.favorite ? "fill-[#f6c050] text-[#f6c050]" : ""} />
          </button>
        </>
      )}
      <button onClick={(e) => p.onMenu(e.currentTarget)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover">
        <MoreHorizontal size={17} />
      </button>
    </header>
  );
}

function PageMenu({
  anchor,
  values,
  words,
  meta,
  favorite,
  onToggleFavorite,
  onClose,
  onPatch,
  onDuplicate,
  onDelete,
  onCopyPath,
  ai,
  onAi,
}: {
  anchor: HTMLElement;
  values: Record<string, unknown>;
  words: number;
  meta?: NoteMeta;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onClose: () => void;
  onPatch: (v: Record<string, unknown>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  ai: AiAccess;
  onAi: (visible: boolean) => void;
}) {
  const font = values.font ?? "default";
  const fonts: [string, string, string][] = [
    ["default", "Default", "font-sans"],
    ["serif", "Serif", "font-serif"],
    ["mono", "Mono", "font-mono"],
  ];
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <Popover anchor={anchor} placement="bottom-end" onClose={onClose} className="w-64 p-1">
      <MenuSection label="Style" />
      <div className="grid grid-cols-3 gap-1 px-1 pb-1">
        {fonts.map(([id, label, cls]) => (
          <button
            key={id}
            onClick={() => onPatch({ font: id === "default" ? null : id })}
            className={`flex flex-col items-center rounded-md py-1.5 hover:bg-hover ${font === id ? "text-[var(--blue)]" : "text-ink"}`}
          >
            <span className={`text-2xl ${cls}`}>Ag</span>
            <span className="text-xs text-muted">{label}</span>
          </button>
        ))}
      </div>
      <MenuItem label="Small text" right={<Toggle on={values.small === true} />} onClick={() => onPatch({ small: values.small === true ? null : true })} />
      <MenuItem label="Full width" right={<Toggle on={values.fullWidth === true} />} onClick={() => onPatch({ fullWidth: values.fullWidth === true ? null : true })} />
      <MenuDivider />
      {ai.source === "parent" && !ai.visible ? (
        <div className="px-2 py-1.5 text-xs leading-relaxed text-muted">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <EyeOff size={14} /> Hidden from AI agents
          </span>
          Because “{ai.from?.title}” is hidden. Sub-pages follow their parent.
        </div>
      ) : (
        <MenuItem icon={<Bot size={15} />} label="Visible to AI agents" right={<Toggle on={ai.visible} />} onClick={() => onAi(!ai.visible)} />
      )}
      <MenuDivider />
      {onToggleFavorite && <MenuItem icon={<Star size={15} />} label={favorite ? "Remove from Favorites" : "Add to Favorites"} onClick={act(onToggleFavorite)} />}
      <MenuItem icon={<Link2 size={15} />} label="Copy link" hint="[[…]]" onClick={act(onCopyPath)} />
      <MenuItem icon={<Copy size={15} />} label="Duplicate" onClick={act(onDuplicate)} />
      <MenuItem icon={<Trash2 size={15} />} label="Move to Trash" danger onClick={act(onDelete)} />
      <MenuDivider />
      <div className="px-2 py-1 text-xs leading-relaxed text-faint">
        Word count: {words.toLocaleString()}
        {meta && (
          <>
            <br />
            Last edited {timeAgo(meta.modified / 1000)}
            <br />
            {meta.path}
          </>
        )}
      </div>
    </Popover>
  );
}

function EmptyPageStarters({ onDatabase }: { onDatabase: (type: "table" | "board" | "calendar") => void }) {
  const items = [
    { type: "table" as const, label: "Table", icon: <Table2 size={16} /> },
    { type: "board" as const, label: "Board", icon: <KanbanSquare size={16} /> },
    { type: "calendar" as const, label: "Calendar", icon: <Calendar size={16} /> },
  ];
  return (
    <div className="mt-6 text-sm text-faint">
      <div className="mb-1 px-1">Get started with</div>
      {items.map((i) => (
        <button key={i.type} onClick={() => onDatabase(i.type)} className="flex h-8 w-full items-center gap-2 rounded-md px-1 text-muted hover:bg-hover">
          <span className="text-faint">{i.icon}</span> {i.label}
        </button>
      ))}
    </div>
  );
}

function TagInput({ autoFocus, onAdd, onDone }: { autoFocus: boolean; onAdd: (t: string) => void; onDone: () => void }) {
  const [value, setValue] = useState("");
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/[,[\]#]/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) {
          onAdd(value.trim());
          setValue("");
        }
        if (e.key === "Escape") (e.target as HTMLInputElement).blur();
      }}
      onBlur={() => {
        if (value.trim()) onAdd(value.trim());
        setValue("");
        onDone();
      }}
      placeholder="Add tag…"
      className="w-20 bg-transparent text-xs text-ink outline-none placeholder:text-faint"
    />
  );
}
