/**
 * A GitHub repository, worked on like the folder the desktop app has. The files live in memory; edits
 * go straight into this browser's store, then to GitHub as commits. Pulling merges as the other apps
 * do (crates/betelgeuse-core/src/git_lib.rs): edits to different lines both survive, and when the same
 * lines changed, the other device's version keeps the page and this one's sits beside it as
 * "Page (conflicted copy)". Sync never stops half-way, and nothing is lost.
 */
import { GitHub, GitHubError, SignedOut, type TreeChange } from "./github";
import { conflictedCopyPath, mergeText } from "./merge";
import type { KV } from "./store";
import { aiPolicy, aiVisible, isMarkdownPage, TRASH, titleOf, type Files } from "./vault";

type FileNode = { text?: string; bytes?: Uint8Array; sha?: string };
type WorkRecord = FileNode | { deleted: true };
type Meta = { branch: string; commit: string; tree: string; files: [string, string][]; times: [string, { modified: number; created: number }][] };

export type Change = { path: string; status: "added" | "modified" | "deleted" | "renamed" };
export type SyncResult = { updated: boolean; conflicts: string[]; commit: string | null };
export type Emit = (event: string, payload: unknown) => void;

/** Only pages and workspace settings are read up front; images and other files wait until asked for. */
const isText = (path: string) => isMarkdownPage(path) || (path.startsWith(".betelgeuse/") && path.endsWith(".json")) || path === ".gitignore";
const isLocal = (path: string) => path.startsWith(`${TRASH}/`);

const WELCOME = `---
icon: 🌟
---
This workspace lives in this GitHub repository. Every page is a Markdown file, and every change is a commit.

Type \`/\` for any block. Add this repository in the Betelgeuse desktop or phone app to work on the same pages there.
`;
const GITIGNORE = ".DS_Store\n.obsidian/workspace*.json\n.trash/\n";

export type WorkspaceOptions = {
  owner: string;
  repo: string;
  github: GitHub;
  store: KV;
  emit: Emit;
  now?: () => number;
  /** Tells this workspace's other tabs what changed. */
  channel?: Pick<BroadcastChannel, "postMessage"> & { onmessage: ((e: MessageEvent) => void) | null };
  /** Runs one tab's sync at a time. */
  lock?: <T>(run: () => Promise<T>) => Promise<T>;
};

export class Workspace implements Files {
  readonly owner: string;
  readonly repo: string;
  branch = "main";
  private gh: GitHub;
  private store: KV;
  private emit: Emit;
  private now: () => number;
  private lock: <T>(run: () => Promise<T>) => Promise<T>;
  private channel: WorkspaceOptions["channel"];

  private commitSha: string | null = null;
  private treeSha: string | null = null;
  /** The repository at `commitSha`: path → blob sha. */
  private base = new Map<string, string>();
  /** Blob sha → text, for the text files. */
  private texts = new Map<string, string>();
  private working = new Map<string, FileNode>();
  private timesByPath = new Map<string, { modified: number; created: number }>();
  /** Writes to the store, in the order they happened. */
  private writes: Promise<unknown> = Promise.resolve();
  private queue: Promise<unknown> = Promise.resolve();
  private autocommit = 0;
  private commitTimer: ReturnType<typeof setTimeout> | undefined;
  private syncTimer: ReturnType<typeof setInterval> | undefined;
  private soonTimer: ReturnType<typeof setTimeout> | undefined;
  private timesTimer: ReturnType<typeof setTimeout> | undefined;
  private lastError: string | null = null;
  private edits = 0;

  constructor(options: WorkspaceOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.gh = options.github;
    this.store = options.store;
    this.emit = options.emit;
    this.now = options.now ?? Date.now;
    this.lock = options.lock ?? ((run) => run());
    this.channel = options.channel;
    if (this.channel) this.channel.onmessage = (e) => void this.fromOtherTab(e.data);
  }

  get id() {
    return `github:${this.owner}/${this.repo}`;
  }
  get github() {
    return this.gh;
  }

  // ---------- Files ----------

  paths = () => [...this.working.keys()];
  has = (path: string) => this.working.has(path);
  read = (path: string) => this.working.get(path)?.text;
  times = (path: string) => this.timesByPath.get(path) ?? { modified: 0, created: 0 };

