// Writes public/third-party-notices.txt: the licenses of everything the app ships. Their licenses
// (MIT, Apache-2.0, BSD, ISC, …) ask for their notices to travel with copies of the software.
//
// - npm packages bundled into the app's interface and the MCP server it ships (production
//   dependencies of @betelgeuse/desktop and betelgeuse-mcp)
// - Rust crates compiled into the app (normal dependencies of src-tauri, for every platform)
//
// Packages with the same license text are listed together under one copy of it.
// Runs before every build: `node scripts/notices.mjs`.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(desktop, "public/third-party-notices.txt");

/** The license, notice and copying files at the top of a package's folder. */
function licenseTexts(dir) {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^(licen[cs]e|copying|notice)([-._].*)?$/i.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trim())
    .filter(Boolean);
}

/** name@version -> { name, version, license, dir } */
const packages = new Map();
const add = (name, version, license, dir) => {
  const key = `${name}@${version}`;
  if (!packages.has(key)) packages.set(key, { name, version, license: license || "see text", dir });
};

/**
 * Runs npm. Under `npm run`, npm_execpath is npm's own CLI script, which runs with this Node on every
 * platform. Otherwise fall back to the command; on Windows that is `npm.cmd`, which Node can only
 * start through a shell (a plain execFileSync("npm") fails there with ENOENT).
 */
function runNpm(args, options) {
  const cli = process.env.npm_execpath;
  if (cli && /\.[cm]?js$/.test(cli)) return execFileSync(process.execPath, [cli, ...args], options);
  return execFileSync("npm", args, { ...options, shell: process.platform === "win32" });
}

// npm: the production dependency trees of the app and the MCP server, without the workspaces themselves.
const npm = JSON.parse(
  runNpm(["ls", "--omit=dev", "--all", "--long", "--json", "-w", "@betelgeuse/desktop", "-w", "betelgeuse-mcp"], {
    cwd: desktop,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
);
const walk = (node) => {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    // Paths use \ on Windows, so compare with forward slashes.
    const where = dep.path?.replace(/\\/g, "/");
    const workspace = dep.resolved?.startsWith("file:") || where?.includes("/apps/") || where?.includes("/packages/");
    if (!workspace && dep.version) add(name, dep.version, typeof dep.license === "string" ? dep.license : dep.license?.type, dep.path);
    walk(dep);
  }
};
walk(npm);

// Rust: crates reachable from the app through normal (not dev- or build-only) dependencies.
const meta = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--manifest-path", join(desktop, "src-tauri/Cargo.toml")], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }),
);
const byId = new Map(meta.packages.map((p) => [p.id, p]));
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
const queue = [meta.resolve.root];
const reached = new Set(queue);
while (queue.length) {
  for (const dep of nodes.get(queue.shift())?.deps ?? []) {
    if (!dep.dep_kinds.some((k) => k.kind === null) || reached.has(dep.pkg)) continue;
    reached.add(dep.pkg);
    queue.push(dep.pkg);
  }
}
for (const id of reached) {
  const p = byId.get(id);
  if (id === meta.resolve.root || !p) continue;
  add(p.name, p.version, p.license ?? (p.license_file ? "see text" : null), dirname(p.manifest_path));
}

// Group by license text.
const groups = new Map();
for (const p of [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))) {
  const texts = licenseTexts(p.dir);
  const text = texts.length ? texts.join("\n\n---\n\n") : `${p.license} (the package includes no license file; see https://spdx.org/licenses/)`;
  if (!groups.has(text)) groups.set(text, []);
  groups.get(text).push(p);
}

const rule = "=".repeat(78);
const body = [...groups]
  .sort(([, a], [, b]) => b.length - a.length)
  .map(([text, list]) => `${rule}\n${list.map((p) => `${p.name} ${p.version} (${p.license})`).join("\n")}\n${rule}\n\n${text}\n`)
  .join("\n\n");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `Betelgeuse includes the open-source software listed below, under the licenses that follow each list.\n` +
    `${packages.size} packages in total.\n\n${body}`,
);
console.log(`Wrote ${packages.size} packages (${groups.size} license texts) to public/third-party-notices.txt`);
