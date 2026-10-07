import { ChevronDown, ChevronUp, GripVertical, Plus } from "lucide-react";
import { useState } from "react";
import { readFrontmatter } from "../lib/frontmatter";
import { CellEditor, Checkbox, PropIcon, ValueView } from "./cells";
import { asBool, isComputed, isEmptyValue, isReadOnly, moveProperty, type Property } from "./model";
import { PropertyMenu, TypeMenu } from "./PropertyMenu";
import { useDatabase } from "./useDatabase";

/** How many properties show before the rest fold away (ones holding a value always show). */
const FOLDED = 6;

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
 * The property list at the top of a database row's page. Values are written through
 * the page's own frontmatter so they never race with edits to the page body.
 */
export function RowProperties({
  dbPath,
  rowPath,
  frontmatter,
  times,
  onPatch,
}: {
  dbPath: string;
  rowPath: string;
  frontmatter: string;
  times: { created: number; modified: number };
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const db = useDatabase(dbPath);
  const [editing, setEditing] = useState<{ prop: Property; el: HTMLElement } | null>(null);
  const [menu, setMenu] = useState<{ prop: Property; el: HTMLElement } | null>(null);
  const [adding, setAdding] = useState<HTMLElement | null>(null);
  // Folding is remembered per database, like Notion's "N more properties".
  const [expanded, setExpanded] = useState(() => store.get(`props-expanded:${dbPath}`) === "1");
  // Dragging a property: which one, and where it would land (before `before`; null = at the end).
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ before: string | null } | null>(null);
  const schema = db.state?.schema;
  if (!schema) return null;

  const values = readFrontmatter(frontmatter);
  // Two-way relations and rollups are worked out from other pages, so they come from the database.
  const row = db.state?.rows.find((r) => r.path === rowPath);
  const valueOf = (p: Property) =>
    p.type === "created_time" ? times.created : p.type === "last_edited_time" ? times.modified : isComputed(p) ? row?.computed?.[p.name] : values[p.name];
  const set = (p: Property, v: unknown) => (isComputed(p) ? row && db.setValue(row, p.name, v) : onPatch({ [p.name]: v }));

  const all = schema.properties;
  // Folding a single property away isn't worth a button.
  const foldable = all.length > FOLDED + 1 ? all.filter((p, i) => i >= FOLDED && isEmptyValue(p, valueOf(p))) : [];
  const shown = expanded ? all : all.filter((p) => !foldable.includes(p));
  const hiddenCount = all.length - shown.length;
  const toggle = () => {
    store.set(`props-expanded:${dbPath}`, expanded ? "0" : "1");
    setExpanded(!expanded);
  };
  const endDrag = () => (setDragging(null), setDrop(null));
  const onDrop = () => {
    if (dragging && drop) db.saveSchema({ ...schema, properties: moveProperty(all, dragging, drop.before) });
    endDrag();
  };

  return (
    <div className="mt-4 mb-2 space-y-px text-sm" onDragOver={(e) => dragging && e.preventDefault()} onDrop={onDrop}>
      {shown.map((p, i) => (
        <div
          key={p.name}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            // The lower half drops after this row, i.e. before the next shown one.
            setDrop({ before: e.clientY < r.top + r.height / 2 ? p.name : (shown[i + 1]?.name ?? all[all.indexOf(p) + 1]?.name ?? null) });
          }}
          onDrop={(e) => (e.stopPropagation(), onDrop())}
          className={`group/prop relative -ml-6 flex min-h-[34px] items-start pl-6 ${dragging === p.name ? "opacity-40" : ""}`}
        >
          {dragging && drop?.before === p.name && <span className="pointer-events-none absolute -top-px right-0 left-6 h-0.5 rounded-full bg-[var(--blue)]" />}
          {dragging && drop && i === shown.length - 1 && !shown.some((x) => x.name === drop.before) && (
            <span className="pointer-events-none absolute right-0 -bottom-px left-6 h-0.5 rounded-full bg-[var(--blue)]" />
          )}
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/betelgeuse-property", p.name);
              e.dataTransfer.effectAllowed = "move";
              setDragging(p.name);
            }}
            onDragEnd={endDrag}
            title="Drag to move"
            className="absolute top-0 left-0 grid h-[34px] w-6 cursor-grab place-items-center text-faint opacity-0 group-hover/prop:opacity-100"
          >
            <GripVertical size={14} />
          </span>
          <button
            onClick={(e) => setMenu({ prop: p, el: e.currentTarget })}
            className="flex h-[34px] w-40 shrink-0 items-center gap-2 rounded-md px-1.5 text-muted hover:bg-hover"
          >
            <span className="text-faint">
              <PropIcon type={p.type} />
            </span>
            <span className="truncate">{p.name}</span>
          </button>
          <div
            onClick={(e) => !isReadOnly(p.type) && p.type !== "checkbox" && setEditing({ prop: p, el: e.currentTarget })}
            className={`flex min-h-[34px] min-w-0 flex-1 items-center rounded-md px-2 py-1 ${isReadOnly(p.type) ? "" : "cursor-pointer hover:bg-hover"}`}
          >
            {p.type === "checkbox" ? (
              <Checkbox checked={asBool(values[p.name])} onChange={(v) => onPatch({ [p.name]: v })} />
            ) : (
              <ValueView prop={p} value={valueOf(p)} wrap />
            )}
            {p.type !== "checkbox" && valueOf(p) == null && <span className="text-faint">Empty</span>}
          </div>
        </div>
      ))}
      {foldable.length > 0 && (
        <button onClick={toggle} className="flex h-[34px] items-center gap-2 rounded-md px-1.5 text-faint hover:bg-hover">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? "Hide empty properties" : `${hiddenCount} more ${hiddenCount === 1 ? "property" : "properties"}`}
        </button>
      )}
      <button onClick={(e) => setAdding(e.currentTarget)} className="flex h-[34px] items-center gap-2 rounded-md px-1.5 text-faint hover:bg-hover">
        <Plus size={14} /> Add a property
      </button>

      {editing && (
        <CellEditor
          prop={editing.prop}
          value={valueOf(editing.prop)}
          anchor={editing.el}
          onClose={() => setEditing(null)}
          onChange={(v) => set(editing.prop, v)}
          onPropChange={(next) => db.updateProperty(editing.prop.name, next)}
        />
      )}
      {menu && <PropertyMenu db={db} prop={menu.prop} view={schema.views[0]} anchor={menu.el} onClose={() => setMenu(null)} />}
      {adding && (
        <TypeMenu
          anchor={adding}
          title="Add a property"
          onClose={() => setAdding(null)}
          onPick={(t) => {
            setAdding(null);
            db.addProperty(t);
          }}
        />
      )}
      <div className="!mt-3 h-px bg-line" />
    </div>
  );
}
