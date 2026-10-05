import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronRight, EyeOff, Filter as FilterIcon, Hash, Link2, Sigma, Table2, Trash2, WrapText } from "lucide-react";
import { useEffect, useState } from "react";
import { MenuDivider, MenuItem, MenuSection, Popover } from "../components/Popover";
import { api } from "../lib/api";
import { useVault } from "../lib/vault";
import { DatabasePicker, PropIcon } from "./cells";
import {
  ADDABLE_TYPES,
  TYPE_LABELS,
  allProperties,
  databaseLink,
  filterOpsFor,
  linkTarget,
  parseSchema,
  rollupCalcLabel,
  rollupCalcsFor,
  type NumberFormat,
  type PropType,
  type Property,
  type Schema,
  type View,
} from "./model";
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
  // The menu stays open while a relation or rollup is set up, so it keeps its own copy of the property.
  const [cur, setCur] = useState(prop);
  const [name, setName] = useState(prop.name);
  const [sub, setSub] = useState<{ kind: "type" | "format" | "database" | "relation" | "target" | "calc"; el: HTMLElement } | null>(null);
  const isTitle = cur.type === "title";
  const change = (next: Property) => {
    db.updateProperty(cur.name, next);
    setCur(next);
  };

  const rename = () => {
    const next = name.trim();
    if (next && next !== cur.name && !isTitle) db.updateProperty(cur.name, { ...cur, name: next });
  };
  const close = () => {
    rename();
    onClose();
  };

  const sortBy = (direction: "asc" | "desc") => {
    db.updateView(view.id, { sorts: [{ property: cur.name, direction }, ...(view.sorts ?? []).filter((s) => s.property !== cur.name)] });
    close();
  };

  return (
    <Popover anchor={anchor} onClose={close} className="w-60 p-1">
      <div className="flex items-center gap-1 p-1">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line text-muted">
          <PropIcon type={cur.type} />
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
          icon={<PropIcon type={cur.type} />}
          label="Type"
          hint={TYPE_LABELS[cur.type]}
          right={<ChevronRight size={14} className="text-faint" />}
          onClick={(e) => setSub({ kind: "type", el: e.currentTarget })}
        />
      )}
      {cur.type === "relation" && <RelationSettings db={db} prop={cur} onChange={change} onTwoWay={(reverse) => setCur(({ reverse: _, ...p }) => (reverse ? { ...p, reverse } : p))} onSub={(kind, el) => setSub({ kind, el })} />}
      {cur.type === "rollup" && <RollupSettings db={db} prop={cur} onSub={(kind, el) => setSub({ kind, el })} />}
      {cur.type === "number" && (
        <MenuItem
          icon={<Hash size={14} />}
          label="Number format"
          hint={FORMATS.find(([f]) => f === (cur.format ?? "number"))?.[1]}
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
          db.updateView(view.id, { filters: [...(view.filters ?? []), { property: cur.name, op: filterOpsFor(cur.type)[0].op }] });
          close();
        }}
      />
      <MenuDivider />
      {!isTitle && (
        <MenuItem
          icon={<EyeOff size={14} />}
          label="Hide in view"
          onClick={() => {
            db.updateView(view.id, { hidden: [...(view.hidden ?? []), cur.name] });
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
            db.deleteProperty(cur.name);
            onClose();
          }}
        />
      )}

      {sub?.kind === "type" && (
        <TypeMenu
          anchor={sub.el}
          current={cur.type}
          onClose={() => setSub(null)}
          onPick={(type) => {
            const options = type === "select" || type === "multi_select" || type === "status" ? cur.options ?? [] : undefined;
            change({ name: cur.name, type, ...(options ? { options } : {}) });
            // Relations and rollups need setting up, which happens in this menu.
            if (type === "relation" || type === "rollup") setSub(null);
            else onClose();
          }}
        />
      )}
      {sub?.kind === "database" && (
        <Popover anchor={sub.el} placement="right-start" onClose={() => setSub(null)} className="w-72 overflow-hidden">
          <DatabasePicker
            current={cur.database}
            onPick={(path) => {
              change({ ...cur, database: databaseLink(path) });
              setSub(null);
            }}
          />
        </Popover>
      )}
      {sub && (sub.kind === "relation" || sub.kind === "target" || sub.kind === "calc") && (
        <RollupMenu db={db} prop={cur} kind={sub.kind} anchor={sub.el} onClose={() => setSub(null)} onChange={change} />
      )}
      {sub?.kind === "format" && (
        <Popover anchor={sub.el} placement="right-start" onClose={() => setSub(null)} className="w-52 p-1">
          {FORMATS.map(([f, label]) => (
            <MenuItem
              key={f}
              label={label}
              right={(cur.format ?? "number") === f ? <span className="text-muted">✓</span> : null}
              onClick={() => {
                change({ ...cur, format: f });
                setSub(null);
              }}
            />
          ))}
        </Popover>
      )}
    </Popover>
  );
}

type SubMenu = "database" | "relation" | "target" | "calc";
type DatabaseHook = Props["db"];
type Props = Parameters<typeof PropertyMenu>[0];

