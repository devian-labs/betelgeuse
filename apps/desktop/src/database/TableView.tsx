import { Check, ChevronDown, ChevronRight, Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MenuDivider, MenuItem, MenuSection, Popover } from "../components/Popover";
import { PropIcon, StatusDot, Tag } from "./cells";
import { CALC_LABELS, CALC_SHORT, calcsFor, calculate, visibleProperties, type Calc, type Property, type Row } from "./model";
import type { Database } from "./useDatabase";
import { PropertyMenu, TypeMenu } from "./PropertyMenu";
import { EditableValue, OpenButton, RowMenu, RowTitle, TitleInput, type ViewProps } from "./shared";

const DEFAULT_WIDTH = 180;
/** Left of the rows: the drag/menu grip and the bulk-select checkbox. */
const GUTTER = 52;
const TITLE_WIDTH = 280;

export function TableView({ db, schema, view, rows, editTitleOf, onTitleEdited }: ViewProps) {
  const props = visibleProperties(schema, view);
  const [menu, setMenu] = useState<{ prop: Property; el: HTMLElement } | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [rowMenu, setRowMenu] = useState<{ path: string; el: HTMLElement } | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [calcMenu, setCalcMenu] = useState<{ prop: Property; el: HTMLElement } | null>(null);
  // Rows ticked for bulk actions; Shift-click ticks the range from the last one.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastTicked = useRef<string | null>(null);
  const shown = rows.filter((r) => selected.has(r.path));
  const tick = (path: string, shift: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const on = !prev.has(path);
      const from = rows.findIndex((r) => r.path === lastTicked.current);
      const to = rows.findIndex((r) => r.path === path);
      const range = shift && from >= 0 ? rows.slice(Math.min(from, to), Math.max(from, to) + 1) : [rows[to]];
      for (const r of range) if (on) next.add(r.path);
      else next.delete(r.path);
      lastTicked.current = path;
      return next;
    });
  const allTicked = rows.length > 0 && shown.length === rows.length;
  useEffect(() => {
    if (!selected.size) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[data-popover]") && setSelected(new Set());
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [selected.size]);

  useEffect(() => {
    if (editTitleOf && rows.some((r) => r.path === editTitleOf)) {
      setEditingTitle(editTitleOf);
      onTitleEdited();
    }
  }, [editTitleOf, rows, onTitleEdited]);

  const width = (p: Property) => liveWidths[p.name] ?? view.widths?.[p.name] ?? (p.type === "title" ? TITLE_WIDTH : DEFAULT_WIDTH);

  const startResize = (p: Property, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const start = width(p);
    let current = start;
    const move = (ev: MouseEvent) => {
      current = Math.max(80, start + ev.clientX - startX);
      setLiveWidths((w) => ({ ...w, [p.name]: current }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      db.updateView(view.id, { widths: { ...view.widths, [p.name]: current } });
      setLiveWidths({});
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const reorder = (from: string, to: string) => {
    const names = props.filter((p) => p.type !== "title").map((p) => p.name);
    const all = [...names, ...schema.properties.map((p) => p.name).filter((n) => !names.includes(n))];
    const without = all.filter((n) => n !== from);
    without.splice(to === "" ? 0 : without.indexOf(to) + 1, 0, from);
    db.updateView(view.id, { order: without });
  };

  const total = props.reduce((n, p) => n + width(p), 0) + GUTTER + 34;
  const calcs = view.calcs ?? {};

  return (
    <div className="overflow-x-auto pb-2">
      {shown.length > 0 && <BulkBar db={db} rows={shown} props={props} onClear={() => setSelected(new Set())} />}
      <div style={{ width: total, minWidth: "100%" }} className="text-sm">
        {/* header */}
        <div style={{ paddingLeft: GUTTER }} className="group/head relative flex h-[34px] border-b border-line text-muted">
          <span className="absolute top-0 bottom-0 left-7 grid place-items-center">
            <TickBox
              on={allTicked}
              partly={!allTicked && shown.length > 0}
              visible={shown.length > 0}
              title={allTicked ? "Deselect all" : "Select all"}
              onClick={() => setSelected(allTicked ? new Set() : new Set(rows.map((r) => r.path)))}
            />
          </span>
          {props.map((p) => (
            <div
              key={p.name}
              style={{ width: width(p) }}
              draggable={p.type !== "title"}
              onDragStart={(e) => {
                setDragging(p.name);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => dragging && e.preventDefault()}
              onDrop={() => {
                if (dragging && dragging !== p.name) reorder(dragging, p.type === "title" ? "" : p.name);
                setDragging(null);
              }}
              className={`relative flex shrink-0 items-center border-r border-line last:border-r-0 ${dragging === p.name ? "opacity-40" : ""}`}
            >
              <button
                onClick={(e) => setMenu({ prop: p, el: e.currentTarget })}
                className="flex h-full w-full min-w-0 items-center gap-1.5 px-2 hover:bg-hover"
              >
                <span className="shrink-0 text-faint">
                  <PropIcon type={p.type} />
                </span>
                <span className="truncate">{p.name}</span>
              </button>
              <span onMouseDown={(e) => startResize(p, e)} className="absolute top-0 -right-[3px] z-10 h-full w-[5px] cursor-col-resize hover:bg-[var(--blue)]/50" />
            </div>
          ))}
          <button
            onClick={(e) => setAddAnchor(e.currentTarget)}
            title="Add a property"
            className="grid w-[34px] shrink-0 place-items-center border-l border-line text-faint hover:bg-hover"
          >
            <Plus size={15} />
          </button>
        </div>

        {/* rows */}
        {rows.map((row) => (
          <div
            key={row.path}
            style={{ paddingLeft: GUTTER }}
            className={`group/row relative flex min-h-[34px] border-b border-line ${selected.has(row.path) ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--row-hover)]"}`}
          >
            <button
              onClick={(e) => setRowMenu({ path: row.path, el: e.currentTarget })}
              className="absolute top-1.5 left-1 grid size-5 place-items-center rounded text-faint opacity-0 group-hover/row:opacity-100 hover:bg-hover"
            >
              <GripVertical size={14} />
            </button>
            <span className="absolute top-0 bottom-0 left-7 grid h-[34px] place-items-center">
              <TickBox on={selected.has(row.path)} visible={shown.length > 0} title="Select" onClick={(e) => tick(row.path, e.shiftKey)} />
            </span>
            {props.map((p) =>
              p.type === "title" ? (
                <div
                  key={p.name}
                  style={{ width: width(p) }}
                  onClick={() => setEditingTitle(row.path)}
                  className="flex shrink-0 cursor-text items-center gap-1 border-r border-line px-2 py-1.5"
                >
                  {editingTitle === row.path ? (
                    <TitleInput row={row} db={db} onDone={() => setEditingTitle(null)} />
                  ) : (
                    <>
                      <RowTitle row={row} />
                      <OpenButton row={row} />
                    </>
                  )}
                </div>
              ) : (
                <EditableValue
                  key={p.name}
                  db={db}
                  row={row}
                  prop={p}
                  wrap={view.wrap}
                  className={`flex shrink-0 items-center overflow-hidden border-r border-line px-2 py-1.5 last:border-r-0 ${
                    p.type === "checkbox" ? "" : "hover:bg-hover"
                  } ${p.type === "number" ? "justify-end" : ""}`}
                  style={{ width: width(p) }}
                />
              ),
            )}
          </div>
        ))}

        <button
          onClick={async () => onTitleEditedAfterCreate(await db.createRow())}
          style={{ paddingLeft: GUTTER + 4 }}
          className="flex h-[34px] w-full items-center gap-1.5 border-b border-line text-faint hover:bg-hover"
        >
          <Plus size={15} /> New page
        </button>

        {/* calculations */}
        <div style={{ paddingLeft: GUTTER }} className="group/calc flex h-[34px]">
          {props.map((p) => {
            const calc = calcs[p.name] ?? (p.type === "title" ? "count_all" : "none");
            const set = calcs[p.name] && calcs[p.name] !== "none";
            return (
              <button
                key={p.name}
                style={{ width: width(p) }}
                onClick={(e) => setCalcMenu({ prop: p, el: e.currentTarget })}
                className={`flex shrink-0 items-center justify-end gap-1 px-2 text-xs hover:bg-hover ${set ? "" : "opacity-0 group-hover/calc:opacity-100"}`}
              >
                {set ? (
                  <>
                    <span className="text-faint uppercase tracking-wide text-[10px]">{CALC_SHORT[calc]}</span>
                    <span className="font-medium text-ink tabular-nums">{calculate(rows, p, calc)}</span>
                  </>
                ) : (
                  <span className="flex items-center gap-0.5 text-faint">
                    Calculate <ChevronDown size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {menu && <PropertyMenu db={db} prop={menu.prop} view={view} anchor={menu.el} onClose={() => setMenu(null)} />}
      {addAnchor && (
        <TypeMenu
          anchor={addAnchor}
          title="Add a property"
          onClose={() => setAddAnchor(null)}
          onPick={async (t) => {
            setAddAnchor(null);
            await db.addProperty(t);
          }}
        />
      )}
      {rowMenu && (
        <RowMenu
          db={db}
          row={rows.find((r) => r.path === rowMenu.path)!}
          anchor={rowMenu.el}
          onClose={() => setRowMenu(null)}
          onRename={() => setEditingTitle(rowMenu.path)}
        />
      )}
      {calcMenu && (
        <Popover anchor={calcMenu.el} placement="bottom-end" onClose={() => setCalcMenu(null)} className="max-h-[60vh] w-52 overflow-y-auto p-1">
          {calcsFor(calcMenu.prop.type).map((group, i) => (
            <div key={i}>
              {i > 0 && <MenuDivider />}
              {group.map((c: Calc) => (
                <MenuItem
                  key={c}
                  label={CALC_LABELS[c]}
                  right={(calcs[calcMenu.prop.name] ?? "none") === c ? <span className="text-muted">✓</span> : null}
                  onClick={() => {
                    db.updateView(view.id, { calcs: { ...calcs, [calcMenu.prop.name]: c } });
                    setCalcMenu(null);
                  }}
                />
              ))}
            </div>
          ))}
        </Popover>
      )}
    </div>
  );

  function onTitleEditedAfterCreate(path: string) {
    setEditingTitle(path);
  }
}

/** A row's (or the header's) bulk-select box: shown on hover, or always once anything is ticked. */
function TickBox({ on, partly, visible, title, onClick }: { on: boolean; partly?: boolean; visible: boolean; title: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid size-4 place-items-center rounded-[4px] border transition-opacity ${
        on || partly ? "border-[var(--blue)] bg-[var(--blue)] text-white" : "border-[var(--line-strong)] bg-surface"
      } ${on || partly || visible ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 group-hover/head:opacity-100"}`}
    >
      {on ? <Check size={11} strokeWidth={3} /> : partly ? <span className="h-0.5 w-2 rounded bg-white" /> : null}
    </button>
  );
}

/** Actions for the ticked rows: set a property on all of them, duplicate, or move them to the Trash. */
function BulkBar({ db, rows, props, onClear }: { db: Database; rows: Row[]; props: Property[]; onClear: () => void }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [prop, setProp] = useState<{ prop: Property; el: HTMLElement } | null>(null);
  const settable = props.filter((p) => ["select", "status", "multi_select", "checkbox"].includes(p.type));
  const setAll = async (name: string, value: unknown) => {
    setProp(null);
    setMenu(null);
    for (const r of rows) await db.setValue(r, name, value);
  };
  const n = rows.length;
  return (
    <div className="sticky left-0 z-10 mb-1 flex h-9 w-fit items-center gap-1 rounded-lg border border-line bg-raised px-1.5 text-[13px] shadow-pop">
      <span className="px-1.5 font-medium text-[var(--blue)]">
        {n} selected
      </span>
      <span className="h-4 w-px bg-line" />
      {settable.length > 0 && (
        <button onClick={(e) => setMenu(e.currentTarget)} className="flex h-7 items-center gap-1 rounded-md px-2 text-muted hover:bg-hover hover:text-ink">
          Set property <ChevronDown size={13} />
        </button>
      )}
      <button
        onClick={async () => {
          for (const r of rows) await db.duplicateRow(r);
          onClear();
        }}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-muted hover:bg-hover hover:text-ink"
      >
        <Copy size={13} /> Duplicate
      </button>
      <button
        onClick={async () => {
          onClear();
          for (const r of rows) await db.deleteRow(r);
        }}
        title="Move the selected pages to the Trash"
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-muted hover:bg-hover hover:text-[var(--c-red-text)]"
      >
        <Trash2 size={13} /> Delete
      </button>
      <button onClick={onClear} title="Clear selection (Esc)" className="grid size-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-ink">
        <X size={14} />
      </button>

      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} className="w-56 p-1">
          {settable.map((p) => (
            <MenuItem
              key={p.name}
              icon={<PropIcon type={p.type} />}
              label={p.name}
              right={<ChevronRight size={13} className="text-faint" />}
              onClick={(e) => setProp({ prop: p, el: e.currentTarget })}
            />
          ))}
        </Popover>
      )}
      {prop && (
        <Popover anchor={prop.el} placement="right-start" onClose={() => setProp(null)} className="max-h-[60vh] w-56 overflow-y-auto p-1">
          <MenuSection label={`Set ${prop.prop.name} on ${n} page${n === 1 ? "" : "s"}`} />
          {prop.prop.type === "checkbox" ? (
            <>
              <MenuItem label="Checked" onClick={() => setAll(prop.prop.name, true)} />
              <MenuItem label="Unchecked" onClick={() => setAll(prop.prop.name, false)} />
            </>
          ) : (
            <>
              {(prop.prop.options ?? []).map((o) => (
                <MenuItem
                  key={o.name}
                  label={
                    prop.prop.type === "status" ? (
                      <span className="flex items-center gap-1.5">
                        <StatusDot color={o.color} /> {o.name}
                      </span>
                    ) : (
                      <Tag name={o.name} color={o.color} />
                    )
                  }
                  onClick={() => setAll(prop.prop.name, prop.prop.type === "multi_select" ? [o.name] : o.name)}
                />
              ))}
              <MenuDivider />
              <MenuItem label="Clear" onClick={() => setAll(prop.prop.name, null)} />
            </>
          )}
        </Popover>
      )}
    </div>
  );
}
