import assert from "node:assert/strict";
import { test } from "node:test";
import { allProperties, applyView, calculate, parseSchema, toRow, writeSchema, defaultSchema, visibleProperties } from "../src/database/model.ts";
import { patchFrontmatter } from "../src/lib/frontmatter.ts";

const schema = {
  properties: [
    { name: "Status", type: "status", options: [{ name: "Todo", color: "gray" }, { name: "Doing", color: "blue" }, { name: "Done", color: "green" }] },
    { name: "Estimate", type: "number" },
    { name: "Due", type: "date" },
    { name: "Tags", type: "multi_select", options: [] },
    { name: "Shipped", type: "checkbox" },
  ],
  views: [{ id: "t", name: "Table", type: "table" }],
};
const row = (title, fm) => toRow({ path: `DB/${title}.md`, title, content: `---\n${fm}\n---\nbody of ${title}`, created: 0, modified: 0 });
const rows = [
  row("A", "Status: Done\nEstimate: 5\nDue: 2026-10-02\nTags: [app]\nShipped: true"),
  row("B", "Status: Todo\nEstimate: 3\nDue: 2026-10-09\nTags: [agents, app]"),
  row("C", "Status: Doing\nDue: 2026-10-16"),
];
const titles = (rs) => rs.map((r) => r.title).join("");
const view = (v) => ({ id: "t", name: "T", type: "table", ...v });

test("sorts by option order, numbers and keeps empties last both ways", () => {
  assert.equal(titles(applyView(rows, schema, view({ sorts: [{ property: "Status", direction: "asc" }] }), "")), "BCA");
  assert.equal(titles(applyView(rows, schema, view({ sorts: [{ property: "Estimate", direction: "asc" }] }), "")), "BAC");
  assert.equal(titles(applyView(rows, schema, view({ sorts: [{ property: "Estimate", direction: "desc" }] }), "")), "ABC");
});

test("filters by select, multi-select, number, date and checkbox", () => {
  const f = (filters) => titles(applyView(rows, schema, view({ filters }), ""));
  assert.equal(f([{ property: "Status", op: "is", value: "Done" }]), "A");
  assert.equal(f([{ property: "Tags", op: "contains", value: "app" }]), "AB");
  assert.equal(f([{ property: "Estimate", op: "gt", value: "4" }]), "A");
  assert.equal(f([{ property: "Estimate", op: "is_empty" }]), "C");
  assert.equal(f([{ property: "Due", op: "before", value: "2026-10-10" }]), "AB");
  assert.equal(f([{ property: "Shipped", op: "unchecked" }]), "BC");
});

test("search matches titles and property values", () => {
  assert.equal(titles(applyView(rows, schema, view({}), "agents")), "B");
});

test("footer calculations", () => {
  const p = (n) => schema.properties.find((x) => x.name === n);
  assert.equal(calculate(rows, p("Estimate"), "sum"), "8");
  assert.equal(calculate(rows, p("Estimate"), "average"), "4");
  assert.equal(calculate(rows, p("Estimate"), "count_empty"), "1");
  assert.equal(calculate(rows, p("Tags"), "count_unique"), "2");
  assert.equal(calculate(rows, p("Shipped"), "percent_checked"), "33.3%");
  assert.equal(calculate(rows, p("Due"), "date_range"), "14 days");
});

test("schema block is written into and read back from the page body", () => {
  const body = writeSchema("A description.\n", defaultSchema());
  assert.match(body, /^A description\.\n\n```database\n/);
  assert.deepEqual(parseSchema(body).properties.map((p) => p.name), ["Status", "Tags"]);
});

test("frontmatter patches keep other keys and formatting", () => {
  const fm = "# note\nicon: 🚀\nTags: [a, b]\nStatus: Todo";
  assert.equal(patchFrontmatter(fm, { Status: "Done", Estimate: 3 }), "# note\nicon: 🚀\nTags: [a, b]\nStatus: Done\nEstimate: 3");
  assert.equal(patchFrontmatter(fm, { Tags: null }), "# note\nicon: 🚀\nStatus: Todo");
  assert.equal(patchFrontmatter("", { "Due date": "2026-10-04", Tags: ["x", "y z"] }), "Due date: 2026-10-04\nTags: [x, y z]");
});

test("the title column keeps its own name (Notion's \"Source\")", () => {
  const named = parseSchema('```database\n{"title":"Source","properties":[{"name":"Amount","type":"number"}],"views":[]}\n```');
  assert.equal(named.title, "Source");
  assert.deepEqual(allProperties(named).map((p) => [p.name, p.type]), [["Source", "title"], ["Amount", "number"]]);
  assert.equal(visibleProperties(named, named.views[0])[0].name, "Source");
  assert.ok(writeSchema("", named).includes('"title": "Source"'));
  assert.equal(allProperties(parseSchema("```database\n{}\n```"))[0].name, "Name");
});
