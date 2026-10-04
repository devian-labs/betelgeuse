import { ChevronDown, GripVertical, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { MenuDivider, MenuItem, Popover } from "../components/Popover";
import { PropIcon } from "./cells";
import { CALC_LABELS, CALC_SHORT, calcsFor, calculate, visibleProperties, type Calc, type Property } from "./model";
import { PropertyMenu, TypeMenu } from "./PropertyMenu";
import { EditableValue, OpenButton, RowMenu, RowTitle, TitleInput, type ViewProps } from "./shared";

const DEFAULT_WIDTH = 180;
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

  const total = props.reduce((n, p) => n + width(p), 0) + 32 + 34;
  const calcs = view.calcs ?? {};

  return (
    <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
      <div style={{ width: total, minWidth: "100%" }} className="text-sm">
        {/* header */}
        <div className="flex h-[34px] border-b border-line pl-8 text-muted">
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
          <div key={row.path} className="group/row relative flex min-h-[34px] border-b border-line pl-8 hover:bg-[var(--row-hover)]">
            <button
              onClick={(e) => setRowMenu({ path: row.path, el: e.currentTarget })}
              className="absolute top-1.5 left-2 grid size-5 place-items-center rounded text-faint opacity-0 group-hover/row:opacity-100 hover:bg-hover"
            >
              <GripVertical size={14} />
            </button>
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
          className="flex h-[34px] w-full items-center gap-1.5 border-b border-line pl-9 text-faint hover:bg-hover"
        >
          <Plus size={15} /> New page
        </button>

        {/* calculations */}
        <div className="group/calc flex h-[34px] pl-8">
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
