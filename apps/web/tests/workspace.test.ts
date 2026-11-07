// Sync against a fake GitHub: what two devices editing one repository have to get right.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { makeCommands } from "../lib/commands.ts";
import { GitHub } from "../lib/github.ts";
import { conflictedCopyPath, mergeText } from "../lib/merge.ts";
import { MemoryKV } from "../lib/store.ts";
import * as vault from "../lib/vault.ts";
import { Workspace } from "../lib/workspace.ts";
import { FakeGitHub } from "./fake-github.ts";

let gh: FakeGitHub;
const events: [string, unknown][] = [];

const device = (store = new MemoryKV()) => {
  const ws = new Workspace({ owner: "octo", repo: "notes", github: new GitHub(async () => "test-token", gh.url), store, emit: (e, p) => void events.push([e, p]) });
  return { ws, store };
};
const opened = async (store?: MemoryKV) => {
  const d = device(store);
  await d.ws.open();
  await d.ws.sync();
  return d.ws;
};

before(async () => {
  gh = new FakeGitHub();
  await gh.start();
});
after(() => gh.stop());
beforeEach(() => {
  const url = gh.url;
  Object.assign(gh, { blobs: new Map(), trees: new Map(), commits: new Map(), branch: null, requests: [], before: undefined, url });
  events.length = 0;
});

test("an empty repository becomes a workspace", async () => {
  const ws = await opened();
  assert.deepEqual(vault.listNotes(ws).map((n) => n.path), ["Welcome.md"]);
  assert.ok(gh.text(".gitignore")!.includes(".trash/"));
});

test("opens what's already there", async () => {
  gh.push({ "A.md": "---\nicon: 🌟\ntags: [x]\n---\nHello", "A/B.md": "Sub", ".assets/i.png": "binary", ".betelgeuse/plugins.json": '{"enabled":["finance"]}', "README.txt": "not a page" });
  const ws = await opened();
  const notes = vault.listNotes(ws);
  assert.deepEqual(notes.map((n) => [n.path, n.icon]), [["A.md", "🌟"], ["A/B.md", null]]);
  assert.equal(ws.read("A.md"), "---\nicon: 🌟\ntags: [x]\n---\nHello");
  assert.equal(ws.read(".betelgeuse/plugins.json"), '{"enabled":["finance"]}');
  assert.equal(ws.read(".assets/i.png"), undefined, "images wait until asked for");
  assert.equal(new TextDecoder().decode(await ws.readBytes(".assets/i.png")), "binary");
  assert.equal(ws.changes().length, 0);
});

test("a large workspace takes few requests to open", async () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 450; i++) files[`Page ${i}.md`] = `page ${i}`;
  gh.push(files);
  await opened();
  assert.equal(gh.requests.filter((r) => r.path === "/graphql").length, 5);
  assert.ok(gh.requests.length < 15, `took ${gh.requests.length} requests`);
});

test("edits become one commit, named after the page", async () => {
  gh.push({ "Plan.md": "one" });
  const ws = await opened();
  ws.write("Plan.md", "two");
  assert.deepEqual(ws.changes(), [{ path: "Plan.md", status: "modified" }]);
  const { commit } = await ws.sync();
  assert.ok(commit);
  assert.equal(gh.text("Plan.md"), "two");
  assert.equal(gh.log()[0].message, "Update Plan");
  assert.equal(ws.changes().length, 0);
  assert.equal((await ws.sync()).commit, null, "nothing left to do");
});

test("creating, renaming and deleting reach the repository", async () => {
  gh.push({ "A.md": "[[B]]", "B.md": "b", "B/Child.md": "c" });
  const ws = await opened();
  const created = vault.createNote(ws, null, "New");
  vault.renameNote(ws, "B.md", "Renamed");
  await ws.sync();
  assert.deepEqual(gh.files(), ["A.md", "New.md", "Renamed.md", "Renamed/Child.md"]);
  assert.equal(gh.text("A.md"), "[[Renamed]]");
  vault.deleteNote(ws, created, 1000);
  await ws.sync();
  assert.ok(!gh.files().includes("New.md"));
  assert.ok(!gh.files().some((f) => f.startsWith(".trash")), "the trash stays out of git, as on desktop");
  assert.equal(vault.listTrash(ws, 2000).length, 1);
});

test("typing back what was there isn't a change", async () => {
  gh.push({ "A.md": "one" });
  const ws = await opened();
  ws.write("A.md", "two");
  ws.write("A.md", "one");
  assert.deepEqual(ws.changes(), []);
});

