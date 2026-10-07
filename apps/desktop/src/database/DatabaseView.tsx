import {
  ArrowDownUp,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Filter as FilterIcon,
  KanbanSquare,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { PageIcon } from "../components/PageIcon";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { MenuDivider, MenuItem, MenuSection, Popover } from "../components/Popover";
import { wantsNewTab } from "../lib/nav";
import { useVault } from "../lib/vault";
import { PropIcon } from "./cells";
import {
  VIEW_LABELS,
  allProperties,
  applyView,
  filterDefaults,
  filterOpsFor,
  filterValues,
  findProperty,
  type Filter,
  type Schema,
  type View,
  type ViewType,
} from "./model";
import { BoardView, CalendarView, GalleryView, ListView } from "./OtherViews";
import { Toggle } from "./PropertyMenu";
import type { ViewProps } from "./shared";
import { TableView } from "./TableView";
import { useDatabase, type Database } from "./useDatabase";

export const VIEW_ICONS: Record<ViewType, (size: number) => ReactNode> = {
  table: (s) => <Table2 size={s} />,
  board: (s) => <KanbanSquare size={s} />,
  list: (s) => <ListIcon size={s} />,
  gallery: (s) => <LayoutGrid size={s} />,
  calendar: (s) => <Calendar size={s} />,
};

const VIEWS: Record<ViewType, (p: ViewProps) => ReactNode> = {
  table: TableView,
  board: BoardView,
  list: ListView,
  gallery: GalleryView,
  calendar: CalendarView,
};

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* convenience only */
    }
  },
};

/**
 * A database: either the whole body of a database page, or embedded inline in
 * another page via `![[Database]]` (in which case `title` shows a link header).
 */
export function DatabaseView({ path, inline }: { path: string; inline?: boolean }) {
  const db = useDatabase(path);
  const { openPage, notes } = useVault();
  const [activeId, setActiveId] = useState(() => store.get(`view:${path}`));
  const [search, setSearch] = useState<string | null>(null);
  const [editTitleOf, setEditTitleOf] = useState<string | null>(null);
  const onTitleEdited = useCallback(() => setEditTitleOf(null), []);

  const schema = db.state?.schema;
  const view = schema?.views.find((v) => v.id === activeId) ?? schema?.views[0];
  const rows = useMemo(
    () => (schema && view && db.state ? applyView(db.state.rows, schema, view, search ?? "") : []),
    [db.state, schema, view, search],
  );
  // Pages made from a view start with its filters' values, on top of what the view sets itself (a board column's group).
  const viewDb = useMemo(
    () => ({
      ...db,
      createRow: (values: Record<string, unknown> = {}, openAfter = false) =>
        db.createRow({ ...(schema && view ? filterDefaults(schema, view) : {}), ...values }, openAfter),
    }),
    [db, schema, view],
  );

  if (db.missing) return <div className="py-2 text-sm text-faint">Database not found: {path}</div>;
  if (!db.state || !schema || !view) return <div className="h-24" />;

  const select = (id: string) => {
    setActiveId(id);
    store.set(`view:${path}`, id);
  };
  const meta = notes.find((n) => n.path === path);
  const Active = VIEWS[view.type] ?? TableView;

  return (
    <div className="database-view" onKeyDown={(e) => e.stopPropagation()}>
      {inline && (
        <button onClick={(e) => openPage(path, { newTab: wantsNewTab(e) })} className="group mb-1 flex items-center gap-2 text-left">
          <PageIcon icon={meta?.icon ?? "🗃️"} size={22} />
          <span className="text-xl font-bold text-ink">{meta?.title ?? path.replace(/\.md$/, "")}</span>
          <ArrowUpRight size={16} className="text-faint opacity-0 group-hover:opacity-100" />
        </button>
      )}

      <Toolbar db={db} schema={schema} view={view} select={select} search={search} setSearch={setSearch} onNew={async () => setEditTitleOf(await viewDb.createRow())} />
      <Chips db={db} schema={schema} view={view} />

      <div className="mt-1">
        <Active db={viewDb} schema={schema} view={view} rows={rows} editTitleOf={editTitleOf} onTitleEdited={onTitleEdited} />
      </div>
    </div>
  );
}