  write = (path: string, text: string) => {
    this.working.set(path, { text });
    this.touch(path);
    this.changed(path);
  };
  writeBytes(path: string, bytes: Uint8Array) {
    this.working.set(path, { bytes });
    this.touch(path);
    this.changed(path);
  }
  remove = (path: string) => {
    this.working.delete(path);
    this.timesByPath.delete(path);
    this.changed(path);
  };
  move = (from: string, to: string) => {
    const node = this.working.get(from);
    if (!node) return;
    this.working.delete(from);
    this.working.set(to, node);
    const times = this.timesByPath.get(from);
    this.timesByPath.delete(from);
    if (times) this.timesByPath.set(to, times);
    this.changed(from);
    this.changed(to);
  };

  /** A file's bytes, fetched from GitHub the first time (and then kept in this browser). */
  async readBytes(path: string): Promise<Uint8Array> {
    const node = this.working.get(path);
    if (!node) throw new Error(`no such file: ${path}`);
    if (node.bytes) return node.bytes;
    if (node.text !== undefined) return new TextEncoder().encode(node.text);
    const cached = await this.store.get<Uint8Array>("blobs", node.sha!);
    if (cached) return cached;
    const bytes = await this.gh.bytes(this.owner, this.repo, node.sha!);
    void this.store.put("blobs", node.sha!, bytes);
    return bytes;
  }

  private touch(path: string) {
    const now = this.now();
    this.timesByPath.set(path, { modified: now, created: this.timesByPath.get(path)?.created ?? now });
    clearTimeout(this.timesTimer);
    this.timesTimer = setTimeout(() => this.commitSha && this.saveMeta(), 1000);
  }

  private isDirty(path: string) {
    if (isLocal(path)) return false;
    const [remote, node] = [this.base.get(path), this.working.get(path)];
    if (!node) return remote !== undefined;
    if (remote === undefined) return true;
    if (node.text !== undefined) return this.texts.get(remote) !== node.text;
    return node.bytes !== undefined || node.sha !== remote;
  }

  /** Saves where a file now stands: only what differs from the repository needs keeping. */
  private changed(path: string, announce = true) {
    this.edits++;
    const node = this.working.get(path);
    let record: WorkRecord | null = null;
    if (isLocal(path)) record = node ?? null;
    else if (this.isDirty(path)) record = node ?? { deleted: true };
    this.writes = this.writes
      .then(() => (record ? this.store.put("work", path, record) : this.store.del("work", path)))
      .catch((e) => console.error("couldn't save in this browser", path, e));
    if (announce) this.afterWrite(path);
  }

  private afterWrite(path: string) {
    this.channel?.postMessage({ type: "changed", path });
    this.emit("vault-changed", [path]);
    if (isLocal(path)) return;
    clearTimeout(this.commitTimer);
    if (this.autocommit > 0) this.commitTimer = setTimeout(() => void this.background(), this.autocommit * 1000);
  }

  /** Done once every edit so far is safe in this browser. */
  flush = () => this.writes;

  // ---------- Opening ----------

  private saveMeta() {
    const meta: Meta = { branch: this.branch, commit: this.commitSha!, tree: this.treeSha!, files: [...this.base], times: [...this.timesByPath] };
    this.writes = this.writes.then(() => this.store.put("meta", "state", meta)).catch((e) => console.error("couldn't save in this browser", e));
  }

