// The workspace rules, mirroring the tests in crates/betelgeuse-core/src/vault.rs: a page handled by
// the web app must look the same as one handled by the desktop or phone app.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as v from "../lib/vault.ts";

class Mem implements v.Files {
  m = new Map<string, string>();
  constructor(files: Record<string, string> = {}) {
    for (const [k, t] of Object.entries(files)) this.m.set(k, t);
  }
  paths = () => [...this.m.keys()];
  has = (p: string) => this.m.has(p);
  read = (p: string) => this.m.get(p);
  write = (p: string, t: string) => void this.m.set(p, t);
  remove = (p: string) => void this.m.delete(p);
  move = (a: string, b: string) => {
    this.m.set(b, this.m.get(a)!);
    this.m.delete(a);
  };
  times = () => ({ modified: 1, created: 1 });
}

test("long titles fit in a file name", () => {
  const long = `GitHub - owner/repo: ${"轻量级 Web 应用防火墙 ".repeat(20)}`;
  const name = v.sanitizeTitle(long);
  assert.ok(new TextEncoder().encode(name).length <= 200 && !name.endsWith(" "));
  assert.equal(v.sanitizeTitle("Ideas"), "Ideas");
  assert.equal(v.sanitizeTitle('a/b: "c"'), "a b c");
  assert.equal(v.sanitizeTitle(".hidden"), "Untitled");
});

test("parses frontmatter", () => {
  const [fm, body] = v.splitFrontmatter('---\ntitle: "A"\ntags: [x, "y"]\norder: 2.5\nai: no\nlist:\n  - one\n  - two\n---\nBody\n');
  assert.equal(body, "Body\n");
  assert.equal(v.fmValue(fm, "title"), "A");
  assert.deepEqual(v.fmList(fm, "tags"), ["x", "y"]);
  assert.deepEqual(v.fmList(fm, "list"), ["one", "two"]);
  assert.equal(v.fmNumber(fm, "order"), 2.5);
  assert.equal(v.fmBool(fm, "ai"), false);
  assert.deepEqual(v.splitFrontmatter("no front\n---\n"), ["", "no front\n---\n"]);
  assert.deepEqual(v.splitFrontmatter("---\nnever closed"), ["", "---\nnever closed"]);
});

test("sets and removes frontmatter strings", () => {
  assert.equal(v.setFmString("Body", "title", "A"), '---\ntitle: "A"\n---\nBody');
  assert.equal(v.setFmString('---\ntitle: "A"\nicon: x\n---\nBody', "title", null), "---\nicon: x\n---\nBody");
  assert.equal(v.setFmString('---\ntitle: "A"\n---\nBody', "title", null), "Body");
});

test("moves pages with their sub-pages and links", () => {
  const f = new Mem({ "Home.md": "See [[Work/Plan]], [[Work/Plan/Step|the step]] and [[Plan]].", "Work/Plan.md": "x", "Work/Plan/Step.md": "s", "Ideas/Plan.md": "y" });
  assert.equal(v.moveNote(f, "Work/Plan.md", "Home"), "Home/Plan.md");
  assert.ok(f.has("Home/Plan/Step.md") && !f.paths().some((p) => p.startsWith("Work/")));
  assert.equal(f.read("Home.md"), "See [[Home/Plan]], [[Home/Plan/Step|the step]] and [[Plan]].");
  assert.throws(() => v.moveNote(f, "Home.md", "Home/Plan"), /inside itself/);
  assert.equal(v.moveNote(f, "Ideas/Plan.md", ""), "Plan.md");
  assert.equal(v.moveNote(f, "Plan.md", ""), "Plan.md");
});

test("database rows follow their order", () => {
  const f = new Mem({ "Db.md": "", "Db/Apple.md": "---\norder: 3\n---\n", "Db/Mango.md": "---\norder: 2\n---\n", "Db/Zebra.md": "---\norder: 1\n---\n", "Db/New row.md": "", "Db/Sub/Deep.md": "", "Db/.hidden.md": "" });
  assert.deepEqual(v.databaseRows(f, "Db.md").map((r) => r.title), ["Zebra", "Mango", "Apple", "New row"]);
});

test("finds and rewrites links", () => {
  assert.deepEqual(v.wikilinks("see [[Ideas]] and [[Ideas|my ideas]] and [[Other#h]]"), ["Ideas", "Ideas", "Other"]);
  const f = new Mem({ "Ideas.md": "", "A.md": "[[ideas#a]] [[Ideas 2]] [[My Ideas]] [[Ideas|x]]" });
  assert.equal(v.renameNote(f, "Ideas.md", "Plans"), "Plans.md");
  assert.equal(f.read("A.md"), "[[Plans#a]] [[Ideas 2]] [[My Ideas]] [[Plans|x]]");
  assert.ok(v.linkMatches("ideas", "Ideas.md") && v.linkMatches("Welcome/Ideas", "Welcome/Ideas.md"));
});