function Toolbar({
  db,
  schema,
  view,
  select,
  search,
  setSearch,
  onNew,
}: {
  db: Database;
  schema: Schema;
  view: View;
  select: (id: string) => void;
  search: string | null;
  setSearch: (s: string | null) => void;
  onNew: () => void;
}) {
  const [addView, setAddView] = useState<HTMLElement | null>(null);
  const [tabMenu, setTabMenu] = useState<{ view: View; el: HTMLElement } | null>(null);
  const [filterMenu, setFilterMenu] = useState<HTMLElement | null>(null);
  const [sortMenu, setSortMenu] = useState<HTMLElement | null>(null);
  const [settings, setSettings] = useState<HTMLElement | null>(null);
  // Dragging a tab: which view, and the gap it would drop into (0 = before the first tab).
  const [dragging, setDragging] = useState<string | null>(null);
  const [gap, setGap] = useState<number | null>(null);
  const endDrag = () => (setDragging(null), setGap(null));

  return (
    <div className="flex h-10 items-center gap-1 border-b border-line">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {schema.views.map((v, i) => (
          <button
            key={v.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/betelgeuse-view", v.id);
              e.dataTransfer.effectAllowed = "move";
              setDragging(v.id);
            }}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setGap(e.clientX > r.left + r.width / 2 ? i + 1 : i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = schema.views.findIndex((x) => x.id === dragging);
              // The gap counts the dragged tab itself; its new index is among the other tabs.
              if (dragging && gap !== null && gap !== from && gap !== from + 1) db.reorderView(dragging, gap > from ? gap - 1 : gap);
              endDrag();
            }}
            onDragEnd={endDrag}
            onClick={(e) => (v.id === view.id ? setTabMenu({ view: v, el: e.currentTarget }) : select(v.id))}
            className={`relative flex h-10 shrink-0 items-center gap-1.5 px-2 text-sm ${v.id === view.id ? "text-ink" : "text-muted hover:text-ink"} ${dragging === v.id ? "opacity-40" : ""}`}
          >
            {dragging && gap === i && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--blue)]" />}
            {dragging && gap === i + 1 && i === schema.views.length - 1 && <span className="absolute inset-y-2 right-0 w-0.5 rounded-full bg-[var(--blue)]" />}
            <span className="flex h-7 items-center gap-1.5 rounded-md px-1 hover:bg-hover">
              {VIEW_ICONS[v.type](15)}
              {v.name}
            </span>
            {v.id === view.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
          </button>
        ))}
        <button onClick={(e) => setAddView(e.currentTarget)} className="grid size-7 shrink-0 place-items-center rounded-md text-faint hover:bg-hover" title="Add a view">
          <Plus size={15} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 text-muted">
        <IconButton title="Filter" active={!!view.filters?.length} onClick={(e) => setFilterMenu(e.currentTarget)}>
          <FilterIcon size={15} />
        </IconButton>
        <IconButton title="Sort" active={!!view.sorts?.length} onClick={(e) => setSortMenu(e.currentTarget)}>
          <ArrowDownUp size={15} />
        </IconButton>
        {search === null ? (
          <IconButton title="Search" onClick={() => setSearch("")}>
            <Search size={15} />
          </IconButton>
        ) : (
          <span className="flex h-7 items-center gap-1 rounded-md px-1.5">
            <Search size={15} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => !search && setSearch(null)}
              onKeyDown={(e) => e.key === "Escape" && setSearch(null)}
              placeholder="Type to search…"
              className="w-36 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            />
            {search && (
              <button onClick={() => setSearch(null)} className="text-faint">
                <X size={13} />
              </button>
            )}
          </span>
        )}
        <IconButton title="View settings" onClick={(e) => setSettings(e.currentTarget)}>
          <MoreHorizontal size={16} />
        </IconButton>
        <button onClick={onNew} className="ml-1 flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-sm font-medium text-ink hover:bg-hover">
          <Plus size={14} className="text-muted" />
          New
        </button>
      </div>

      {addView && (
        <Popover anchor={addView} onClose={() => setAddView(null)} className="w-52 p-1">
          <MenuSection label="Add a view" />
          {(Object.keys(VIEW_LABELS) as ViewType[]).map((t) => (
            <MenuItem
              key={t}
              icon={VIEW_ICONS[t](15)}
              label={VIEW_LABELS[t]}
              onClick={async () => {
                setAddView(null);
                select(await db.addView(t));
              }}
            />
          ))}
        </Popover>
      )}
      {tabMenu && <ViewTabMenu db={db} view={tabMenu.view} anchor={tabMenu.el} canDelete={schema.views.length > 1} select={select} onClose={() => setTabMenu(null)} />}
      {filterMenu && <AddFilterMenu db={db} schema={schema} view={view} anchor={filterMenu} placement="bottom-end" onClose={() => setFilterMenu(null)} />}
      {sortMenu && <SortMenu db={db} schema={schema} view={view} anchor={sortMenu} onClose={() => setSortMenu(null)} />}
      {settings && <ViewSettings db={db} schema={schema} view={view} anchor={settings} onClose={() => setSettings(null)} />}
    </div>
  );
}

