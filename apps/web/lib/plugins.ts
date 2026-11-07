/**
 * Plugins in the browser. The store is the same one the other apps use: signed zips built by the
 * release pipeline. They're fetched through this site (GitHub's downloads don't allow browsers to
 * read them, and nothing personal is involved), then checked here against the public key, so the
 * server can't slip anything in. Installed plugins live in this browser, like on a computer.
 */
import { strFromU8, unzipSync } from "fflate";
import { IdbKV, type KV } from "./store";

/** crates/betelgeuse-core/plugin-signing.pub, which a test keeps this equal to. */
export const PLUGIN_PUBLIC_KEY = "hmdPMmOE2NPwgsJZ3jI7zwariKKHELjXVBWBBl0nlMw=";
export const MANIFEST = "betelgeuse-plugin.json";
const MAX_UNPACKED = 100 * 1024 * 1024;

export type InstalledPlugin = { manifest: Record<string, unknown> & { id: string; version: string; main?: string }; files: Record<string, string> };
export type StoreEntry = { id: string; name: string; version: string; sha256: string; signature: string } & Record<string, unknown>;
export type StoreIndex = { plugins: StoreEntry[]; fetched: number; stale: boolean };

export const validId = (id: string) => id.length > 0 && id.length <= 64 && /^[a-z0-9][a-z0-9-]*$/.test(id);

const b64 = (s: string) => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Checks a download's checksum and signature; throws unless both hold. */
export async function verifyPlugin(bytes: Uint8Array, entry: Pick<StoreEntry, "name" | "sha256" | "signature">, publicKey = PLUGIN_PUBLIC_KEY) {
  const data = bytes as Uint8Array<ArrayBuffer>;
  if (hex(await crypto.subtle.digest("SHA-256", data)).toLowerCase() !== entry.sha256.trim().toLowerCase()) {
    throw new Error(`The download of ${entry.name} is damaged (its checksum doesn't match). Try again.`);
  }
  if (!entry.signature?.trim()) throw new Error(`${entry.name} isn't signed.`);
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("raw", b64(publicKey), { name: "Ed25519" }, false, ["verify"]);
  } catch {
    throw new Error("This browser can't verify plugin signatures, so it can't install them. Update it and try again.");
  }
  if (!(await crypto.subtle.verify({ name: "Ed25519" }, key, b64(entry.signature), data))) {
    throw new Error(`${entry.name} isn't signed by Betelgeuse. It wasn't installed.`);
  }
}

/** Reads a plugin zip, refusing unsafe paths and anything that isn't what the store listed. */
export function unpackPlugin(bytes: Uint8Array, entry: Pick<StoreEntry, "id" | "version">): InstalledPlugin {
  let total = 0;
  const unpacked = unzipSync(bytes, {
    filter: (f) => {
      total += f.originalSize;
      return true;
    },
  });
  if (total > MAX_UNPACKED) throw new Error("The plugin package is too large.");
  const files: Record<string, string> = {};
  for (const [name, data] of Object.entries(unpacked)) {
    if (name.endsWith("/")) continue;
    if (name.startsWith("/") || name.includes("\\") || name.split("/").some((s) => s === ".." || s === "")) throw new Error("The plugin package has an unsafe file path.");
    files[name] = strFromU8(data);
  }
  if (!files[MANIFEST]) throw new Error("The plugin package has no manifest.");
  const manifest = JSON.parse(files[MANIFEST]) as InstalledPlugin["manifest"];
  if (manifest.id !== entry.id || manifest.version !== entry.version) throw new Error("The plugin package doesn't match the store's listing.");
  if (!files[manifest.main ?? "main.js"]) throw new Error(`The plugin's ${manifest.main ?? "main.js"} is missing.`);
  return { manifest, files };
}

export class PluginStore {
  private kv: KV;
  private dev: InstalledPlugin[] | null = null;
  private index: StoreIndex | null = null;

  constructor(kv?: KV) {
    this.kv = kv ?? new IdbKV("plugins");
  }

  private async installed() {
    return (await this.kv.all<InstalledPlugin>("local")).map(([, p]) => p);
  }

  /** Development builds also load the plugins built in this repository, like the desktop app. */
  private async devPlugins() {
    if (process.env.NODE_ENV === "production") return [];
    if (!this.dev) this.dev = await fetch("/api/plugins/dev").then((r) => (r.ok ? r.json() : []), () => []);
    return this.dev ?? [];
  }

  async list() {
    const dev = await this.devPlugins();
    const installed = (await this.installed()).filter((p) => !dev.some((d) => d.manifest.id === p.manifest.id));
    return [...dev.map((p) => ({ p, source: "dev" })), ...installed.map((p) => ({ p, source: "installed" }))]
      .map(({ p, source }) => ({ manifest: p.manifest, id: p.manifest.id, dir: p.manifest.id, source }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  async file(id: string, file: string) {
    const all = [...(await this.devPlugins()), ...(await this.installed())];
    const text = all.find((p) => p.manifest.id === id)?.files[file];
    if (text === undefined) throw new Error(`plugin ${id} has no file ${file}`);
    return text;
  }

  async storeIndex(refresh: boolean): Promise<StoreIndex> {
    if (this.index && !refresh) return this.index;
    const res = await fetch("/api/plugins/index", { cache: refresh ? "no-store" : "default" });
    if (!res.ok) {
      if (this.index) return { ...this.index, stale: true };
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Couldn't reach the plugin store.");
    }
    this.index = (await res.json()) as StoreIndex;
    return this.index;
  }

  async install(id: string) {
    const entry = (await this.storeIndex(false)).plugins.find((e) => e.id === id);
    if (!entry) throw new Error(`${id} isn't in the plugin store.`);
    const res = await fetch(`/api/plugins/zip?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Couldn't download ${entry.name}.`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await verifyPlugin(bytes, entry);
    await this.kv.put("local", id, unpackPlugin(bytes, entry));
    return id;
  }

  uninstall = (id: string) => this.kv.del("local", id);
}

