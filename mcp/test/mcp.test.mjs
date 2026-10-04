// End-to-end: spawn the built server over stdio against a throwaway git vault.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const vault = mkdtempSync(path.join(os.tmpdir(), "betelgeuse-test-"));
const git = (...a) => execFileSync("git", ["-C", vault, ...a], { encoding: "utf8" });
let client;

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  assert.ok(!r.isError, r.content[0].text);
  return r.content[0].text;
};

before(async () => {
  mkdirSync(path.join(vault, "Projects"));
  writeFileSync(path.join(vault, "Projects.md"), "---\nicon: 🚀\ntags: [work]\n---\nAll projects. See [[Ideas]].\n");
  writeFileSync(path.join(vault, "Projects/Launch.md"), "Ship the comet tracker.\n");
  writeFileSync(path.join(vault, "Ideas.md"), "- a telescope app\n");
  mkdirSync(path.join(vault, "Tasks"));
  writeFileSync(
    path.join(vault, "Tasks.md"),
    '---\ntype: database\n---\n```database\n{"properties":[{"name":"Status","type":"status","options":[{"name":"Todo","color":"gray"},{"name":"Done","color":"green"}]},{"name":"Estimate","type":"number"}],"views":[{"id":"t","name":"Table","type":"table"}]}\n```\n',
  );
  writeFileSync(path.join(vault, "Tasks/Write tests.md"), "---\nStatus: Done\nEstimate: 2\n---\n");
  writeFileSync(path.join(vault, "Tasks/Ship it.md"), "---\nStatus: Todo\nEstimate: 5\n---\n");
  git("init", "-q", "-b", "main");
  git("-c", "user.name=t", "-c", "user.email=t@t", "add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  client = new Client({ name: "test-agent", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({ command: "node", args: [path.resolve("dist/index.js"), "--workspace", vault], stderr: "ignore" }),
  );
});

after(() => client?.close());

test("lists tools and instructions", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "create_note", "delete_note", "list_notes", "note_history", "query_database", "read_note", "rename_note", "search_notes", "update_note", "workspace_info",
  ]);
  assert.match(client.getInstructions(), /wikilinks/);
});