function IconButton({ children, title, active, onClick }: { children: ReactNode; title: string; active?: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button title={title} onClick={onClick} className={`grid size-7 place-items-center rounded-md hover:bg-hover ${active ? "text-[var(--blue)]" : ""}`}>
      {children}
    </button>
  );
}

function ViewTabMenu({ db, view, anchor, canDelete, select, onClose }: { db: Database; view: View; anchor: HTMLElement; canDelete: boolean; select: (id: string) => void; onClose: () => void }) {
  const [name, setName] = useState(view.name);
  const close = () => {
    if (name.trim() && name !== view.name) db.updateView(view.id, { name: name.trim() });
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={close} className="w-56 p-1">
      <div className="flex items-center gap-1 p-1">
        <span className="grid size-7 place-items-center rounded-md border border-line text-muted">{VIEW_ICONS[view.type](15)}</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && close()}
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-side px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
        />
      </div>
      <MenuDivider />
      <MenuSection label="Layout" />
      {(Object.keys(VIEW_LABELS) as ViewType[]).map((t) => (
        <MenuItem key={t} icon={VIEW_ICONS[t](15)} label={VIEW_LABELS[t]} right={view.type === t ? <span className="text-muted">✓</span> : null} onClick={() => db.updateView(view.id, { type: t })} />
      ))}
      <MenuDivider />
      <MenuItem
        icon={<Copy size={14} />}
        label="Duplicate view"
        onClick={async () => {
          onClose();
          select(await db.addView(view.type, view));
        }}
      />
      {canDelete && (
        <MenuItem
          icon={<Trash2 size={14} />}
          label="Delete view"
          danger
          onClick={() => {
            db.deleteView(view.id);
            onClose();
          }}
        />
      )}
    </Popover>
  );
}

function SortMenu({ db, schema, view, anchor, onClose }: { db: Database; schema: Schema; view: View; anchor: HTMLElement; onClose: () => void }) {
  const sorts = view.sorts ?? [];
  const props = allProperties(schema);
  const set = (next: typeof sorts) => db.updateView(view.id, { sorts: next });
  return (
    <Popover anchor={anchor} placement="bottom-end" onClose={onClose} className="w-80 p-2">
      {sorts.length === 0 && <div className="px-1 py-1 text-sm text-faint">No sorts applied to this view</div>}
      {sorts.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5 py-1">
          <select
            value={s.property}
            onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, property: e.target.value } : x)))}
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-side px-1.5 text-sm text-ink outline-none"
          >
            {props.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
          <select
            value={s.direction}
            onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, direction: e.target.value as "asc" | "desc" } : x)))}
            className="h-7 rounded-md border border-line bg-side px-1.5 text-sm text-ink outline-none"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <button onClick={() => set(sorts.filter((_, j) => j !== i))} className="grid size-7 place-items-center rounded-md text-faint hover:bg-hover">
            <X size={14} />
          </button>
        </div>
      ))}
      <MenuDivider />
      <MenuItem
        icon={<Plus size={14} />}
        label="Add sort"
        onClick={() => {
          const unused = props.find((p) => !sorts.some((s) => s.property === p.name)) ?? props[0];
          set([...sorts, { property: unused.name, direction: "asc" }]);
        }}
      />
      {sorts.length > 0 && <MenuItem icon={<Trash2 size={14} />} label="Delete sort" danger onClick={() => (set([]), onClose())} />}
    </Popover>
  );
}

