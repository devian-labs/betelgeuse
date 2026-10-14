#!/usr/bin/env node
// Packages every plugin in plugins/ for the plugin store: builds it, zips its dist/ folder, and
// signs the zip. Writes to dist-plugins/:
//   plugin-<id>-<version>.zip   one per plugin
//   plugins.json                the store's index (manifest fields, zip URL, SHA-256, signature)
//
//   PLUGIN_SIGNING_KEY="$(cat key.pem)" node scripts/package-plugins.mjs
//   node scripts/package-plugins.mjs --key ~/.betelgeuse/plugin-signing-key.pem
//
// The release workflow runs this and attaches the files to the release; the app reads
// releases/latest/download/plugins.json. Without a key, packages are unsigned: only development
// builds of the app install those.
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-plugins");
const keyArg = process.argv.indexOf("--key");
const pem = keyArg > 0 ? readFileSync(process.argv[keyArg + 1], "utf8") : process.env.PLUGIN_SIGNING_KEY;
const key = pem?.trim() ? createPrivateKey(pem) : null;
if (!key) console.warn("No signing key (PLUGIN_SIGNING_KEY or --key): packages will be unsigned.");

execFileSync("node", [path.join(root, "scripts/plugins.mjs")], { stdio: "inherit" });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const plugins = [];
for (const name of readdirSync(path.join(root, "plugins"))) {
  const dist = path.join(root, "plugins", name, "dist");
  if (!existsSync(path.join(dist, "betelgeuse-plugin.json"))) continue;
  const m = JSON.parse(readFileSync(path.join(dist, "betelgeuse-plugin.json"), "utf8"));
  if (m.private) continue; // examples and internal plugins stay out of the store
  const file = `plugin-${m.id}-${m.version}.zip`;
  execFileSync("zip", ["-r", "-X", "-q", path.join(out, file), "."], { cwd: dist });
  const bytes = readFileSync(path.join(out, file));
  plugins.push({
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description ?? "",
    author: m.author ?? "",
    icon: m.icon ?? "",
    homepage: m.homepage ?? "",
    engines: m.engines,
    platforms: m.platforms ?? ["desktop"],
    permissions: m.permissions ?? [],
    url: file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    signature: key ? sign(null, bytes, key).toString("base64") : "",
    size: statSync(path.join(out, file)).size,
  });
  console.log(`packaged ${file}${key ? " (signed)" : ""}`);
}
writeFileSync(path.join(out, "plugins.json"), JSON.stringify({ plugins }, null, 2) + "\n");
console.log(`\n${plugins.length} plugin${plugins.length === 1 ? "" : "s"} → dist-plugins/plugins.json`);