  /** Reads what this browser has. False when it has nothing for this workspace yet. */
  private async load(): Promise<boolean> {
    // Reads take a moment: an edit made meanwhile would be overwritten, so read again until none was.
    let meta: Meta | undefined;
    let work: [string, WorkRecord][];
    let known: Map<string, string | Uint8Array>;
    for (;;) {
      const edits = this.edits;
      await this.flush();
      meta = await this.store.get<Meta>("meta", "state");
      work = await this.store.all<WorkRecord>("work");
      known = new Map(await this.store.all<string | Uint8Array>("blobs"));
      if (edits === this.edits) break;
    }
    this.working = new Map();
    if (!meta) {
      for (const [path, rec] of work) if (!("deleted" in rec)) this.working.set(path, rec);
      return false;
    }
    this.branch = meta.branch;
    this.commitSha = meta.commit;
    this.treeSha = meta.tree;
    this.base = new Map(meta.files);
    this.timesByPath = new Map(meta.times);
    for (const [path, sha] of this.base) {
      const text = known.get(sha);
      if (isText(path) && typeof text === "string") this.texts.set(sha, text);
    }
    for (const [path, sha] of this.base) this.working.set(path, isText(path) && this.texts.has(sha) ? { text: this.texts.get(sha) } : { sha });
    for (const [path, rec] of work) {
      if ("deleted" in rec) this.working.delete(path);
      else this.working.set(path, rec);
    }
    return true;
  }

  /**
   * Opens the workspace. With a copy in this browser it's ready straight away and catches up in the
   * background, offline included; the first time it reads the whole repository.
   */
  async open(progress?: (done: number, total: number) => void): Promise<void> {
    const known = await this.load();
    let info;
    try {
      info = await this.gh.repository(this.owner, this.repo);
    } catch (e) {
      // Offline, a copy is fine. A repository this account can't reach isn't.
      if (known && !(e instanceof SignedOut) && !(e instanceof GitHubError)) return void this.background();
      throw e;
    }
    this.branch = info.default_branch;
    if (known) {
      void this.background();
      return;
    }
    let head = await this.gh.head(this.owner, this.repo, this.branch);
    if (!head) {
      await this.gh.putFile(this.owner, this.repo, ".gitignore", GITIGNORE, "Set up Betelgeuse workspace");
      await this.gh.putFile(this.owner, this.repo, "Welcome.md", WELCOME, "Add Welcome page");
      head = await this.gh.head(this.owner, this.repo, this.branch);
      if (!head) throw new Error("GitHub didn't create the first commit.");
    }
    const { tree: treeSha, date } = await this.gh.commit(this.owner, this.repo, head);
    const entries = await this.gh.tree(this.owner, this.repo, treeSha);
    const wanted = [...new Set(entries.filter((e) => isText(e.path)).map((e) => e.sha))];
    const cached = new Map(await this.store.all<string | Uint8Array>("blobs"));
    const fetch = wanted.filter((sha) => {
      const text = cached.get(sha);
      if (typeof text === "string") this.texts.set(sha, text);
      return typeof text !== "string";
    });
    progress?.(0, fetch.length);
    const got = await this.gh.texts(this.owner, this.repo, fetch, (n) => progress?.(n, fetch.length));
    for (const [sha, text] of got) {
      this.texts.set(sha, text);
      this.writes = this.writes.then(() => this.store.put("blobs", sha, text));
    }
    this.commitSha = head;
    this.treeSha = treeSha;
    this.base = new Map(entries.map((e) => [e.path, e.sha]));
    const local = this.working;
    this.working = new Map();
    for (const e of entries) {
      this.working.set(e.path, isText(e.path) ? { text: this.texts.get(e.sha) ?? "" } : { sha: e.sha });
      this.timesByPath.set(e.path, { modified: date, created: date });
    }
    for (const [path, node] of local) this.working.set(path, node);
    this.saveMeta();
    await this.flush();
  }

  // ---------- Other tabs ----------

  private async fromOtherTab(message: { type: string; path?: string }) {
    if (message.type === "changed" && message.path) {
      await this.flush();
      const rec = await this.store.get<WorkRecord>("work", message.path);
      const remote = this.base.get(message.path);
      if (rec && "deleted" in rec) this.working.delete(message.path);
      else if (rec) this.working.set(message.path, rec);
      else if (remote !== undefined) this.working.set(message.path, isText(message.path) && this.texts.has(remote) ? { text: this.texts.get(remote) } : { sha: remote });
      else this.working.delete(message.path);
      this.emit("vault-changed", [message.path]);
    } else if (message.type === "synced") {
      await this.load();
      this.emit("git-synced", { updated: true, conflicts: [] });
    }
  }

  // ---------- Status ----------

