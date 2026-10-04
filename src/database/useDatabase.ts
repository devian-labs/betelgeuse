import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { joinNote, patchFrontmatter, splitNote } from "../lib/frontmatter";
import { useVault } from "../lib/vault";
import {
  defaultSchema,
  newId,
  parseSchema,
  toRow,
  uniquePropertyName,
  writeSchema,
  TYPE_LABELS,
  VIEW_LABELS,
  type PropType,
  type Property,
  type Row,
  type Schema,
  type View,
  type ViewType,
} from "./model";

type State = { schema: Schema; pageFrontmatter: string; pageBody: string; rows: Row[] };

export type Database = ReturnType<typeof useDatabase>;

export function useDatabase(path: string) {
  const { refreshKey, peek } = useVault();
  const [state, setState] = useState<State | null>(null);
  const [missing, setMissing] = useState(false);
  const latest = useRef<State | null>(null);
  latest.current = state;

  const load = useCallback(async () => {
    try {
      const [page, raw] = await Promise.all([api.readNote(path), api.databaseRows(path)]);
      const { frontmatter, body } = splitNote(page);
      setState({ schema: parseSchema(body), pageFrontmatter: frontmatter, pageBody: body, rows: raw.map(toRow) });
      setMissing(false);
    } catch {
      setMissing(true);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const saveSchema = useCallback(
    async (schema: Schema) => {
      const s = latest.current;
      if (!s) return;
      const pageBody = writeSchema(s.pageBody, schema);
      const next = { ...s, schema, pageBody };
      latest.current = next;
      setState(next);
      await api.writeNote(path, joinNote(s.pageFrontmatter, pageBody));
    },
    [path],
  );

  const writeRow = useCallback(async (row: Row, patch: Record<string, unknown>) => {
    const frontmatter = patchFrontmatter(row.frontmatter, patch);
    const values = { ...row.values, ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === null || v === undefined) delete values[k];
    const next: Row = { ...row, frontmatter, values, modified: Date.now() };
    setState((s) => (s ? { ...s, rows: s.rows.map((r) => (r.path === row.path ? next : r)) } : s));
    await api.writeNote(row.path, joinNote(frontmatter, row.body));
  }, []);

  const setValue = useCallback((row: Row, prop: string, value: unknown) => writeRow(row, { [prop]: value }), [writeRow]);

  const updateProperty = useCallback(
    async (oldName: string, prop: Property) => {
      const s = latest.current;
      if (!s) return;
      const renamed = oldName !== prop.name;
      const rename = (n: string) => (n === oldName ? prop.name : n);
      const views = !renamed
        ? s.schema.views
        : s.schema.views.map((v) => ({
            ...v,
            order: v.order?.map(rename),
            hidden: v.hidden?.map(rename),
            sorts: v.sorts?.map((x) => ({ ...x, property: rename(x.property) })),
            filters: v.filters?.map((x) => ({ ...x, property: rename(x.property) })),
            calcs: v.calcs && Object.fromEntries(Object.entries(v.calcs).map(([k, c]) => [rename(k), c])),
            widths: v.widths && Object.fromEntries(Object.entries(v.widths).map(([k, w]) => [rename(k), w])),
            groupBy: v.groupBy && rename(v.groupBy),
            dateProperty: v.dateProperty && rename(v.dateProperty),
          }));
      await saveSchema({ properties: s.schema.properties.map((p) => (p.name === oldName ? prop : p)), views });
      if (renamed) {
        for (const row of s.rows) if (oldName in row.values) await writeRow(row, { [prop.name]: row.values[oldName], [oldName]: null });
      }
    },
    [saveSchema, writeRow],
  );

  const addProperty = useCallback(
    async (type: PropType, viewId?: string, index?: number) => {
      const s = latest.current;
      if (!s) return "";
      const name = uniquePropertyName(s.schema, TYPE_LABELS[type]);
      const prop: Property = { name, type, ...(type === "select" || type === "multi_select" ? { options: [] } : {}) };
      if (type === "status") {
        prop.options = [
          { name: "Not started", color: "gray" },
          { name: "In progress", color: "blue" },
          { name: "Done", color: "green" },
        ];
      }
      const properties = [...s.schema.properties, prop];
      const views = s.schema.views.map((v) => {
        if (v.id !== viewId || index === undefined) return v;
        const order = [...(v.order ?? s.schema.properties.map((p) => p.name)).filter((n) => n !== name)];
        order.splice(index, 0, name);
        return { ...v, order };
      });
      await saveSchema({ properties, views });
      return name;
    },
    [saveSchema],
  );

  const deleteProperty = useCallback(
    async (name: string) => {
      const s = latest.current;
      if (!s) return;
      const views = s.schema.views.map((v) => ({
        ...v,
        order: v.order?.filter((n) => n !== name),
        hidden: v.hidden?.filter((n) => n !== name),
        sorts: v.sorts?.filter((x) => x.property !== name),
        filters: v.filters?.filter((x) => x.property !== name),
        groupBy: v.groupBy === name ? undefined : v.groupBy,
        dateProperty: v.dateProperty === name ? undefined : v.dateProperty,
      }));
      await saveSchema({ properties: s.schema.properties.filter((p) => p.name !== name), views });
      for (const row of s.rows) if (name in row.values) await writeRow(row, { [name]: null });
    },
    [saveSchema, writeRow],
  );

  const updateView = useCallback(
    (id: string, patch: Partial<View>) => {
      const s = latest.current;
      if (s) saveSchema({ ...s.schema, views: s.schema.views.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
    },
    [saveSchema],
  );

  const addView = useCallback(
    async (type: ViewType, from?: View) => {
      const s = latest.current;
      if (!s) return "";
      const view: View = from
        ? { ...from, id: newId(), name: `${from.name} copy` }
        : { id: newId(), name: VIEW_LABELS[type], type };
      if (type === "board" && !view.groupBy) view.groupBy = s.schema.properties.find((p) => p.type === "status" || p.type === "select")?.name;
      if (type === "calendar" && !view.dateProperty) view.dateProperty = s.schema.properties.find((p) => p.type === "date")?.name;
      await saveSchema({ ...s.schema, views: [...s.schema.views, view] });
      return view.id;
    },
    [saveSchema],
  );

  const deleteView = useCallback(
    (id: string) => {
      const s = latest.current;
      if (s && s.schema.views.length > 1) saveSchema({ ...s.schema, views: s.schema.views.filter((v) => v.id !== id) });
    },
    [saveSchema],
  );

  const createRow = useCallback(
    async (values: Record<string, unknown> = {}, openAfter = false) => {
      const rowPath = await api.createNote(path, "Untitled");
      const frontmatter = patchFrontmatter("", values);
      if (frontmatter) await api.writeNote(rowPath, joinNote(frontmatter, ""));
      await load();
      if (openAfter) peek(rowPath);
      return rowPath;
    },
    [path, load, peek],
  );

  const renameRow = useCallback(
    async (row: Row, title: string) => {
      if (!title.trim() || title.trim() === row.title) return;
      await api.renameNote(row.path, title.trim());
      await load();
    },
    [load],
  );

  const deleteRow = useCallback(
    async (row: Row) => {
      setState((s) => (s ? { ...s, rows: s.rows.filter((r) => r.path !== row.path) } : s));
      await api.deleteNote(row.path);
    },
    [],
  );

  const duplicateRow = useCallback(
    async (row: Row) => {
      await api.duplicateNote(row.path);
      await load();
    },
    [load],
  );

  return {
    state,
    missing,
    reload: load,
    saveSchema,
    setValue,
    updateProperty,
    addProperty,
    deleteProperty,
    updateView,
    addView,
    deleteView,
    createRow,
    renameRow,
    deleteRow,
    duplicateRow,
  };
}

/** Creates a new database page (optionally nested) with Notion's default columns. */
export async function createDatabase(parent: string | null, title = "Untitled database"): Promise<string> {
  const path = await api.createNote(parent, title);
  await api.writeNote(path, joinNote("type: database", writeSchema("", defaultSchema())));
  return path;
}
