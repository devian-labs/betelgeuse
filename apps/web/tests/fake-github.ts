/**
 * A small GitHub for tests: real git hashing and fast-forward rules over the API calls the web app
 * makes, plus OAuth sign-in. The unit tests and the browser test both talk to it over HTTP.
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

type Commit = { sha: string; tree: string; parents: string[]; message: string; date: string };

const sha1 = (s: Buffer | string) => createHash("sha1").update(s).digest("hex");
const blobSha = (b: Buffer) => sha1(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]));

export class FakeGitHub {
  blobs = new Map<string, Buffer>();
  trees = new Map<string, Map<string, string>>();
  commits = new Map<string, Commit>();
  branch: string | null = null;
  requests: { method: string; path: string }[] = [];
  /** Runs before each request; a test can make another device push first. */
  before?: (method: string, path: string) => Promise<void> | void;
  tokens = new Map([["test-token", "octo"]]);
  refreshTokens = new Set<string>();
  expiresIn = 28800;
  private clock = 1_700_000_000_000;
  private server?: Server;
  private codes = new Map<string, { challenge: string; method: string }>();
  url = "";

  constructor(
    readonly owner = "octo",
    readonly repo = "notes",
  ) {}

  /** Seeds the repository with a commit, as if pushed from elsewhere. */
  push(files: Record<string, string | null>, message = "From elsewhere") {
    const parent = this.branch ? this.commits.get(this.branch)! : null;
    const tree = new Map(parent ? this.trees.get(parent.tree)! : []);
    for (const [path, text] of Object.entries(files)) {
      if (text === null) tree.delete(path);
      else tree.set(path, this.addBlob(Buffer.from(text)));
    }
    this.branch = this.addCommit(this.addTree(tree), parent ? [parent.sha] : [], message);
    return this.branch;
  }

  text(path: string) {
    const tree = this.branch ? this.trees.get(this.commits.get(this.branch)!.tree)! : new Map<string, string>();
    const sha = tree.get(path);
    return sha ? this.blobs.get(sha)!.toString() : undefined;
  }
  files() {
    return this.branch ? [...this.trees.get(this.commits.get(this.branch)!.tree)!.keys()].sort() : [];
  }
  log() {
    const out: Commit[] = [];
    for (let c = this.branch ? this.commits.get(this.branch) : undefined; c; c = c.parents[0] ? this.commits.get(c.parents[0]) : undefined) out.push(c);
    return out;
  }

  private addBlob(b: Buffer) {
    const sha = blobSha(b);
    this.blobs.set(sha, b);
    return sha;
  }
  private addTree(files: Map<string, string>) {
    const sha = sha1(JSON.stringify([...files].sort()));
    this.trees.set(sha, files);
    return sha;
  }
  private addCommit(tree: string, parents: string[], message: string) {
    this.clock += 60_000;
    const date = new Date(this.clock).toISOString();
    const sha = sha1(JSON.stringify([tree, parents, message, date]));
    this.commits.set(sha, { sha, tree, parents, message, date });
    return sha;
  }

  async start(port = 0) {
    this.server = createServer((req, res) => void this.handle(req, res).catch((e) => this.send(res, 500, { message: String(e) })));
    await new Promise<void>((r) => this.server!.listen(port, "127.0.0.1", r));
    const address = this.server.address() as { port: number };
    this.url = `http://127.0.0.1:${address.port}`;
    return this.url;
  }
  stop() {
    this.server?.closeAllConnections();
    return new Promise((r) => (this.server ? this.server.close(r) : r(null)));
  }

  private send(res: ServerResponse, status: number, body: unknown, raw = false) {
    res.writeHead(status, { "Content-Type": raw ? "text/plain" : "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });
    res.end(raw ? (body as string) : JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url!, "http://x");
    const path = url.pathname;
    const method = req.method!;
    if (method === "OPTIONS") return this.send(res, 204, {});
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};

    // ---------- sign-in ----------
    if (path === "/login/oauth/authorize") {
      const code = `code-${this.codes.size + 1}`;
      this.codes.set(code, { challenge: url.searchParams.get("code_challenge")!, method: url.searchParams.get("code_challenge_method")! });
      const back = new URL(url.searchParams.get("redirect_uri")!);
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (path === "/login/oauth/access_token") {
      if (body.client_secret !== "test-secret") return this.send(res, 200, { error: "incorrect_client_credentials" });
      if (body.grant_type === "refresh_token") {
        if (!this.refreshTokens.delete(body.refresh_token)) return this.send(res, 200, { error: "bad_refresh_token" });
      } else {
        const pending = this.codes.get(body.code);
        const challenge = createHash("sha256").update(body.code_verifier ?? "").digest("base64url");
        if (!pending || pending.challenge !== challenge) return this.send(res, 200, { error: "bad_verification_code" });
        this.codes.delete(body.code);
      }
      const token = `ghu_${this.tokens.size}`;
      const refresh = `ghr_${this.tokens.size}`;
      this.tokens.set(token, this.owner);
      this.refreshTokens.add(refresh);
      return this.send(res, 200, { access_token: token, expires_in: this.expiresIn, refresh_token: refresh, token_type: "bearer" });
    }

    // ---------- the API ----------
    if (!this.tokens.has(req.headers.authorization?.replace("Bearer ", "") ?? "")) return this.send(res, 401, { message: "Bad credentials" });
    this.requests.push({ method, path });
    await this.before?.(method, path);

    if (path === "/user") return this.send(res, 200, { login: this.owner, name: "Octo", avatar_url: "" });
    if (path === "/user/installations") return this.send(res, 200, { installations: [{ id: 1 }] });
    if (path === "/user/installations/1/repositories") {
      return this.send(res, 200, { repositories: [{ name: this.repo, full_name: `${this.owner}/${this.repo}`, owner: { login: this.owner }, private: true, default_branch: "main", description: null }] });
    }
    if (path === "/graphql") {
      if (body.query.includes("history")) {
        return this.send(res, 200, { data: { repository: { ref: { target: { history: { totalCount: this.log().length } } } } } });
      }
      const repository: Record<string, unknown> = {};
      for (const m of body.query.matchAll(/(b\d+): object\(oid: "([0-9a-f]+)"\)/g) as IterableIterator<RegExpMatchArray>) {
        const blob = this.blobs.get(m[2]);
        repository[m[1]] = blob ? { text: blob.toString(), isTruncated: false, isBinary: false } : null;
      }
      return this.send(res, 200, { data: { repository } });
    }

    const prefix = `/repos/${this.owner}/${this.repo}`;
    if (!path.startsWith(prefix)) return this.send(res, 404, { message: "Not Found" });
    const rest = path.slice(prefix.length);
    if (rest === "") return this.send(res, 200, { default_branch: "main", private: true, full_name: `${this.owner}/${this.repo}`, description: null });
    if (rest === "/git/ref/heads/main") {
      if (!this.branch) return this.send(res, 409, { message: "Git Repository is empty." });
      return this.send(res, 200, { object: { sha: this.branch } });
    }
    let m: RegExpExecArray | null;
    if (method === "GET" && (m = /^\/git\/commits\/(\w+)$/.exec(rest))) {
      const c = this.commits.get(m[1]);
      return c ? this.send(res, 200, { tree: { sha: c.tree }, committer: { date: c.date } }) : this.send(res, 404, { message: "Not Found" });
    }
    if (method === "GET" && (m = /^\/git\/trees\/(\w+)$/.exec(rest))) {
      const t = this.trees.get(m[1]);
      if (!t) return this.send(res, 404, { message: "Not Found" });
      return this.send(res, 200, { truncated: false, tree: [...t].map(([p, sha]) => ({ path: p, type: "blob", sha, size: this.blobs.get(sha)?.length })) });
    }
    if (method === "GET" && (m = /^\/git\/blobs\/(\w+)$/.exec(rest))) {
      const b = this.blobs.get(m[1]);
      return b ? this.send(res, 200, { content: b.toString("base64"), encoding: "base64" }) : this.send(res, 404, { message: "Not Found" });
    }
    if (method === "POST" && rest === "/git/blobs") return this.send(res, 201, { sha: this.addBlob(Buffer.from(body.content, "base64")) });
    if (method === "POST" && rest === "/git/trees") {
      const base = this.trees.get(body.base_tree);
      if (!base) return this.send(res, 404, { message: "base_tree not found" });
      const next = new Map(base);
      for (const e of body.tree) {
        if (e.sha === null) {
          if (!next.delete(e.path)) return this.send(res, 422, { message: `GitRPC::BadObjectState: ${e.path}` });
        } else if (e.content !== undefined) next.set(e.path, this.addBlob(Buffer.from(e.content)));
        else if (this.blobs.has(e.sha)) next.set(e.path, e.sha);
        else return this.send(res, 422, { message: "Invalid sha" });
      }
      return this.send(res, 201, { sha: this.addTree(next) });
    }
    if (method === "POST" && rest === "/git/commits") {
      if (!this.trees.has(body.tree)) return this.send(res, 422, { message: "Tree SHA does not exist" });
      return this.send(res, 201, { sha: this.addCommit(body.tree, body.parents, body.message) });
    }
    if (method === "PATCH" && rest === "/git/refs/heads/main") {
      const c = this.commits.get(body.sha);
      if (!c) return this.send(res, 422, { message: "Object does not exist" });
      // Fast-forward only: the new commit must descend from the branch.
      const seen = new Set<string>();
      const walk = (s: string): boolean => s === this.branch || (!seen.has(s) && (seen.add(s), (this.commits.get(s)?.parents ?? []).some(walk)));
      if (this.branch && !walk(body.sha)) return this.send(res, 422, { message: "Update is not a fast forward" });
      this.branch = body.sha;
      return this.send(res, 200, { object: { sha: body.sha } });
    }
    if (method === "PUT" && (m = /^\/contents\/(.+)$/.exec(rest))) {
      this.push({ [decodeURIComponent(m[1])]: Buffer.from(body.content, "base64").toString() }, body.message);
      return this.send(res, 201, {});
    }
    if (method === "GET" && (m = /^\/contents\/(.+)$/.exec(rest))) {
      const c = this.commits.get(url.searchParams.get("ref")!);
      const sha = c && this.trees.get(c.tree)!.get(decodeURIComponent(m[1]).split("/").map(decodeURIComponent).join("/"));
      return sha ? this.send(res, 200, this.blobs.get(sha)!.toString(), true) : this.send(res, 404, { message: "Not Found" });
    }
    if (method === "GET" && rest === "/commits") {
      const only = url.searchParams.get("path");
      const list = this.log().filter((c) => {
        if (!only) return true;
        const before = c.parents[0] ? this.trees.get(this.commits.get(c.parents[0])!.tree)!.get(only) : undefined;
        return this.trees.get(c.tree)!.get(only) !== before;
      });
      return this.send(res, 200, list.map((c) => ({ sha: c.sha, commit: { message: c.message, author: { name: "Octo", date: c.date }, committer: { date: c.date } } })));
    }
    return this.send(res, 404, { message: `Not Found: ${method} ${path}` });
  }
}