test("commits never name pages hidden from agents", async () => {
  gh.push({ "Secret.md": "---\nai: false\n---\nx", "Open.md": "o" });
  const ws = await opened();
  ws.write("Secret.md", "---\nai: false\n---\ny");
  ws.write("Open.md", "p");
  await ws.sync();
  assert.equal(gh.log()[0].message, "Update Open, 1 private page");
});

test("another device's changes arrive", async () => {
  gh.push({ "A.md": "one", "Gone.md": "x" });
  const ws = await opened();
  gh.push({ "A.md": "two", "New.md": "n", "Gone.md": null });
  const { updated, conflicts } = await ws.sync();
  assert.deepEqual([updated, conflicts], [true, []]);
  assert.equal(ws.read("A.md"), "two");
  assert.equal(ws.read("New.md"), "n");
  assert.ok(!ws.has("Gone.md"));
  assert.deepEqual(ws.changes(), []);
});

test("edits to different lines both survive", async () => {
  gh.push({ "A.md": "one\ntwo\nthree\n" });
  const ws = await opened();
  ws.write("A.md", "ONE\ntwo\nthree\n");
  gh.push({ "A.md": "one\ntwo\nTHREE\n" });
  const { conflicts } = await ws.sync();
  assert.deepEqual(conflicts, []);
  assert.equal(gh.text("A.md"), "ONE\ntwo\nTHREE\n");
  assert.equal(ws.read("A.md"), "ONE\ntwo\nTHREE\n");
});

test("edits to the same line keep both versions", async () => {
  gh.push({ "Plan.md": "line\n" });
  const ws = await opened();
  ws.write("Plan.md", "mine\n");
  gh.push({ "Plan.md": "theirs\n" });
  const { conflicts } = await ws.sync();
  assert.deepEqual(conflicts, ["Plan.md"]);
  assert.equal(gh.text("Plan.md"), "theirs\n", "the other device's version keeps the page");
  assert.equal(gh.text("Plan (conflicted copy).md"), "mine\n", "this one's sits beside it");
  assert.equal(ws.read("Plan (conflicted copy).md"), "mine\n");
  assert.ok(events.some(([e, p]) => e === "git-synced" && (p as { conflicts: string[] }).conflicts[0] === "Plan.md"));
});

test("the same edit on both sides isn't a conflict", async () => {
  gh.push({ "A.md": "one" });
  const ws = await opened();
  ws.write("A.md", "same");
  gh.push({ "A.md": "same" });
  assert.deepEqual((await ws.sync()).conflicts, []);
  assert.deepEqual(ws.changes(), []);
});

test("deleted on one side and edited on the other is kept, edited", async () => {
  gh.push({ "A.md": "a", "B.md": "b" });
  const ws = await opened();
  ws.write("A.md", "edited here");
  ws.remove("B.md");
  gh.push({ "A.md": null, "B.md": "edited there" });
  await ws.sync();
  assert.equal(gh.text("A.md"), "edited here");
  assert.equal(gh.text("B.md"), "edited there");
});

test("another device pushing in the middle of ours loses nothing", async () => {
  gh.push({ "A.md": "a\n", "B.md": "b\n" });
  const ws = await opened();
  ws.write("A.md", "from web\n");
  let raced = false;
  gh.before = (method) => {
    if (method === "PATCH" && !raced) {
      raced = true;
      gh.push({ "B.md": "from phone\n" });
    }
  };
  await ws.sync();
  assert.equal(gh.text("A.md"), "from web\n");
  assert.equal(gh.text("B.md"), "from phone\n");
  assert.equal(ws.read("B.md"), "from phone\n");
  assert.deepEqual(ws.changes(), []);
});

test("an edit made while pushing is pushed next time, not lost", async () => {
  gh.push({ "A.md": "one" });
  const ws = await opened();
  ws.write("A.md", "two");
  let once = false;
  gh.before = (method) => {
    if (method === "PATCH" && !once) {
      once = true;
      ws.write("A.md", "three");
    }
  };
  await ws.sync();
  assert.equal(gh.text("A.md"), "two");
  assert.equal(ws.read("A.md"), "three");
  assert.deepEqual(ws.changes(), [{ path: "A.md", status: "modified" }]);
  await ws.sync();
  assert.equal(gh.text("A.md"), "three");
});

test("closing the tab doesn't lose an edit", async () => {
  gh.push({ "A.md": "one" });
  const store = new MemoryKV();
  const first = await opened(store);
  first.write("A.md", "unsynced");
  vault.createNote(first, null, "Draft");
  vault.deleteNote(first, vault.createNote(first, null, "Trashed"), 1000);
  await first.flush();
  first.dispose();

  const requests = gh.requests.length;
  const { ws } = device(store);
  gh.before = undefined;
  await ws.open();
  assert.equal(ws.read("A.md"), "unsynced");
  assert.ok(ws.has("Draft.md"));
  assert.equal(vault.listTrash(ws, 2000).length, 1);
  await ws.sync();
  assert.equal(gh.text("A.md"), "unsynced");
  assert.ok(gh.files().includes("Draft.md"));
  assert.ok(gh.requests.length - requests < 15);
});

