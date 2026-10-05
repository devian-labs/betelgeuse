import { ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { CoverBox } from "../components/Cover";
import { PageIcon } from "../components/PageIcon";
import { useOpenRow } from "../lib/vault";
import { monthGrid, StatusDot, Tag } from "./cells";
import {
  asDate,
  asList,
  cardPreviewOf,
  cardSections,
  displayValue,
  relationTitles,
  findProperty,
  getValue,
  isEmptyValue,
  isoDay,
  visibleProperties,
  withOption,
  type CardPreview,
  type Property,
  type Row,
} from "./model";
import { EditableValue, RowMenu, RowTitle, TitleInput, type ViewProps } from "./shared";

/** Non-empty, visible, non-title properties of a row: what Notion shows on cards. */
function cardProps(props: Property[], row: Row, exclude?: string) {
  return props.filter((p) => p.type !== "title" && p.name !== exclude && !isEmptyValue(p, getValue(row, p)));
}

function useAutoEditTitle({ editTitleOf, rows, onTitleEdited }: ViewProps) {
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    if (editTitleOf && rows.some((r) => r.path === editTitleOf)) {
      setEditing(editTitleOf);
      onTitleEdited();
    }
  }, [editTitleOf, rows, onTitleEdited]);
  return [editing, setEditing] as const;
}

function Card({
  row,
  props,
  vp,
  exclude,
  editing,
  setEditing,
  preview,
  draggable,
}: {
  row: Row;
  props: Property[];
  vp: ViewProps;
  exclude?: string;
  editing: string | null;
  setEditing: (p: string | null) => void;
  /** Gallery cards show a preview: the page's cover or the start of its text (see the view's settings). */
  preview?: CardPreview;
  draggable?: boolean;
}) {
  const openRow = useOpenRow();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const shown = preview ? cardPreviewOf(row, preview) : null;
  const text = row.body
    .replace(/!\[[^\]]*\]\([^)]*\)|<[^>]+>|```database[\s\S]*?```/g, " ")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/[#>*_`~[\]|]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const { lines, tags, stats } = cardSections(props, row, exclude);
  const big = !!preview; // gallery cards get a header with a large icon; board cards stay compact
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      draggable={draggable && editing !== row.path}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/betelgeuse-row", row.path);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => editing !== row.path && openRow(row.path, e)}
      className="group/card relative cursor-pointer overflow-hidden rounded-lg border border-line bg-raised transition-[background-color,border-color,box-shadow] hover:border-[var(--line-strong)] hover:bg-[var(--card-hover)] hover:shadow-card"
    >
      {shown === "cover" && <CoverBox cover={String(row.values.cover)} className="h-32 w-full border-b border-line" />}
      {shown === "content" && (
        <div className="h-32 overflow-hidden border-b border-line bg-side px-3 pt-3 text-[11px] leading-snug whitespace-pre-line text-faint">
          {text || <span className="opacity-60">Empty page</span>}
        </div>
      )}
      <div className={big ? "space-y-2.5 p-3.5" : "space-y-1.5 px-3 py-2.5"}>
        {editing === row.path ? (
          <TitleInput row={row} db={vp.db} onDone={() => setEditing(null)} />
        ) : big ? (
          <div className="flex min-w-0 items-center gap-2.5 pr-6">
            {row.icon && shown !== "cover" && (
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-side">
                <PageIcon icon={row.icon} size={22} />
              </span>
            )}
            <span className={`truncate text-[15px] font-semibold ${row.title === "Untitled" ? "text-faint" : "text-ink"}`}>{row.title}</span>
          </div>
        ) : (
          <RowTitle row={row} className="pr-6 text-[14px]" />
        )}

        {lines.map((p) => (
          <div key={p.name} onClick={stop} className="text-[13px] leading-snug text-muted">
            <EditableValue db={vp.db} row={row} prop={p} className="line-clamp-2 rounded hover:bg-hover">
              {p.type === "text" ? <span className="line-clamp-2">{displayValue(p, getValue(row, p))}</span> : undefined}
            </EditableValue>
          </div>
        ))}

        {tags.length > 0 && (
          <div onClick={stop} className="flex flex-wrap items-center gap-1">
            {tags.map((p) => (
              <EditableValue key={p.name} db={vp.db} row={row} prop={p} wrap className="rounded hover:bg-hover" />
            ))}
          </div>
        )}

        {stats.length > 0 && (
          <div onClick={stop} className={`flex flex-wrap items-center gap-y-1 text-xs text-faint ${big ? "gap-x-3 border-t border-line pt-2.5" : "gap-x-2.5"}`}>
            {stats.map((p) => {
              const v = getValue(row, p);
              // Relations show how many pages they link; open the cell to see or change which.
              const count = p.type === "relation" ? relationTitles(v).length : null;
              return (
                <EditableValue key={p.name} db={vp.db} row={row} prop={p} className="flex items-baseline gap-1 rounded px-0.5 hover:bg-hover">
                  {count !== null ? (
                    <>
                      <span className="font-medium text-muted tabular-nums">{count}</span>
                      <span>{p.name}</span>
                    </>
                  ) : (
                    <>
                      <span>{p.name}</span>
                      <span className="font-medium text-muted tabular-nums">{(Array.isArray(v) ? v.join(", ") : displayValue(p, v)) || "0"}</span>
                    </>
                  )}
                </EditableValue>
              );
            })}
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenu(e.currentTarget);
        }}
        className="absolute top-2 right-2 grid size-6 place-items-center rounded-md border border-line bg-raised text-muted opacity-0 shadow-sm group-hover/card:opacity-100 hover:bg-hover"
      >
        <MoreHorizontal size={14} />
      </button>
      {menu && <RowMenu db={vp.db} row={row} anchor={menu} onClose={() => setMenu(null)} onRename={() => setEditing(row.path)} />}
    </div>
  );
}

