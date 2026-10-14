---
title: The manifest
description: betelgeuse-plugin.json — the fields every Betelgeuse plugin declares, and its permissions.
---
Every plugin has a `betelgeuse-plugin.json` at the top of its folder. The build copies it into `dist/` next to `main.js`. Betelgeuse reads it before loading any code: to list the plugin, check that it can run here, and show its permissions.

```json
{
  "id": "word-goals",
  "name": "Word Goals",
  "version": "1.2.0",
  "description": "Set a word goal for a page and watch the progress bar fill up.",
  "author": "Ada Lovelace",
  "icon": "🎯",
  "homepage": "https://github.com/ada/word-goals",
  "engines": { "betelgeuse": ">=0.4.0", "api": "1" },
  "platforms": ["desktop"],
  "main": "main.js",
  "styles": "styles.css",
  "permissions": ["workspace:read", "workspace:write"]
}
```

## Fields

| Field | Required | |
|---|---|---|
| `id` | yes | Unique, permanent identifier: lowercase letters, digits and dashes, up to 64 characters. It names the plugin's folder and its data folder, so don't change it after release. |
| `name` | yes | Shown in Settings and the store. |
| `version` | yes | [Semver](https://semver.org): `1.2.0`. Bump it with every release. |
| `description` | | One sentence: what it does for people. |
| `author` | | You or your organisation. |
| `icon` | | An emoji, shown next to the name. |
| `homepage` | | Where to learn more or report problems. |
| `engines.betelgeuse` | yes | The Betelgeuse versions it works with, as a range: `>=0.4.0`, `^0.4.0`, `>=0.4.0 <1.0.0`, `0.4.x`, `*`. |
| `engines.api` | yes | The plugin API major version: `"1"`. |
| `platforms` | | `["desktop"]` (the default) or also `"mobile"` once the phone app runs plugins. |
| `main` | | The code file; `main.js` by default. |
| `styles` | | A stylesheet to load with the plugin, such as `styles.css`. |
| `permissions` | | What the plugin may do (below). |
| `private` | | `true` keeps it out of the plugin store (examples, internal tools). |

Betelgeuse won't load a plugin whose `engines` don't match, and says why in Settings → Plugins.

## Permissions

Ask only for what you use. People see these in plain words before installing, and the API enforces them: without a permission, the part of `ctx` that needs it is missing or throws.

| Permission | Unlocks |
|---|---|
| `workspace:read` | `ctx.workspace`: list pages, read pages and database rows, open pages, watch for changes. |
| `workspace:write` | `ctx.workspace.createPage`, `writePage`, `setProperties`, and `page.setProperties` in page panels. Needs `workspace:read` too. |
| `shell:open` | `ctx.shell.openUrl`: open web links in the browser. |
| `network:<host>` | `ctx.http.fetch` to that host, e.g. `network:api.example.com`. Use `network:*.example.com` for its subdomains. One entry per host. |
| `library` | `ctx.library`: the media library (folders the person picks, file search, details, thumbnails). |

Every plugin can always use its own storage (`ctx.storage`), show messages (`ctx.ui`) and register views, panels, commands and search results.