test("reopening needs only what changed", async () => {
  gh.push({ "A.md": "a", "B.md": "b" });
  const store = new MemoryKV();
  await opened(store);
  gh.push({ "B.md": "b2" });
  gh.requests = [];
  const { ws } = device(store);
  await ws.open();
  await ws.sync();
  assert.equal(ws.read("B.md"), "b2");
  assert.equal(ws.read("A.md"), "a");
});

test("images go up as blobs and come back byte for byte", async () => {
  gh.push({ "A.md": "a" });
  const ws = await opened();
  const bytes = Uint8Array.from([0, 255, 1, 254, 10, 13, 128]);
  ws.writeBytes(".assets/pic.png", bytes);
  await ws.sync();
  assert.ok(gh.files().includes(".assets/pic.png"));
  assert.deepEqual(await ws.readBytes(".assets/pic.png"), bytes);
  const other = await opened();
  assert.deepEqual(await other.readBytes(".assets/pic.png"), bytes);
  // Sub-page files move with their page without being downloaded.
  gh.push({ "Doc.md": "d" });
  await other.sync();
  other.writeBytes("Doc/pic.png", bytes);
  await other.sync();
  gh.requests = [];
  vault.renameNote(other, "Doc.md", "Moved");
  await other.sync();
  assert.ok(gh.files().includes("Moved/pic.png") && !gh.files().includes("Doc/pic.png"));
  assert.ok(!gh.requests.some((r) => r.path.includes("/git/blobs")));
});

test("a page's history comes from GitHub", async () => {
  gh.push({ "A.md": "one" }, "First");
  gh.push({ "B.md": "x" }, "Other");
  gh.push({ "A.md": "two" }, "Second");
  const ws = await opened();
  const log = await ws.github.log("octo", "notes", "main", "A.md", 100);
  assert.deepEqual(log.map((c) => c.subject), ["Second", "First"]);
  assert.ok(log[0].timestamp > 1_000_000_000 && log[0].timestamp < 10_000_000_000, "in seconds, like git");
  assert.equal(await ws.github.show("octo", "notes", log[1].hash, "A.md"), "one");
});

// Holds back the page-reading requests until a test lets them go.
const holdPages = () => {
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  gh.before = async (_method, path) => {
    if (path === "/graphql") await held;
  };
  return release;
};
const big = () => Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`Page ${i}.md`, `page ${i}`]));

test("opens before its pages have loaded, and fills in behind", async () => {
  gh.push({ ...big(), "Icon.md": "---\nicon: 🌟\n---\nx" });
  const release = holdPages();
  const { ws } = device();
  await Promise.race([ws.open(), new Promise((_, no) => setTimeout(() => no(new Error("open waited for the pages")), 1500))]);
  const notes = vault.listNotes(ws);
  assert.equal(notes.length, 251, "the whole page list is there");
  assert.equal(notes.find((n) => n.path === "Page 7.md")!.title, "Page 7", "named after their files for now");
  assert.equal(notes.find((n) => n.path === "Icon.md")!.icon, null);
  release();
  await ws.loadRest();
  assert.equal(vault.listNotes(ws).find((n) => n.path === "Icon.md")!.icon, "🌟");
  assert.equal(ws.read("Page 7.md"), "page 7");
  assert.deepEqual(ws.changes(), [], "loading isn't editing");
  const progress = events.filter(([e]) => e === "load-progress").map(([, p]) => p as { done: number; total: number });
  assert.deepEqual(progress.at(-1), { done: 251, total: 251 });
  assert.ok(events.some(([e]) => e === "vault-changed"), "the interface hears about it");
  ws.dispose();
});

test("the workspace's settings are there from the start", async () => {
  gh.push({ ...big(), ".betelgeuse/plugins.json": '{"enabled":["finance"]}', ".betelgeuse/config.json": '{"ai":{"policy":"shared"}}' });
  const { ws } = device();
  await ws.open();
  assert.equal(ws.read(".betelgeuse/plugins.json"), '{"enabled":["finance"]}');
  assert.equal(vault.aiPolicy(ws), "shared");
  await ws.loadRest();
  ws.dispose();
});

