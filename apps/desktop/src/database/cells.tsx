import {
  AlignLeft,
  ArrowUpRight,
  AtSign,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Clock,
  FileText,
  GripVertical,
  Hash,
  Link,
  List,
  Loader,
  MoreHorizontal,
  Plus,
  Search,
  Sigma,
  Table2,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { COLORS, colorLabel, tagColor, type Color } from "../lib/colors";
import { MenuDivider, MenuItem, MenuSection, Popover } from "../components/Popover";
import { PageIcon } from "../components/PageIcon";
import { api } from "../lib/api";
import { useOpenRow, useVault } from "../lib/vault";
import {
  asBool,
  asDate,
  asList,
  asNumber,
  formatDate,
  formatNumber,
  isoDay,
  databaseLink,
  linksTo,
  relationDatabase,
  relationPage,
  relationTitles,
  toLink,
  toRow,
  withOption,
  type Row,
  type PropType,
  type Property,
  type SelectOption,
} from "./model";

export function PropIcon({ type, size = 14 }: { type: PropType; size?: number }) {
  const icons: Record<PropType, ReactNode> = {
    title: <Type size={size} />,
    text: <AlignLeft size={size} />,
    number: <Hash size={size} />,
    select: <ChevronDown size={size} />,
    multi_select: <List size={size} />,
    status: <Loader size={size} />,
    date: <Calendar size={size} />,
    checkbox: <CheckSquare size={size} />,
    url: <Link size={size} />,
    email: <AtSign size={size} />,
    created_time: <Clock size={size} />,
    last_edited_time: <Clock size={size} />,
    relation: <ArrowUpRight size={size} />,
    rollup: <Sigma size={size} />,
  };
  return <>{icons[type]}</>;
}

export function Tag({ name, color, onRemove }: { name: string; color?: Color | string; onRemove?: () => void }) {
  return (
    <span
      style={{ background: tagColor(color) }}
      className="inline-flex h-5 max-w-full shrink-0 items-center gap-0.5 rounded-[3px] px-1.5 text-[13px] leading-5 whitespace-nowrap text-ink"
    >
      <span className="truncate">{name}</span>
      {onRemove && (
        <button onClick={onRemove} className="opacity-50 hover:opacity-100">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

const optionColor = (prop: Property, name: string) => prop.options?.find((o) => o.name === name)?.color;

export function StatusDot({ color }: { color?: string }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: `var(--c-${color ?? "gray"}-text)` }} />;
}

/** Read-only rendering of a property value, as shown in table cells and cards. */
export function ValueView({ prop, value, wrap, limit }: { prop: Property; value: unknown; wrap?: boolean; limit?: number }) {
  switch (prop.type) {
    case "select":
    case "status":
    case "multi_select": {
      const list = asList(value);
      if (!list.length) return null;
      return (
        <span className={`flex gap-1 ${wrap ? "flex-wrap" : "overflow-hidden"}`}>
          {list.map((v) =>
            prop.type === "status" ? (
              <span
                key={v}
                style={{ background: tagColor(optionColor(prop, v)) }}
                className="inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[13px] whitespace-nowrap text-ink"
              >
                <StatusDot color={optionColor(prop, v)} />
                {v}
              </span>
            ) : (
              <Tag key={v} name={v} color={optionColor(prop, v)} />
            ),
          )}
        </span>
      );
    }
    case "checkbox":
      return <Checkbox checked={asBool(value)} />;
    case "number": {
      const n = asNumber(value);
      return n === null ? null : <span className="tabular-nums">{formatNumber(n, prop.format)}</span>;
    }
    case "date":
    case "created_time":
    case "last_edited_time": {
      const d = asDate(value);
      return d ? <span className="whitespace-nowrap">{formatDate(d, prop.type !== "date")}</span> : null;
    }
    case "relation":
      return <RelationChips prop={prop} value={value} wrap={wrap} limit={limit} />;
    case "url":
    case "email": {
      const s = asList(value)[0];
      return s ? <span className="truncate text-ink underline decoration-[var(--line)] underline-offset-2">{s}</span> : null;
    }
    default: {
      const s = asList(value).join(", ");
      return s ? <span className={wrap ? "break-words whitespace-pre-wrap" : "truncate"}>{s}</span> : null;
    }
  }
}

/** Linked pages as chips; clicking one opens it (in a side peek, or a new tab with ⌘/Ctrl). */
function RelationChips({ prop, value, wrap, limit }: { prop: Property; value: unknown; wrap?: boolean; limit?: number }) {
  const { notes } = useVault();
  const openRow = useOpenRow();
  const all = relationTitles(value);
  if (!all.length) return null;
  const titles = limit ? all.slice(0, limit) : all;
  const dbPath = relationDatabase(prop, notes);
  return (
    <span className={`flex gap-1.5 ${wrap ? "flex-wrap" : "overflow-hidden"}`}>
      {titles.map((t) => {
        const page = relationPage(t, dbPath, notes);
        return (
          <span
            key={t}
            onClick={(e) => {
              if (!page) return;
              e.stopPropagation();
              openRow(page.path, e);
            }}
            className={`inline-flex max-w-full shrink-0 items-center gap-1 text-[14px] whitespace-nowrap underline-offset-2 ${
              page ? "cursor-pointer text-ink underline decoration-[var(--line)] hover:decoration-current" : "text-faint line-through"
            }`}
            title={page ? page.path : `No page named “${t}”`}
          >
            {page?.icon ? <PageIcon icon={page.icon} size={14} /> : <FileText size={13} className="shrink-0 text-faint" />}
            <span className="truncate">{t}</span>
          </span>
        );
      })}
      {titles.length < all.length && <span className="shrink-0 text-[13px] whitespace-nowrap text-faint">+{all.length - titles.length} more</span>}
    </span>
  );
}

export function Checkbox({ checked, onChange }: { checked: boolean; onChange?: (v: boolean) => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={`grid size-4 shrink-0 place-items-center rounded-[3px] border ${
        checked ? "border-[var(--blue)] bg-[var(--blue)]" : "border-[var(--muted)] bg-transparent hover:bg-hover"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="size-3 fill-none stroke-white stroke-[2]">
          <path d="M2.5 6.2 5 8.5l4.5-5" />
        </svg>
      )}
    </button>
  );
}

// ---------- editors ----------

type EditorProps = {
  prop: Property;
  value: unknown;
  anchor: HTMLElement;
  onChange: (value: unknown) => void;
  onPropChange: (prop: Property) => void;
  onClose: () => void;
};

/** Popover editor for a single cell. Checkboxes toggle in place and never open this. */
export function CellEditor(p: EditorProps) {
  switch (p.prop.type) {
    case "select":
    case "status":
    case "multi_select":
      return <SelectEditor {...p} />;
    case "date":
      return <DateEditor {...p} />;
    case "relation":
      return <RelationEditor {...p} />;
    default:
      return <TextEditor {...p} />;
  }
}

function TextEditor({ prop, value, anchor, onChange, onClose }: EditorProps) {
  const [text, setText] = useState(asList(value).join(", "));
  const commit = () => {
    if (prop.type === "number") {
      const n = asNumber(text);
      onChange(text.trim() === "" ? null : n ?? value);
    } else onChange(text.trim() === "" ? null : text);
    onClose();
  };
  const rect = anchor.getBoundingClientRect();
  return (
    <Popover anchor={new DOMRect(rect.left, rect.top - 1, rect.width, 0)} onClose={commit} className="p-0">
      <textarea
        autoFocus
        rows={prop.type === "text" ? 3 : 1}
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        }}
        placeholder={prop.type === "url" ? "Type or paste a link" : prop.type === "number" ? "Type a number" : "Type something…"}
        style={{ width: Math.max(rect.width, 240) }}
        className={`block resize-none bg-transparent px-2.5 py-2 text-sm text-ink outline-none placeholder:text-faint ${
          prop.type === "number" ? "text-right tabular-nums" : ""
        }`}
      />
    </Popover>
  );
}

function DateEditor({ value, anchor, onChange, onClose }: EditorProps) {
  const d = asDate(value);
  const today = new Date();
  const [month, setMonth] = useState(() => new Date((d ?? today).getFullYear(), (d ?? today).getMonth(), 1));
  const selected = d ? isoDay(d) : null;
  const days = monthGrid(month);

  return (
    <Popover anchor={anchor} onClose={onClose} className="w-64 p-2">
      <input
        key={selected ?? ""}
        defaultValue={selected ?? ""}
        placeholder="YYYY-MM-DD"
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const v = e.currentTarget.value.trim();
          if (!v) onChange(null);
          else if (asDate(v)) onChange(isoDay(asDate(v)!));
          onClose();
        }}
        className="mb-2 h-8 w-full rounded-md border border-line bg-side px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
      />
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-sm font-medium text-ink">
          {month.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
        </span>
        <span className="flex gap-0.5 text-muted">
          <button onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))} className="rounded px-1.5 text-xs hover:bg-hover">
            Today
          </button>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded px-1.5 hover:bg-hover">
            ‹
          </button>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded px-1.5 hover:bg-hover">
            ›
          </button>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-faint">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
        {days.map((day) => {
          const iso = isoDay(day);
          const inMonth = day.getMonth() === month.getMonth();
          return (
            <button
              key={iso}
              onClick={() => {
                onChange(iso);
                onClose();
              }}
              className={`m-px grid h-7 place-items-center rounded-md text-[13px] ${
                iso === selected
                  ? "bg-[var(--blue)] text-white"
                  : iso === isoDay(today)
                    ? "font-semibold text-[var(--c-red-text)] hover:bg-hover"
                    : inMonth
                      ? "text-ink hover:bg-hover"
                      : "text-faint hover:bg-hover"
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      {selected && (
        <>
          <MenuDivider />
          <MenuItem
            icon={<X size={14} />}
            label="Clear"
            onClick={() => {
              onChange(null);
              onClose();
            }}
          />
        </>
      )}
    </Popover>
  );
}

/** 6-week grid of days covering `month`, starting on Sunday. */
export function monthGrid(month: Date): Date[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function SelectEditor({ prop, value, anchor, onChange, onPropChange, onClose }: EditorProps) {
  const multi = prop.type === "multi_select";
  const [selected, setSelected] = useState(asList(value));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<{ option: SelectOption; el: HTMLElement } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = prop.options ?? [];
  const q = query.trim();
  const shown = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q && !options.some((o) => o.name.toLowerCase() === q.toLowerCase());
  const items = [...shown.map((o) => o.name), ...(canCreate ? [q] : [])];

  useEffect(() => setActive(0), [query]);

  const pick = (name: string) => {
    const { prop: next } = withOption(prop, name);
    if (next !== prop) onPropChange(next);
    if (multi) {
      const list = selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name];
      setSelected(list);
      onChange(list);
      setQuery("");
      inputRef.current?.focus();
    } else {
      onChange(selected[0] === name ? null : name);
      onClose();
    }
  };

  const remove = (name: string) => {
    const list = selected.filter((s) => s !== name);
    setSelected(list);
    onChange(multi ? list : null);
  };

  return (
    <Popover anchor={anchor} onClose={onClose} className="w-72 overflow-hidden">
      <div className="flex min-h-9 flex-wrap items-center gap-1 border-b border-line bg-side px-2 py-1.5">
        {selected.map((s) => (
          <Tag key={s} name={s} color={optionColor(prop, s)} onRemove={() => remove(s)} />
        ))}
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, items.length - 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
            if (e.key === "Enter" && items[active]) (e.preventDefault(), pick(items[active]));
            if (e.key === "Backspace" && !query && selected.length) remove(selected[selected.length - 1]);
          }}
          placeholder={selected.length ? "" : "Search for an option…"}
          className="min-w-16 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1">
        <div className="px-2 pt-1 pb-1 text-[11px] text-faint">{options.length ? "Select an option or create one" : "Type to create an option"}</div>
        {shown.map((o, i) => (
          <div
            key={o.name}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(o.name)}
            className={`group flex h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 ${active === i ? "bg-hover" : ""}`}
          >
            <GripVertical size={12} className="text-faint" />
            <span className="min-w-0 flex-1">
              <Tag name={o.name} color={o.color} />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing({ option: o, el: e.currentTarget });
              }}
              className="grid size-6 place-items-center rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-hover"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        ))}
        {canCreate && (
          <div
            onMouseEnter={() => setActive(shown.length)}
            onClick={() => pick(q)}
            className={`flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-ink ${active === shown.length ? "bg-hover" : ""}`}
          >
            Create <Tag name={q} color={withOption(prop, q).option.color} />
          </div>
        )}
      </div>
      {editing && (
        <OptionMenu
          option={editing.option}
          anchor={editing.el}
          onClose={() => setEditing(null)}
          onChange={(next) => {
            onPropChange({ ...prop, options: options.map((o) => (o.name === editing.option.name ? next : o)) });
            if (next.name !== editing.option.name && selected.includes(editing.option.name)) {
              const list = selected.map((s) => (s === editing.option.name ? next.name : s));
              setSelected(list);
              onChange(multi ? list : list[0]);
            }
            setEditing({ ...editing, option: next });
          }}
          onDelete={() => {
            onPropChange({ ...prop, options: options.filter((o) => o.name !== editing.option.name) });
            if (selected.includes(editing.option.name)) remove(editing.option.name);
            setEditing(null);
          }}
        />
      )}
    </Popover>
  );
}

