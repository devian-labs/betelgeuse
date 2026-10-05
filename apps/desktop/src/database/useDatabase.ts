import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { joinNote, patchFrontmatter, splitNote } from "../lib/frontmatter";
import { useVault } from "../lib/vault";
import {
  asList,
  databaseLink,
  defaultSchema,
  findProperty,
  linksTo,
  linkTarget,
  mapProperty,
  newId,
  parseSchema,
  relationDatabase,
  relationTitles,
  removeProperty,
  toLink,
  toRelationValue,
  toRow,
  uniquePropertyName,
  withComputed,
  writeSchema,
  TYPE_LABELS,
  VIEW_LABELS,
  type PropType,
  type Property,
  type RelatedDatabase,
  type Row,
  type Schema,
  type View,
  type ViewType,
} from "./model";

type State = {
  schema: Schema;
  pageFrontmatter: string;
  pageBody: string;
  rows: Row[];
  /** Databases this one relates to (itself included), for two-way relations and rollups. */
  related: Map<string, RelatedDatabase>;
};

const titleOf = (path: string) => path.replace(/^.*\//, "").replace(/\.md$/, "");

/** Reads another database's schema and rows. */
async function readDatabase(path: string): Promise<RelatedDatabase> {
  const [page, raw] = await Promise.all([api.readNote(path), api.databaseRows(path)]);
  return { path, schema: parseSchema(splitNote(page).body), rows: raw.map(toRow) };
}

export type Database = ReturnType<typeof useDatabase>;

export function useDatabase(path: string) {
  const { refreshKey, peek, notes } = useVault();
  const [state, setState] = useState<State | null>(null);
  const [missing, setMissing] = useState(false);
  const latest = useRef<State | null>(null);
  latest.current = state;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const resolve = useCallback((prop: Property) => relationDatabase(prop, notesRef.current), []);
  // Related databases resolve against the page list, so reload when databases come, go or move.
  const databases = useMemo(() => notes.filter((n) => n.kind === "database").map((n) => n.path).join("\n"), [notes]);

  /** State with `rows` as this database's rows, and every row's computed values worked out again. */
  const withRows = useCallback(
    (s: Omit<State, "rows">, rows: Row[]): State => {
      const related = new Map(s.related).set(path, { path, schema: s.schema, rows });
      return { ...s, related, rows: withComputed(rows, s.schema, related, resolve) };
    },
    [path, resolve],
  );

  const load = useCallback(async () => {
    try {
      const [page, raw] = await Promise.all([api.readNote(path), api.databaseRows(path)]);
      const { frontmatter, body } = splitNote(page);
      const schema = parseSchema(body);
      const targets = new Set(schema.properties.filter((p) => p.type === "relation").map(resolve));
      const related = new Map<string, RelatedDatabase>();
      for (const t of targets) {
        if (t && t !== path) await readDatabase(t).then((db) => related.set(t, db), () => {});
      }
      setState(withRows({ schema, pageFrontmatter: frontmatter, pageBody: body, related }, raw.map(toRow)));
      setMissing(false);
    } catch {
      setMissing(true);
    }
  }, [path, resolve, withRows]);

  useEffect(() => {
    load();
  }, [load, refreshKey, databases]);

  /**
   * Applies schema edits that may reach other databases (the other side of a two-way relation).
   * Edits to this database fold into `own`, which is returned for the caller to save.
   */
  const editSchemas = useCallback(
    async (own: Schema, edits: [string | undefined, (sc: Schema) => Schema][]) => {
      let next = own;
      for (const [target, fn] of edits) {
        if (!target) continue;
        if (target === path) {
          next = fn(next);
          continue;
        }
        const { frontmatter, body } = splitNote(await api.readNote(target));
        await api.writeNote(target, joinNote(frontmatter, writeSchema(body, fn(parseSchema(body)))));
      }
      return next;
    },
    [path],
  );

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
    setState((s) => (s ? withRows(s, s.rows.map((r) => (r.path === row.path ? next : r))) : s));
    await api.writeNote(row.path, joinNote(frontmatter, row.body));
  }, [withRows]);

  /**
   * Sets a property value. The related side of a two-way relation stores nothing itself, so
   * changing it links or unlinks this row on the pages of the other database instead.
   */
  const setValue = useCallback(
    async (row: Row, name: string, value: unknown) => {
      const s = latest.current;
      const prop = s?.schema.properties.find((p) => p.name === name);
      if (!s || !prop?.synced) return writeRow(row, { [name]: value });
      const source = s.related.get(resolve(prop) ?? "");
      const sourceProp = source && findProperty(source.schema, prop.synced);
      if (!source || !sourceProp) return;
      const want = relationTitles(value);
      for (const r of source.rows) {
        const current = asList(r.values[sourceProp.name]);
        const linked = current.some((v) => linksTo(linkTarget(v), row));
        const wanted = want.some((t) => linksTo(t, r));
        if (linked === wanted) continue;
        const next = wanted
          ? sourceProp.limit === "one"
            ? [toLink(row.title)]
            : [...current, toLink(row.title)]
          : current.filter((v) => !linksTo(linkTarget(v), row));
        await api.writeNote(r.path, joinNote(patchFrontmatter(r.frontmatter, { [sourceProp.name]: next.length ? next : null }), r.body));
      }
      await load();
    },
    [writeRow, resolve, load],
  );

  /** Turns a relation's other side on (a property on the related database) or off. */
  const setTwoWay = useCallback(
    async (name: string, on: boolean) => {
      const s = latest.current;
      const prop = s?.schema.properties.find((p) => p.name === name);
      const target = prop && resolve(prop);
      if (!s || !prop || !target || on === !!prop.reverse) return prop?.reverse;
      let reverse: string | undefined;
      let schema = await editSchemas(s.schema, [
        [
          target,
          (sc) => {
            if (!on) return removeProperty(sc, prop.reverse!);
            reverse = uniquePropertyName(sc, titleOf(path));
            return { ...sc, properties: [...sc.properties, { name: reverse, type: "relation", database: databaseLink(path), synced: name }] };
          },
        ],
      ]);
      schema = mapProperty(schema, name, ({ reverse: _, ...p }) => (reverse ? { ...p, reverse } : p));
      await saveSchema(schema);
      await load();
      return reverse;
    },
    [resolve, editSchemas, saveSchema, path, load],
  );

  const updateProperty = useCallback(
    async (oldName: string, next: Property) => {
      const prop = { ...next };
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
      const old = s.schema.properties.find((p) => p.name === oldName);
      // Keep both sides of a two-way relation pointing at each other.
      const edits: [string | undefined, (sc: Schema) => Schema][] = [];
      if (old?.reverse) {
        const stillPaired = prop.type === "relation" && !prop.synced && resolve(prop) === resolve(old);
        if (!stillPaired) {
          edits.push([resolve(old), (sc) => removeProperty(sc, old.reverse!)]);
          delete prop.reverse;
        } else if (renamed) edits.push([resolve(old), (sc) => mapProperty(sc, old.reverse!, (p) => ({ ...p, synced: prop.name }))]);
      }
      if (old?.synced) {
        const stillPaired = prop.type === "relation" && prop.synced === old.synced;
        if (!stillPaired) edits.push([resolve(old), (sc) => mapProperty(sc, old.synced!, ({ reverse: _, ...p }) => p)]);
        else if (renamed) edits.push([resolve(old), (sc) => mapProperty(sc, old.synced!, (p) => ({ ...p, reverse: prop.name }))]);
      }
      const schema = await editSchemas({ ...s.schema, properties: s.schema.properties.map((p) => (p.name === oldName ? prop : p)), views }, edits);
      await saveSchema(schema);
      // A property that just became a relation (or was pointed at a database) holds names; make them links.
      const converting = prop.type === "relation" && !prop.synced && !!prop.database && (old?.type !== "relation" || old.database !== prop.database);
      for (const row of s.rows) {
        if (!(oldName in row.values)) continue;
        const value = converting ? toRelationValue(row.values[oldName], prop.limit) : row.values[oldName];
        if (renamed) await writeRow(row, { [prop.name]: value, [oldName]: null });
        else if (converting) await writeRow(row, { [prop.name]: value });
      }
      if (edits.length || converting || prop.type === "relation" || prop.type === "rollup") await load();
    },
    [saveSchema, writeRow, editSchemas, resolve, load],
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
      await saveSchema({ ...s.schema, properties, views });
      return name;
    },
    [saveSchema],
  );

  const deleteProperty = useCallback(
    async (name: string) => {
      const s = latest.current;
      if (!s) return;
      const old = s.schema.properties.find((p) => p.name === name);
      const schema = await editSchemas(removeProperty(s.schema, name), [
        [old?.reverse ? resolve(old) : undefined, (sc) => removeProperty(sc, old!.reverse!)],
        [old?.synced ? resolve(old) : undefined, (sc) => mapProperty(sc, old!.synced!, ({ reverse: _, ...p }) => p)],
      ]);
      await saveSchema(schema);
      for (const row of s.rows) if (name in row.values) await writeRow(row, { [name]: null });
    },
    [saveSchema, writeRow, editSchemas, resolve],
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
    setTwoWay,
    resolve,
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
