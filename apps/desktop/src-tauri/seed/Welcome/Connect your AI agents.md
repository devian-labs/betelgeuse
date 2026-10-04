---
icon: 🤖
tags: [guide, mcp, agents]
---
Betelgeuse comes with an MCP server that works directly on this workspace. AI agents such as Claude and Cursor can list, search, read, create and edit pages, query databases, follow backlinks and read git history. **Every change an agent makes is a separate git commit**, so you can review it or undo it.

## Connecting an agent

Click **Connect agents** in the sidebar, or **Settings → AI agents → Connect agents**. Pick your client and copy its ready-made setup:

| Client         | Setup                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Claude Code    | Run the `claude mcp add` command shown, then check it with `/mcp`              |
| Claude Desktop | Add the snippet to `claude_desktop_config.json` and restart Claude             |
| Cursor         | Add the snippet in **Settings → MCP**, or to `~/.cursor/mcp.json`              |
| HTTP           | Start the server with `--http 3917` and connect to `http://127.0.0.1:3917/mcp` |

Turn on **read-only** to give an agent the reading tools only.

> [!orange] 🔧
> The server needs Node.js 20 or newer. If the dialog says the server isn't built yet, run `npm run mcp:build` in the Betelgeuse folder.

<details>
<summary>Running the server by hand</summary>

```bash
node packages/mcp/dist/index.js --workspace ~/Betelgeuse              # stdio
node packages/mcp/dist/index.js --workspace ~/Betelgeuse --http 3917  # http://127.0.0.1:3917/mcp
node packages/mcp/dist/index.js --workspace ~/Betelgeuse --read-only  # read tools only
```

</details>

## What agents can do

| Tool             | What it does                                                         |
| ---------------- | -------------------------------------------------------------------- |
| `workspace_info` | Where the workspace is, its page count, tags and recent commits      |
| `list_notes`     | The page tree with titles, icons and tags                            |
| `search_notes`   | Full-text search, with snippets                                      |
| `read_note`      | A page's frontmatter and Markdown, its links and its backlinks       |
| `query_database` | A database's rows as records, filtered and sorted                    |
| `note_history`   | A page's git log, and its content at any earlier commit              |
| `create_note`    | Create a page, optionally as a sub-page                              |
| `update_note`    | Append, prepend or replace a page's text, and change its frontmatter |
| `rename_note`    | Rename a page and update every link to it                            |
| `delete_note`    | Move a page to the Trash                                             |

Pages are also available to agents as `betelgeuse://note/{path}` resources, and the server tells agents how this workspace works: frontmatter, wikilinks, sub-pages and databases.

## Reviewing what agents did

Each agent write is its own commit, authored as the agent's name followed by "via Betelgeuse MCP". In a page's history, agent commits have a robot icon, and you can restore any earlier version. See [[History and sync]].

## Things to try

- [ ] Ask your agent to "add three ideas to the Ideas page", then open [[Ideas]] and its history
- [ ] Ask it which [[Roadmap]] tasks are still in progress
- [ ] Ask it to summarise the pages that link to [[Databases]]

You decide which pages agents can see. See [[What AI agents can see]].
