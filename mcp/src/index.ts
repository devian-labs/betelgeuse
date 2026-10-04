#!/usr/bin/env node
/**
 * Betelgeuse MCP server: gives AI agents structured access to a Betelgeuse workspace
 * (a folder of Markdown notes tracked in git).
 *
 *   betelgeuse-mcp --workspace ~/Betelgeuse                 # stdio
 *   betelgeuse-mcp --workspace ~/Betelgeuse --http 3917     # Streamable HTTP on 127.0.0.1:3917/mcp
 *   betelgeuse-mcp --workspace ~/Betelgeuse --read-only     # no write tools
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { Vault, type FrontmatterPatch } from "./vault.js";

const { values: args } = parseArgs({
  options: {
    workspace: { type: "string" },
    vault: { type: "string" }, // older name for --workspace
    http: { type: "string" },
    host: { type: "string", default: "127.0.0.1" },
    "read-only": { type: "boolean", default: false },
  },
});

const expandHome = (p: string) => (p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p);
const root = path.resolve(expandHome(args.workspace ?? args.vault ?? process.env.BETELGEUSE_WORKSPACE ?? process.env.BETELGEUSE_VAULT ?? "~/Betelgeuse"));
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`betelgeuse-mcp: workspace folder not found: ${root}\nPass --workspace <path> or set BETELGEUSE_WORKSPACE.`);
  process.exit(1);
}
const vault = new Vault(root);
const readOnly = args["read-only"];

const INSTRUCTIONS = `Betelgeuse is the user's personal knowledge base: a folder of Markdown notes tracked in git.

Conventions:
- A note's title is its file name. Paths are workspace-relative, e.g. "Projects/Launch plan.md".
- Sub-pages live in a folder named after their parent: "Projects/Launch plan.md" is a child of "Projects.md".
- Notes may start with YAML frontmatter. Common keys are "icon" (one emoji) and "tags" (a list).
- Notes link to each other with [[Title]] or [[Title|label]] wikilinks.
- The body is GitHub-flavoured Markdown: headings, lists, "- [ ]" task lists, tables, code blocks and quotes.
- Notion-style blocks use readable HTML-ish syntax: <span data-color="red" data-bg="yellow">text</span> for colours,
  "> [!yellow] 💡" callouts, <details><summary>Title</summary> … </details> toggles,
  <div class="columns"><div class="column"> … </div></div> columns, and "![[Database]]" to embed a database.

Databases:
- A database is a page with "type: database" in its frontmatter and a \`\`\`database JSON block that defines its
  properties (Status, Tags, Due…) and views. Its rows are its sub-pages; each row's property values are in the
  row's YAML frontmatter, keyed by property name (e.g. "Status: Done", "Due: 2026-10-04", "Tags: [a, b]").
- Use query_database to read a database as a table. To add a row, call create_note with parent set to the
  database and the property values in frontmatter. To change values, call update_note with frontmatter only.
- Select and status values must match one of the property's option names; dates are YYYY-MM-DD.

How to work:
- Start with search_notes or list_notes. Call read_note before editing a note.
- Wherever a note is expected you can pass either its path or its title.
- Prefer update_note with mode "append" when adding to a note, so the user's content stays as it is.
- Each write is committed to git separately, so the user can review and revert it. Write one-line summaries a person can read.
- The user can hide pages from agents. Hidden pages don't appear anywhere in these tools; don't guess at or ask about them.`;

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));
const fail = (e: unknown) => ({ ...text(e instanceof Error ? e.message : String(e)), isError: true });
const safe =
  <A,>(fn: (a: A) => Promise<ReturnType<typeof text>>) =>
  async (a: A) => {
    try {
      return await fn(a);
    } catch (e) {
      return fail(e);
    }
  };

const frontmatterSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]))
  .optional()
  .describe('Frontmatter keys to set, e.g. {"icon": "🚀", "tags": ["project"], "Status": "Done", "Estimate": 3}. Set a key to null to remove it.');

function buildServer(): McpServer {
  const server = new McpServer({ name: "betelgeuse", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const agent = () => server.server.getClientVersion()?.name ?? "agent";
  const commit = (paths: string[], message: string) => vault.commit(paths, message, agent());

  // ---------- read ----------

  server.registerTool(
    "workspace_info",
    {
      title: "Workspace info",
      description: "Where the workspace is, how many notes it has, its tags and recent git activity.",
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const notes = await vault.list();
      const recent = [...notes].sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 10);
      return json({
        root,
        notes: notes.length,
        git: await vault.isRepo(),
        readOnly,
        tags: await vault.tags(),
        recentlyModified: recent.map((n) => ({ path: n.path, modified: n.modified })),
      });
    }),
  );

  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description: "Lists notes as a page tree with titles, icons and tags. Optionally filter by folder or tag.",
      inputSchema: {
        folder: z.string().optional().describe('Only notes under this folder, e.g. "Projects"'),
        tag: z.string().optional().describe("Only notes with this tag"),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ folder, tag }) => {
      let notes = await vault.list();
      if (folder) notes = notes.filter((n) => n.path.startsWith(`${folder.replace(/\/$/, "")}/`));
      if (tag) notes = notes.filter((n) => n.tags.some((t) => t.toLowerCase() === tag.toLowerCase().replace(/^#/, "")));
      const lines = notes.map((n) => {
        const depth = n.path.split("/").length - 1;
        const meta = [n.tags.length ? `#${n.tags.join(" #")}` : "", n.path].filter(Boolean).join("  ");
        return `${"  ".repeat(depth)}- ${n.icon ? `${n.icon} ` : ""}${n.title}  (${meta})`;
      });
      return text(lines.length ? lines.join("\n") : "No notes match.");
    }),
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description: "Case-insensitive full-text search over titles, tags and bodies. Returns ranked matches with snippets.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ query, limit }) => json(await vault.search(query, limit))),
  );

  server.registerTool(
    "read_note",
    {
      title: "Read note",
      description: "Reads a note's frontmatter and Markdown body, with its outgoing [[links]] and the notes that link to it.",
      inputSchema: { note: z.string().describe("Note path or title") },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ note }) => {
      const n = await vault.read(await vault.find(note));
      const header = {
        path: n.path,
        title: n.title,
        frontmatter: n.frontmatter,
        links: n.links,
        backlinks: n.backlinks,
        modified: n.modified,
      };
      return text(`${JSON.stringify(header, null, 2)}\n\n----- body -----\n${n.body}`);
    }),
  );

  server.registerTool(
    "note_history",
    {
      title: "Note history",
      description:
        "Lists git commits that changed a note. Pass a revision to get the note's full content at that commit, e.g. to see what changed or recover text.",
      inputSchema: {
        note: z.string().describe("Note path or title"),
        revision: z.string().optional().describe("Commit hash from the history list"),
        limit: z.number().int().min(1).max(200).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ note, revision, limit }) => {
      // A deleted note can still have history, so fall back to the literal path, but never for a hidden page.
      const rel = await vault.find(note).catch(async (e) => {
        if (await vault.isHidden(note)) throw e;
        return note.endsWith(".md") ? note : `${note}.md`;
      });
      return revision ? text(await vault.readAt(rel, revision)) : json(await vault.history(rel, limit));
    }),
  );

  server.registerTool(
    "query_database",
    {
      title: "Query database",
      description:
        "Reads a database: its properties (with select options) and its rows as records of property values. Optionally filter rows by exact property values and sort them.",
      inputSchema: {
        database: z.string().describe("Database page path or title"),
        where: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe('Exact matches, e.g. {"Status": "In progress"}. For list properties, matches if the list contains the value.'),
        sort: z.string().optional().describe("Property to sort by; prefix with - for descending, e.g. \"-Due\""),
        limit: z.number().int().min(1).max(500).default(100),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ database, where, sort, limit }) => {
      const rel = await vault.find(database);
      const { schema, rows } = await vault.database(rel);
      let out = rows as Record<string, unknown>[];
      for (const [k, v] of Object.entries(where ?? {})) {
        out = out.filter((r) => (Array.isArray(r[k]) ? (r[k] as unknown[]).map(String).includes(String(v)) : String(r[k] ?? "") === String(v)));
      }
      if (sort) {
        const key = sort.replace(/^-/, "");
        const dir = sort.startsWith("-") ? -1 : 1;
        out = [...out].sort((a, b) => {
          const [x, y] = [a[key], b[key]];
          if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
          return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
        });
      }
      return json({ database: rel, properties: schema.properties, views: (schema.views ?? []).map((v: { name: string; type: string }) => `${v.name} (${v.type})`), rows: out.slice(0, limit) });
    }),
  );

  server.registerResource(
    "note",
    new ResourceTemplate("betelgeuse://note/{+path}", {
      list: async () => ({
        resources: (await vault.list()).map((n) => ({
          uri: `betelgeuse://note/${n.path.split("/").map(encodeURIComponent).join("/")}`,
          name: n.title,
          description: n.path,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { title: "Betelgeuse note", description: "A note in the workspace as raw Markdown", mimeType: "text/markdown" },
    async (uri, { path: p }) => {
      const rel = await vault.find(decodeURIComponent(String(p)));
      const n = await vault.read(rel);
      const fm = Object.keys(n.frontmatter).length ? `${JSON.stringify(n.frontmatter)}\n\n` : "";
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: `${fm}${n.body}` }] };
    },
  );

  if (readOnly) return server;

  // ---------- write ----------

  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description:
        "Creates a note. The title becomes the file name; if that name is taken, a number is added. Pass parent to create it as a sub-page.",
      inputSchema: {
        title: z.string().min(1),
        body: z.string().default("").describe("Markdown body. Do not repeat the title as a heading."),
        parent: z.string().optional().describe("Path or title of the parent note"),
        frontmatter: frontmatterSchema,
      },
    },
    safe(async ({ title, body, parent, frontmatter }) => {
      const rel = await vault.create(title, body, { parent, frontmatter: frontmatter as FrontmatterPatch });
      const rev = await commit([rel], `create ${rel}`);
      return json({ path: rel, commit: rev });
    }),
  );

  server.registerTool(
    "update_note",
    {
      title: "Update note",
      description:
        'Changes a note\'s body and/or frontmatter. mode "append" (the default) adds to the end, "prepend" adds to the start, and "replace" overwrites the whole body. Read the note before using "replace".',
      inputSchema: {
        note: z.string().describe("Note path or title"),
        body: z.string().optional(),
        mode: z.enum(["append", "prepend", "replace"]).default("append"),
        frontmatter: frontmatterSchema,
        summary: z.string().optional().describe("One-line commit message describing the change"),
      },
      annotations: { destructiveHint: true },
    },
    safe(async ({ note, body, mode, frontmatter, summary }) => {
      const rel = await vault.find(note);
      await vault.update(rel, { body, mode, frontmatter: frontmatter as FrontmatterPatch });
      const rev = await commit([rel], summary ?? `${mode} ${rel}`);
      return json({ path: rel, commit: rev });
    }),
  );

  server.registerTool(
    "rename_note",
    {
      title: "Rename note",
      description: "Renames a note and its sub-pages folder, and updates every [[link]] to it.",
      inputSchema: { note: z.string().describe("Note path or title"), title: z.string().min(1).describe("New title") },
      annotations: { destructiveHint: true },
    },
    safe(async ({ note, title }) => {
      const rel = await vault.find(note);
      const { path: next, touched } = await vault.rename(rel, title);
      const rev = await commit(touched, `rename ${rel} → ${next}`);
      return json({ path: next, updated: touched, commit: rev });
    }),
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description: "Moves a note and its sub-pages to the Trash, where the user can restore them. Only use this when the user asks for it.",
      inputSchema: { note: z.string().describe("Note path or title") },
      annotations: { destructiveHint: true },
    },
    safe(async ({ note }) => {
      const rel = await vault.find(note);
      const removed = await vault.delete(rel);
      const rev = await commit(removed, `move ${rel} to Trash`);
      return json({ movedToTrash: removed, commit: rev });
    }),
  );

  return server;
}

if (args.http) {
  const port = Number(args.http);
  // Stateless: a fresh server per request keeps concurrent clients isolated.
  createServer(async (req, res) => {
    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404).end();
      return;
    }
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  }).listen(port, args.host, () => {
    console.error(`betelgeuse-mcp: serving workspace ${root} at http://${args.host}:${port}/mcp${readOnly ? " (read-only)" : ""}`);
  });
} else {
  await buildServer().connect(new StdioServerTransport());
  console.error(`betelgeuse-mcp: serving workspace ${root} over stdio${readOnly ? " (read-only)" : ""}`);
}
