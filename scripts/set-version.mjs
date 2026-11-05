#!/usr/bin/env node
// Sets the app's version everywhere it is written down, so a release tag and the built files agree.
//
//   npm run version:set 0.2.0
//
// Then merge it through a pull request (main is protected), and tag the merged commit; see
// CONTRIBUTING.md, "Releasing".
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("usage: npm run version:set <major.minor.patch>   e.g. 0.2.0 or 0.2.0-beta.1");
  process.exit(1);
}

/** Replaces exactly one match of `re` in a file, so a missed or ambiguous spot fails loudly. */
function replaceOnce(file, re, to) {
  const abs = path.join(root, file);
  const text = readFileSync(abs, "utf8");
  const hits = text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)) ?? [];
  if (hits.length !== 1) throw new Error(`${file}: expected one version to update, found ${hits.length}`);
  writeFileSync(abs, text.replace(re, to));
  console.log(`  ${file}`);
}

function setJson(file, edit) {
  const abs = path.join(root, file);
  const json = JSON.parse(readFileSync(abs, "utf8"));
  edit(json);
  writeFileSync(abs, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`  ${file}`);
}

console.log(`Setting version ${version}:`);
replaceOnce("apps/desktop/src-tauri/tauri.conf.json", /("version":\s*)"[^"]+"/, `$1"${version}"`);
replaceOnce("apps/desktop/src-tauri/Cargo.toml", /^(version\s*=\s*)"[^"]+"/m, `$1"${version}"`);
replaceOnce("Cargo.lock", /(name = "betelgeuse"\nversion = )"[^"]+"/, `$1"${version}"`);
replaceOnce("Cargo.lock", /(name = "betelgeuse-mobile"\nversion = )"[^"]+"/, `$1"${version}"`);
replaceOnce("apps/mobile/src-tauri/tauri.conf.json", /("version":\s*)"[^"]+"/, `$1"${version}"`);
replaceOnce("apps/mobile/src-tauri/Cargo.toml", /^(version\s*=\s*)"[^"]+"/m, `$1"${version}"`);
setJson("apps/desktop/package.json", (j) => (j.version = version));
setJson("apps/mobile/package.json", (j) => (j.version = version));
setJson("packages/mcp/package.json", (j) => (j.version = version));
setJson("package-lock.json", (j) => {
  for (const ws of ["apps/desktop", "apps/mobile", "packages/mcp"]) if (j.packages?.[ws]) j.packages[ws].version = version;
});
replaceOnce("packages/mcp/src/index.ts", /(new McpServer\(\{ name: "betelgeuse", version: )"[^"]+"/, `$1"${version}"`);
console.log(`\nNext: commit "release: v${version}" and merge it through a pull request, then on the merged main:\n  git tag v${version} && git push origin v${version}`);
