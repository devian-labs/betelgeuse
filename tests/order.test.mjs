import assert from "node:assert/strict";
import { test } from "node:test";
import { joinNote, patchFrontmatter, splitNote } from "../src/lib/frontmatter.ts";
import { nearestGap, planReorder } from "../src/lib/order.ts";
import { buildTree } from "../src/lib/tree.ts";

const note = (path, order = null) => ({ path, title: path.split("/").pop().replace(/\.md$/, ""), icon: null, tags: [], kind: null, ai: null, order, modified: 0, created: 0 });
const titles = (nodes) => nodes.map((n) => n.title).join(" ");

// ---------- tree sort ----------

test("siblings sort by order, unordered pages after them A–Z", () => {
  const tree = buildTree([note("b.md"), note("C.md", 2), note("a.md"), note("D.md", -1), note("E.md", 0.5)]);
  assert.equal(titles(tree), "D E C a b");
});

test("equal orders fall back to A–Z, and non-numbers count as unset", () => {
  const tree = buildTree([note("Zed.md", 1), note("Amy.md", 1), note("Bob.md", "3"), note("Cat.md", Infinity), note("Dan.md", NaN)]);
  assert.equal(titles(tree), "Amy Zed Bob Cat Dan");
});

test("order applies within each folder, and plain folders sort as unordered", () => {
  const tree = buildTree([note("P.md", 2), note("P/x.md"), note("P/y.md", 1), note("Q.md", 1), note("Folder/z.md"), note("Apple.md")]);
  assert.equal(titles(tree), "Q P Apple Folder");
  assert.equal(titles(tree[1].children), "y x");
});

// ---------- renumbering ----------

const sibs = (spec) => spec.split(" ").map((s) => {
  const [path, order] = s.split("=");
  return { path, order: order === undefined ? null : Number(order) };
});

test("dropping between ordered siblings writes only the moved page, at the midpoint", () => {
  // a=1 b=2 c=3 d=4: move d between b and c
  assert.deepEqual(planReorder(sibs("a=1 b=2 c=3 d=4"), "d", 2), { d: 2.5 });
  // A whole number when there is room for one.
  assert.deepEqual(planReorder(sibs("a=1 b=4 c=9"), "c", 1), { c: 3 });
  assert.deepEqual(planReorder(sibs("a=1 b=2.5 c=3"), "a", 2), { a: 2.75 });
});

test("moving to the top or bottom goes one past the end", () => {
  assert.deepEqual(planReorder(sibs("a=1 b=2 c=3"), "c", 0), { c: 0 });
  assert.deepEqual(planReorder(sibs("a=0 b=2 c=3"), "c", 0), { c: -1 });
  assert.deepEqual(planReorder(sibs("a=1 b=2 c=3"), "a", 3), { a: 4 });
  assert.deepEqual(planReorder(sibs("a=1 b=2.5 c=3.5"), "b", 3), { b: 4 });
});

test("the first reorder in a folder numbers every sibling 1..n in the new order", () => {
  assert.deepEqual(planReorder(sibs("a b c d"), "d", 1), { a: 1, d: 2, b: 3, c: 4 });
  assert.deepEqual(planReorder(sibs("a b c"), "a", 0 + 3), { b: 1, c: 2, a: 3 });
  assert.deepEqual(planReorder(sibs("a b c"), "c", 0), { c: 1, a: 2, b: 3 });
});

test("dropping into the unordered tail numbers only the pages up to the drop", () => {
  // a=1 b=2 then unordered c d e: move a below d
  assert.deepEqual(planReorder(sibs("a=1 b=2 c d e"), "a", 4), { c: 3, d: 4, a: 5 });
  // Moving an unordered page up among the ordered ones touches just that page.
  assert.deepEqual(planReorder(sibs("a=1 b=2 c d"), "d", 1), { d: 1.5 });
  assert.deepEqual(planReorder(sibs("a=1 b=2 c d"), "d", 2), { d: 3 });
});

test("dropping where the page already is changes nothing", () => {
  assert.deepEqual(planReorder(sibs("a=1 b=2 c=3"), "b", 1), {});
  assert.deepEqual(planReorder(sibs("a=1 b=2 c=3"), "b", 2), {});
  assert.deepEqual(planReorder(sibs("a b"), "a", 0), {});
  assert.deepEqual(planReorder(sibs("a b"), "x", 0), {});
});

test("no room between equal orders renumbers the ordered siblings", () => {
  assert.deepEqual(planReorder(sibs("a=1 b=1 c=2"), "c", 1), { c: 2, b: 3 });
});

test("the plan reproduces the dropped order when sorted", () => {
  const cases = [
    ["a b c d e", "e", 2],
    ["a=1 b=2 c=3 d e", "b", 5],
    ["a=1 b=2 c=3 d e", "e", 0],
    ["a=1 b=1 c=1 d", "d", 1],
    ["a=-2 b=7 c", "c", 1],
  ];
  for (const [spec, moved, gap] of cases) {
    const before = sibs(spec);
    const writes = planReorder(before, moved, gap);
    const after = before.map((s) => ({ ...s, order: s.path in writes ? writes[s.path] : s.order }));
    const sorted = buildTree(after.map((s) => note(`${s.path}.md`, s.order))).map((n) => n.title);
    const expected = before.map((s) => s.path).filter((p) => p !== moved);
    expected.splice(gap > before.findIndex((s) => s.path === moved) ? gap - 1 : gap, 0, moved);
    assert.deepEqual(sorted, expected, `${spec}: move ${moved} to ${gap}`);
  }
});

test("writing an order keeps the other frontmatter and the body as they were", () => {
  const content = "---\nicon: 🚀\n# a comment\ntags: [a, b]\norder: 2\ncover: gradient_3\n---\n# Title\n\nBody *text*\n";
  const { frontmatter, body } = splitNote(content);
  assert.equal(joinNote(patchFrontmatter(frontmatter, { order: 2.5 }), body), content.replace("order: 2", "order: 2.5"));
  const plain = splitNote("Just text\n");
  assert.equal(joinNote(patchFrontmatter(plain.frontmatter, { order: 1 }), plain.body), "---\norder: 1\n---\nJust text\n");
});

// ---------- drop position ----------

test("the drop goes to the nearest gap between sibling blocks", () => {
  const blocks = [
    { top: 0, bottom: 30 },
    { top: 30, bottom: 150 }, // expanded, with sub-pages
    { top: 150, bottom: 180 },
  ];
  assert.equal(nearestGap(blocks, -20), 0);
  assert.equal(nearestGap(blocks, 10), 0);
  assert.equal(nearestGap(blocks, 20), 1);
  assert.equal(nearestGap(blocks, 40), 1); // on the expanded row: above it
  assert.equal(nearestGap(blocks, 120), 2); // among its sub-pages, nearer the end
  assert.equal(nearestGap(blocks, 170), 3);
  assert.equal(nearestGap([], 5), 0);
});
