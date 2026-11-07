/**
 * The web app's answer to the desktop app's Tauri commands: same names, same arguments, same results,
 * so the shared interface (lib/api.ts, the plugin runtime) doesn't know which backend it has.
 */
import type { PluginStore } from "./plugins";
import { validId } from "./plugins";
import type { KV } from "./store";
import * as vault from "./vault";
import type { Workspace } from "./workspace";

const ENABLED = ".betelgeuse/plugins.json";
const dataFile = (id: string) => `.betelgeuse/plugins/${id}/data.json`;

const parse = (text: string | undefined, fallback: Record<string, unknown>): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text ?? "");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : fallback;
  } catch {
    return fallback;
  }
};

export function makeCommands(ws: Workspace, plugins: PluginStore, store: KV) {
  const saved = async <T,>(value: T) => (await ws.flush(), value);
  const page = (path: string) => {
    const text = ws.read(vault.resolve(path));
    if (text === undefined) throw new Error(`no such page: ${path}`);
    return text;
  };
  const checkId = (id: string) => {
    if (!validId(id)) throw new Error("bad plugin id");
  };
  const enabled = (): string[] => {
    const list = parse(ws.read(ENABLED), {}).enabled;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  };

  type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- checked by lib/api.ts's types
  const commands: Record<string, (a: Args) => unknown> = {
    current_vault: () => ({ path: ws.id, name: ws.repo }),
    list_notes: () => vault.listNotes(ws),
    read_note: ({ path }) => page(path),
    write_note: ({ path, content }) => {
      ws.write(vault.resolve(path), content);
      return saved(undefined);
    },
    create_note: ({ parent, title }) => saved(vault.createNote(ws, parent, title)),
    database_rows: ({ path }) => vault.databaseRows(ws, path),
    duplicate_note: ({ path }) => saved(vault.duplicateNote(ws, path)),
    save_asset: ({ name, bytes }) => {
      const path = vault.assetPath(name, Date.now());
      ws.writeBytes(path, Uint8Array.from(bytes as number[]));
      return saved(path);
    },
    read_asset: async ({ path }) => {
      const bytes = await ws.readBytes(vault.resolve(path));
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    rename_note: ({ path, title }) => saved(vault.renameNote(ws, path, title)),
    move_note: ({ path, dest }) => saved(vault.moveNote(ws, path, dest)),
    delete_note: ({ path }) => saved(vault.deleteNote(ws, path, Date.now())),
    list_trash: () => vault.listTrash(ws, Date.now()),
    restore_trash: ({ id }) => saved(vault.restoreTrash(ws, id)),
    purge_trash: ({ id }) => {
      vault.purgeTrash(ws, id);
      return saved(undefined);
    },
    search_notes: ({ query }) => vault.search(ws, query),
    backlinks: ({ path }) => vault.backlinks(ws, path),

    git_status: () => ({ branch: ws.branch, changes: ws.changes(), has_remote: true }),
    git_commit: async ({ message }) => (await ws.sync(message ?? undefined)).commit,
    git_log: ({ path, limit }) => ws.github.log(ws.owner, ws.repo, ws.branch, path ?? undefined, limit ?? 100),
    git_show: ({ rev, path }) => ws.github.show(ws.owner, ws.repo, rev, vault.resolve(path)),
    git_sync: async () => {
      const { updated, commit } = await ws.sync();
      return updated || commit ? "Synced" : "Already up to date";
    },
    git_settings: async () => ({
      branch: ws.branch,
      remote_url: `github.com/${ws.owner}/${ws.repo}`,
      user_name: null,
      user_email: null,
      commits: await ws.github.commitCount(ws.owner, ws.repo, ws.branch).catch(() => 0),
    }),
    set_autocommit: ({ seconds }) => ws.setAutocommit(seconds),
    set_autosync: ({ seconds }) => ws.setAutosync(seconds),
    git_sync_soon: () => ws.syncSoon(),
    get_ai_policy: () => vault.aiPolicy(ws),
    set_ai_policy: ({ policy }) => {
      vault.setAiPolicy(ws, policy);
      return saved(undefined);
    },
    ui_state_get: () => null, // Recents fall back to the browser's storage, which is all there is here
    ui_state_set: () => undefined,

    plugins_list: () => plugins.list(),
    plugin_file: ({ id, file }) => plugins.file(id, file),
    plugin_uninstall: ({ id }) => plugins.uninstall(id),
    plugins_enabled: () => enabled(),
    plugins_set_enabled: ({ ids }) => {
      const list = [...new Set((ids as string[]).filter(validId))].sort();
      ws.write(ENABLED, `${JSON.stringify({ enabled: list }, null, 2)}\n`);
      return saved(undefined);
    },
    plugin_data_get: async ({ id, scope }) => {
      checkId(id);
      return scope === "workspace" ? parse(ws.read(dataFile(id)), {}) : ((await store.get("local", `plugin-data:${id}`)) ?? {});
    },
    plugin_data_set: async ({ id, scope, value }) => {
      checkId(id);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("plugin data is a JSON object");
      if (scope === "workspace") {
        ws.write(dataFile(id), `${JSON.stringify(value, null, 2)}\n`);
        await ws.flush();
      } else await store.put("local", `plugin-data:${id}`, value);
    },
    plugin_store_index: ({ refresh }) => plugins.storeIndex(!!refresh),
    plugin_store_install: ({ id }) => plugins.install(id),
  };

  return async <T,>(command: string, args: Args = {}): Promise<T> => {
    const run = commands[command];
    if (!run) throw new Error(`"${command}" isn't available in the web app.`);
    return (await run(args)) as T;
  };
}
