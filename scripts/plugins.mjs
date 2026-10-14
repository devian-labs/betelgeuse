#!/usr/bin/env node
// Typechecks and builds every plugin in plugins/ (each into its own dist/, the installable folder).
//
//   node scripts/plugins.mjs            typecheck + build all
//   node scripts/plugins.mjs <id> …     only these
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2);
const dirs = readdirSync(path.join(root, "plugins"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(root, "plugins", d.name, "betelgeuse-plugin.json")))
  .map((d) => path.join(root, "plugins", d.name))
  .filter((d) => !only.length || only.includes(JSON.parse(readFileSync(path.join(d, "betelgeuse-plugin.json"), "utf8")).id));

for (const dir of dirs) {
  const { id, version } = JSON.parse(readFileSync(path.join(dir, "betelgeuse-plugin.json"), "utf8"));
  console.log(`\n▸ ${id} ${version}`);
  const run = (script) => execFileSync("npm", ["run", script, "--prefix", dir], { stdio: "inherit", cwd: root });
  run("typecheck");
  run("build");
}
console.log(`\n${dirs.length} plugin${dirs.length === 1 ? "" : "s"} built.`);