function ViewSettings({ db, schema, view, anchor, onClose }: { db: Database; schema: Schema; view: View; anchor: HTMLElement; onClose: () => void }) {
  const hidden = new Set(view.hidden ?? []);
  const groupable = schema.properties.filter((p) => ["select", "status", "multi_select"].includes(p.type));
  const dates = allProperties(schema).filter((p) => ["date", "created_time", "last_edited_time"].includes(p.type));
  return (
    <Popover anchor={anchor} placement="bottom-end" onClose={onClose} className="max-h-[70vh] w-64 overflow-y-auto p-1">
      <MenuSection label="Layout" />
      <div className="grid grid-cols-5 gap-1 px-1 pb-1">
        {(Object.keys(VIEW_LABELS) as ViewType[]).map((t) => (
          <button
            key={t}
            title={VIEW_LABELS[t]}
            onClick={() => db.updateView(view.id, { type: t })}
            className={`flex flex-col items-center gap-1 rounded-md border py-1.5 text-[10px] ${
              view.type === t ? "border-[var(--blue)] text-[var(--blue)]" : "border-line text-muted hover:bg-hover"
            }`}
          >
            {VIEW_ICONS[t](16)}
            {VIEW_LABELS[t]}
          </button>
        ))}
      </div>
      {view.type === "board" && (
        <>
          <MenuSection label="Group by" />
          {groupable.map((p) => (
            <MenuItem key={p.name} icon={<PropIcon type={p.type} />} label={p.name} right={view.groupBy === p.name ? <span className="text-muted">✓</span> : null} onClick={() => db.updateView(view.id, { groupBy: p.name })} />
          ))}
          {!groupable.length && <div className="px-2 pb-1 text-xs text-faint">Add a Select or Status property first</div>}
        </>
      )}
      {view.type === "gallery" && (
        <>
          <MenuSection label="Card preview" />
          {(
            [
              ["auto", "Cover, else page content"],
              ["cover", "Page cover"],
              ["content", "Page content"],
              ["none", "None"],
            ] as const
          ).map(([mode, label]) => (
            <MenuItem key={mode} label={label} right={(view.cardPreview ?? "auto") === mode ? <span className="text-muted">✓</span> : null} onClick={() => db.updateView(view.id, { cardPreview: mode })} />
          ))}
          <MenuSection label="Card size" />
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {(["small", "medium", "large"] as const).map((size) => (
              <button
                key={size}
                onClick={() => db.updateView(view.id, { cardSize: size })}
                className={`rounded-md border py-1 text-xs capitalize ${(view.cardSize ?? "medium") === size ? "border-[var(--blue)] text-[var(--blue)]" : "border-line text-muted hover:bg-hover"}`}
              >
                {size}
              </button>
            ))}
          </div>
        </>
      )}
      {view.type === "calendar" && (
        <>
          <MenuSection label="Show calendar by" />
          {dates.map((p) => (
            <MenuItem key={p.name} icon={<PropIcon type={p.type} />} label={p.name} right={view.dateProperty === p.name ? <span className="text-muted">✓</span> : null} onClick={() => db.updateView(view.id, { dateProperty: p.name })} />
          ))}
        </>
      )}
      <MenuDivider />
      <MenuSection label="Properties" />
      {schema.properties.map((p) => (
        <MenuItem
          key={p.name}
          icon={<PropIcon type={p.type} />}
          label={p.name}
          right={hidden.has(p.name) ? <EyeOff size={14} className="text-faint" /> : <Eye size={14} className="text-muted" />}
          onClick={() =>
            db.updateView(view.id, { hidden: hidden.has(p.name) ? [...hidden].filter((h) => h !== p.name) : [...hidden, p.name] })
          }
        />
      ))}
      <MenuDivider />
      <MenuItem icon={<Pencil size={14} />} label="Wrap content" right={<Toggle on={!!view.wrap} />} onClick={() => db.updateView(view.id, { wrap: !view.wrap })} />
    </Popover>
  );
}

function AddFilterMenu({ db, schema, view, anchor, placement, onClose }: { db: Database; schema: Schema; view: View; anchor: HTMLElement; placement?: "bottom-end"; onClose: () => void }) {
  return (
    <Popover anchor={anchor} placement={placement} onClose={onClose} className="max-h-[60vh] w-56 overflow-y-auto p-1">
      <MenuSection label="Filter by" />
      {allProperties(schema).map((p) => (
        <MenuItem
          key={p.name}
          icon={<PropIcon type={p.type} />}
          label={p.name}
          onClick={() => {
            db.updateView(view.id, { filters: [...(view.filters ?? []), { property: p.name, op: filterOpsFor(p.type)[0].op }] });
            onClose();
          }}
        />
      ))}
    </Popover>
  );
}

