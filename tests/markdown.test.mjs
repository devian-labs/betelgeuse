// Markdown must survive a load/save cycle through the editor unchanged, or every
// open-and-save would produce noisy git diffs. Runs the editor's real extensions headless.
import { Window } from "happy-dom";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const window = new Window({ url: "http://localhost" });
for (const key of ["window", "document", "navigator", "Node", "HTMLElement", "Element", "DOMParser", "getComputedStyle", "MutationObserver", "localStorage", "requestAnimationFrame", "Event", "CustomEvent", "KeyboardEvent", "MouseEvent"]) {
  if (key === "navigator") globalThis[key] ??= window[key];
  else globalThis[key] = window[key] ?? window;
}

const { Editor } = await import("@tiptap/core");
const { contentExtensions } = await import("../src/editor/Editor.tsx");
const { normalizeMarkdown } = await import("../src/editor/markdown.ts");
const { joinNote, readFrontmatter, splitNote } = await import("../src/lib/frontmatter.ts");
const { parseSchema } = await import("../src/database/model.ts");

function roundTrip(md) {
  // Node views need a mounted React tree; serialisation doesn't, so strip them here.
  const extensions = contentExtensions().map((e) => (e.config.addNodeView ? e.extend({ addNodeView: undefined }) : e));
  const editor = new Editor({ extensions, content: md, contentType: "markdown" });
  const out = normalizeMarkdown(editor.getMarkdown());
  editor.destroy();
  return out;
}

const same = (md) => assert.equal(roundTrip(md).trim(), md.trim());

// ---------- seed workspace (src-tauri/seed mirrors the pages a new workspace starts with) ----------

const SEED = fileURLToPath(new URL("../src-tauri/seed/", import.meta.url));
const seed = readdirSync(SEED, { recursive: true })
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.split("\\").join("/"))
  .sort()
  .map((path) => ({ path, content: readFileSync(SEED + path, "utf8") }));
const titleOf = (path) => path.split("/").pop().replace(/\.md$/, "");