  changes(): Change[] {
    const paths = new Set([...this.base.keys(), ...this.working.keys()]);
    const out: Change[] = [];
    for (const path of paths) {
      if (!this.isDirty(path)) continue;
      out.push({ path, status: !this.working.has(path) ? "deleted" : this.base.has(path) ? "modified" : "added" });
    }
    return out.sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  /** A commit message naming the changed pages. Agents can read the log, so it never names pages hidden from them. */
  private summarize(changes: Change[]) {
    const policy = aiPolicy(this);
    let hidden = 0;
    const names: string[] = [];
    for (const c of changes) {
      if (c.path.endsWith(".md") && !aiVisible(this, c.path, policy)) hidden++;
      else names.push(titleOf(c.path));
    }
    if (hidden) names.push(hidden === 1 ? "1 private page" : `${hidden} private pages`);
    const shown = names.slice(0, 3).join(", ");
    return names.length > 3 ? `Update ${shown} and ${names.length - 3} more` : `Update ${shown}`;
  }

  // ---------- Sync ----------

  setAutocommit(seconds: number) {
    this.autocommit = seconds;
    clearTimeout(this.commitTimer);
  }
  setAutosync(seconds: number) {
    clearInterval(this.syncTimer);
    if (seconds > 0) this.syncTimer = setInterval(() => void this.background(), seconds * 1000);
  }
  syncSoon() {
    clearTimeout(this.soonTimer);
    this.soonTimer = setTimeout(() => void this.background(), 1000);
  }
  dispose() {
    clearTimeout(this.commitTimer);
    clearTimeout(this.soonTimer);
    clearTimeout(this.timesTimer);
    clearInterval(this.syncTimer);
    if (this.channel) this.channel.onmessage = null;
  }

  /** A sync nobody is waiting on: trouble is reported as an event, once. */
  private async background() {
    try {
      await this.sync();
      this.lastError = null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof SignedOut) this.emit("auth-lost", message);
      if (this.lastError !== message) this.emit("git-sync-failed", message);
      this.lastError = message;
    }
  }

  /** Pulls and pushes. One at a time, across every tab on this workspace. */
  sync(message?: string): Promise<SyncResult> {
    const run = this.queue.then(() => this.lock(() => this.syncNow(message)));
    this.queue = run.catch(() => {});
    return run;
  }

