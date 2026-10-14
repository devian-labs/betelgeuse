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
export type AssetKind = "video" | "audio" | "image" | "raw" | "design" | "project" | "font" | "document" | "other";
/** How productions (rows of a pipeline database) map to project folders in the library. */
export type Pipeline = {
  /** The pipeline database's page path. */
  database: string | null;
  channelProperty: string;
  folderProperty: string;
  /** Where new project folders go, per channel value: library folder ids. */
  channelFolders: Record<string, string>;
  defaultFolder: string | null;
  template: string[];
};
export type StudioSettings = { enabled: boolean; ignore: string[]; thumbnails: boolean; pipeline: Pipeline };
export type LibraryStatus = {
  settings: StudioSettings;
  roots: { name: string; path: string; files: number; exists: boolean }[];
  scanning: boolean;
  lastScan: number | null;
  total: number;
  ffmpeg: string | null;
  ffprobe: string | null;
  cacheBytes: number;
};
export type Asset = {
  /** `<library folder name>/<path inside it>`: the same on every machine. */
  id: string;
  root: string;
  rel: string;
  name: string;
  ext: string;
  kind: AssetKind;
  size: number;
  modified: number;
  created: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  fps: number | null;
  codec: string | null;
  /** Its library folder isn't reachable right now (an unplugged drive). */
  offline: boolean;
  tags: string[];
  rating: number;
  notes: string;
  /** Absolute path on this machine. */
  path: string;
};
export type LibraryQuery = {
  text?: string;
  kinds?: AssetKind[];
  folder?: string | null;
  tags?: string[];
  list?: "recent" | "favorites" | "untagged" | null;
  sort?: "relevance" | "modified" | "name" | "size" | "duration";
  desc?: boolean;
  limit?: number;
};
export type LibraryResult = { hits: Asset[]; total: number; kinds: Partial<Record<AssetKind, number>> };
export type MetaPatch = { tags?: string[]; addTags?: string[]; removeTags?: string[]; rating?: number; notes?: string };
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
  /** Moves a page (and sub-pages) into folder `dest` (a page's sub-pages, or "" for the top level); returns its new path. */
  moveNote: (path: string, dest: string) => invoke<string>("move_note", { path, dest }),
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
  /** Per-machine UI state kept in a file, for things that must survive a quit or crash (Recents). */
  uiStateGet: (key: string) => invoke<string | null>("ui_state_get", { key }),
  uiStateSet: (key: string, value: string) => invoke<void>("ui_state_set", { key, value }),

  // Creator Studio: the asset library.
  libraryStatus: () => invoke<LibraryStatus>("library_status"),
  librarySetSettings: (settings: StudioSettings) => invoke<void>("library_set_settings", { settings }),
  libraryAddFolder: (path: string) => invoke<void>("library_add_folder", { path }),
  libraryRemoveFolder: (name: string) => invoke<void>("library_remove_folder", { name }),
  libraryRescan: () => invoke<void>("library_rescan"),
  libraryClearCache: () => invoke<void>("library_clear_cache"),
  librarySearch: (query: LibraryQuery) => invoke<LibraryResult>("library_search", { query }),
  libraryFolders: () => invoke<[string, number][]>("library_folders"),
  libraryTags: () => invoke<[string, number][]>("library_tags"),
  librarySetMeta: (ids: string[], patch: MetaPatch) => invoke<void>("library_set_meta", { ids, patch }),
  /** PNG/JPEG bytes, or empty when the file has no preview. */
  libraryThumbnail: (id: string) => invoke<ArrayBuffer>("library_thumbnail", { id }),
  libraryOpen: (id: string, withApp?: string) => invoke<void>("library_open", { id, with: withApp ?? null }),
  libraryReveal: (id: string) => invoke<void>("library_reveal", { id }),
  /** Sub-folder names of a library folder, read from disk. */
  librarySubfolders: (id: string) => invoke<string[]>("library_subfolders", { id }),
  libraryFolderExists: (id: string) => invoke<boolean>("library_folder_exists", { id }),
  /** Creates `<parent>/<name>` with the template's sub-folders; returns the new folder's id. */
  libraryCreateFolder: (parent: string, name: string, template: string[]) => invoke<string>("library_create_folder", { parent, name, template }),
};
