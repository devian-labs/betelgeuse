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
| `apps/desktop/src-tauri/` | The desktop app's Rust side: its commands, file watching, import from Notion and Obsidian. |
| `apps/desktop/src-tauri/seed/` | The Welcome guide every new workspace starts with. |
| `apps/desktop/tests/` | Editor and database tests. |
| `apps/lander/` | The website ([betelgeuse.devianlabs.com](https://betelgeuse.devianlabs.com)). Run it with `npm run lander`. |
| `crates/betelgeuse-core/` | The workspace engine every app shares (Rust): pages, frontmatter, databases, links, trash and git. |
| `packages/mcp/` | The MCP server that AI agents connect to. The desktop app bundles it. |
| `brand/`, `scripts/` | Logos, and the install-from-source scripts. |

New clients (mobile, browser extension) go in `apps/`. Code shared between them goes in `packages/` (TypeScript) or `crates/` (Rust). All Rust crates form one Cargo workspace at the repo root, so `cargo test --workspace` tests them all and builds land in `target/`. Run a script in one workspace with `npm run <script> -w <name>`, e.g. `npm run typecheck -w @betelgeuse/desktop`.

## A few rules

- **Keep files readable.** Everything Betelgeuse saves must be plain Markdown that a person could edit by hand. A new block needs a Markdown form and a test in `apps/desktop/tests/markdown.test.mjs`.
- **Keep the app and the MCP server in sync.** Changes to how pages, links or AI visibility work go in both `apps/desktop/src-tauri/src/vault.rs` and `packages/mcp/src/vault.ts`.
- **Agents never see hidden pages.** New MCP tools must read pages through `Vault.files()` or `Vault.find()`.
- **Keep pull requests small**, and add light and dark screenshots for UI changes.

## Sign your commits (DCO)

Every commit needs a `Signed-off-by` line, which certifies you wrote the change or otherwise have the right to submit it under the project's MIT license, as set out in the [Developer Certificate of Origin](https://developercertificate.org). Git adds it for you:

```sh
git commit -s -m "Fix the board's drop target"
```

That appends `Signed-off-by: Your Name <you@example.com>` using your git name and email. Forgot? `git commit --amend -s` fixes the last commit, and `git rebase --signoff main` fixes every commit on your branch.

## Releasing

```bash
npm run version:set 0.2.0          # writes the version everywhere it appears
git add -A && git commit -m "release: v0.2.0"
git tag v0.2.0 && git push --follow-tags
```

The tag starts the Release workflow. It runs the tests, checks that the tag matches the app version, then builds macOS (Apple Silicon and Intel), Windows and Linux (x64 and ARM64) and attaches the installers to a draft GitHub release. Review the draft and click **Publish**. A tag with a suffix, like `v0.2.0-beta.1`, makes a pre-release.

To try the builds without releasing, run the workflow by hand (**Actions → Release → Run workflow**): the installers are attached to the run as artifacts and nothing is published.

## Updating the screenshots

`npm run screenshots -w @betelgeuse/lander` captures the app in light and dark for the README and website.
