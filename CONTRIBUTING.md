# Contributing

Thanks for helping! Bug reports, ideas, docs and code are all welcome. For bigger changes, open an issue or a [discussion](https://github.com/devian-labs/betelgeuse/discussions) first so we can agree on the approach.

## Set up

You need [Node.js 20+](https://nodejs.org), [Rust](https://rustup.rs) and git. On macOS, also run `xcode-select --install`. On Linux, install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

```sh
git clone https://github.com/devian-labs/betelgeuse && cd betelgeuse
npm install      # installs every app and package (npm workspaces)
npm run app      # start the desktop app with hot reload
npm run lander   # start the website
npm test         # run all tests
```

To try things without touching your own notes, use a throwaway workspace: `BETELGEUSE_WORKSPACE=/tmp/bg-dev npm run app`.

## Where things are

| Folder | What's in it |
| --- | --- |
| `apps/desktop/` | The desktop app (Tauri). |
| `apps/desktop/src/` | The app's interface (React). The editor is in `src/editor/`, databases in `src/database/`. |
| `apps/desktop/src-tauri/` | The desktop backend (Rust): files, git, import, trash. |
| `apps/desktop/src-tauri/seed/` | The Welcome guide every new workspace starts with. |
| `apps/desktop/tests/` | Editor and database tests. |
| `apps/lander/` | The website ([betelgeuse.devianlabs.com](https://betelgeuse.devianlabs.com)). Run it with `npm run lander`. |
| `packages/mcp/` | The MCP server that AI agents connect to. The desktop app bundles it. |
| `brand/`, `scripts/` | Logos, and the install-from-source scripts. |

New clients (mobile, browser extension) go in `apps/`. Code shared between them goes in `packages/`. Run a script in one workspace with `npm run <script> -w <name>`, e.g. `npm run typecheck -w @betelgeuse/desktop`.

## A few rules

- **Keep files readable.** Everything Betelgeuse saves must be plain Markdown that a person could edit by hand. A new block needs a Markdown form and a test in `apps/desktop/tests/markdown.test.mjs`.
- **Keep the app and the MCP server in sync.** Changes to how pages, links or AI visibility work go in both `apps/desktop/src-tauri/src/vault.rs` and `packages/mcp/src/vault.ts`.
- **Agents never see hidden pages.** New MCP tools must read pages through `Vault.files()` or `Vault.find()`.
- **Keep pull requests small**, and add light and dark screenshots for UI changes.

## Releasing

Bump the version in `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml` and `apps/desktop/src-tauri/tauri.conf.json`, then push a tag like `v0.2.0`. GitHub Actions builds the app for every platform into a draft release, ready to publish.

## Updating the screenshots

`npm run screenshots -w @betelgeuse/lander` captures the app in light and dark for the README and website.