test("a page asked for goes ahead of the queue", async () => {
  gh.push(big());
  const { ws } = device();
  await ws.open();
  await ws.ensure(["Page 200.md"]);
  assert.equal(ws.read("Page 200.md"), "page 200");
  await ws.loadRest();
  ws.dispose();
});

test("an edit made while pages load isn't overwritten", async () => {
  gh.push(big());
  const release = holdPages();
  const { ws } = device();
  await ws.open();
  ws.write("Page 3.md", "edited early");
  release();
  await ws.loadRest();
  assert.equal(ws.read("Page 3.md"), "edited early");
  assert.deepEqual(ws.changes(), [{ path: "Page 3.md", status: "modified" }]);
  gh.before = undefined;
  await ws.sync();
  assert.equal(gh.text("Page 3.md"), "edited early");
  assert.equal(gh.text("Page 4.md"), "page 4", "the rest untouched");
  ws.dispose();
});

test("syncing during the load can't name a private page in a commit", async () => {
  gh.push({ ...big(), "Secret.md": "---\nai: false\n---\nx" });
  const release = holdPages();
  const { ws } = device();
  await ws.open();
  // Its parent, which says it's private, hasn't been read yet.
  ws.write("Secret/Child.md", "new");
  const syncing = ws.sync();
  // Long enough for a sync that didn't wait to have committed already, naming the page.
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!gh.files().includes("Secret/Child.md"), "nothing is pushed until every page is read");
  release();
  await syncing;
  assert.equal(gh.log()[0].message, "Update 1 private page");
  ws.dispose();
});

test("renaming waits for every page, so no link is missed", async () => {
  gh.push({ ...big(), "Target.md": "t", "Zed links.md": "[[Target]]" });
  const release = holdPages();
  const { ws } = device();
  await ws.open();
  const invoke = makeCommands(ws, {} as never, new MemoryKV());
  const renamed = invoke<string>("rename_note", { path: "Target.md", title: "Moved" });
  release();
  assert.equal(await renamed, "Moved.md");
  assert.equal(ws.read("Zed links.md"), "[[Moved]]");
  ws.dispose();
});

test("opening a page or database reads it first", async () => {
  gh.push({ ...big(), "Db.md": "d", "Db/Row.md": "---\nStatus: Doing\n---\nrow" });
  const { ws } = device();
  await ws.open();
  const invoke = makeCommands(ws, {} as never, new MemoryKV());
  assert.equal(await invoke("read_note", { path: "Db.md" }), "d");
  const rows = await invoke<vault.Row[]>("database_rows", { path: "Db.md" });
  assert.equal(rows[0].content, "---\nStatus: Doing\n---\nrow");
  await assert.rejects(invoke("read_note", { path: "Nope.md" }), /no such page/);
  await ws.loadRest();
  ws.dispose();
});

test("closing partway picks up where it left off", async () => {
  gh.push(big());
  const store = new MemoryKV();
  const first = device(store).ws;
  await first.open();
  await first.ensure(["Page 1.md"]);
  await first.loadRest();
  await first.flush();
  first.dispose();
  // Half the cache goes missing, as if the tab closed midway.
  const blobs = await store.all<string>("blobs");
  for (const [sha] of blobs.slice(0, 120)) await store.del("blobs", sha);
  gh.requests = [];
  const second = device(store).ws;
  await second.open();
  await second.loadRest();
  assert.equal(second.read("Page 200.md"), "page 200");
  assert.equal(gh.requests.filter((r) => r.path === "/graphql").length, 2, "only what was missing");
  assert.deepEqual(second.changes(), []);
  second.dispose();
});

test("a failed load is retried, and edits wait safely", async () => {
  gh.push(big());
  let fail = true;
  gh.before = (_m, path) => {
    if (path === "/graphql" && fail) throw new Error("boom");
  };
  const { ws } = device();
  await ws.open();
  await ws.loadRest().catch(() => {});
  ws.write("Page 2.md", "kept");
  await assert.rejects(ws.sync());
  assert.equal(gh.text("Page 2.md"), "page 2");
  fail = false;
  await ws.sync();
  assert.equal(gh.text("Page 2.md"), "kept");
  assert.equal(ws.read("Page 200.md"), "page 200");
  ws.dispose();
});

test("merging text", () => {
  assert.equal(mergeText("a\nb\nc", "A\nb\nc", "a\nb\nC"), "A\nb\nC");
  assert.equal(mergeText("a", "b", "c"), null);
  assert.equal(conflictedCopyPath("N/Plan.md", () => false), "N/Plan (conflicted copy).md");
  assert.equal(conflictedCopyPath("Plan.md", (c) => c === "Plan (conflicted copy).md"), "Plan (conflicted copy 2).md");
});
