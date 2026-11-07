/**
 * GitHub for the demo: the same answers as the real API, from memory. The demo runs the real workspace
 * and sync code against it, so editing, commits and page history all work, and nothing leaves the tab.
 */
import { GitHub, GitHubError, type CommitInfo, type Repository, type TreeChange, type TreeEntry, type User } from "../github";

type Commit = { sha: string; tree: string; parents: string[]; message: string; date: number };

const AUTHOR = "You";

export class DemoGitHub extends GitHub {
  private blobs = new Map<string, Uint8Array<ArrayBuffer>>();
  private trees = new Map<string, Map<string, string>>();
  private commits = new Map<string, Commit>();
  private branch: string;
  private ids = 0;

  /** Starts with these files, committed `age` milliseconds ago. */
  constructor(files: Record<string, string>, age = 0, now = Date.now()) {
    super(async () => "", "");
    const tree = new Map(Object.entries(files).map(([path, text]) => [path, this.addBlob(new TextEncoder().encode(text))]));
    this.branch = this.addCommit("Create the demo workspace", this.addTree(tree), [], now - age);
  }

  private id(kind: string) {
    return `demo${kind}${(++this.ids).toString(16).padStart(8, "0")}`;
  }
  private addBlob(bytes: Uint8Array<ArrayBuffer>) {
    const sha = this.id("blob");
    this.blobs.set(sha, bytes);
    return sha;
  }
  private addTree(files: Map<string, string>) {
    const sha = this.id("tree");
    this.trees.set(sha, files);
    return sha;
  }
  private addCommit(message: string, tree: string, parents: string[], date = Date.now()) {
    const sha = this.id("commit");
    this.commits.set(sha, { sha, tree, parents, message, date });
    return sha;
  }
  private find<T>(map: Map<string, T>, sha: string): T {
    const found = map.get(sha);
    if (found === undefined) throw new GitHubError(404, "Not Found");
    return found;
  }

  user = async (): Promise<User> => ({ login: "demo", name: "Demo", avatar_url: "" });
  repositories = async (): Promise<Repository[]> => [];
  repository = async (owner: string, repo: string): Promise<Repository> => ({ owner, name: repo, full_name: `${owner}/${repo}`, private: true, default_branch: "main", description: null });

  head = async () => this.branch;
  commit = async (_owner: string, _repo: string, sha: string) => {
    const c = this.find(this.commits, sha);
    return { tree: c.tree, date: c.date };
  };
  tree = async (_owner: string, _repo: string, sha: string): Promise<TreeEntry[]> => [...this.find(this.trees, sha)].map(([path, blob]) => ({ path, sha: blob }));
  texts = async (_owner: string, _repo: string, shas: string[]) => new Map(shas.map((sha) => [sha, new TextDecoder().decode(this.find(this.blobs, sha))]));
  bytes = async (_owner: string, _repo: string, sha: string) => this.find(this.blobs, sha);

  createBlob = async (_owner: string, _repo: string, bytes: Uint8Array) => this.addBlob(bytes as Uint8Array<ArrayBuffer>);
  createTree = async (_owner: string, _repo: string, base: string, changes: TreeChange[]) => {
    const next = new Map(this.find(this.trees, base));
    for (const c of changes) {
      if (c.sha === null) next.delete(c.path);
      else if (c.content !== undefined) next.set(c.path, this.addBlob(new TextEncoder().encode(c.content)));
      else if (c.sha) next.set(c.path, c.sha);
    }
    return this.addTree(next);
  };
  createCommit = async (_owner: string, _repo: string, message: string, tree: string, parent: string) => this.addCommit(message, tree, [parent]);
  updateBranch = async (_owner: string, _repo: string, _branch: string, sha: string) => {
    this.branch = sha;
    return true;
  };
  putFile = async () => {
    throw new GitHubError(422, "The demo already has its first commit.");
  };

  log = async (_owner: string, _repo: string, _branch: string, path: string | undefined, limit: number): Promise<CommitInfo[]> => {
    const out: CommitInfo[] = [];
    for (let c: Commit | undefined = this.commits.get(this.branch); c && out.length < limit; c = c.parents[0] ? this.commits.get(c.parents[0]) : undefined) {
      const before = c.parents[0] ? this.trees.get(this.commits.get(c.parents[0])!.tree)?.get(path ?? "") : undefined;
      if (path && this.trees.get(c.tree)!.get(path) === before) continue;
      out.push({ hash: c.sha, short: c.sha.slice(-7), author: AUTHOR, timestamp: Math.floor(c.date / 1000), subject: c.message });
    }
    return out;
  };
  show = async (_owner: string, _repo: string, rev: string, path: string) => {
    const sha = this.trees.get(this.find(this.commits, rev).tree)?.get(path);
    if (!sha) throw new GitHubError(404, "Not Found");
    return new TextDecoder().decode(this.find(this.blobs, sha));
  };
  commitCount = async () => {
    let n = 0;
    for (let c: Commit | undefined = this.commits.get(this.branch); c; c = c.parents[0] ? this.commits.get(c.parents[0]) : undefined) n++;
    return n;
  };
}