/** Same rules as `wikilinks` in src-tauri/src/vault.rs, so code spans and embeds count too. */
const wikilinks = (text) =>
  text
    .split("[[")
    .slice(1)
    .flatMap((chunk) => {
      const end = chunk.indexOf("]]");
      const target = end < 0 ? "" : chunk.slice(0, end).split(/[|#]/)[0].trim();
      return target && !target.includes("\n") ? [target] : [];
    });

test("seed has its pages", () => {
  for (const page of ["Welcome.md", "Ideas.md", "Roadmap.md"]) assert.ok(seed.some((s) => s.path === page), page);
  assert.ok(seed.length > 10);
});

for (const { path, content } of seed) {
  const { frontmatter, body } = splitNote(content);
  if (readFrontmatter(frontmatter).type === "database") {
    test(`seed database "${path}" has a schema`, () => assert.ok(parseSchema(body).properties.length > 0));
  } else {
    // Byte-for-byte: what the editor would save after opening the page must equal the file.
    test(`seed page "${path}" round-trips unchanged`, () => assert.equal(joinNote(frontmatter, roundTrip(body)), content));
  }
}

test("every [[link]] in the seed points at a seed page", () => {
  const resolves = (target) =>
    seed.some(({ path }) => [titleOf(path), path.replace(/\.md$/, "")].some((t) => t.toLowerCase() === target.replace(/\.md$/, "").toLowerCase()));
  const broken = seed.flatMap(({ path, content }) => wikilinks(content).filter((t) => !resolves(t)).map((t) => `${path} -> [[${t}]]`));
  assert.deepEqual(broken, []);
  const titles = seed.map(({ path }) => titleOf(path).toLowerCase());
  assert.equal(new Set(titles).size, titles.length, "page titles are unique, so links are unambiguous");
});

test("the Welcome page links to every guide page", () => {
  const welcome = wikilinks(seed.find((s) => s.path === "Welcome.md").content);
  const missing = seed.filter(({ path }) => path.startsWith("Welcome/") && !welcome.includes(titleOf(path))).map((s) => s.path);
  assert.deepEqual(missing, []);
});

test("wikilinks", () => same("See [[Ideas]] and [[Projects/Launch|the launch]]."));

test("nested lists, tasks and code", () => same("- one\n  - nested\n- two\n\n1. first\n2. second\n\n- [ ] todo\n- [x] done\n\n```ts\nconst a = 1;\n```"));

test("tables keep single blank lines around them", () => same("Para\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\nAfter"));

test("trailing empty paragraphs are dropped and files end with one newline", () => {
  assert.equal(roundTrip("Hello\n\n| a |\n| - |\n| 1 |\n\n&nbsp;\n\n&nbsp;"), "Hello\n\n| a   |\n| --- |\n| 1   |\n");
  assert.equal(roundTrip("- Weekly review template\n- Reading list\n"), "- Weekly review template\n- Reading list\n");
});

test("text and background colours", () =>
  same('Some <span data-color="red">red **bold**</span> and <span data-bg="yellow">highlighted</span> and <span data-color="blue" data-bg="gray">both</span>.'));

test("callouts", () => same("> [!yellow] 💡\n> A tip with **bold**.\n>\n> - and a list"));

test("toggles, including nested ones", () =>
  same("<details>\n<summary>Click to expand</summary>\n\nHidden **content**.\n\n<details open>\n<summary>Inner</summary>\n\nDeep.\n\n</details>\n\n</details>"));

test("columns", () => same('<div class="columns">\n<div class="column">\n\nLeft side\n\n</div>\n<div class="column">\n\n- right\n- list\n\n</div>\n</div>'));

test("database embeds", () => same("Intro\n\n![[Roadmap]]\n\nOutro"));

test("code block languages", () => same("```python\nprint('hi')\n```\n\n```\nplain\n```"));

test("colour spanning bold text stays one well-formed span", () =>
  same('<span data-bg="red">Plain then **bold words** and `code` then plain.</span>'));

// ---------- Notion import (src-tauri/src/importer.rs) ----------

/** Byte-for-byte: what the editor writes back must equal the input. */
const exact = (md) => assert.equal(roundTrip(md), md);

test("a page may start with a table", () => exact("| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\nAfter\n"));

test("imported tables: multi-line cells use <br>, paragraph breaks <br><br>", () => {
  exact(
    [
      "| Products                                                      | Services                        |",
      "| ------------------------------------------------------------- | ------------------------------- |",
      "| **Desktop**<br><br>**The control center.**<br>Built for devs. | **Software**<br><br>End-to-end. |",
      "|                                                               | **Gigs**<br>• one<br>• two      |",
      "",
    ].join("\n"),
  );
  // Links (with aliases, escaped inside cells), code with pipes and wide characters keep their padding.
  exact("| Page                 | Code     | 名前  |\n| -------------------- | -------- | --- |\n| [[Tasks\\|the tasks]] | `a \\| b` | 💡x |\n");
});

test("imported callouts", () => {
  exact("> [!gray] 💡\n> Control center for everything.\n");
  exact("> [!gray] 📢\n> - one\n>   - nested\n>\n> Second paragraph.\n");
  exact("> [!yellow] 💡\n> # Meet Rahul\n>\n> Text.\n");
  exact("> [!gray] 💡\n>\n");
});

test("imported lists, embeds and files", () => {
  exact("- [x] done\n- [ ] todo\n  - [ ] sub\n- [ ] \n\n1. first\n   - inner\n");
  exact("![[Tasks]]\n\n![[Notion import/Private & Shared/Library 2]]\n\n### Domains\n");
  exact("![image.png](.assets/notion-0/a-image.png)\n\n[Contract.pdf](.assets/notion-0/a-Contract.pdf)\n\n---\n\nAfter\n");
});

test("HTML-imported colours, highlights and callout colours", () => {
  exact('Some <span data-color="green">green **bold**</span> text and <span data-bg="red">the plan</span>.\n');
  exact('**<span data-color="green">Desktop</span>** and *<span data-color="red">it</span>*\n');
  exact('<span data-color="purple">A purple paragraph.</span>\n\n## <span data-bg="red">Head</span>\n');
  exact("> [!blue] 💡\n> Control center.\n\n> [!green] ✏️\n> Your private space.\n\n> [!gray] lucide:Bell:yellow\n> **Tip**: a callout with a list.\n>\n> - one\n");
});

test("HTML-imported toggles, columns and tables with breaks", () => {
  exact('<details open>\n<summary>Read <span data-color="gray">more</span></summary>\n\nHidden **text**.\n\n- inside\n\n</details>\n');
  exact("<details open>\n<summary>**Phase 1 &amp; 2**</summary>\n\n- [x] Init `repo`.\n  - [ ] Sub task\n\n</details>\n");
  exact("<details>\n<summary>Empty</summary>\n\n\n\n</details>\n");
  exact('<div class="columns">\n<div class="column">\n\n![[Tasks]]\n\n</div>\n<div class="column">\n\nSee [[Launch]] and <span data-bg="red">the plan</span>.\n\n</div>\n</div>\n');
  exact(
    [
      '| <span data-bg="gray">Products</span>                                                        | Services                                 |',
      "| ------------------------------------------------------------------------------------------- | ---------------------------------------- |",
      '| **<span data-color="green">Desktop</span>**<br><br>**The control center.**<br>Built \\| ops. | [Services](https://example.com/services) |',
      "",
    ].join("\n"),
  );
  // Tables in a callout get the blank lines the editor writes around them.
  exact("> [!gray] 💡\n> a\n>\n>\n> | x   |\n> | --- |\n> | y   |\n>\n");
});

test("HTML-imported lists, links and line breaks", () => {
  exact("- a  \nb\n\n- [ ] a\n\n  b\n- [x] c\n\n1. first\n   1. inner\n2. second\n");
  exact("- a\n![](https://x.y/a.png)\n");
  exact("Mail [team@example.com](mailto:team@example.com) or [https://a.b/c\\_d](https://a.b/c_d).\n");
  exact("> Ship *small*.  \n> Ship often.\n\n---\n\n- \n\nafter\n");
});

// The importers' output for synthetic exports with every Notion quirk (regenerated by the Rust
// tests `notion_import_fixture` and `notion_html_import_fixture`) must survive opening and
// saving each page unchanged.
for (const dir of ["notion-import", "notion-html-import"]) {
  const IMPORTED = fileURLToPath(new URL(`./fixtures/${dir}/`, import.meta.url));
  const imported = readdirSync(IMPORTED, { recursive: true })
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.split("\\").join("/"))
    .sort();

  test(`the ${dir} fixture exists`, () => assert.ok(imported.length >= 10));

  for (const path of imported) {
    const content = readFileSync(IMPORTED + path, "utf8");
    const { frontmatter, body } = splitNote(content);
    if (readFrontmatter(frontmatter).type === "database") {
      test(`${dir}: database "${path}" has a schema`, () => assert.ok(parseSchema(body).properties.length > 0));
    } else {
      test(`${dir}: page "${path}" round-trips unchanged`, () => assert.equal(joinNote(frontmatter, roundTrip(body)), content));
    }
  }
}

test("pressing Enter starts the next block without the colour", () => {
  const extensions = contentExtensions().map((e) => (e.config.addNodeView ? e.extend({ addNodeView: undefined }) : e));
  const editor = new Editor({ extensions, content: "" });
  // tr.insertText applies the stored formatting, like real typing does (insertContent would not).
  const type = (text) => editor.view.dispatch(editor.state.tr.insertText(text));
  editor.commands.setColor({ color: "red" });
  type("red");
  editor.commands.splitBlock(); // what Enter runs in a paragraph
  type("plain");
  assert.equal(normalizeMarkdown(editor.getMarkdown()), '<span data-color="red">red</span>\n\nplain\n');
  // Choosing a colour on an empty line still applies to what you type next.
  editor.commands.splitBlock();
  editor.commands.setColor({ bg: "yellow" });
  type("kept");
  assert.match(editor.getMarkdown(), /<span data-bg="yellow">kept<\/span>/);
  editor.destroy();
});
