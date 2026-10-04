// The Notion HTML importer maps Notion's built-in icons to Lucide icons by name
// (`NOTION_ICONS` in src-tauri/src/importer/notion_html.rs): every name must exist in lucide-react,
// or the page icon would silently fall back to an emoji-less blank.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { icons } from "lucide-react";

const source = readFileSync(new URL("../src-tauri/src/importer/notion_html.rs", import.meta.url), "utf8");
const table = source.slice(source.indexOf("const NOTION_ICONS"), source.indexOf("];", source.indexOf("const NOTION_ICONS")));
const pairs = [...table.matchAll(/\("([a-z0-9-]+)", "([A-Za-z0-9]+)"\)/g)].map((m) => [m[1], m[2]]);

test("the Notion icon table is non-empty", () => assert.ok(pairs.length > 100));

test("every Notion icon maps to a Lucide icon that exists", () => {
  const missing = pairs.filter(([, lucide]) => !icons[lucide]).map(([notion, lucide]) => `${notion} -> ${lucide}`);
  assert.deepEqual(missing, []);
});