  private async syncNow(message?: string): Promise<SyncResult> {
    await this.flush();
    const result: SyncResult = { updated: false, conflicts: [], commit: null };
    // Another device can push between our pull and push: then pull again.
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await this.gh.head(this.owner, this.repo, this.branch);
      if (head && head !== this.commitSha) {
        const pulled = await this.pull(head);
        result.updated ||= pulled.updated;
        result.conflicts.push(...pulled.conflicts);
      }
      const pushed = await this.push(message);
      if (pushed === "behind") continue;
      result.commit = pushed;
      await this.flush();
      if (pushed) this.emit("git-committed", pushed);
      if (pushed || result.updated) this.channel?.postMessage({ type: "synced" });
      this.emit("git-synced", { updated: result.updated, conflicts: result.conflicts });
      return result;
    }
    throw new Error("Other devices kept pushing while this one tried to. It'll try again shortly.");
  }

  private async pull(head: string): Promise<{ updated: boolean; conflicts: string[] }> {
    const { tree: treeSha, date } = await this.gh.commit(this.owner, this.repo, head);
    const entries = await this.gh.tree(this.owner, this.repo, treeSha);
    const remote = new Map(entries.map((e) => [e.path, e.sha]));
    const touched = [...new Set([...this.base.keys(), ...remote.keys()])].filter((p) => this.base.get(p) !== remote.get(p));

    const need = new Set<string>();
    for (const p of touched) {
      const sha = remote.get(p);
      if (sha && isText(p) && !this.texts.has(sha)) need.add(sha);
    }
    const got = await this.gh.texts(this.owner, this.repo, [...need]);
    for (const [sha, text] of got) {
      this.texts.set(sha, text);
      this.writes = this.writes.then(() => this.store.put("blobs", sha, text));
    }

    // No awaits from here on: an edit arriving now lands after the merge, not in the middle of it.
    const fromRemote = (p: string, sha: string): FileNode => (isText(p) ? { text: this.texts.get(sha) ?? "" } : { sha });
    const conflicts: string[] = [];
    const dirty = new Map(touched.map((p) => [p, this.isDirty(p)]));
    const announce: string[] = [];
    const copies: [string, FileNode][] = [];
    for (const p of touched) {
      const [baseSha, theirs, ours] = [this.base.get(p), remote.get(p), this.working.get(p)];
      if (!dirty.get(p)) {
        if (theirs) this.working.set(p, fromRemote(p, theirs));
        else this.working.delete(p);
        announce.push(p);
        if (theirs) this.timesByPath.set(p, { modified: date, created: this.timesByPath.get(p)?.created ?? date });
        else this.timesByPath.delete(p);
        continue;
      }
      // Changed on both sides. A page deleted on one side and edited on the other is kept, edited.
      if (!theirs) continue; // deleted there: our edit stays, as a new file
      if (!ours) {
        this.working.set(p, fromRemote(p, theirs));
        announce.push(p);
        continue;
      }
      const theirText = isText(p) ? this.texts.get(theirs) : undefined;
      if (ours.text !== undefined && theirText !== undefined) {
        if (ours.text === theirText) continue;
        const merged = baseSha !== undefined && this.texts.has(baseSha) ? mergeText(this.texts.get(baseSha)!, ours.text, theirText) : null;
        if (merged !== null) {
          this.working.set(p, { text: merged });
          announce.push(p);
          continue;
        }
      }
      copies.push([p, ours]);
      this.working.set(p, fromRemote(p, theirs));
      announce.push(p);
    }
    for (const [p, ours] of copies) {
      const copy = conflictedCopyPath(p, (c) => this.working.has(c) || remote.has(c));
      this.working.set(copy, ours);
      this.touch(copy);
      announce.push(copy);
      conflicts.push(p);
    }
    this.base = remote;
    this.commitSha = head;
    this.treeSha = treeSha;
    this.saveMeta();
    for (const p of announce) this.changed(p, false);
    for (const p of touched) if (!announce.includes(p)) this.changed(p, false);
    if (announce.length) this.emit("vault-changed", announce);
    return { updated: announce.length > 0, conflicts };
  }

  /** Commits what's changed on top of the current head. "behind" when another device got there first. */
  private async push(message?: string): Promise<string | "behind" | null> {
    const changes = this.changes();
    if (!changes.length) return null;
    const snapshot = changes.map((c) => ({ ...c, node: this.working.get(c.path) }));
    const tree: TreeChange[] = [];
    for (const { path, node } of snapshot) {
      if (!node) tree.push({ path, sha: null });
      else if (node.text !== undefined) tree.push({ path, content: node.text });
      else if (node.bytes) tree.push({ path, sha: await this.gh.createBlob(this.owner, this.repo, node.bytes) });
      else tree.push({ path, sha: node.sha! });
    }
    const treeSha = await this.gh.createTree(this.owner, this.repo, this.treeSha!, tree);
    const commit = await this.gh.createCommit(this.owner, this.repo, message?.trim() || this.summarize(changes), treeSha, this.commitSha!);
    if (!(await this.gh.updateBranch(this.owner, this.repo, this.branch, commit))) return "behind";

    // The repository now holds this snapshot. Edits made while pushing still differ, and stay to be pushed.
    const entries = await this.gh.tree(this.owner, this.repo, treeSha);
    this.base = new Map(entries.map((e) => [e.path, e.sha]));
    this.commitSha = commit;
    this.treeSha = treeSha;
    for (const { path, node } of snapshot) {
      const sha = this.base.get(path);
      if (!sha || !node) continue;
      if (node.text !== undefined) {
        this.texts.set(sha, node.text);
        const text = node.text;
        this.writes = this.writes.then(() => this.store.put("blobs", sha, text));
      } else if (node.bytes) {
        const bytes = node.bytes;
        this.writes = this.writes.then(() => this.store.put("blobs", sha, bytes));
        if (this.working.get(path) === node) this.working.set(path, { sha });
      } else if (this.working.get(path) === node) this.working.set(path, { sha });
    }
    this.saveMeta();
    for (const { path } of snapshot) this.changed(path, false);
    return commit;
  }
}
