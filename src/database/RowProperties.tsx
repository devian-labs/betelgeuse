import { Plus } from "lucide-react";
import { useState } from "react";
import { readFrontmatter } from "../lib/frontmatter";
import { CellEditor, Checkbox, PropIcon, ValueView } from "./cells";
import { asBool, isReadOnly, type Property } from "./model";
import { PropertyMenu, TypeMenu } from "./PropertyMenu";
import { useDatabase } from "./useDatabase";

/**
 * The property list at the top of a database row's page. Values are written through
 * the page's own frontmatter so they never race with edits to the page body.
 */
export function RowProperties({
  dbPath,
  frontmatter,
  times,
  onPatch,
}: {
  dbPath: string;
  frontmatter: string;
  times: { created: number; modified: number };
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const db = useDatabase(dbPath);
  const [editing, setEditing] = useState<{ prop: Property; el: HTMLElement } | null>(null);
  const [menu, setMenu] = useState<{ prop: Property; el: HTMLElement } | null>(null);
  const [adding, setAdding] = useState<HTMLElement | null>(null);
  const schema = db.state?.schema;
  if (!schema) return null;

  const values = readFrontmatter(frontmatter);
  const valueOf = (p: Property) => (p.type === "created_time" ? times.created : p.type === "last_edited_time" ? times.modified : values[p.name]);

  return (
    <div className="mt-4 mb-2 space-y-px text-sm">
      {schema.properties.map((p) => (
        <div key={p.name} className="flex min-h-[34px] items-start">
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
      <button onClick={(e) => setAdding(e.currentTarget)} className="flex h-[34px] items-center gap-2 rounded-md px-1.5 text-faint hover:bg-hover">
        <Plus size={14} /> Add a property
      </button>

      {editing && (
        <CellEditor
          prop={editing.prop}
          value={values[editing.prop.name]}
          anchor={editing.el}
          onClose={() => setEditing(null)}
          onChange={(v) => onPatch({ [editing.prop.name]: v })}
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
