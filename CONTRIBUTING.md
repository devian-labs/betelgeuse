# Contributing

Thanks for helping! Bug reports, ideas, docs and code are all welcome. For bigger changes, open an issue or a [discussion](https://github.com/devian-labs/betelgeuse/discussions) first so we can agree on the approach.

## Set up

You need [Node.js 20+](https://nodejs.org), [Rust](https://rustup.rs) and git. On macOS, also run `xcode-select --install`. On Linux, install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

```sh
git clone https://github.com/devian-labs/betelgeuse && cd betelgeuse
npm install && npm --prefix mcp install
npm run app      # start the app with hot reload
npm test         # run all tests
```

To try things without touching your own notes, use a throwaway workspace: `BETELGEUSE_WORKSPACE=/tmp/bg-dev npm run app`.

## Where things are

| Folder | What's in it |
| --- | --- |
| `src/` | The app's interface (React). The editor is in `src/editor/`, databases in `src/database/`. |
| `src-tauri/` | The desktop backend (Rust): files, git, import, trash. |
| `src-tauri/seed/` | The Welcome guide every new workspace starts with. |
| `mcp/` | The MCP server that AI agents connect to. |
| `tests/` | Editor and database tests. |
| `lander/` | The website ([betelgeuse.devianlabs.com](https://betelgeuse.devianlabs.com)). Run it with `npm --prefix lander run dev`. |

## A few rules

- **Keep files readable.** Everything Betelgeuse saves must be plain Markdown that a person could edit by hand. A new block needs a Markdown form and a test in `tests/markdown.test.mjs`.
- **Keep the app and the MCP server in sync.** Changes to how pages, links or AI visibility work go in both `src-tauri/src/vault.rs` and `mcp/src/vault.ts`.
- **Agents never see hidden pages.** New MCP tools must read pages through `Vault.files()` or `Vault.find()`.
- **Keep pull requests small**, and add light and dark screenshots for UI changes.

## Releasing

Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, then push a tag like `v0.2.0`. GitHub Actions builds the app for every platform into a draft release, ready to publish.

## Updating the screenshots

`npm --prefix lander run screenshots` captures the app in light and dark for the README and website.
