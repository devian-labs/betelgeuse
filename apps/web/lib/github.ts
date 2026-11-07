/**
 * GitHub's API, called straight from the browser: notes travel between this page and GitHub and never
 * through Betelgeuse's server. The token comes from the server's session (see lib/server/session.ts).
 */
export type TreeEntry = { path: string; sha: string; size?: number };
export type TreeChange = { path: string; content?: string; sha?: string | null };
export type CommitInfo = { hash: string; short: string; author: string; timestamp: number; subject: string };
export type Repository = { owner: string; name: string; full_name: string; private: boolean; default_branch: string; description: string | null };
export type User = { login: string; name: string | null; avatar_url: string };

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
/** The session ended: signing in again fixes it. Edits stay safe in this browser meanwhile. */
export class SignedOut extends Error {
  constructor() {
    super("Your GitHub session has ended. Sign in again to keep syncing.");
  }
}

export const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromBase64 = (b64: string) => Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0));

const BATCH = 100;
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export class GitHub {
  private readonly api: string;
  constructor(
    private readonly token: (force?: boolean) => Promise<string>,
    api = "https://api.github.com",
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
  ) {
    this.api = api.replace(/\/$/, "");
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async (force: boolean) =>
      this.fetcher(path.startsWith("http") ? path : `${this.api}${path}`, {
        ...init,
        // Fresh answers: "has anything changed?" must not come from the browser's HTTP cache.
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${await this.token(force)}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...init.headers,
        },
      });
    let res = await send(false);
    if (res.status === 401) {
      res = await send(true); // a token that just expired: the session refreshes it
      if (res.status === 401) throw new SignedOut();
    }
    return res;
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.request(path, init);
    if (!res.ok) throw await this.failure(res);
    return (await res.json()) as T;
  }

  private async failure(res: Response) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      return new GitHubError(res.status, `GitHub's rate limit was reached. Try again ${reset ? `after ${new Date(reset).toLocaleTimeString()}` : "later"}.`);
    }
    return new GitHubError(res.status, body?.message ?? `GitHub answered ${res.status}`);
  }

  private post<T>(path: string, body: unknown, method = "POST") {
    return this.json<T>(path, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  }

  user = () => this.json<User>("/user");

  /** The repositories the signed-in person gave the Betelgeuse app access to. */
  async repositories(): Promise<Repository[]> {
    const { installations } = await this.json<{ installations: { id: number }[] }>("/user/installations?per_page=100");
    const lists = await Promise.all(
      installations.map(async (i) => {
        const repos: (Omit<Repository, "owner" | "name"> & { name: string; owner: { login: string } })[] = [];
        for (let page = 1; ; page++) {
          const { repositories } = await this.json<{ repositories: typeof repos }>(`/user/installations/${i.id}/repositories?per_page=100&page=${page}`);
          repos.push(...repositories);
          if (repositories.length < 100) return repos;
        }
      }),
    );
    return lists
      .flat()
      .map((r) => ({ ...r, owner: r.owner.login }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  repository = async (owner: string, repo: string) => {
    const r = await this.json<{ default_branch: string; private: boolean; full_name: string; description: string | null }>(`/repos/${owner}/${repo}`);
    return { ...r, owner, name: repo } as Repository;
  };

  /** The commit a branch points at, or null while the repository has no commits. */
  async head(owner: string, repo: string, branch: string): Promise<string | null> {
    const res = await this.request(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    if (res.status === 404 || res.status === 409) return null;
    if (!res.ok) throw await this.failure(res);
    return ((await res.json()) as { object: { sha: string } }).object.sha;
  }

  async commit(owner: string, repo: string, sha: string) {
    const c = await this.json<{ tree: { sha: string }; committer: { date: string } }>(`/repos/${owner}/${repo}/git/commits/${sha}`);
    return { tree: c.tree.sha, date: Date.parse(c.committer.date) || 0 };
  }

  /** Every file in a tree. */
  async tree(owner: string, repo: string, sha: string): Promise<TreeEntry[]> {
    const t = await this.json<{ truncated: boolean; tree: { path: string; type: string; sha: string; size?: number }[] }>(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
    if (t.truncated) throw new Error("This repository has too many files for the web app to open.");
    return t.tree.filter((e) => e.type === "blob").map(({ path, sha: blob, size }) => ({ path, sha: blob, size }));
  }

  /** Text files by blob sha, many per request, so opening a large workspace stays well inside the rate limit. */
  async texts(owner: string, repo: string, shas: string[], progress?: (done: number) => void): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < shas.length; i += BATCH) {
      const batch = shas.slice(i, i + BATCH);
      const fields = batch.map((sha, k) => `b${k}: object(oid: "${sha}") { ... on Blob { text isTruncated isBinary } }`).join("\n");
      const res = await this.post<{ data?: { repository: Record<string, { text: string | null; isTruncated: boolean; isBinary: boolean } | null> | null }; errors?: { message: string }[] }>("/graphql", {
        query: `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
        variables: { owner, name: repo },
      });
      if (!res.data?.repository) throw new GitHubError(502, res.errors?.[0]?.message ?? "GitHub couldn't read the repository.");
      for (const [k, sha] of batch.entries()) {
        const blob = res.data.repository[`b${k}`];
        // GitHub cuts long files short here: those come one at a time.
        out.set(sha, blob && !blob.isTruncated && blob.text !== null ? blob.text : new TextDecoder().decode(await this.bytes(owner, repo, sha)));
      }
      progress?.(Math.min(shas.length, i + BATCH));
    }
    return out;
  }

  async bytes(owner: string, repo: string, sha: string) {
    const b = await this.json<{ content: string }>(`/repos/${owner}/${repo}/git/blobs/${sha}`);
    return fromBase64(b.content);
  }

  createBlob = (owner: string, repo: string, bytes: Uint8Array) => this.post<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, { content: toBase64(bytes), encoding: "base64" }).then((r) => r.sha);

  createTree = (owner: string, repo: string, base: string, changes: TreeChange[]) =>
    this.post<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, { base_tree: base, tree: changes.map((c) => ({ mode: "100644", type: "blob", ...c })) }).then((r) => r.sha);

  createCommit = (owner: string, repo: string, message: string, tree: string, parent: string) => this.post<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, { message, tree, parents: [parent] }).then((r) => r.sha);

  /** Moves a branch forward. False when it has moved on since (another device pushed first). */
  async updateBranch(owner: string, repo: string, branch: string, sha: string): Promise<boolean> {
    const res = await this.request(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha, force: false }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) return true;
    if (res.status === 422 || res.status === 409) return false;
    throw await this.failure(res);
  }

  /** The first commit: GitHub's lower-level calls refuse to work on a repository with none. */
  putFile = (owner: string, repo: string, path: string, text: string, message: string) =>
    this.post(`/repos/${owner}/${repo}/contents/${encodePath(path)}`, { message, content: toBase64(new TextEncoder().encode(text)) }, "PUT");

  async log(owner: string, repo: string, branch: string, path: string | undefined, limit: number): Promise<CommitInfo[]> {
    const q = new URLSearchParams({ sha: branch, per_page: String(Math.min(limit, 100)) });
    if (path) q.set("path", path);
    const commits = await this.json<{ sha: string; commit: { message: string; author: { name: string; date: string } | null; committer: { date: string } | null } }[]>(`/repos/${owner}/${repo}/commits?${q}`);
    return commits.map((c) => ({
      hash: c.sha,
      short: c.sha.slice(0, 7),
      author: c.commit.author?.name ?? "",
      timestamp: Math.floor(Date.parse(c.commit.author?.date ?? c.commit.committer?.date ?? "") / 1000) || 0,
      subject: c.commit.message.split("\n")[0],
    }));
  }

  /** A file as it was at a commit. */
  async show(owner: string, repo: string, rev: string, path: string) {
    const res = await this.request(`/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(rev)}`, { headers: { Accept: "application/vnd.github.raw+json" } });
    if (!res.ok) throw await this.failure(res);
    return res.text();
  }

  async commitCount(owner: string, repo: string, branch: string) {
    const res = await this.post<{ data?: { repository?: { ref?: { target?: { history?: { totalCount: number } } } } } }>("/graphql", {
      query: `query($owner: String!, $name: String!, $ref: String!) { repository(owner: $owner, name: $name) { ref(qualifiedName: $ref) { target { ... on Commit { history { totalCount } } } } } }`,
      variables: { owner, name: repo, ref: `refs/heads/${branch}` },
    });
    return res.data?.repository?.ref?.target?.history?.totalCount ?? 0;
  }
}
