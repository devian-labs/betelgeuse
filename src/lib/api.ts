import { invoke } from "@tauri-apps/api/core";

export type NoteMeta = {
  path: string;
  title: string;
  icon: string | null;
  tags: string[];
  kind: string | null;
  /** Frontmatter `ai`: false hides the page (and sub-pages) from agents, true shares it. */
  ai: boolean | null;
  /** Frontmatter `order`: position among sibling pages in the sidebar (ascending; unset pages follow A–Z). */
  order: number | null;
  modified: number;
  created: number;
};
export type RawRow = { path: string; title: string; content: string; modified: number; created: number };
export type SearchHit = { path: string; title: string; icon: string | null; snippet: string; score: number };
export type VaultInfo = { path: string; name: string };
export type Change = { path: string; status: "added" | "modified" | "deleted" | "renamed" };
export type RepoStatus = { branch: string; changes: Change[]; has_remote: boolean };
export type Commit = { hash: string; short: string; author: string; timestamp: number; subject: string };
export type GitSettings = { branch: string; remote_url: string | null; user_name: string | null; user_email: string | null; commits: number };
export type AiPolicy = "all" | "shared";
export type TrashItem = { id: string; title: string; icon: string | null; original: string; deleted: number; pages: number };
export type ImportReport = { root: string; pages: number; databases: number; assets: number; skipped: string[] };
export type McpInfo = { server_path: string; built: boolean; vault: string; node_path: string | null };

export const api = {
  currentVault: () => invoke<VaultInfo>("current_vault"),
  openVault: (path: string) => invoke<VaultInfo>("open_vault", { path }),
  listNotes: () => invoke<NoteMeta[]>("list_notes"),
  readNote: (path: string) => invoke<string>("read_note", { path }),
  writeNote: (path: string, content: string) => invoke<void>("write_note", { path, content }),
  createNote: (parent: string | null, title: string) => invoke<string>("create_note", { parent, title }),
  databaseRows: (path: string) => invoke<RawRow[]>("database_rows", { path }),
  duplicateNote: (path: string) => invoke<string>("duplicate_note", { path }),
  saveAsset: (name: string, bytes: number[]) => invoke<string>("save_asset", { name, bytes }),
  readAsset: (path: string) => invoke<ArrayBuffer>("read_asset", { path }),
  renameNote: (path: string, title: string) => invoke<string>("rename_note", { path, title }),
  /** Moves a page (and sub-pages) to the Trash; returns the trash item id. */
  deleteNote: (path: string) => invoke<string>("delete_note", { path }),
  listTrash: () => invoke<TrashItem[]>("list_trash"),
  restoreTrash: (id: string) => invoke<string>("restore_trash", { id }),
  purgeTrash: (id?: string) => invoke<void>("purge_trash", { id: id ?? null }),
  search: (query: string) => invoke<SearchHit[]>("search_notes", { query }),
  backlinks: (path: string) => invoke<NoteMeta[]>("backlinks", { path }),
  gitStatus: () => invoke<RepoStatus>("git_status"),
  gitCommit: (message?: string) => invoke<string | null>("git_commit", { message }),
  gitLog: (path?: string, limit?: number) => invoke<Commit[]>("git_log", { path, limit }),
  gitShow: (rev: string, path: string) => invoke<string>("git_show", { rev, path }),
  gitSync: () => invoke<string>("git_sync"),
  gitSettings: () => invoke<GitSettings>("git_settings"),
  gitSetRemote: (url: string) => invoke<void>("git_set_remote", { url }),
  gitSetIdentity: (name: string, email: string) => invoke<void>("git_set_identity", { name, email }),
  gitTestRemote: () => invoke<string>("git_test_remote"),
  gitPublish: () => invoke<string>("git_publish"),
  setAutocommit: (seconds: number) => invoke<void>("set_autocommit", { seconds }),
  getAiPolicy: () => invoke<AiPolicy>("get_ai_policy"),
  setAiPolicy: (policy: AiPolicy) => invoke<void>("set_ai_policy", { policy }),
  importPages: (source: "notion" | "obsidian", path: string) => invoke<ImportReport>("import_pages", { source, path }),
  mcpInfo: () => invoke<McpInfo>("mcp_info"),
};
