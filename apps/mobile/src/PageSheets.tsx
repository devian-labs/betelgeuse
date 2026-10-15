import { Copy, CornerUpRight, FileText, Link2, Plus, Search, Star, StarOff, Table2, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageIcon } from "@desktop/components/PageIcon";
import { useVault } from "@desktop/lib/vault";
import { parentOf, titleOf, useMobile } from "./mobile";
import { within } from "./lists";
import { afterSheet, Sheet, SheetDivider, SheetItem } from "./ui";

export function NoteIcon({ icon, kind, size = 18 }: { icon?: string | null; kind?: string | null; size?: number }) {
  if (icon) return <PageIcon icon={icon} size={size + 1} />;
  return kind === "database" ? <Table2 size={size - 1} /> : <FileText size={size - 1} />;
}

/** The sheet behind a page's ••• (or a long press on it in the list). */
export function PageActionsSheet({ path, onClose }: { path: string; onClose: () => void }) {
  const { notes, createPage, openPage } = useVault();
  const m = useMobile();
  const note = notes.find((n) => n.path === path);
  const favorite = m.favorites.includes(path);
  const act = (fn: () => unknown) => () => {
    onClose();
    afterSheet(fn);
  };
  return (
    <Sheet
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="grid size-6 place-items-center text-faint">
            <NoteIcon icon={note?.icon} kind={note?.kind} />
          </span>
          <span className="truncate">{note?.title ?? titleOf(path)}</span>
        </span>
      }
    >
      <SheetItem
        icon={favorite ? <StarOff size={19} /> : <Star size={19} />}
        label={favorite ? "Remove from Favorites" : "Add to Favorites"}
        onClick={act(() => m.toggleFavorite(path))}
      />
      <SheetItem
        icon={<Plus size={19} />}
        label={note?.kind === "database" ? "Add a row" : "Add a page inside"}
        onClick={act(async () => openPage(await createPage(path)))}
      />
      <SheetItem icon={<Copy size={18} />} label="Duplicate" onClick={act(() => m.duplicatePage(path))} />
      <SheetItem icon={<CornerUpRight size={19} />} label="Move to…" onClick={act(() => m.moveSheet(path))} />
      <SheetItem
        icon={<Link2 size={19} />}
        label="Copy link"
        hint="[[…]]"
        onClick={act(() => navigator.clipboard.writeText(`[[${titleOf(path)}]]`).then(() => m.toast({ message: "Link copied" })))}
      />
      <SheetDivider />
      <SheetItem icon={<Trash2 size={19} />} label="Move to Trash" danger onClick={act(() => m.deletePage(path))} />
    </Sheet>
  );
}

/** Picks where a page (and its sub-pages) moves to: inside another page, or the top level. */
export function MoveSheet({ path, onClose }: { path: string; onClose: () => void }) {
  const { notes } = useVault();
  const m = useMobile();
  const [query, setQuery] = useState("");
  const here = parentOf(path);
  const nameOf = (p: string) => notes.find((n) => n.path === p)?.title ?? titleOf(p);
  const q = query.trim().toLowerCase();
  const targets = notes
    .filter((n) => !within(n.path, path) && n.path !== here)
    .filter((n) => !q || n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 200);
  const move = (dest: string) => {
    onClose();
    afterSheet(() => m.movePage(path, dest).catch((e) => m.toast({ message: String(e) })));
  };
  return (
    <Sheet onClose={onClose} title={`Move “${nameOf(path)}” to`} className="h-[80vh]">
      <label className="mx-1 mb-1 flex h-10 items-center gap-2 rounded-xl bg-hover px-3">
        <Search size={16} className="shrink-0 text-faint" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pages" className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint" />
      </label>
      {here && !q && <SheetItem icon={<CornerUpRight size={18} />} label="Top level" hint="No parent page" onClick={() => move("")} />}
      {targets.map((n) => (
        <SheetItem
          key={n.path}
          icon={<NoteIcon icon={n.icon} kind={n.kind} />}
          label={n.title}
          hint={n.path.includes("/") ? nameOf(parentOf(n.path)!) : undefined}
          onClick={() => move(n.path.replace(/\.md$/, ""))}
        />
      ))}
      {targets.length === 0 && <p className="px-3 py-6 text-center text-sm text-faint">No pages match</p>}
    </Sheet>
  );
}