test("relations in frontmatter are backlinks and follow renames", () => {
  const f = new Mem({ "Areas/Projects/Khao.md": "", "Tasks/Design.md": '---\nProject: ["[[Khao]]"]\n---\n', "Areas/Projects.md": "", "Areas.md": "", "Tasks.md": '---\nrel: "[[Areas/Projects]]"\n---\n' });
  assert.deepEqual(v.backlinks(f, "Areas/Projects/Khao.md").map((n) => n.path), ["Tasks/Design.md"]);
  v.renameNote(f, "Areas/Projects/Khao.md", "Khaoo");
  assert.equal(f.read("Tasks/Design.md"), '---\nProject: ["[[Khaoo]]"]\n---\n');
  v.renameNote(f, "Areas/Projects.md", "Products");
  assert.ok(f.has("Areas/Products/Khaoo.md"));
  assert.ok(f.read("Tasks.md")!.includes('"[[Areas/Products]]"'));
});

test("AI visibility inherits from parent pages", () => {
  const f = new Mem({ "Open.md": "", "Secret.md": "---\nai: false\n---\n", "Secret/Child.md": "", "Shared.md": "---\nai: true\n---\n", "Shared/Child.md": "" });
  assert.ok(v.aiVisible(f, "Open.md", "all"));
  assert.ok(!v.aiVisible(f, "Secret.md", "all"));
  assert.ok(!v.aiVisible(f, "Secret/Child.md", "all"));
  assert.ok(!v.aiVisible(f, "Open.md", "shared"));
  assert.ok(v.aiVisible(f, "Shared/Child.md", "shared"));
  v.setAiPolicy(f, "shared");
  assert.equal(v.aiPolicy(f), "shared");
});

test("trash round trip", () => {
  const f = new Mem({ "Projects.md": "---\nicon: 🚀\n---\n", "Projects/Plan.md": "plan" });
  const id = v.deleteNote(f, "Projects.md", 1000);
  assert.ok(!f.has("Projects.md") && !f.has("Projects/Plan.md"));
  const items = v.listTrash(f, 2000);
  assert.deepEqual([items.length, items[0].pages, items[0].icon], [1, 2, "🚀"]);
  assert.equal(v.listNotes(f).length, 0, "trash is not part of the page tree");
  f.write("Projects.md", "new");
  assert.equal(v.restoreTrash(f, id), "Projects 2.md");
  assert.equal(f.read("Projects 2/Plan.md"), "plan");
  assert.equal(v.listTrash(f, 2000).length, 0);
  v.deleteNote(f, "Projects.md", 1000);
  assert.equal(v.listTrash(f, 1000 + 31 * 24 * 3600 * 1000).length, 0, "gone after 30 days");
  assert.throws(() => v.purgeTrash(f, "../x"), /invalid trash id/);
});

test("pages in one place can share a name", () => {
  const f = new Mem({ "Budget.md": "" });
  const [a, b, c] = [v.createNote(f, "Budget.md", "Salary"), v.createNote(f, "Budget.md", "Salary"), v.createNote(f, "Budget.md", "Salary")];
  assert.deepEqual([a, b, c], ["Budget/Salary.md", "Budget/Salary 2.md", "Budget/Salary 3.md"]);
  assert.ok(v.listNotes(f).filter((n) => n.path !== "Budget.md").every((n) => n.title === "Salary"));
  assert.equal(f.read(a), "", "a name that fits its file needs no frontmatter");
  assert.equal(f.read(b), '---\ntitle: "Salary"\n---\n');
  f.write(c, "---\nAmount: 10\n---\nBody\n");
  const bonus = v.renameNote(f, c, "Bonus");
  assert.equal(bonus, "Budget/Bonus.md");
  assert.equal(f.read(bonus), "---\nAmount: 10\n---\nBody\n");
  assert.equal(v.renameNote(f, b, "Salary"), b, "same name: nothing to do");
  const odd = v.renameNote(f, bonus, 'Rent: Jan/Feb "paid"');
  assert.equal(odd, "Budget/Rent Jan Feb paid.md");
  assert.equal(v.listNotes(f).find((n) => n.path === odd)!.title, 'Rent: Jan/Feb "paid"');
  const copy = v.duplicateNote(f, b);
  assert.equal(v.pageTitle(copy, v.splitFrontmatter(f.read(copy)!)[0]), "Salary copy");
});

test("refuses paths that escape the workspace", () => {
  for (const bad of ["", "/etc/passwd", "../x.md", "a/../../b.md", "a//b.md", "a\\b.md"]) assert.throws(() => v.resolve(bad));
  assert.equal(v.resolve("a/b.md"), "a/b.md");
});

test("search scores titles, tags and bodies", () => {
  const f = new Mem({ "Alpha.md": "---\ntags: [beta]\n---\nnothing", "Beta.md": "beta beta", "Gamma.md": "one beta here", "None.md": "zzz" });
  const hits = v.search(f, "beta");
  assert.deepEqual(hits.map((h) => h.path), ["Beta.md", "Alpha.md", "Gamma.md"]);
  assert.equal(hits[0].score, 102);
  assert.ok(hits[2].snippet.includes("beta"));
  assert.deepEqual(v.search(f, "  "), []);
});
