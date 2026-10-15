import assert from "node:assert/strict";
import { test } from "node:test";
import { searchCommands } from "../src/editor/commandSearch.ts";

// The slash menu's entries (ids, titles, keywords), in menu order.
const MENU = [
  ["text", "Text", "paragraph plain"],
  ["page", "Page", "subpage"],
  ["todo", "To-do list", "task checkbox"],
  ["h1", "Heading 1", "title big"],
  ["h2", "Heading 2", "subtitle"],
  ["h3", "Heading 3", ""],
  ["table", "Table", "grid simple"],
  ["bullet", "Bulleted list", "ul unordered"],
  ["number", "Numbered list", "ol ordered"],
  ["toggle", "Toggle list", "details collapse expand"],
  ["quote", "Quote", "blockquote"],
  ["divider", "Divider", "hr rule line"],
  ["callout", "Callout", "note info warning tip"],
  ["code", "Code", "snippet pre"],
  ["col2", "2 columns", "layout side"],
  ["color-red", "Red", "color text"],
].map(([id, title, keywords]) => ({ id, title, keywords }));

const first = (q) => searchCommands(MENU, q)[0]?.id;

test("short forms find their block first", () => {
  assert.equal(first("h1"), "h1");
  assert.equal(first("h2"), "h2");
  assert.equal(first("h3"), "h3");
  assert.equal(first("todo"), "todo");
  assert.equal(first("ul"), "bullet");
  assert.equal(first("ol"), "number");
  assert.equal(first("hr"), "divider");
  assert.equal(first("bl"), "bullet");
  assert.equal(first("nl"), "number");
  assert.equal(first("2c"), "col2");
});

test("titles match without spaces, and by the start of each word", () => {
  assert.equal(first("heading3"), "h3");
  assert.equal(first("heading 3"), "h3");
  assert.equal(first("head 2"), "h2");
  assert.equal(first("num li"), "number");
  assert.equal(first("to-do"), "todo");
});

test("a title's start beats a keyword, and ties keep menu order", () => {
  assert.deepEqual(searchCommands(MENU, "t").map((c) => c.id).slice(0, 4), ["text", "todo", "table", "toggle"]);
  assert.equal(first("checkbox"), "todo");
  assert.equal(first("call"), "callout");
});

test("nothing matching finds nothing", () => {
  assert.deepEqual(searchCommands(MENU, "zzz"), []);
  assert.deepEqual(searchCommands(MENU, "h4"), []);
});