export function BoardView(vp: ViewProps) {
  const { db, schema, view, rows } = vp;
  const [editing, setEditing] = useAutoEditTitle(vp);
  const [over, setOver] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const group = view.groupBy ? findProperty(schema, view.groupBy) : undefined;
  const props = visibleProperties(schema, view);

  if (!group || !["select", "status", "multi_select"].includes(group.type)) {
    return (
      <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">
        Boards group pages by a Select or Status property. Add one, then choose it under ••• → Group by.
      </div>
    );
  }

  const NONE = "\u0000none";
  const groups = [NONE, ...(group.options ?? []).map((o) => o.name)];
  const rowsIn = (g: string) =>
    rows.filter((r) => {
      const v = asList(getValue(r, group));
      return g === NONE ? v.length === 0 : v.includes(g);
    });

  const move = (path: string, g: string) => {
    const row = rows.find((r) => r.path === path);
    if (!row) return;
    if (group.type === "multi_select") {
      const current = asList(getValue(row, group));
      db.setValue(row, group.name, g === NONE ? null : [...new Set([...current, g])]);
    } else db.setValue(row, group.name, g === NONE ? null : g);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {groups.map((g) => {
        const items = rowsIn(g);
        if (g === NONE && items.length === 0) return null;
        const option = group.options?.find((o) => o.name === g);
        const add = async () => setEditing(await db.createRow(g === NONE ? {} : { [group.name]: group.type === "multi_select" ? [g] : g }));
        return (
          <div
            key={g}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(g);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              setOver(null);
              const path = e.dataTransfer.getData("text/betelgeuse-row");
              if (path) move(path, g);
            }}
            // Columns stay neutral; the status colour lives in the header pill, and tints the column
            // only while a card is dragged over it, as a drop hint.
            style={{ background: over === g ? `color-mix(in srgb, var(--c-${option?.color ?? "gray"}-bg) 70%, transparent)` : undefined }}
            className={`group/col flex w-72 shrink-0 flex-col gap-2 self-start rounded-xl p-2 transition-colors ${over === g ? "" : "bg-[var(--row-hover)]"}`}
          >
            <div className="flex h-7 items-center gap-2 px-1.5">
              {g === NONE ? (
                <Tag name={`No ${group.name}`} color="default" />
              ) : group.type === "status" ? (
                <span
                  style={{ background: `var(--c-${option?.color ?? "gray"}-tag)` }}
                  className="inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[13px] text-ink"
                >
                  <StatusDot color={option?.color} />
                  {g}
                </span>
              ) : (
                <Tag name={g} color={option?.color} />
              )}
              <span className="text-[13px] text-faint tabular-nums">{items.length}</span>
              <button
                onClick={add}
                title="New page in this group"
                className="ml-auto grid size-6 place-items-center rounded-md text-faint opacity-0 group-hover/col:opacity-100 hover:bg-hover hover:text-ink"
              >
                <Plus size={14} />
              </button>
            </div>
            {items.map((row) => (
              <Card key={row.path} row={row} props={props} vp={vp} exclude={group.name} editing={editing} setEditing={setEditing} draggable />
            ))}
            {/* An empty column is a drop target, so it keeps some height and says so. */}
            {!items.length && (
              <div className="grid h-16 place-items-center rounded-lg border border-dashed border-line text-xs text-faint">Drop pages here</div>
            )}
            <button onClick={add} className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-faint hover:bg-hover hover:text-muted">
              <Plus size={14} /> New page
            </button>
          </div>
        );
      })}
      <div className="w-56 shrink-0">
        {addingGroup ? (
          <input
            autoFocus
            placeholder="Group name"
            onBlur={() => setAddingGroup(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                db.updateProperty(group.name, withOption(group, e.currentTarget.value.trim()).prop);
                setAddingGroup(false);
              }
              if (e.key === "Escape") setAddingGroup(false);
            }}
            className="h-8 w-full rounded-md border border-line bg-raised px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
          />
        ) : (
          <button onClick={() => setAddingGroup(true)} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-faint hover:bg-hover">
            <Plus size={15} /> Add group
          </button>
        )}
      </div>
    </div>
  );
}