/** Lists databases to relate to; picking one sets the relation's `database`. */
export function DatabasePicker({ current, onPick }: { current?: string; onPick: (path: string) => void }) {
  const { notes } = useVault();
  const [query, setQuery] = useState("");
  const dbs = notes.filter((n) => n.kind === "database" && n.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-2">
        <Search size={13} className="text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a database…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1">
        <MenuSection label="Relate to a database" />
        {dbs.map((n) => (
          <MenuItem
            key={n.path}
            icon={n.icon ? <PageIcon icon={n.icon} size={14} /> : <Table2 size={14} />}
            label={n.title}
            hint={n.path.includes("/") ? n.path.replace(/\/[^/]*$/, "") : undefined}
            right={current === databaseLink(n.path) ? <span className="text-muted">✓</span> : null}
            onClick={() => onPick(n.path)}
          />
        ))}
        {!dbs.length && <div className="px-2 py-1.5 text-sm text-faint">No databases found</div>}
      </div>
    </>
  );
}

/** Picks pages from the related database, or creates one there. */
function RelationEditor({ prop, value, anchor, onChange, onPropChange, onClose }: EditorProps) {
  const { notes, refresh } = useVault();
  const dbPath = relationDatabase(prop, notes);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState(relationTitles(value));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const single = prop.limit === "one";

  useEffect(() => {
    if (dbPath) api.databaseRows(dbPath).then((raw) => setRows(raw.map(toRow)), () => setRows([]));
  }, [dbPath]);
  useEffect(() => setActive(0), [query]);

  if (!dbPath) {
    return (
      <Popover anchor={anchor} onClose={onClose} className="w-72 overflow-hidden">
        <DatabasePicker
          onPick={(path) => {
            onPropChange({ ...prop, database: databaseLink(path) });
            onClose();
          }}
        />
      </Popover>
    );
  }

  const q = query.trim();
  const isSelected = (r: Row) => selected.some((t) => linksTo(t, r));
  const shown = (rows ?? []).filter((r) => r.title.toLowerCase().includes(q.toLowerCase()));
  const canCreate = !!q && !(rows ?? []).some((r) => r.title.toLowerCase() === q.toLowerCase());

  const commit = (titles: string[]) => {
    setSelected(titles);
    onChange(titles.length ? titles.map(toLink) : null);
  };
  const toggle = (title: string) => {
    const has = selected.some((t) => t.toLowerCase() === title.toLowerCase());
    if (single) {
      commit(has ? [] : [title]);
      onClose();
    } else commit(has ? selected.filter((t) => t.toLowerCase() !== title.toLowerCase()) : [...selected, title]);
    setQuery("");
  };
  const create = async () => {
    const path = await api.createNote(dbPath, q);
    await refresh();
    const title = path.replace(/^.*\//, "").replace(/\.md$/, "");
    setRows((rs) => [...(rs ?? []), { path, title, frontmatter: "", values: {}, body: "", created: Date.now(), modified: Date.now() }]);
    toggle(title);
  };
  const items = shown.length + (canCreate ? 1 : 0);

  return (
    <Popover anchor={anchor} onClose={onClose} className="w-80 overflow-hidden">
      <div className="flex min-h-9 flex-wrap items-center gap-1 border-b border-line bg-side px-2 py-1.5">
        {selected.map((t) => (
          <Tag key={t} name={t} onRemove={() => commit(selected.filter((s) => s !== t))} />
        ))}
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, items - 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
            if (e.key === "Enter") {
              e.preventDefault();
              if (active < shown.length) toggle(shown[active].title);
              else if (canCreate) create();
            }
            if (e.key === "Backspace" && !query && selected.length) commit(selected.slice(0, -1));
          }}
          placeholder={selected.length ? "" : "Link a page…"}
          className="min-w-16 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1">
        <div className="px-2 pt-1 pb-1 text-[11px] text-faint">
          In {notes.find((n) => n.path === dbPath)?.title ?? dbPath}
          {single ? " · one page" : ""}
        </div>
        {rows === null && <div className="px-2 py-1.5 text-sm text-faint">Loading…</div>}
        {shown.map((r, i) => (
          <div
            key={r.path}
            onMouseEnter={() => setActive(i)}
            onClick={() => toggle(r.title)}
            className={`flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-ink ${active === i ? "bg-hover" : ""}`}
          >
            {r.icon ? <PageIcon icon={r.icon} size={15} /> : <FileText size={14} className="shrink-0 text-faint" />}
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            {isSelected(r) && <span className="text-muted">✓</span>}
          </div>
        ))}
        {canCreate && (
          <div
            onMouseEnter={() => setActive(shown.length)}
            onClick={create}
            className={`flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-ink ${active === shown.length ? "bg-hover" : ""}`}
          >
            <Plus size={14} className="text-faint" /> New page “{q}”
          </div>
        )}
      </div>
    </Popover>
  );
}

function OptionMenu({
  option,
  anchor,
  onChange,
  onDelete,
  onClose,
}: {
  option: SelectOption;
  anchor: HTMLElement;
  onChange: (o: SelectOption) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(option.name);
  return (
    <Popover anchor={anchor} placement="right-start" onClose={onClose} className="w-56 p-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== option.name && onChange({ ...option, name: name.trim() })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="m-1 h-7 w-[calc(100%-8px)] rounded-md border border-line bg-side px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
      />
      <MenuItem icon={<Trash2 size={14} />} label="Delete" danger onClick={onDelete} />
      <MenuDivider />
      <MenuSection label="Colors" />
      {COLORS.map((c) => (
        <MenuItem
          key={c}
          icon={<span className="size-4 rounded-[3px] border border-line" style={{ background: tagColor(c) }} />}
          label={colorLabel(c)}
          right={option.color === c ? <span className="text-muted">✓</span> : null}
          onClick={() => onChange({ ...option, color: c })}
        />
      ))}
    </Popover>
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button onClick={onClick} className="flex h-8 w-full items-center gap-1.5 px-2 text-sm text-faint hover:bg-hover">
      <Plus size={15} /> {label}
    </button>
  );
}

export const StatusIcon = CircleDot;
