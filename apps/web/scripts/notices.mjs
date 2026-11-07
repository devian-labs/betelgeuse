// Writes public/third-party-notices.txt: the licenses of everything the web app ships.
// Same idea as apps/desktop/scripts/notices.mjs, for this app's npm packages alone.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(web, "public/third-party-notices.txt");
const cli = process.env.npm_execpath;
const args = ["ls", "--omit=dev", "--all", "--long", "--json", "-w", "@betelgeuse/web"];
const options = { cwd: web, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] };
const run = () => {
  try {
    return cli?.endsWith(".js") ? execFileSync(process.execPath, [cli, ...args], options) : execFileSync("npm", args, { ...options, shell: process.platform === "win32" });
  } catch (e) {
    return e.stdout; // npm exits non-zero over optional packages not installed on this machine
  }
};

const packages = new Map();
const walk = (node) => {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    const where = dep.path?.replace(/\\/g, "/");
    const ours = dep.resolved?.startsWith("file:") || where?.includes("/apps/") || where?.includes("/packages/");
    if (!ours && dep.version) packages.set(`${name}@${dep.version}`, { name, version: dep.version, license: typeof dep.license === "string" ? dep.license : dep.license?.type, dir: dep.path });
    walk(dep);
  }
};
walk(JSON.parse(run()));

const texts = (dir) =>
  dir && existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /^(licen[cs]e|copying|notice)([-._].*)?$/i.test(f))
        .sort()
        .map((f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trim())
        .filter(Boolean)
    : [];
const groups = new Map();
for (const p of [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const text = texts(p.dir).join("\n\n") || `Licensed under ${p.license ?? "the terms in its package"}.`;
  groups.set(text, [...(groups.get(text) ?? []), `${p.name} ${p.version}`]);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `Open-source software in Betelgeuse for the web\n\n${[...groups].map(([text, names]) => `${names.join("\n")}\n\n${text}`).join(`\n\n${"-".repeat(72)}\n\n`)}\n`);
console.log(`Wrote ${packages.size} packages (${groups.size} license texts) to public/third-party-notices.txt`);
