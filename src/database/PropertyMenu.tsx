import { ArrowDown, ArrowUp, ChevronRight, EyeOff, Filter as FilterIcon, Hash, Trash2, WrapText } from "lucide-react";
import { useState } from "react";
import { MenuDivider, MenuItem, MenuSection, Popover } from "../components/Popover";
import { PropIcon } from "./cells";
import { ADDABLE_TYPES, TYPE_LABELS, filterOpsFor, type NumberFormat, type PropType, type Property, type View } from "./model";
import type { Database } from "./useDatabase";

const FORMATS: [NumberFormat, string][] = [
  ["number", "Number"],
  ["comma", "Number with commas"],
  ["percent", "Percent"],
  ["dollar", "US dollar"],
  ["euro", "Euro"],
  ["pound", "Pound"],
  ["rupee", "Rupee"],
  ["yen", "Yen"],
];

/** Notion's column header menu. */
export function PropertyMenu({
  db,
  prop,
  view,
  anchor,
  onClose,
}: {
  db: Database;
  prop: Property;
  view: View;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const [name, setName] = useState(prop.name);
  const [sub, setSub] = useState<{ kind: "type" | "format"; el: HTMLElement } | null>(null);
  const isTitle = prop.type === "title";

  const rename = () => {
    const next = name.trim();
    if (next && next !== prop.name && !isTitle) db.updateProperty(prop.name, { ...prop, name: next });
  };
  const close = () => {
    rename();
    onClose();
  };

  const sortBy = (direction: "asc" | "desc") => {
    db.updateView(view.id, { sorts: [{ property: prop.name, direction }, ...(view.sorts ?? []).filter((s) => s.property !== prop.name)] });
    close();
  };

  return (
    <Popover anchor={anchor} onClose={close} className="w-60 p-1">
      <div className="flex items-center gap-1 p-1">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line text-muted">
          <PropIcon type={prop.type} />
        </span>
        <input
          autoFocus={!isTitle}
          disabled={isTitle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && close()}
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-side px-2 text-sm text-ink outline-none focus:border-[var(--blue)] disabled:opacity-70"
        />
      </div>
      {!isTitle && (
        <MenuItem
          icon={<PropIcon type={prop.type} />}
          label="Type"
          hint={TYPE_LABELS[prop.type]}
          right={<ChevronRight size={14} className="text-faint" />}
          onClick={(e) => setSub({ kind: "type", el: e.currentTarget })}
        />
      )}
      {prop.type === "number" && (
        <MenuItem
          icon={<Hash size={14} />}
          label="Number format"
          hint={FORMATS.find(([f]) => f === (prop.format ?? "number"))?.[1]}
          right={<ChevronRight size={14} className="text-faint" />}
          onClick={(e) => setSub({ kind: "format", el: e.currentTarget })}
        />
      )}
      <MenuDivider />
      <MenuItem icon={<ArrowUp size={14} />} label="Sort ascending" onClick={() => sortBy("asc")} />
      <MenuItem icon={<ArrowDown size={14} />} label="Sort descending" onClick={() => sortBy("desc")} />
      <MenuItem
        icon={<FilterIcon size={14} />}
        label="Filter"
        onClick={() => {
          db.updateView(view.id, { filters: [...(view.filters ?? []), { property: prop.name, op: filterOpsFor(prop.type)[0].op }] });
          close();
        }}
      />
      <MenuDivider />
      {!isTitle && (
        <MenuItem
          icon={<EyeOff size={14} />}
          label="Hide in view"
          onClick={() => {
            db.updateView(view.id, { hidden: [...(view.hidden ?? []), prop.name] });
            close();
          }}
        />
      )}
      <MenuItem
        icon={<WrapText size={14} />}
        label="Wrap content"
        right={<Toggle on={!!view.wrap} />}
        onClick={() => db.updateView(view.id, { wrap: !view.wrap })}
      />
      {!isTitle && (
        <MenuItem
          icon={<Trash2 size={14} />}
          label="Delete property"
          danger
          onClick={() => {
            db.deleteProperty(prop.name);
            onClose();
          }}
        />
      )}

      {sub?.kind === "type" && (
        <TypeMenu
          anchor={sub.el}
          current={prop.type}
          onClose={() => setSub(null)}
          onPick={(type) => {
            const options = type === "select" || type === "multi_select" || type === "status" ? prop.options ?? [] : undefined;
            db.updateProperty(prop.name, { name: prop.name, type, ...(options ? { options } : {}) });
            onClose();
          }}
        />
      )}
      {sub?.kind === "format" && (
        <Popover anchor={sub.el} placement="right-start" onClose={() => setSub(null)} className="w-52 p-1">
          {FORMATS.map(([f, label]) => (
            <MenuItem
              key={f}
              label={label}
              right={(prop.format ?? "number") === f ? <span className="text-muted">✓</span> : null}
              onClick={() => {
                db.updateProperty(prop.name, { ...prop, format: f });
                setSub(null);
              }}
            />
          ))}
        </Popover>
      )}
    </Popover>
  );
}

export function TypeMenu({
  anchor,
  current,
  onPick,
  onClose,
  title = "Type",
}: {
  anchor: HTMLElement;
  current?: PropType;
  onPick: (t: PropType) => void;
  onClose: () => void;
  title?: string;
}) {
  return (
    <Popover anchor={anchor} placement={current ? "right-start" : "bottom-end"} onClose={onClose} className="max-h-[70vh] w-56 overflow-y-auto p-1">
      <MenuSection label={title} />
      {ADDABLE_TYPES.map((t) => (
        <MenuItem
          key={t}
          icon={<PropIcon type={t} />}
          label={TYPE_LABELS[t]}
          right={current === t ? <span className="text-muted">✓</span> : null}
          onClick={() => onPick(t)}
        />
      ))}
    </Popover>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--blue)]" : "bg-[var(--line-strong)]"}`}>
      <span className={`absolute top-0.5 size-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`} />
    </span>
  );
}
