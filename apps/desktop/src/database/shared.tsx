import { ArrowUpRight, Copy, ExternalLink, FileText, Maximize2, PanelRight, Trash2 } from "lucide-react";
import { PageIcon } from "../components/PageIcon";
import { useState, type ReactNode } from "react";
import { MenuDivider, MenuItem, Popover } from "../components/Popover";
import { useOpenRow, useVault } from "../lib/vault";
import { CellEditor, Checkbox, ValueView } from "./cells";
import { asBool, getValue, isReadOnly, type Property, type Row, type Schema, type View } from "./model";
import type { Database } from "./useDatabase";

export type ViewProps = {
  db: Database;
  schema: Schema;
  view: View;
  rows: Row[];
  /** Path of a just-created row whose title should open for editing. */
  editTitleOf: string | null;
  onTitleEdited: () => void;
};

/** A property value that edits in place: checkboxes toggle, everything else opens an editor. */
export function EditableValue({
  db,
  row,
  prop,
  wrap,
  className = "",
  placeholder,
  children,
  style,
}: {
  db: Database;
  row: Row;
  prop: Property;
  wrap?: boolean;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  children?: ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const value = getValue(row, prop);
  const readOnly = isReadOnly(prop.type);

  if (prop.type === "checkbox") {
    return (
      <div style={style} className={`flex items-center ${className}`}>
        <Checkbox checked={asBool(value)} onChange={(v) => db.setValue(row, prop.name, v)} />
      </div>
    );
  }

  return (
    <>
      <div
        style={style}
        onClick={(e) => {
          if (readOnly) return;
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
        className={`${readOnly ? "" : "cursor-pointer"} ${className}`}
      >
        {children ?? <ValueView prop={prop} value={value} wrap={wrap} />}
        {placeholder && !children && value == null && <span className="text-faint">{placeholder}</span>}
      </div>
      {anchor && (
        <CellEditor
          prop={prop}
          value={value}
          anchor={anchor}
          onClose={() => setAnchor(null)}
          onChange={(v) => db.setValue(row, prop.name, v)}
          onPropChange={(p) => db.updateProperty(prop.name, p)}
        />
      )}
    </>
  );
}

/** Inline title editor used when a row is created or renamed. */
export function TitleInput({ row, db, onDone }: { row: Row; db: Database; onDone: () => void }) {
  const [title, setTitle] = useState(row.title === "Untitled" ? "" : row.title);
  const commit = () => {
    db.renameRow(row, title.trim() || "Untitled");
    onDone();
  };
  return (
    <input
      autoFocus
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") onDone();
      }}
      placeholder="Untitled"
      className="w-full min-w-0 bg-transparent font-medium text-ink outline-none placeholder:text-faint"
    />
  );
}

export function RowTitle({ row, className = "" }: { row: Row; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      {row.icon ? <PageIcon icon={row.icon} size={16} /> : <FileText size={15} className="shrink-0 text-faint" />}
      <span className={`truncate font-medium ${row.title === "Untitled" ? "text-faint" : "text-ink"}`}>{row.title}</span>
    </span>
  );
}

export function RowMenu({ db, row, anchor, onClose, onRename }: { db: Database; row: Row; anchor: HTMLElement; onClose: () => void; onRename?: () => void }) {
  const { peek, openPage } = useVault();
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} className="w-56 p-1">
      <MenuItem icon={<PanelRight size={14} />} label="Open in side peek" onClick={act(() => peek(row.path))} />
      <MenuItem icon={<Maximize2 size={14} />} label="Open as full page" onClick={act(() => openPage(row.path))} />
      <MenuItem icon={<ExternalLink size={14} />} label="Open in new tab" onClick={act(() => openPage(row.path, { newTab: true }))} />
      {onRename && <MenuItem icon={<ArrowUpRight size={14} />} label="Rename" onClick={act(onRename)} />}
      <MenuDivider />
      <MenuItem icon={<Copy size={14} />} label="Duplicate" onClick={act(() => db.duplicateRow(row))} />
      <MenuItem icon={<Trash2 size={14} />} label="Delete" danger onClick={act(() => db.deleteRow(row))} />
    </Popover>
  );
}

/** Notion's "OPEN" pill that appears on hover in the title cell. */
export function OpenButton({ row }: { row: Row }) {
  const openRow = useOpenRow();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        openRow(row.path, e);
      }}
      className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded-md border border-line bg-raised px-1.5 text-[11px] font-medium tracking-wide text-muted opacity-0 shadow-sm group-hover/row:opacity-100 hover:bg-hover"
    >
      <PanelRight size={12} /> OPEN
    </button>
  );
}