/** Filter / sort pills under the toolbar. */
function Chips({ db, schema, view }: { db: Database; schema: Schema; view: View }) {
  const [editing, setEditing] = useState<{ index: number; el: HTMLElement } | null>(null);
  const [adding, setAdding] = useState<HTMLElement | null>(null);
  const filters = view.filters ?? [];
  const sorts = view.sorts ?? [];
  if (!filters.length && !sorts.length) return null;
  const setFilters = (next: Filter[]) => db.updateView(view.id, { filters: next });

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line py-2">
      {sorts.length > 0 && (
        <span className="flex h-6 items-center gap-1 rounded-full border border-[var(--blue)]/40 bg-[var(--c-blue-bg)] px-2 text-xs text-[var(--blue)]">
          <ArrowDownUp size={12} />
          {sorts.length === 1 ? `${sorts[0].property} ${sorts[0].direction === "asc" ? "↑" : "↓"}` : `${sorts.length} sorts`}
          <button onClick={() => db.updateView(view.id, { sorts: [] })} className="opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </span>
      )}
      {filters.map((f, i) => {
        const prop = findProperty(schema, f.property);
        const op = prop ? filterOpsFor(prop.type).find((o) => o.op === f.op) : undefined;
        return (
          <button
            key={i}
            onClick={(e) => setEditing({ index: i, el: e.currentTarget })}
            className="flex h-6 items-center gap-1 rounded-full border border-[var(--blue)]/40 bg-[var(--c-blue-bg)] px-2 text-xs text-[var(--blue)]"
          >
            {prop && <PropIcon type={prop.type} size={12} />}
            <span className="font-medium">{f.property}</span>
            {op && (op.needsValue ? <span>{`${op.label.toLowerCase()} ${filterValues(f).join(", ") || "…"}`}</span> : <span>{op.label.toLowerCase()}</span>)}
            <ChevronDown size={12} />
          </button>
        );
      })}
      {filters.length > 0 && (
        <button onClick={(e) => setAdding(e.currentTarget)} className="flex h-6 items-center gap-1 rounded-full px-2 text-xs text-faint hover:bg-hover hover:text-muted">
          <Plus size={12} /> Add filter
        </button>
      )}
      {adding && <AddFilterMenu db={db} schema={schema} view={view} anchor={adding} onClose={() => setAdding(null)} />}
      {editing && filters[editing.index] && (
        <FilterEditor
          schema={schema}
          filter={filters[editing.index]}
          anchor={editing.el}
          onClose={() => setEditing(null)}
          onChange={(f) => setFilters(filters.map((x, i) => (i === editing.index ? f : x)))}
          onDelete={() => {
            setFilters(filters.filter((_, i) => i !== editing.index));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function FilterEditor({ schema, filter, anchor, onChange, onDelete, onClose }: { schema: Schema; filter: Filter; anchor: HTMLElement; onChange: (f: Filter) => void; onDelete: () => void; onClose: () => void }) {
  const prop = findProperty(schema, filter.property);
  const [value, setValue] = useState(filterValues(filter)[0] ?? "");
  if (!prop) return null;
  const ops = filterOpsFor(prop.type);
  const op = ops.find((o) => o.op === filter.op) ?? ops[0];
  // Only the typed value is a draft; options apply as they're clicked, so closing must not overwrite them.
  const commit = () => !prop.options && value !== (filterValues(filter)[0] ?? "") && onChange({ ...filter, value });
  const chosen = filterValues(filter);
  // Option filters take several values (matching any of them); a single one stays a plain string.
  const toggle = (name: string) => {
    const next = chosen.includes(name) ? chosen.filter((c) => c !== name) : [...chosen, name];
    onChange({ ...filter, value: next.length > 1 ? next : next[0] });
  };

  return (
    <Popover anchor={anchor} onClose={() => (commit(), onClose())} className="w-72 p-2">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted">
        <span className="font-medium text-ink">{prop.name}</span>
        <select
          value={op.op}
          onChange={(e) => onChange({ ...filter, op: e.target.value as Filter["op"] })}
          className="h-6 rounded border border-line bg-side px-1 text-xs text-ink outline-none"
        >
          {ops.map((o) => (
            <option key={o.op} value={o.op}>
              {o.label}
            </option>
          ))}
        </select>
        <button onClick={onDelete} className="ml-auto grid size-6 place-items-center rounded text-faint hover:bg-hover" title="Delete filter">
          <Trash2 size={13} />
        </button>
      </div>
      {op.needsValue &&
        (prop.options ? (
          <div className="max-h-56 overflow-y-auto">
            {prop.options.map((o) => (
              <MenuItem
                key={o.name}
                label={<span className="rounded-[3px] px-1.5 py-0.5 text-[13px]" style={{ background: `var(--c-${o.color}-tag)` }}>{o.name}</span>}
                right={chosen.includes(o.name) ? <span className="text-muted">✓</span> : null}
                onClick={() => toggle(o.name)}
              />
            ))}
          </div>
        ) : (
          <input
            autoFocus
            type={prop.type === "number" ? "number" : prop.type === "date" || prop.type.endsWith("_time") ? "date" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && (commit(), onClose())}
            placeholder="Type a value…"
            className="h-8 w-full rounded-md border border-line bg-side px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
          />
        ))}
    </Popover>
  );
}
