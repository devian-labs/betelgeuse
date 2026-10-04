# Betelgeuse

A block-based notebook on a plain-files workspace: every page is a Markdown file in a git repository, and an open MCP server lets AI agents read and write it.

[Website](https://betelgeuse.devianlabs.com) · [Download](https://github.com/devian-labs/betelgeuse/releases/latest) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

[![CI](https://github.com/devian-labs/betelgeuse/actions/workflows/ci.yml/badge.svg)](https://github.com/devian-labs/betelgeuse/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="lander/public/assets/editor-dark-1440.jpg">
  <img alt="The Betelgeuse editor with the page tree in the sidebar" src="lander/public/assets/editor-light-1440.jpg">
</picture>

## Install

Betelgeuse runs on macOS, Windows and Linux. The MCP server for AI agents needs Node.js 20 or newer.

### Install from source

This is the easiest and safest option. Building locally means your OS trusts the app, so there are no "unidentified developer" warnings. You need git, Node.js 20+ and [Rust](https://rustup.rs). On macOS you also need the Xcode Command Line Tools, on Linux [WebKitGTK](https://v2.tauri.app/start/prerequisites/#linux), and on Windows the Visual Studio C++ Build Tools. The script checks for each one.

```sh
# macOS and Linux: installs to /Applications, or the .deb / ~/.local/bin on Linux
git clone https://github.com/devian-labs/betelgeuse && cd betelgeuse && ./scripts/install.sh
```

```powershell
# Windows: builds and runs the installer
git clone https://github.com/devian-labs/betelgeuse; cd betelgeuse; .\scripts\install.ps1
```

Pass `--build-only` to `install.sh` to build without installing. The first build takes a few minutes.

### Download a build

Each [GitHub release](https://github.com/devian-labs/betelgeuse/releases) has a `.dmg` for Apple Silicon and Intel Macs, a Windows `.exe` installer, and a Linux `.AppImage` and `.deb`. They aren't signed with Apple or Microsoft certificates yet, so:

- **macOS** says it "can't verify the developer" the first time. Open **System Settings → Privacy & Security** and click **Open Anyway**, or run `xattr -dr com.apple.quarantine /Applications/Betelgeuse.app`.
- **Windows** SmartScreen may appear. Click **More info → Run anyway**.

## Develop

```sh
npm install && npm --prefix mcp install
npm run app          # builds the MCP server, then `tauri dev`
```

On first launch Betelgeuse creates `~/Betelgeuse`, runs `git init` and adds a Welcome guide: one page per feature, each using the blocks it describes (`src-tauri/seed/`). Click the workspace name in the sidebar to open or create another folder. Set `BETELGEUSE_WORKSPACE=/some/dir` to use a different workspace for a single run. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup.

## How the workspace works

| Concept | On disk |
| --- | --- |
| Page | `Title.md`. The file name is the title. |
| Sub-page | `Parent/Child.md` is nested under `Parent.md` |
| Icon and tags | YAML frontmatter: `icon: 🚀`, `tags: [a, b]` |
| Page link | `[[Title]]` or `[[Title\|label]]`. Renaming a page rewrites links to it. |
| History | Git. Changes are committed after 8 s of quiet. `⌘S` commits now. Sync runs pull and push when a remote is set. |

Obsidian, VS Code or plain git can open the workspace while Betelgeuse is running. The app watches the folder and reloads open pages when they change on disk.

## Editor

The editor is a block editor built on Tiptap 3, with its own Betelgeuse, Graphite and Midnight palettes in light and dark mode.

- **Blocks:** text, H1 to H3, to-do, bulleted and numbered lists, toggle, quote, callout, divider, table, image, code (syntax highlighting, language picker, copy, wrap), 2 to 4 columns, sub-page, link to page, and inline or full-page database.
- **Ways to insert and change blocks:**
  - `/` opens the menu, grouped as Basic blocks, Inline, Database, Media, Layout and Colours.
  - `+` adds a block below.
  - `⋮⋮` lets you drag a block, or click it for Turn into, Colour, Duplicate and Delete.
  - `⌘⌥0` to `⌘⌥8` turn the current block into another type, and `⌘D` duplicates it.
- **Selection menu:** Turn into, Link, bold, italic, strikethrough, code, and text or background colour. `⌘⇧H` highlights.
- **Links and mentions:** `[[` and `@` link pages. `@today` inserts the date.
- **Pages:** cover (gradients, colours or a link), icon, tags, Default/Serif/Mono style, small text, full width, favourites, duplicate, word count, and empty-page starters (Table, Board, Calendar).

Every block is stored as readable Markdown:

| Block | Markdown |
| --- | --- |
| Text colour / background | `<span data-color="red" data-bg="yellow">…</span>` |
| Callout | `> [!yellow] 💡` (Obsidian callout) |
| Toggle | `<details><summary>…</summary>…</details>` |
| Columns | `<div class="columns"><div class="column">…</div></div>` |
| Inline database | `![[Tasks]]` (Obsidian embed) |

`tests/markdown.test.mjs` loads each of these into the editor and saves it again, checking the output is byte-for-byte unchanged so saves don't create noisy git diffs.

## Databases

A database is a page with `type: database` in its frontmatter and a ```` ```database ```` JSON block holding its properties and views. Its rows are its sub-pages, and each row's values sit in that row's YAML frontmatter:

```yaml
---
Status: In progress
Estimate: 3
Due: 2026-10-09
Tags: [agents]
---
```

- **Views:** table, board (drag cards between groups), list, gallery and calendar (drag rows between days). Add, rename, duplicate or delete views, and switch layouts.
- **Property types:** title, text, number (number formats and currencies), select, multi-select, status, date, checkbox, URL, email, created time and last edited time.
- **Columns:** rename, change type, hide, reorder by dragging, resize, wrap, and edit options with colours.
- **Sort, filter and search:** sort and filter pills, and search inside the database.
- **Footer calculations:** count all, values, empty, not empty, unique, percent empty and not empty, sum, average, median, min, max, range, checked, unchecked, percent checked, and earliest, latest and date range.
- **Rows:** click OPEN to see a row in a side peek with its properties at the top, or open it as a full page.

## Trash

Deleting a page moves it, and everything inside it, to the Trash, and a toast offers Undo. The Trash opens from the sidebar, below Settings. You can search it, **Restore** a page to where it was (renamed if that name is now taken), **Delete forever**, or **Empty Trash**. Items are removed automatically after 30 days.

Trashed pages live in a hidden `.trash/` folder that git ignores, so they stay out of search, links and the MCP server. Every earlier version is still in git history. When an agent deletes a page through MCP, it goes to the same Trash.

## What AI agents can see

Each page has a **Visible to AI agents** switch. You'll find it in the page's `•••` menu and the sidebar's row menu. Hiding a page also hides its sub-pages. It's stored as `ai: false` (or `ai: true`) in the page's frontmatter. The workspace-wide policy lives in `.betelgeuse/config.json`, and you change it under Settings → AI agents:

- **All pages, except ones I hide** (the default).
- **Only pages I share.** Pages agents create are shared automatically.

The MCP server enforces this on every tool. Hidden pages are left out of listings, search, links, backlinks, history, database rows and resources. Reading, editing or creating under them fails as if they didn't exist. Auto-commit messages say "private page" instead of naming hidden pages, because agents can read the git log. This covers agents using the MCP server, not an agent you've given direct access to the folder itself.

## Import

Settings → Import (or **Import** in the sidebar):

- **Notion:** use a "Markdown & CSV" export with subpages, as the .zip or the unzipped folder.
  - Notion's IDs are removed from file names, and links become `[[wikilinks]]`.
  - Images are copied to `.assets/`.
  - Each database CSV becomes a database. Property types are inferred: number, date, checkbox, select, status, multi-select, URL and email.
  - Each database gets a table view, plus a board view if it has a Status or Select column and a calendar view if it has a date column.
- **Obsidian:** choose the vault folder.
  - Folders and `[[links]]` are kept as they are, and `.obsidian` is skipped.
  - Attachments and `![[image.png]]` embeds go to `.assets/`.
  - Callout types are mapped to colours and icons.

Everything lands under a single new page and is committed as one change.

## MCP server (`mcp/`)

```sh
node mcp/dist/index.js --workspace ~/Betelgeuse              # stdio
node mcp/dist/index.js --workspace ~/Betelgeuse --http 3917  # http://127.0.0.1:3917/mcp
node mcp/dist/index.js --workspace ~/Betelgeuse --read-only  # read tools only
claude mcp add betelgeuse -- node "$PWD/mcp/dist/index.js" --workspace ~/Betelgeuse
```

**Tools:**

- `workspace_info`, `list_notes`, `search_notes`, `read_note`, `query_database` (rows as records, with filter and sort)
- `create_note`, `update_note` (append, prepend or replace, plus frontmatter patches)
- `rename_note`, `delete_note`, `note_history` (git log, and a page's content at any revision)

Notes are also available as `betelgeuse://note/{path}` resources. The server sends agents the workspace conventions as MCP instructions.

Every agent write becomes its own commit, authored as `<client> via Betelgeuse MCP`. The History panel marks agent commits with a bot badge and can restore any version.

The **Connect agents** button in the sidebar gives copy-paste configuration for Claude Code, Claude Desktop, Cursor and HTTP clients.

## Layout

```
src/              React UI: components/, editor/ (Tiptap extensions), lib/
src-tauri/src/    vault.rs (workspace files, links, search), git.rs (git CLI), lib.rs (commands, watcher, auto-commit)
mcp/src/          MCP server: vault.ts mirrors the Rust workspace rules
tests/            editor Markdown round-trip tests
lander/           landing page (Next.js static export, deployed on Vercel)
```

`npm test` runs four test suites: editor round-trip, database engine, MCP end-to-end against a temporary git workspace, and the Rust unit tests.

## POC limits

- Search is a linear scan. Fine for thousands of notes; a real index (tantivy or SQLite FTS) comes next.
- Formulas, relations and rollups aren't implemented. Board groups and calendar dates are the only grouping options.
- There are no comments, page templates or sharing.
- There is no conflict UI. If an agent and you edit the same page at the same moment, the last write wins, though git keeps both versions.
- The MCP server runs from the source tree. Shipping it as a Tauri sidecar is the next step.

## License

[MIT](LICENSE). Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). If Betelgeuse is useful to you, [sponsoring](https://github.com/sponsors/devian-labs) helps pay for signed builds.