test("lists the tree and reads notes by title with backlinks", async () => {
  assert.match(await call("list_notes"), /🚀 Projects.*#work[\s\S]*  - Launch/);
  const ideas = await call("read_note", { note: "ideas" });
  assert.match(ideas, /"backlinks": \[\s*"Projects.md"/);
  assert.match(ideas, /a telescope app/);
});

test("search ranks title hits and returns snippets", async () => {
  const hits = JSON.parse(await call("search_notes", { query: "comet" }));
  assert.equal(hits[0].path, "Projects/Launch.md");
  assert.match(hits[0].snippet, /comet tracker/);
});

test("writes are committed as the agent", async () => {
  const created = JSON.parse(
    await call("create_note", { title: "Roadmap", parent: "Projects", body: "Q1: [[Launch]]", frontmatter: { tags: ["plan"] } }),
  );
  assert.equal(created.path, "Projects/Roadmap.md");
  assert.ok(created.commit);
  await call("update_note", { note: "Roadmap", body: "Q2: scale", summary: "add Q2 to roadmap" });
  const file = readFileSync(path.join(vault, "Projects/Roadmap.md"), "utf8");
  assert.equal(file, "---\ntags: [plan]\n---\nQ1: [[Launch]]\n\nQ2: scale\n");
  assert.match(git("log", "-1", "--format=%an|%s"), /^test-agent via Betelgeuse MCP\|mcp: add Q2 to roadmap/);
  assert.equal(git("status", "--porcelain"), "");
});

test("rename rewrites links, history can read old revisions", async () => {
  const r = JSON.parse(await call("rename_note", { note: "Launch", title: "Comet launch" }));
  assert.equal(r.path, "Projects/Comet launch.md");
  assert.match(readFileSync(path.join(vault, "Projects/Roadmap.md"), "utf8"), /\[\[Comet launch\]\]/);
  const history = JSON.parse(await call("note_history", { note: "Comet launch" }));
  assert.equal(history.length, 2);
  assert.equal(await call("note_history", { note: "Comet launch", revision: history[1].rev }), "Ship the comet tracker.\n");
  assert.equal(git("status", "--porcelain"), "");
});

test("rejects paths outside the vault", async () => {
  const r = await client.callTool({ name: "read_note", arguments: { note: "../../etc/passwd" } });
  assert.ok(r.isError);
});

test("serves notes as resources", async () => {
  const { resources } = await client.listResources();
  const ideas = resources.find((r) => r.name === "Ideas");
  const { contents } = await client.readResource({ uri: ideas.uri });
  assert.match(contents[0].text, /telescope/);
});

test("queries a database and adds a row with typed properties", async () => {
  const all = JSON.parse(await call("query_database", { database: "Tasks", sort: "-Estimate" }));
  assert.deepEqual(all.rows.map((r) => r.Name), ["Ship it", "Write tests"]);
  assert.equal(all.properties[0].options.length, 2);
  await call("create_note", { title: "Review", parent: "Tasks", frontmatter: { Status: "Todo", Estimate: 1 } });
  assert.equal(readFileSync(path.join(vault, "Tasks/Review.md"), "utf8"), "---\nStatus: Todo\nEstimate: 1\n---\n");
  await call("update_note", { note: "Tasks/Review", frontmatter: { Status: "Done" } });
  const done = JSON.parse(await call("query_database", { database: "Tasks", where: { Status: "Done" } }));
  assert.deepEqual(done.rows.map((r) => r.Name).sort(), ["Review", "Write tests"]);
});

test("pages hidden from AI are invisible and untouchable", async () => {
  writeFileSync(path.join(vault, "Diary.md"), "---\nai: false\n---\nmy secret thoughts about comets\n");
  mkdirSync(path.join(vault, "Diary"), { recursive: true });
  writeFileSync(path.join(vault, "Diary/Monday.md"), "secret monday\n");
  writeFileSync(path.join(vault, "Ideas.md"), "- a telescope app\n- see [[Diary]]\n");
  assert.doesNotMatch(await call("list_notes"), /Diary|Monday/);
  assert.equal(JSON.parse(await call("search_notes", { query: "secret" })).length, 0);
  assert.doesNotMatch(await call("read_note", { note: "Ideas" }).then((t) => t.split("----- body")[0]), /Diary/);
  for (const [name, args] of [
    ["read_note", { note: "Diary" }],
    ["read_note", { note: "Diary/Monday" }],
    ["update_note", { note: "Diary", body: "x" }],
    ["delete_note", { note: "Diary/Monday" }],
    ["note_history", { note: "Diary" }],
    ["create_note", { title: "Tuesday", parent: "Diary" }],
  ]) {
    const r = await client.callTool({ name, arguments: args });
    assert.ok(r.isError, `${name} ${JSON.stringify(args)} should fail`);
  }
  const { resources } = await client.listResources();
  assert.ok(!resources.some((r) => /Diary/.test(r.uri)));
});

test("in shared-only mode agents see just shared pages, and pages they create are shared", async () => {
  mkdirSync(path.join(vault, ".betelgeuse"), { recursive: true });
  writeFileSync(path.join(vault, ".betelgeuse/config.json"), JSON.stringify({ ai: { policy: "shared" } }));
  writeFileSync(path.join(vault, "Public.md"), "---\nai: true\n---\nhello\n");
  const listing = await call("list_notes");
  assert.match(listing, /Public/);
  assert.doesNotMatch(listing, /Ideas|Projects/);
  const created = JSON.parse(await call("create_note", { title: "Agent notes", body: "hi" }));
  assert.match(readFileSync(path.join(vault, created.path), "utf8"), /^---\nai: true\n---/);
  assert.match(await call("list_notes"), /Agent notes/);
  writeFileSync(path.join(vault, ".betelgeuse/config.json"), JSON.stringify({ ai: { policy: "all" } }));
});

test("deleting moves a page to the Trash with its sub-pages", async () => {
  mkdirSync(path.join(vault, "Old/Sub"), { recursive: true });
  writeFileSync(path.join(vault, "Old.md"), "old page\n");
  writeFileSync(path.join(vault, "Old/Sub.md"), "sub page\n");
  const r = JSON.parse(await call("delete_note", { note: "Old" }));
  assert.deepEqual(r.movedToTrash, ["Old.md", "Old"]);
  const { readdirSync } = await import("node:fs");
  const [id] = readdirSync(path.join(vault, ".trash")).filter((d) => readFileSync(path.join(vault, ".trash", d, "meta.json"), "utf8").includes("Old.md"));
  assert.equal(readFileSync(path.join(vault, ".trash", id, "Old/Sub.md"), "utf8"), "sub page\n");
  assert.doesNotMatch(await call("list_notes"), /Old/);
});
