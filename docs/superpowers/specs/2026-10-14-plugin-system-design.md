# Plugin system: design

Date: 2026-10-14 · Status: steps 1–4 built (runtime and API 1, media library service, Creator Studio as a plugin, signed store with updates, docs site). Step 5 (more extension points, plugin MCP tools) is next.

## Goal

Make Betelgeuse extensible with plugins that are installed only by the people who want them, so
the core app stays small and focused, and features like Creator Studio don't weigh on everyone.

Success looks like:

1. Creator Studio (the asset library, productions, the Assets panel) is a plugin. Someone who
   never installs it gets no Library in the sidebar, no Creator Studio settings, no background
   scanning, and none of its code in the download.
2. Settings → Plugins lists the available plugins; Install downloads one, verifies it, and turns it
   on without restarting. Uninstall removes it completely.
3. Plugins live in this repository (`plugins/<id>/`), build and test with the app, and are
   released through the same CI.
4. The plugin API is stable and versioned, so a plugin written for one version keeps working on the
   next minor versions, and the core can change its internals freely.
5. Anyone can build a plugin: a documented, versioned API, an example to start from, a build preset,
   and a documentation site (`/docs` on the website) for using the app, its plugins and building them.

## How others do it (and what we take)

| App | Model | Take | Avoid |
|---|---|---|---|
| **Obsidian** | `manifest.json` + `main.js` (+ `styles.css`) per plugin, in the vault's `.obsidian/plugins/`; a registry JSON in a GitHub repo; plugins run in the app's renderer with full access | The packaging (manifest + one JS bundle), the registry-in-a-repo, per-workspace enablement | No sandbox and no permissions: any plugin can do anything; plugins reaching into internals break on updates |
| **VS Code** | Declarative *contribution points* in the manifest; code runs in a separate extension-host process; *activation events* load extensions lazily | Contribution points; lazy activation; `Disposable`s for clean unloading; a versioned API (`engines.vscode`) | A separate process for the UI isn't possible for us (plugins need to render React) |
| **Logseq** | Plugins run in sandboxed iframes and talk to the app over an RPC bridge | An async, message-shaped API, so isolation can be added later | The iframe-per-plugin cost and clunky UI integration, for first-party plugins today |
| **Figma** | Logic in a sandboxed JS realm, UI in an iframe, `postMessage` between them | Capabilities requested up front and shown at install | — |
| **Zed** | Extensions compiled to WebAssembly, against a WIT-defined API | — | A WASM runtime (~10 MB) is heavier than the features it would host |
| **Tauri** | Plugins are Rust crates compiled into the app | — | Nothing loads at runtime: every "plugin" ships to everyone, which is exactly what we want to avoid |

## Key decisions

**1. Plugins are JavaScript bundles loaded at runtime.** A plugin is a CommonJS bundle (`main.js`) plus
a manifest and optional CSS, evaluated in the app's webview with a `require` that hands out only the
shared modules (React, ReactDOM, the plugin API and its UI kit). CommonJS rather than ES modules
because bare imports (`react`) can't be mapped to the app's copies once the app has started (import
maps must exist before the first module loads); Obsidian made the same choice. This is the only way to
ship a feature to some people and not others: Rust in the app is compiled in for everyone, and
dynamically loading native libraries has no stable ABI across Rust versions, needs a build per
platform and architecture, and runs into macOS code-signing rules (library validation) once the app
is notarised.

**2. Native work goes through host services, not plugin native code.** Plugins can't ship Rust. What
needs native power (walking folders, watching them, reading media details, making thumbnails,
opening files) is provided by the core as small, general *host services* any plugin can use, behind
permissions. They're general on purpose: a photo plugin, a podcast plugin and Creator Studio all
need "index these folders" and "thumbnail this file". The Creator Studio-specific parts (search,
tags, productions, pipeline) move to the plugin, in TypeScript.

> Weight, honestly: Creator Studio's Rust is about 1,400 lines (~200 KB of the binary); its UI is
> ~1,800 lines in the 2.4 MB frontend bundle. The real costs of building it in are the UI clutter,
> the settings, the background scanning and watching, and the frontend code: all of which leave the
> core. The generic host services that stay are small and cost nothing when no plugin uses them.

