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
