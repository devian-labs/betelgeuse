import type { Editor as TiptapEditor } from "@tiptap/react";
import {
  ArrowUpRight,
  Calendar,
  ChevronRight,
  Copy,
  History,
  CornerUpRight,
  Image as ImageIcon,
  KanbanSquare,
  Link2,
  MoreHorizontal,
  SmilePlus,
  Star,
  Table2,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CoverBox, CoverCredit, CoverPicker, photoCover } from "@desktop/components/Cover";
import { HistoryPanel } from "@desktop/components/HistoryPanel";
import { IconPicker } from "@desktop/components/LazyIconPicker";
import { PageIcon } from "@desktop/components/PageIcon";
import { DatabaseView } from "@desktop/database/DatabaseView";
import { defaultSchema, writeSchema } from "@desktop/database/model";
import { RowProperties } from "@desktop/database/RowProperties";
import { createDatabase } from "@desktop/database/useDatabase";
import { PageContext } from "@desktop/editor/blocks";
import { Editor } from "@desktop/editor/Editor";
import { api, type NoteMeta } from "@desktop/lib/api";
import { markQuietWrite } from "@desktop/lib/quiet";
import { PluginPagePanels } from "@desktop/plugins/slots";
import { labelColor, tagColor } from "@desktop/lib/colors";
import { frontmatterTags, joinNote, pageTitle, patchFrontmatter, readFrontmatter, splitNote } from "@desktop/lib/frontmatter";
import { timeAgo } from "@desktop/lib/time";
import { ancestorKeys, resolveWikiLink } from "@desktop/lib/tree";
import { useVault } from "@desktop/lib/vault";
import { parentOf, titleOf, useMobile } from "./mobile";
import { EditorToolbar } from "./EditorToolbar";
import { registerSaver } from "./sync";
import { afterSheet, Sheet, SheetDivider, SheetItem, SheetLabel, Switch, TopBar } from "./ui";

type Doc = { frontmatter: string; body: string };

