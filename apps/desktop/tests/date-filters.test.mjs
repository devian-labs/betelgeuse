import assert from "node:assert/strict";
import { test } from "node:test";
import { applyView, dateMatches, dateRange, describeDateFilter, filterDefaults, isoDay, relativeRange } from "../src/database/model.ts";

const on = (y, m, d) => new Date(y, m - 1, d, 15, 30);
const thursday = on(2026, 10, 15);

test("relative ranges, weeks starting on Monday", () => {
  assert.deepEqual(relativeRange("today", thursday), { from: "2026-10-15", to: "2026-10-15" });
  assert.deepEqual(relativeRange("yesterday", thursday), { from: "2026-10-14", to: "2026-10-14" });
  assert.deepEqual(relativeRange("this_week", thursday), { from: "2026-10-12", to: "2026-10-18" });
  assert.deepEqual(relativeRange("last_week", thursday), { from: "2026-10-05", to: "2026-10-11" });
  assert.deepEqual(relativeRange("this_month", thursday), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(relativeRange("last_month", thursday), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(relativeRange("last_year", thursday), { from: "2025-01-01", to: "2025-12-31" });
  assert.deepEqual(relativeRange("past_7_days", thursday), { from: "2026-10-09", to: "2026-10-15" });
  assert.deepEqual(relativeRange("next_30_days", thursday), { from: "2026-10-15", to: "2026-11-13" });
  // Sunday belongs to the week that started the Monday before.
  assert.deepEqual(relativeRange("this_week", on(2026, 10, 18)), { from: "2026-10-12", to: "2026-10-18" });
  // Across the turn of the year, and February's length.
  assert.deepEqual(relativeRange("last_month", on(2026, 1, 10)), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(relativeRange("next_month", on(2028, 1, 31)), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(relativeRange("someday", thursday), null);
});

test("ranges, open at either end", () => {
  const between = (v, day) => dateMatches(day, "between", v, thursday);
  assert.ok(between(dateRange("2026-01-01", "2026-03-31"), "2026-01-01"));
  assert.ok(between(dateRange("2026-01-01", "2026-03-31"), "2026-03-31"));
  assert.ok(!between(dateRange("2026-01-01", "2026-03-31"), "2026-04-01"));
  assert.ok(between(dateRange("2026-01-01"), "2030-01-01"));
  assert.ok(!between(dateRange(undefined, "2026-01-01"), "2026-01-02"));
  assert.ok(dateMatches("2026-09-15", "within", "last_month", thursday));
  assert.ok(!dateMatches("2026-10-01", "within", "last_month", thursday));
});

test("chips read naturally", () => {
  assert.equal(describeDateFilter({ property: "Date", op: "within", value: "last_month" }), "is last month");
  assert.match(describeDateFilter({ property: "Date", op: "between", value: "2026-01-01..2026-03-31" }), /^is Jan 1, 2026 – Mar 31, 2026$/);
  assert.match(describeDateFilter({ property: "Date", op: "between", value: "2026-01-01.." }), /^is on or after Jan 1, 2026$/);
  assert.match(describeDateFilter({ property: "Date", op: "between", value: "..2026-03-31" }), /^is on or before Mar 31, 2026$/);
  assert.equal(describeDateFilter({ property: "Date", op: "within" }), "is within…");
});

test("views filter by relative dates, and new pages land inside the range", () => {
  const schema = { properties: [{ name: "Name", type: "title" }, { name: "Date", type: "date" }], views: [] };
  const today = isoDay(new Date());
  const lastYear = `${new Date().getFullYear() - 1}-06-15`;
  const rows = [
    { path: "a.md", title: ["Now"], values: { Date: today }, body: "", modified: 0, created: 0 },
    { path: "b.md", title: ["Old"], values: { Date: lastYear }, body: "", modified: 0, created: 0 },
  ];
  const view = (filters) => ({ id: "v", name: "T", type: "table", filters });
  const titles = (filters) => applyView(rows.map((r) => ({ ...r, title: r.title[0] })), schema, view(filters), "").map((r) => r.title);
  assert.deepEqual(titles([{ property: "Date", op: "within", value: "this_year" }]), ["Now"]);
  assert.deepEqual(titles([{ property: "Date", op: "within", value: "last_year" }]), ["Old"]);
  assert.deepEqual(titles([{ property: "Date", op: "within" }]).length, 2); // unfinished: hides nothing
  assert.deepEqual(filterDefaults(schema, view([{ property: "Date", op: "within", value: "this_month" }])), { Date: today });
  const lastYearRange = relativeRange("last_year");
  assert.deepEqual(filterDefaults(schema, view([{ property: "Date", op: "within", value: "last_year" }])), { Date: lastYearRange.to });
});
