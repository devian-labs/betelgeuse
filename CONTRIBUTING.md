# Contributing to Betelgeuse

Thanks for helping. Bug reports, ideas, docs and code are all welcome.

## Set up

You need Node.js 20+, Rust (via [rustup](https://rustup.rs)) and git. On macOS, also install the Xcode Command Line Tools (`xcode-select --install`). On Linux, install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

```sh
git clone https://github.com/devian-labs/betelgeuse && cd betelgeuse
npm install && npm --prefix mcp install
npm run tauri dev          # the app, with hot reload
npm test                   # all test suites
```

To develop against a throwaway workspace instead of `~/Betelgeuse`, run `BETELGEUSE_WORKSPACE=/tmp/bg-dev npm run tauri dev`.

## How the code is organised

| Folder | What's there |
| --- | --- |
| `src/editor/` | Tiptap editor, custom blocks and their Markdown syntax (`blocks.tsx`), slash menu |
| `src/database/` | Database model (filters, sorts, calculations), views and property editors |
| `src/components/` | App shell: sidebar, page view, settings, dialogs |
| `src-tauri/src/` | Rust backend: workspace files (`vault.rs`), git (`git.rs`), importers, trash, AI visibility |
| `mcp/src/` | The MCP server. `vault.ts` mirrors the Rust rules, so the app and agents agree |
| `tests/` | Markdown round-trip and database tests |
| `lander/` | The landing page: a Next.js static export, deployed on Vercel. `npm --prefix lander install && npm --prefix lander run dev` |

## Ground rules

- **Files stay readable.** Anything stored must be plain Markdown, YAML frontmatter or JSON that someone could edit by hand. A new block needs a Markdown syntax plus a round-trip test in `tests/markdown.test.mjs`.
- **The app and the MCP server agree.** If you change how pages, links, frontmatter or AI visibility work, change both `src-tauri/src/vault.rs` and `mcp/src/vault.ts`, and add tests to both.
- **Agents never see hidden pages.** Any new MCP tool must go through `Vault.files()` / `Vault.find()`.
- Keep pull requests focused and include screenshots for UI changes, in light and dark.

## Releasing

Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, then push a `vX.Y.Z` tag. The Release workflow builds every platform into a draft GitHub release.