A plugin that genuinely needs its own native code later (video transcoding, a local AI model) can
ship a **sidecar**: a separate program per platform, started by the host and spoken to over JSON-RPC
on stdin/stdout (the model the MCP server already uses). Out of scope for the first version; the
manifest reserves a field for it.

**3. Contribution points, not reaching into internals.** Plugins add to the app only through named
extension points (a sidebar item, a tab view, a settings section, a page panel, a ⌘K provider, an
editor block…), registered through the API. The core renders them. Plugins never import the core's
modules directly, so the core can be refactored without breaking them.

**4. One API, shaped for isolation later.** First-party plugins run in the main webview (fast, simple,
full React integration). The API they use is async and serialisable (no shared mutable objects),
so third-party plugins can later run in a sandboxed iframe behind the same API, with no changes
for plugin authors.

**5. Installed per machine, enabled per workspace.** Plugin code is installed into the app's data
folder (not the workspace, so it never lands in the notes' git history). Which plugins a workspace
uses, and their settings, live in the workspace (`.betelgeuse/plugins.json`), so a second machine
syncing the workspace offers to install the same plugins.

## As built (step 1)

| Piece | Where |
|---|---|
| Discovery, files, install/uninstall, per-workspace enablement, plugin data | `apps/desktop/src-tauri/src/plugins.rs` (commands `plugins_list`, `plugin_file`, `plugin_install_folder`, `plugin_uninstall`, `plugins_enabled`, `plugins_set_enabled`, `plugin_data_get/set`) |
| Runtime: loading, version checks, permissions, the context, contributions | `apps/desktop/src/plugins/runtime.ts` |
| Slots: tab views (`@plugin/<id>/<view>`), page panels, sidebar items, settings sections, error boundaries | `apps/desktop/src/plugins/slots.tsx`; ⌘K in `CommandPalette.tsx` |
| UI kit (`@betelgeuse/plugin-api/ui`) | `apps/desktop/src/plugins/ui.tsx` |
| Settings → Plugins | `apps/desktop/src/plugins/PluginsSection.tsx` |
| API types, runtime stub, theme tokens, Vite preset | `packages/plugin-api` |
| Example plugin using every contribution point | `plugins/hello-world` |
| Build and typecheck every plugin (CI too) | `npm run plugins` (`scripts/plugins.mjs`) |
| Documentation site | `apps/lander/app/docs`, `apps/lander/lib/docs.ts`; content in `docs/content/` plus the app's Welcome guide |

Development builds load plugins from `plugins/*/dist` (marked "Development", with Reload); release
builds load installed ones from `<app data>/plugins/<id>/`. Contribution points in v1: views,
sidebar, settings, page panels, commands, search. Activation is at startup for enabled plugins
(lazy activation is a later optimisation; the manifest doesn't declare contributions yet).

### Steps 2–4 as built

> Renamed after building: the plugin first called "Creator Studio" (`creator-studio`) is **Media
> Library** (`media-library`): it's a file and media browser; content planning lives in the
> workspace's own Content Studio pages. The app migrates the old id (plugin list, data, tabs).

- **Media library service** (`ctx.library`, permission `library`): the former Creator Studio engine
  (`library.rs`) runs only while a plugin using it is active (`library_set_active`). Its data stays
  where it was (`.betelgeuse/studio.json` for options, `.betelgeuse/library.jsonl` for tags).
- **Creator Studio** is `plugins/creator-studio` (66 KB of JS); the core has no Creator Studio code.
  Its pipeline settings moved into the plugin's data. A one-time migration turns the plugin on for
  workspaces that had the built-in feature switched on, and old `@library` tabs open the plugin's view.
- **Store**: `scripts/package-plugins.mjs` zips and Ed25519-signs each non-private plugin and writes
  `plugins.json`; the Release workflow's `plugins` job attaches them to the release. The app reads
  `releases/latest/download/plugins.json` (or `BETELGEUSE_PLUGIN_INDEX`), checks SHA-256 and the
  signature against `plugin-signing.pub`, unpacks with path checks and verifies the manifest matches
  (`plugin_store.rs`). Settings → Plugins has Installed and Browse, update badges, automatic updates
  (on by default) and installs for plugins a workspace uses but the computer lacks.

## Repository layout

```
plugins/
  creator-studio/
    betelgeuse-plugin.json     manifest (below)
    package.json               a workspace package: build, test, typecheck
    src/
      main.tsx                 activate(ctx): registers its views, panels, settings…
      LibraryView.tsx …        moved from apps/desktop/src/library/
    mcp/index.ts               optional: tools for the MCP server
    tests/
  unsplash-covers/             candidate: cover photo search as its own plugin
packages/
  plugin-api/                  @betelgeuse/plugin-api: the types and the runtime bridge plugins import
  plugin-kit/                  @betelgeuse/plugin-kit: shared UI pieces (Popover, Menu, Switch…) and the Vite preset
  mcp/
apps/desktop/                  the host
```

The root `package.json` adds `"plugins/*"` to `workspaces`.

## The manifest

`betelgeuse-plugin.json`:

```json
{
  "id": "creator-studio",
  "name": "Creator Studio",
  "version": "0.1.0",
  "description": "A searchable library of your footage, audio, photos and project files, and a production pipeline.",
  "author": "Devian Labs",
  "icon": "clapperboard",
  "engines": { "betelgeuse": ">=0.4.0 <0.6.0", "api": "1" },
  "platforms": ["desktop"],
  "main": "main.js",
  "styles": "styles.css",
  "mcp": "mcp.js",
  "activation": ["onStartup:ifConfigured", "onView:library", "onCommand:creator-studio.*"],
  "permissions": [
    "workspace:read",
    "workspace:write",
    "folders:pick",
    "folders:index",
    "media:probe",
    "media:thumbnail",
    "shell:open",
    "network:api.unsplash.com"
  ],
  "contributes": {
    "views": [{ "id": "library", "title": "Library", "icon": "library" }],
    "sidebar": [{ "view": "library", "section": "top" }],
    "settings": { "title": "Creator Studio", "icon": "clapperboard" },
    "pagePanels": [{ "id": "assets", "title": "Assets", "when": "page.isRowOf(pipeline.database)" }],
    "search": [{ "id": "files", "title": "Files" }],
    "commands": [{ "id": "creator-studio.rescan", "title": "Rescan library folders" }]
  }
}
```

- **engines**: the app versions and plugin-API major it works with. The app refuses incompatible
  plugins and says why ("needs Betelgeuse 0.5 or newer").
- **platforms**: `desktop`, `mobile`. Mobile is out of scope at first (see Mobile).
- **activation**: when the plugin's code is loaded. Contributions in the manifest (sidebar item,
  settings section) show without loading code; the code loads when first needed. Creator Studio
  loads at startup only if it has library folders (it watches them).
- **permissions**: shown at install. Enforced by the host (see Security).
- **contributes**: static, so the app can show the plugin's places before loading it.

## The plugin API (`@betelgeuse/plugin-api`, version 1)

A plugin exports `activate(ctx)` and optionally `deactivate()`. Everything `ctx` registers returns a
`Disposable`; disabling the plugin disposes them all, so turning a plugin off removes every trace
without a restart.

```ts
export function activate(ctx: PluginContext) {
  ctx.views.register("library", { render: (el, props) => mount(<LibraryView {...props} />, el) });
  ctx.pagePanels.register("assets", { when: (page) => isProduction(page), render: … });
  ctx.settings.register({ render: … });
  ctx.search.register("files", async (query) => searchLibrary(query));
  ctx.commands.register("creator-studio.rescan", () => ctx.host.folders.rescan());
}
```

| Area | What plugins can do | Permission |
|---|---|---|
| `ctx.workspace` | List pages, read and write pages and frontmatter, read database rows, listen for changes, open a page | `workspace:read` / `workspace:write` |
| `ctx.storage` | Plugin settings and data in `.betelgeuse/plugins/<id>/` (synced with the workspace) and a per-machine store (folder paths, keys) | always |
| `ctx.cache` | A per-machine cache folder for derived data (indexes, thumbnails) | always |
| `ctx.views` | Tab views: opened in tabs like pages (`@plugin/<id>/<view>`), restored with tabs | — |
| `ctx.sidebar` | Items in the sidebar's top group | — |
| `ctx.settings` | A section in Settings | — |
| `ctx.pagePanels` | Panels on pages under the properties, shown when a condition holds | — |
| `ctx.search` | Result groups in ⌘K | — |
| `ctx.commands` | Commands in ⌘K and keyboard shortcuts | — |
| `ctx.editor` (phase 3) | Slash-menu items, blocks, marks, Markdown tokenizers | `editor` |
| `ctx.covers` (phase 3) | Cover sources in the cover picker (Unsplash would be one) | — |
| `ctx.databases` (phase 3) | Property types and views | — |
| `ctx.host.folders` | Pick folders; index them (walk, watch, fingerprint, detect moves, offline drives) and query the index | `folders:pick`, `folders:index` |
| `ctx.host.media` | Media details (ffprobe/EXIF), thumbnails (Quick Look / ffmpeg), stream local files into `<video>`/`<img>` | `media:probe`, `media:thumbnail` |
| `ctx.host.shell` | Open a file or folder in its app, reveal it in Finder/Explorer | `shell:open` |
| `ctx.host.http` | `fetch` to the hosts the manifest lists | `network:<host>` |
| `ctx.ui` | Toasts, confirm dialogs, the app's theme tokens; shared components come from `@betelgeuse/plugin-kit` | — |

**Shared libraries.** React, ReactDOM and `@betelgeuse/plugin-kit` are provided by the app, not
bundled into each plugin (a plugin build marks them external; the app maps them to its own copies).
Plugins are small, and their UI matches the app because they use the same components and CSS
variables. The kit is versioned with the API.

**Content stays readable without the plugin.** Anything a plugin writes into pages must be plain
Markdown that other editors (and Betelgeuse without the plugin) show sensibly: frontmatter
properties, links, fenced blocks with a language tag, HTML comments. A missing plugin's block shows
as a placeholder ("Needs the Creator Studio plugin · Install"), never as broken or lost content.

## Host services (Rust, in the core)

What moves from `library.rs` into general services, and what moves to the plugin:

| Today in `library.rs` | Becomes |
|---|---|
| Library folders per machine, asset protocol scope | `folders`: plugin-scoped folder grants (a plugin can only touch folders the person picked for it) |
| Walk, ignore patterns, bundles, offline drives, watcher with debounce, fingerprints and move tracking, `index.json` cache | `folders.index(grantId, options)`: a general file index kept per plugin, queried by path prefix, kind or modified time, with change events |
| ffprobe, image size, thumbnails, the tool finder | `media.probe`, `media.thumbnail` |
| open, reveal | `shell.open`, `shell.reveal` |
| Search, tags/ratings/notes (`library.jsonl`), studio settings, create project folder, sub-folders | **The plugin** (TypeScript), using `folders`, `storage` and `workspace` |

Every host call carries the calling plugin's id; the host checks it against the permissions the
person granted at install and the folders they picked.

## The plugin store

**Registry.** CI builds every plugin in `plugins/` and publishes, with each app release:

- `plugin-<id>-<version>.zip` (manifest, `main.js`, `styles.css`, `mcp.js`, assets) attached to the
  GitHub release;
- `plugins.json`, the index: id, name, description, version, engines, permissions, download URL,
  SHA-256, and an Ed25519 signature made with a Devian Labs key held as a CI secret.

The app fetches `plugins.json` from the latest release (cached; works offline with what's installed).

**Install.** Settings → Plugins → a plugin → Install: shows what it can do (from permissions, in
plain words: "Read the folders you choose", "Make thumbnails of your media", "Connect to
api.unsplash.com"), downloads the zip, checks the SHA-256 and the signature against the public key
built into the app, unpacks it to `<app data>/plugins/<id>/<version>/`, enables it for the
workspace, and activates it. No restart.

**Updates.** On launch (and daily), the app compares installed versions with the index and updates
compatible plugins in the background (or asks, per a setting). A plugin incompatible with a new app
version is disabled with a notice until an update arrives.

**Uninstall.** Deactivates it, deletes its code and cache, and asks whether to keep its workspace
data (`.betelgeuse/plugins/<id>/`) for later.

**Development.** `npm run dev -w @betelgeuse/plugin-creator-studio` builds the plugin on save into a
folder the dev app loads directly (no zip, no signature) and reloads it in place.

## Security

- **First-party plugins (v1).** Code is signed by Devian Labs and verified at install; the app
  refuses unsigned or modified bundles, except in development builds.
- **Permissions** are checked by the host on every host-service call. Plugins in the main webview
  could in principle bypass the API and call internal commands directly; that's acceptable while
  every plugin is ours and reviewed, and it is why third-party plugins wait for isolation.
- **Third-party plugins.** The API, docs and example are public from the start, and anyone can
  install a plugin from a folder today, with a clear warning to install only trusted plugins (the
  Obsidian model). Store plugins will be built from source by our CI, reviewed and signed.
- **Isolation (later).** For unreviewed plugins: run in a sandboxed iframe on a separate origin, with only the
  plugin API bridged in over `postMessage`; their UI renders in that iframe and is placed by the
  host into the contribution slot. Because the API is already async and serialisable, the same
  plugin code works in both. Third-party registry entries would be reviewed and signed, like VS
  Code's marketplace or Obsidian's community list.

## MCP: plugins and agents

A plugin can contribute tools to the MCP server (`mcp.js`, a module exporting tool definitions).
When the MCP server starts, it reads the workspace's enabled plugins and loads their MCP modules
from the app's plugin folder. Creator Studio would add `library_search` and `library_asset`, and
later the YouTube tools. Plugin tools get the same permission checks and the same "hidden from AI"
rules as the core's.

## Mobile

Plugins declare `platforms`. The phone app skips desktop-only plugins; their pages and data still
sync and show as plain Markdown. A plugin can add `mobile` once it has a phone-friendly UI and uses
only services the phone has (no folder indexing there).

## Migration: Creator Studio becomes the first plugin

1. **Plugin runtime in the core:** manifest loading, the contribution registry and its slots
   (sidebar, views, settings, page panels, ⌘K), activation, disposal, the custom protocol that
   serves plugin files, shared-module mapping, and `@betelgeuse/plugin-api`/`plugin-kit`. Built
   and tested with a tiny `hello-world` plugin in `plugins/`.
2. **Host services:** split `library.rs` into `folders`, `media` and `shell`, with permission
   checks; the Creator Studio-specific parts move out.
3. **Move Creator Studio** into `plugins/creator-studio/`, register through the API, and delete its
   code from the core (`App.tsx`, `Sidebar`, `SettingsDialog`, `PageView`, `CommandPalette`,
   `TabBar` lose their Creator Studio branches). Its data files stay where they are
   (`.betelgeuse/studio.json` and `library.jsonl` move under `.betelgeuse/plugins/creator-studio/`
   with a one-time migration), so the author's setup carries over.
4. **Store:** CI packaging, `plugins.json`, signing, Settings → Plugins (browse, install, update,
   uninstall, enable per workspace), first-run prompt when a workspace uses a plugin that isn't
   installed.
5. **More extension points** as plugins need them: editor blocks and slash commands, cover sources
   (Unsplash covers as a plugin), database property types and views, MCP tools.

Each step ships on its own; after step 3 the app no longer contains Creator Studio.

## Open questions

- **Unsplash covers:** a plugin (lighter core; the built-in key ships only to those who install
  it), or core (covers are a core feature)? Proposed: core keeps covers and random photos; Unsplash
  search becomes a plugin once `ctx.covers` exists.
- **Where the registry lives:** release assets of this repository (proposed: one release, one set
  of plugins), or a separate `betelgeuse-plugins` repository with its own release cadence.
- **Auto-update default:** update compatible plugins silently (proposed, like browsers) or ask.