export function GalleryView(vp: ViewProps) {
  const { db, schema, view, rows } = vp;
  const [editing, setEditing] = useAutoEditTitle(vp);
  const props = visibleProperties(schema, view);
  const width = { small: 180, medium: 240, large: 320 }[view.cardSize ?? "medium"];
  return (
    <div className="pb-4">
      {/* Cards size to their content (start-aligned) rather than stretching to the tallest in the row. */}
      <div className="grid items-start gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${width}px, 1fr))` }}>
        {rows.map((row) => (
          <Card key={row.path} row={row} props={props} vp={vp} editing={editing} setEditing={setEditing} preview={view.cardPreview ?? "auto"} />
        ))}
      </div>
      {/* A slim line like the table's, not a card-sized tile: it adds a page, it isn't one. */}
      <button onClick={async () => setEditing(await db.createRow())} className="mt-2 flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-faint hover:bg-hover">
        <Plus size={15} /> New page
      </button>
    </div>
  );
}

export function ListView(vp: ViewProps) {
  const { db, schema, view, rows } = vp;
  const openRow = useOpenRow();
  const [editing, setEditing] = useAutoEditTitle(vp);
  const [menu, setMenu] = useState<{ row: Row; el: HTMLElement } | null>(null);
  const props = visibleProperties(schema, view);
  return (
    <div className="pb-2">
      {rows.map((row) => (
        <div
          key={row.path}
          onClick={(e) => editing !== row.path && openRow(row.path, e)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ row, el: e.currentTarget });
          }}
          className="flex h-9 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-hover"
        >
          <span className="min-w-0 flex-1">
            {editing === row.path ? <TitleInput row={row} db={db} onDone={() => setEditing(null)} /> : <RowTitle row={row} className="text-sm" />}
          </span>
          <span className="flex shrink-0 items-center gap-3 text-xs text-muted" onClick={(e) => e.stopPropagation()}>
            {cardProps(props, row).map((p) => (
              <EditableValue key={p.name} db={db} row={row} prop={p} className="max-w-48 rounded px-1 hover:bg-hover" />
            ))}
          </span>
        </div>
      ))}
      <button onClick={async () => setEditing(await db.createRow())} className="flex h-9 w-full items-center gap-1.5 rounded-md px-2 text-sm text-faint hover:bg-hover">
        <Plus size={15} /> New page
      </button>
      {menu && <RowMenu db={db} row={menu.row} anchor={menu.el} onClose={() => setMenu(null)} onRename={() => setEditing(menu.row.path)} />}
    </div>
  );
}

export function CalendarView(vp: ViewProps) {
  const { db, schema, view, rows } = vp;
  const openRow = useOpenRow();
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [over, setOver] = useState<string | null>(null);
  const dateProp = view.dateProperty ? findProperty(schema, view.dateProperty) : undefined;

  if (!dateProp) {
    return (
      <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">
        Calendars place pages by a Date property. Add one, then choose it under ••• → Show calendar by.
      </div>
    );
  }

  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    const d = asDate(getValue(r, dateProp));
    if (!d) continue;
    const key = isoDay(d);
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const days = monthGrid(month);
  const editable = dateProp.type === "date";

  return (
    <div className="pb-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-sm font-semibold text-ink">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid size-6 place-items-center rounded text-muted hover:bg-hover">
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))} className="rounded px-2 py-0.5 text-sm text-muted hover:bg-hover">
          Today
        </button>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid size-6 place-items-center rounded text-muted hover:bg-hover">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 border-t border-l border-line text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="border-r border-b border-line px-2 py-1 text-center text-faint">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = isoDay(day);
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = key === isoDay(today);
          const weekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <div
              key={key}
              onDragOver={(e) => editable && (e.preventDefault(), setOver(key))}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                setOver(null);
                const row = rows.find((r) => r.path === e.dataTransfer.getData("text/betelgeuse-row"));
                if (row) db.setValue(row, dateProp.name, key);
              }}
              className={`group/day relative min-h-28 border-r border-b border-line p-1 ${weekend ? "bg-side/60" : ""} ${over === key ? "bg-[var(--c-blue-bg)]" : ""}`}
            >
              <div className="mb-1 flex h-6 items-center justify-between">
                {editable ? (
                  <button
                    onClick={() => db.createRow({ [dateProp.name]: key }, true)}
                    className="grid size-5 place-items-center rounded text-faint opacity-0 group-hover/day:opacity-100 hover:bg-hover"
                  >
                    <Plus size={13} />
                  </button>
                ) : (
                  <span />
                )}
                <span
                  className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[13px] ${
                    isToday ? "bg-[var(--c-red-text)] font-medium text-white" : inMonth ? "text-muted" : "text-faint"
                  }`}
                >
                  {day.getDate() === 1 ? day.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {(byDay.get(key) ?? []).map((row) => (
                  <div
                    key={row.path}
                    draggable={editable}
                    onDragStart={(e) => e.dataTransfer.setData("text/betelgeuse-row", row.path)}
                    onClick={(e) => openRow(row.path, e)}
                    className="cursor-pointer truncate rounded bg-raised px-1.5 py-1 shadow-card hover:bg-[var(--card-hover)]"
                  >
                    <RowTitle row={row} className="text-xs" />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
