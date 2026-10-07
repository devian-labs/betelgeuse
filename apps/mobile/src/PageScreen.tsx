import { ChevronLeft, MoreHorizontal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageIcon } from "@desktop/components/PageIcon";
import { DatabaseView } from "@desktop/database/DatabaseView";
import { RowProperties } from "@desktop/database/RowProperties";
import { createDatabase } from "@desktop/database/useDatabase";
import { Editor } from "@desktop/editor/Editor";
import { api } from "@desktop/lib/api";
import { joinNote, patchFrontmatter, readFrontmatter, splitNote } from "@desktop/lib/frontmatter";
import { resolveWikiLink } from "@desktop/lib/tree";
import { useVault } from "@desktop/lib/vault";
import { rememberRecent } from "./recents";

const titleOf = (path: string) => path.replace(/^.*\//, "").replace(/\.md$/, "");
const parentOf = (path: string) => (path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}.md` : null);

/** One page, full screen: its title, then the editor (or, for a database, its rows). */
export function PageScreen({ path, onBack, onDeleted, onRenamed }: { path: string; onBack: () => void; onDeleted: () => void; onRenamed: (path: string) => void }) {
  const { notes, openPage, createPage, refresh } = useVault();
  const [doc, setDoc] = useState<{ frontmatter: string; body: string } | null>(null);
  const [missing, setMissing] = useState(false);
  // A new page's title starts empty and focused, ready to type, rather than reading "Untitled".
  const untitled = titleOf(path) === "Untitled";
  const [title, setTitle] = useState(untitled ? "" : titleOf(path));
  const [menu, setMenu] = useState(false);
  const fm = useRef("");
  const body = useRef("");
  // Nothing is written until the page has loaded, so a save can never replace it with an empty file.
  const loaded = useRef(false);
  const timer = useRef<number>(undefined);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    rememberRecent(path);
    api
      .readNote(path)
      .then((content) => {
        const parts = splitNote(content);
        fm.current = parts.frontmatter;
        body.current = parts.body;
        loaded.current = true;
        setDoc(parts);
      })
      .catch(() => setMissing(true));
  }, [path]);

  const save = useCallback(async () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (loaded.current) await api.writeNote(path, joinNote(fm.current, body.current));
  }, [path]);
  const scheduleSave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 600);
  };
  // Leaving the page (back, or the app going to the background) saves straight away.
  useEffect(() => {
    const flush = () => document.visibilityState === "hidden" && timer.current && save();
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      if (timer.current) save();
    };
  }, [save]);

  const rename = async () => {
    const next = title.trim();
    if (!next || next === titleOf(path)) return setTitle(untitled ? "" : titleOf(path));
    await save();
    const moved = await api.renameNote(path, next);
    await refresh();
    onRenamed(moved);
  };

  if (missing) {
    return (
      <Screen title={titleOf(path)} onBack={onBack}>
        <p className="px-5 pt-10 text-center text-sm text-muted">This page was moved or deleted.</p>
      </Screen>
    );
  }

  const values = readFrontmatter(doc?.frontmatter ?? "");
  const isDb = values.type === "database";
  const parent = parentOf(path);
  const parentIsDb = !!parent && notes.find((n) => n.path === parent)?.kind === "database";
  const meta = notes.find((n) => n.path === path);
  const icon = typeof values.icon === "string" ? values.icon : null;

  return (
    <Screen title={titleOf(path)} onBack={onBack} onMenu={() => setMenu((m) => !m)}>
      {menu && (
        <div className="absolute top-14 right-3 z-20 w-52 rounded-xl border border-line bg-raised p-1 shadow-pop">
          <button
            onClick={async () => {
              setMenu(false);
              window.clearTimeout(timer.current);
              timer.current = undefined;
              loaded.current = false;
              await api.deleteNote(path);
              onDeleted();
            }}
            className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-[15px] text-[var(--c-red-text)] active:bg-hover"
          >
            <Trash2 size={17} /> Move to Trash
          </button>
        </div>
      )}

      <div className="mobile-page px-5 pb-24">
        {icon && <div className="pt-2">{<PageIcon icon={icon} size={44} />}</div>}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="Untitled"
          autoFocus={untitled}
          enterKeyHint="done"
          className="mt-2 w-full bg-transparent text-[28px] leading-tight font-bold text-ink outline-none placeholder:text-[var(--placeholder)]"
        />

        {parentIsDb && doc && (
          <RowProperties
            dbPath={parent!}
            rowPath={path}
            frontmatter={doc.frontmatter}
            times={{ created: meta?.created ?? 0, modified: meta?.modified ?? 0 }}
            onPatch={(patch) => {
              fm.current = patchFrontmatter(fm.current, patch);
              setDoc({ frontmatter: fm.current, body: body.current });
              scheduleSave();
            }}
          />
        )}

        {isDb ? (
          <div className="mt-4 overflow-x-auto">
            <DatabaseView path={path} />
          </div>
        ) : (
          doc && (
            <div className="relative mt-3">
              <Editor
                initial={doc.body}
                onChange={(md) => {
                  body.current = md;
                  scheduleSave();
                }}
                onOpenLink={(target) => {
                  const hit = resolveWikiLink(target, notesRef.current);
                  if (hit) openPage(hit.path);
                  else createPage(null, target.split("#")[0]).then(openPage);
                }}
                getNotes={() => notesRef.current}
                createPage={async (t) => titleOf(await createPage(null, t))}
                page={{
                  createSubpage: () => createPage(path, "Untitled"),
                  createDatabase: async () => {
                    const db = await createDatabase(path);
                    await refresh();
                    return db;
                  },
                }}
              />
            </div>
          )
        )}
      </div>
    </Screen>
  );
}

function Screen({ title, onBack, onMenu, children }: { title: string; onBack: () => void; onMenu?: () => void; children: React.ReactNode }) {
  return (
    <div className="safe-top relative flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-1.5">
        <button onClick={onBack} aria-label="Back" className="grid size-10 place-items-center rounded-lg text-muted active:bg-hover">
          <ChevronLeft size={24} />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[15px] font-medium">{title}</span>
        {onMenu ? (
          <button onClick={onMenu} aria-label="Page menu" className="grid size-10 place-items-center rounded-lg text-muted active:bg-hover">
            <MoreHorizontal size={22} />
          </button>
        ) : (
          <span className="size-10" />
        )}
      </header>
      <div className="safe-bottom min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