/** A relation's settings: which database, one or many pages, and whether it shows on the other side. */
function RelationSettings({
  db,
  prop,
  onChange,
  onTwoWay,
  onSub,
}: {
  db: DatabaseHook;
  prop: Property;
  onChange: (p: Property) => void;
  onTwoWay: (reverse: string | undefined) => void;
  onSub: (kind: SubMenu, el: HTMLElement) => void;
}) {
  const { notes } = useVault();
  const target = db.resolve(prop);
  const targetTitle = target ? notes.find((n) => n.path === target)?.title : prop.database && linkTarget(prop.database);
  if (prop.synced) {
    return (
      <>
        <MenuItem icon={<Table2 size={14} />} label="Related to" hint={targetTitle ?? "Missing database"} />
        <MenuItem icon={<ArrowLeftRight size={14} />} label="Two-way, from" hint={prop.synced} />
      </>
    );
  }
  return (
    <>
      <MenuItem
        icon={<Table2 size={14} />}
        label="Related to"
        hint={targetTitle ?? "Choose a database"}
        right={<ChevronRight size={14} className="text-faint" />}
        onClick={(e) => onSub("database", e.currentTarget)}
      />
      {target && (
        <>
          <MenuItem
            icon={<Link2 size={14} />}
            label="Limit to one page"
            right={<Toggle on={prop.limit === "one"} />}
            onClick={() => {
              const { limit: _, ...rest } = prop;
              onChange(prop.limit === "one" ? rest : { ...rest, limit: "one" });
            }}
          />
          <MenuItem
            icon={<ArrowLeftRight size={14} />}
            label={`Show on ${targetTitle}`}
            hint={prop.reverse}
            right={<Toggle on={!!prop.reverse} />}
            onClick={() => db.setTwoWay(prop.name, !prop.reverse).then(onTwoWay)}
          />
        </>
      )}
    </>
  );
}

/** The schema of the database a rollup's relation points at. */
function useRollupTarget(db: DatabaseHook, prop: Property): Schema | null {
  const relation = db.state?.schema.properties.find((p) => p.name === prop.relation && p.type === "relation");
  const target = relation && db.resolve(relation);
  const [schema, setSchema] = useState<Schema | null>(null);
  useEffect(() => {
    if (!target) return setSchema(null);
    const known = db.state?.related.get(target)?.schema;
    if (known) return setSchema(known);
    api.readNote(target).then((page) => setSchema(parseSchema(page)), () => setSchema(null));
  }, [target, db.state]);
  return schema;
}

function RollupSettings({ db, prop, onSub }: { db: DatabaseHook; prop: Property; onSub: (kind: SubMenu, el: HTMLElement) => void }) {
  const target = useRollupTarget(db, prop);
  const targetProp = target && prop.target ? allProperties(target).find((p) => p.name === prop.target) : undefined;
  const chevron = <ChevronRight size={14} className="text-faint" />;
  return (
    <>
      <MenuItem icon={<PropIcon type="relation" />} label="Relation" hint={prop.relation ?? "Choose"} right={chevron} onClick={(e) => onSub("relation", e.currentTarget)} />
      {target && (
        <MenuItem icon={<Hash size={14} />} label="Property" hint={prop.target ?? "Choose"} right={chevron} onClick={(e) => onSub("target", e.currentTarget)} />
      )}
      {targetProp && (
        <MenuItem
          icon={<Sigma size={14} />}
          label="Calculate"
          hint={rollupCalcLabel(prop.calc ?? "show_original")}
          right={chevron}
          onClick={(e) => onSub("calc", e.currentTarget)}
        />
      )}
    </>
  );
}

function RollupMenu({
  db,
  prop,
  kind,
  anchor,
  onClose,
  onChange,
}: {
  db: DatabaseHook;
  prop: Property;
  kind: "relation" | "target" | "calc";
  anchor: HTMLElement;
  onClose: () => void;
  onChange: (p: Property) => void;
}) {
  const target = useRollupTarget(db, prop);
  const check = (on: boolean) => (on ? <span className="text-muted">✓</span> : null);
  const pick = (next: Property) => {
    onChange(next);
    onClose();
  };
  const relations = db.state?.schema.properties.filter((p) => p.type === "relation") ?? [];
  const targetProp = target && prop.target ? allProperties(target).find((p) => p.name === prop.target) : undefined;
  return (
    <Popover anchor={anchor} placement="right-start" onClose={onClose} className="max-h-[70vh] w-56 overflow-y-auto p-1">
      {kind === "relation" && (
        <>
          <MenuSection label="Relation" />
          {relations.map((r) => (
            <MenuItem
              key={r.name}
              icon={<PropIcon type="relation" />}
              label={r.name}
              right={check(prop.relation === r.name)}
              onClick={() => pick({ name: prop.name, type: "rollup", relation: r.name })}
            />
          ))}
          {!relations.length && <div className="px-2 py-1.5 text-sm text-faint">Add a relation property first</div>}
        </>
      )}
      {kind === "target" && target && (
        <>
          <MenuSection label="Property" />
          {allProperties(target)
            .filter((p) => p.type !== "rollup")
            .map((p) => (
              <MenuItem
                key={p.name}
                icon={<PropIcon type={p.type} />}
                label={p.name}
                right={check(prop.target === p.name)}
                onClick={() => pick({ ...prop, target: p.name, calc: "show_original" })}
              />
            ))}
        </>
      )}
      {kind === "calc" &&
        targetProp &&
        rollupCalcsFor(targetProp.type).map((group, i) => (
          <div key={i}>
            {i > 0 && <MenuDivider />}
            {group.map((c) => (
              <MenuItem key={c} label={rollupCalcLabel(c)} right={check((prop.calc ?? "show_original") === c)} onClick={() => pick({ ...prop, calc: c })} />
            ))}
          </div>
        ))}
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