/** One page, full screen: cover, icon, title, tags and properties, then the editor (or, for a database, its views). */
export function PageScreen({ path }: { path: string }) {
  const { notes, refreshKey, openPage, createPage, refresh } = useVault();
  const m = useMobile();
  const [doc, setDoc] = useState<Doc | "missing" | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  // A new page's title ("Untitled", "Untitled 2"…) starts empty and focused, ready to type, rather than reading "Untitled".
  const name = notes.find((n) => n.path === path)?.title ?? titleOf(path);
  const untitled = /^Untitled( \d+)?$/.test(name);
  const [title, setTitleState] = useState(untitled ? "" : name);
  const titleRef = useRef(title);
  const setTitle = (v: string) => {
    titleRef.current = v;
    setTitleState(v);
  };
  const [titleFocused, setTitleFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<"menu" | "icon" | "cover" | "history" | null>(null);
  const [coverAnchor, setCoverAnchor] = useState<HTMLElement | null>(null);
  const [addingTag, setAddingTag] = useState(false);
  const [backlinks, setBacklinks] = useState<NoteMeta[]>([]);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const editorRef = useRef<TiptapEditor | null>(null);

  const fm = useRef("");
  const body = useRef("");
  const lastWritten = useRef<string | null>(null);
  const pending = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!pending.current) return;
    pending.current = false;
    const content = joinNote(fm.current, body.current);
    if (content === lastWritten.current) return setSaving(false);
    // Properties, icons and tags show elsewhere (the page list, databases); text alone doesn't.
    const metaChanged = lastWritten.current === null || splitNote(lastWritten.current).frontmatter !== fm.current;
    lastWritten.current = content;
    // Only the text changed: nothing else needs to reload for it (plugins aren't told either).
    if (!metaChanged) markQuietWrite(path);
    await api.writeNote(path, content);
    setSaving(false);
    if (metaChanged) refresh();
  }, [path, refresh]);

  const scheduleSave = useCallback(
    (delay = 500) => {
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
    Promise.all([api.readNote(path), api.backlinks(path).catch(() => [])])
      .then(([content, links]) => {
        setBacklinks(links);
        load(content);
      })
      .catch(() => setDoc("missing"));
  }, [path, load]);

  // Leaving the page (Back, or the app going to the background) saves straight away, and so does
  // a sync, so what's typed goes up with it.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", onHide);
    const unregister = registerSaver(flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      unregister();
      void flush();
    };
  }, [flush]);

  // Pick up changes that arrived from elsewhere (a sync, a database view) unless typing is pending.
  const loadedFor = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === loadedFor.current) return;
    loadedFor.current = refreshKey;
    if (pending.current) return;
    api
      .readNote(path)
      .then((c) => {
        if (c === lastWritten.current || pending.current) return;
        const parts = splitNote(c);
        // Only properties changed: the editor stays as it is, cursor and all.
        if (parts.body === body.current) {
          lastWritten.current = c;
          fm.current = parts.frontmatter;
          setDoc(parts);
        } else load(c);
      })
      .catch(() => setDoc("missing"));
    api.backlinks(path).then(setBacklinks).catch(() => {});
  }, [refreshKey, path, load]);

  const patch = (values: Record<string, unknown>) => {
    fm.current = patchFrontmatter(fm.current, values);
    setDoc({ frontmatter: fm.current, body: body.current });
    scheduleSave(0);
  };

  const openLink = (target: string) => {
    const hit = resolveWikiLink(target, notesRef.current);
    if (hit) openPage(hit.path);
    else createPage(null, target.split("#")[0]).then(openPage);
  };

  const commitTitle = async () => {
    const next = titleRef.current.trim();
    const current = pageTitle(path, fm.current);
    if (!next || next === current) return setTitle(untitled && next === "" ? "" : current);
    await flush();
    const moved = await api.renameNote(path, next);
    if (moved === path) {
      // Only the name in the frontmatter changed (the file name was taken): take it in, so the
      // next save doesn't write the old one back.
      const content = await api.readNote(path);
      lastWritten.current = content;
      fm.current = splitNote(content).frontmatter;
      setDoc({ frontmatter: fm.current, body: body.current });
      await refresh();
      return;
    }
    await m.renamed(path, moved);
  };

  const values = useMemo(() => (doc && doc !== "missing" ? readFrontmatter(doc.frontmatter) : {}), [doc]);
  const meta = notes.find((n) => n.path === path);
  const parent = parentOf(path);
  const parentIsDb = !!parent && notes.find((n) => n.path === parent)?.kind === "database";
  const isDb = values.type === "database";
  const favorite = m.favorites.includes(path);

  if (doc === "missing") {
    return (
      <div className="safe-top flex h-full flex-col">
        <TopBar onBack={m.back} title={<span className="truncate">{name}</span>} />
        <p className="px-5 pt-10 text-center text-sm text-muted">This page was moved or deleted.</p>
      </div>
    );
  }

  const icon = typeof values.icon === "string" ? values.icon : undefined;
  const cover = typeof values.cover === "string" ? values.cover : undefined;
  const coverY = typeof values.coverY === "number" ? Math.min(100, Math.max(0, values.coverY)) : 50;
  const tags = doc ? frontmatterTags(doc.frontmatter) : [];
  const font = values.font === "serif" || values.font === "mono" ? values.font : "default";
  const small = values.small === true;
  const emptyBody = doc && !isDb && !body.current.trim() && !parentIsDb;
  const crumbs = ancestorKeys(path).map((key) => {
    const note = notes.find((n) => n.path === `${key}.md`);
    return { key, title: note?.title ?? key.split("/").pop()!, note };
  });
  const parentCrumb = crumbs.at(-1);

  return (
    <div className="screen-in safe-top flex h-full flex-col bg-surface">
      <TopBar
        onBack={m.back}
        title={
          <span className="flex min-w-0 items-center gap-1 text-muted">
            {parentCrumb && (
              <>
                <button
                  disabled={!parentCrumb.note}
                  onClick={() => parentCrumb.note && openPage(parentCrumb.note.path)}
                  className="flex min-w-0 shrink items-center gap-1 rounded px-1 py-0.5 enabled:active:bg-hover"
                >
                  {parentCrumb.note?.icon && <PageIcon icon={parentCrumb.note.icon} size={15} />}
                  <span className="truncate">{crumbs.length > 1 ? "… / " : ""}{parentCrumb.title}</span>
                </button>
                <span className="text-faint">/</span>
              </>
            )}
            <span className="flex min-w-0 shrink-[2] items-center gap-1 px-1 text-ink">
              {meta?.icon && <PageIcon icon={meta.icon} size={15} />}
              <span className="truncate">{meta?.title ?? titleOf(path)}</span>
            </span>
          </span>
        }
      >
        <span className="shrink-0 px-1 text-xs text-faint">{saving ? "Saving…" : ""}</span>
        <button onClick={() => m.toggleFavorite(path)} aria-label={favorite ? "Remove from Favorites" : "Add to Favorites"} className="grid size-10 place-items-center rounded-full text-muted active:bg-hover">
          <Star size={20} className={favorite ? "fill-[#f6c050] text-[#f6c050]" : ""} />
        </button>
        <button onClick={() => setSheet("menu")} aria-label="Page menu" className="grid size-10 place-items-center rounded-full text-muted active:bg-hover">
          <MoreHorizontal size={22} />
        </button>
      </TopBar>

      <div className="safe-bottom min-h-0 flex-1 overflow-y-auto" data-font={font} data-small={small || undefined}>
        {cover && (
          <CoverBox cover={cover} position={coverY} className="relative h-[170px] w-full">
            {typeof values.coverCredit === "string" && typeof values.coverCreditUrl === "string" && <CoverCredit name={values.coverCredit} url={values.coverCreditUrl} />}
            <button
              onClick={(e) => (setCoverAnchor(e.currentTarget), setSheet("cover"))}
              className="absolute right-3 bottom-3 z-20 rounded-lg bg-raised/90 px-2.5 py-1.5 text-xs font-medium text-muted shadow-sm active:bg-raised"
            >
              Change cover
            </button>
          </CoverBox>
        )}

        <div className={`mobile-page px-5 pb-[45vh] ${cover ? "" : "pt-4"}`}>
          {icon && (
            <button onClick={() => setSheet("icon")} className={`relative z-10 -ml-1 block rounded-lg p-1 leading-none active:bg-hover ${cover ? "-mt-9" : ""}`}>
              <PageIcon icon={icon} size={60} />
            </button>
          )}
          {/* Shown while the title has the cursor, as the desktop app shows them on hover. */}
          {titleFocused && (!icon || !cover || tags.length === 0) && (
            <div className="-ml-2 flex h-9 items-center gap-0.5 text-[13px] text-faint">
              {!icon && <HeadButton icon={<SmilePlus size={15} />} label="Icon" onClick={() => setSheet("icon")} />}
              {!cover && <HeadButton icon={<ImageIcon size={15} />} label="Cover" onClick={() => patch({ cover: photoCover(), coverCredit: null, coverCreditUrl: null })} />}
              {tags.length === 0 && !isDb && <HeadButton icon={<Tag size={14} />} label="Tags" onClick={() => setAddingTag(true)} />}
            </div>
          )}

          <TitleField
            value={title}
            autoFocus={untitled}
            onChange={setTitle}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => {
              setTitleFocused(false);
              void commitTitle();
            }}
            onEnter={() => {
              const editor = editorRef.current;
              if (!editor) return false;
              editor.commands.focus("start");
              return true;
            }}
          />

          {(tags.length > 0 || addingTag) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Tag size={14} className="mr-0.5 text-faint" />
              {tags.map((t) => (
                <span key={t} style={{ background: tagColor(labelColor(t)) }} className="flex items-center gap-1 rounded-[4px] py-0.5 pr-1 pl-2 text-[14px] text-ink">
                  {t}
                  <button onClick={() => patch({ tags: tags.filter((x) => x !== t) })} aria-label={`Remove ${t}`} className="grid size-5 place-items-center opacity-60">
                    <X size={12} />
                  </button>
                </span>
              ))}
              <TagInput autoFocus={addingTag} onAdd={(t) => !tags.includes(t) && patch({ tags: [...tags, t] })} onDone={() => setAddingTag(false)} />
            </div>
          )}

          {parentIsDb && doc && (
            <RowProperties dbPath={parent!} rowPath={path} frontmatter={doc.frontmatter} times={{ created: meta?.created ?? 0, modified: meta?.modified ?? 0 }} onPatch={patch} />
          )}
          {doc && (
            <PluginPagePanels
              page={{ path, title: meta?.title ?? titleOf(path), properties: values, isDatabase: !!isDb, database: parentIsDb ? parent! : null, setProperties: patch }}
            />
          )}

          {isDb ? (
            <div className="mobile-db mt-4 -mx-5 px-5">
              <DatabaseView path={path} />
            </div>
          ) : (
            doc && (
              <div className="relative mt-2">
                <PageContext.Provider value={path}>
                  <Editor
                    key={`${path}:${editorKey}`}
                    editorRef={editorRef}
                    initial={doc.body}
                    onChange={(md) => {
                      body.current = md;
                      scheduleSave();
                    }}
                    onOpenLink={openLink}
                    getNotes={() => notesRef.current}
                    createPage={async (t) => titleOf(await createPage(null, t))}
                    page={{
                      createSubpage: (t) => createPage(path, t || "Untitled"),
                      findSubpage: (t) => {
                        const want = `${path.replace(/\.md$/, "")}/${t}.md`.toLowerCase();
                        return notesRef.current.find((n) => n.path.toLowerCase() === want)?.path;
                      },
                      createDatabase: () => createDatabase(path),
                    }}
                  />
                </PageContext.Provider>
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
            )
          )}

          {backlinks.length > 0 && !isDb && (
            <section className="mt-14 border-t border-line pt-3">
              <button
                onClick={() => setShowBacklinks((v) => !v)}
                aria-expanded={showBacklinks}
                className="-ml-1 flex h-9 items-center gap-1.5 rounded-md px-1 text-[13px] font-medium text-faint active:bg-hover"
              >
                <Link2 size={14} /> {backlinks.length} backlink{backlinks.length > 1 ? "s" : ""}
                <ChevronRight size={14} className={`transition-transform ${showBacklinks ? "rotate-90" : ""}`} />
              </button>
              {showBacklinks &&
                backlinks.map((b) => (
                  <button key={b.path} onClick={() => openPage(b.path)} className="flex h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left text-[15px] active:bg-hover">
                    <span className="grid w-6 place-items-center">{b.icon ? <PageIcon icon={b.icon} size={17} /> : <Link2 size={15} className="text-faint" />}</span>
                    <span className="flex-1 truncate">{b.title}</span>
                    <ArrowUpRight size={15} className="text-faint" />
                  </button>
                ))}
            </section>
          )}
        </div>
      </div>

      {!isDb && doc && <EditorToolbar editorRef={editorRef} editorKey={editorKey} onOpenLink={openLink} />}

      {sheet === "menu" && (
        <PageMenu
          path={path}
          values={values}
          words={body.current.split(/\s+/).filter(Boolean).length}
          meta={meta}
          hasIcon={!!icon}
          hasCover={!!cover}
          onClose={() => setSheet(null)}
          onPatch={patch}
          onIcon={() => setSheet("icon")}
          onTags={() => setAddingTag(true)}
          onDelete={async () => {
            // Nothing more is saved here: a late save would bring the page back.
            window.clearTimeout(timer.current);
            pending.current = false;
            await m.deletePage(path);
          }}
          onBeforeLeave={flush}
          onHistory={() => setSheet("history")}
        />
      )}
      {sheet === "icon" && (
        <Sheet onClose={() => setSheet(null)} title="Page icon" className="icon-sheet">
          <IconPicker
            current={icon}
            onClose={() => setSheet(null)}
            onPick={(i) => {
              setSheet(null);
              patch({ icon: i });
            }}
          />
        </Sheet>
      )}
      {sheet === "history" && (
        <div className="history-screen safe-top safe-bottom fixed inset-0 z-40 flex flex-col bg-surface">
          <HistoryPanel
            path={path}
            refreshKey={refreshKey}
            onClose={() => setSheet(null)}
            onRestore={async (content) => {
              setSheet(null);
              // Restored like any edit: it's saved now and goes up with the next sync.
              await api.writeNote(path, content);
              load(content);
              refresh();
            }}
          />
        </div>
      )}
      {sheet === "cover" && (
        <CoverPicker
          anchor={coverAnchor}
          onClose={() => setSheet(null)}
          onPick={(c, credit) => {
            setSheet(null);
            patch({ cover: c, coverY: null, coverCredit: credit?.name ?? null, coverCreditUrl: credit?.url ?? null });
          }}
        />
      )}
    </div>
  );
}

function HeadButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    // Keeps the title focused, so the row doesn't vanish before the tap lands.
    <button onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="flex h-8 items-center gap-1.5 rounded-md px-2 active:bg-hover">
      {icon} {label}
    </button>
  );
}

function PageMenu({
  path,
  values,
  words,
  meta,
  hasIcon,
  hasCover,
  onClose,
  onPatch,
  onIcon,
  onTags,
  onDelete,
  onBeforeLeave,
  onHistory,
}: {
  path: string;
  values: Record<string, unknown>;
  words: number;
  meta?: NoteMeta;
  hasIcon: boolean;
  hasCover: boolean;
  onClose: () => void;
  onPatch: (v: Record<string, unknown>) => void;
  onIcon: () => void;
  onTags: () => void;
  onDelete: () => void;
  onBeforeLeave: () => Promise<void>;
  onHistory: () => void;
}) {
  const m = useMobile();
  const font = values.font ?? "default";
  const fonts: [string, string, string][] = [
    ["default", "Default", "font-sans"],
    ["serif", "Serif", "font-serif"],
    ["mono", "Mono", "font-mono"],
  ];
  const act = (fn: () => unknown) => () => {
    onClose();
    afterSheet(fn);
  };
  const isDb = values.type === "database";
  return (
    <Sheet onClose={onClose}>
      <SheetLabel>Style</SheetLabel>
      <div className="grid grid-cols-3 gap-1.5 px-1 pb-1">
        {fonts.map(([id, label, cls]) => (
          <button
            key={id}
            onClick={() => onPatch({ font: id === "default" ? null : id })}
            className={`flex flex-col items-center rounded-xl border py-2 active:bg-hover ${font === id ? "border-[var(--blue)] text-[var(--blue)]" : "border-line text-ink"}`}
          >
            <span className={`text-2xl ${cls}`}>Ag</span>
            <span className="text-xs text-muted">{label}</span>
          </button>
        ))}
      </div>
      <SheetItem label="Small text" right={<Switch on={values.small === true} />} onClick={() => onPatch({ small: values.small === true ? null : true })} />
      <SheetDivider />
      {!hasIcon && <SheetItem icon={<SmilePlus size={19} />} label="Add icon" onClick={act(onIcon)} />}
      {!hasCover && <SheetItem icon={<ImageIcon size={19} />} label="Add cover" onClick={act(() => onPatch({ cover: photoCover(), coverCredit: null, coverCreditUrl: null }))} />}
      {hasCover && <SheetItem icon={<ImageIcon size={19} />} label="Remove cover" onClick={act(() => onPatch({ cover: null, coverY: null, coverCredit: null, coverCreditUrl: null }))} />}
      {!isDb && <SheetItem icon={<Tag size={18} />} label="Add tags" onClick={act(onTags)} />}
      <SheetDivider />
      <SheetItem
        icon={<Star size={19} />}
        label={m.favorites.includes(path) ? "Remove from Favorites" : "Add to Favorites"}
        onClick={act(() => m.toggleFavorite(path))}
      />
      <SheetItem
        icon={<Link2 size={19} />}
        label="Copy link"
        hint="[[…]]"
        onClick={act(() => navigator.clipboard.writeText(`[[${titleOf(path)}]]`).then(() => m.toast({ message: "Link copied" })))}
      />
      <SheetItem icon={<Copy size={18} />} label="Duplicate" onClick={act(async () => (await onBeforeLeave(), m.duplicatePage(path)))} />
      <SheetItem icon={<CornerUpRight size={19} />} label="Move to…" onClick={act(async () => (await onBeforeLeave(), m.moveSheet(path)))} />
      {m.sync.status?.configured && <SheetItem icon={<History size={19} />} label="Page history" onClick={act(async () => (await onBeforeLeave(), onHistory()))} />}
      <SheetItem icon={<Trash2 size={19} />} label="Move to Trash" danger onClick={act(onDelete)} />
      <SheetDivider />
      <div className="px-3 py-2 text-xs leading-relaxed text-faint">
        {!isDb && <>Word count: {words.toLocaleString()}<br /></>}
        {meta && (
          <>
            Last edited {timeAgo(meta.modified / 1000)}
            <br />
            {meta.path}
          </>
        )}
      </div>
    </Sheet>
  );
}

