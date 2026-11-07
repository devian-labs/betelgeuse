// Writes public/starter-pages.json: the pages a new workspace starts with (packages/starter-pages), for
// the demo and for new repositories. Welcome.desktop.md and Welcome.phone.md are for those apps.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const pages = join(web, "../../packages/starter-pages");
const out = join(web, "public/starter-pages.json");

const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (!/^Welcome\..+\.md$/.test(name)) files[relative(pages, path).split("\\").join("/")] = readFileSync(path, "utf8");
  }
};
walk(pages);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(files));
console.log(`Wrote ${Object.keys(files).length} files to public/starter-pages.json`);