function EmptyPageStarters({ onDatabase }: { onDatabase: (type: "table" | "board" | "calendar") => void }) {
  const items = [
    { type: "table" as const, label: "Table", icon: <Table2 size={17} /> },
    { type: "board" as const, label: "Board", icon: <KanbanSquare size={17} /> },
    { type: "calendar" as const, label: "Calendar", icon: <Calendar size={17} /> },
  ];
  return (
    <div className="mt-8 text-[14px] text-faint">
      <div className="mb-1">Get started with</div>
      {items.map((i) => (
        <button key={i.type} onClick={() => onDatabase(i.type)} className="-ml-1 flex h-10 w-full items-center gap-2.5 rounded-lg px-1 text-[15px] text-muted active:bg-hover">
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
      }}
      onBlur={() => {
        if (value.trim()) onAdd(value.trim());
        setValue("");
        onDone();
      }}
      enterKeyHint="done"
      placeholder="Add tag…"
      className="w-24 bg-transparent text-ink outline-none placeholder:text-faint"
    />
  );
}

/** The page title: wraps onto more lines as needed. Enter (Next) moves to the page text. */
function TitleField({
  value,
  autoFocus,
  onChange,
  onFocus,
  onBlur,
  onEnter,
}: {
  value: string;
  autoFocus: boolean;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onEnter: () => boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      autoFocus={autoFocus}
      // A title is one line: pasted line breaks become spaces.
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, " "))}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.key !== "Enter") return;
        e.preventDefault();
        if (!onEnter()) e.currentTarget.blur();
      }}
      enterKeyHint="next"
      placeholder="Untitled"
      className="page-title mt-1 block w-full resize-none overflow-hidden bg-transparent text-[30px] leading-[1.2] font-bold text-ink outline-none placeholder:text-[var(--placeholder)]"
    />
  );
}
