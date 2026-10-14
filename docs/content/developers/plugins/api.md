---
title: API reference
description: The Betelgeuse plugin API, version 1 — activate, contribution points, storage, the workspace and more.
---
Types for everything here are in `@betelgeuse/plugin-api` (`index.d.ts`), so your editor completes and checks them.

## activate and deactivate

```tsx
import { definePlugin } from "@betelgeuse/plugin-api";

export const { activate, deactivate } = definePlugin({
  async activate(ctx) {
    // Register what the plugin adds. Can be async (load settings first, say).
  },
  deactivate() {
    // Optional: stop timers or connections you started yourself.
  },
});
```

Betelgeuse calls `activate` when the plugin is turned on (at startup, or when someone switches it on) and `deactivate` when it's turned off. Everything registered through `ctx` returns a `Disposable` and is removed automatically when the plugin is turned off; you don't need to undo it in `deactivate`. For things you set up yourself, push a disposable to `ctx.subscriptions`:

```ts
const timer = setInterval(check, 60_000);
ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
```

If `activate` throws, the plugin is marked as failed in Settings → Plugins with the error message, and anything it registered so far is removed.

## Context

| | |
|---|---|
| `ctx.manifest` | Your manifest, as read. |
| `ctx.app` | `{ version, apiVersion, platform }`: the Betelgeuse version (`"0.4.0"`), `1`, and `"desktop"`. |
| `ctx.log(...)` | Logs to the developer console, prefixed with your plugin's id. |

## Views

A view is a full screen that opens in a tab, like a page. Its tab is restored when the app reopens.

```tsx
ctx.views.register("dashboard", {
  title: "Dashboard",
  icon: <span>📊</span>,
  component: ({ viewId }) => <Dashboard />,
});

ctx.views.open("dashboard");                    // in the current tab
ctx.views.open("dashboard", { newTab: true });  // in a new tab
```

The view fills the area under the tab bar; make your root element `flex-1` with its own scrolling (`overflow-y-auto`).

## Sidebar items

Items in the sidebar's top group. Open one of your views, or run something.

```tsx
ctx.sidebar.register({ id: "dashboard", title: "Dashboard", icon: <span>📊</span>, view: "dashboard" });
ctx.sidebar.register({ id: "sync", title: "Sync now", onClick: () => syncNow() });
```

## Settings

One section in Settings, with its own entry in the Settings sidebar.

```tsx
ctx.settings.register({ title: "Word Goals", icon: <span>🎯</span>, component: SettingsScreen });
```

Use `SettingRow`, `Switch` and `TextInput` from [the UI kit](/docs/developers/plugins/ui/) so it looks like the other sections.

## Page panels

A panel under a page's properties. `when` decides which pages show it.

```tsx
ctx.pagePanels.register({
  id: "goal",
  when: (page) => typeof page.properties["Word goal"] === "number",
  component: ({ page }) => <GoalBar page={page} />,
});
```

`page` is a `PageInfo`:

| | |
|---|---|
| `path` | Its file path in the workspace, e.g. `Projects/Launch.md`. |
| `title` | |
| `properties` | Its properties (frontmatter) as plain values. |
| `isDatabase` | Whether the page is a database. |
| `database` | For database rows, the database's path; otherwise `null`. |
| `setProperties(patch)` | Sets properties; `null` removes one. Needs `workspace:write`. |

Keep `when` fast: it runs every time a page renders.

## Commands

Commands appear in `⌘K` when the search matches their title.

```ts
ctx.commands.register({ id: "reset", title: "Reset word goals", run: () => resetAll() });
await ctx.commands.run("reset");
```

## Search

A group of results in `⌘K`, for what people type. Return a handful of results, quickly; the app debounces typing and shows your group under the page results.

```tsx
ctx.search.register({
  id: "goals",
  title: "Word goals",
  search: async (query) =>
    (await findGoals(query)).slice(0, 5).map((g) => ({
      id: g.path,
      title: g.title,
      detail: `${g.done} of ${g.goal} words`,
      run: () => ctx.workspace?.openPage(g.path),
    })),
});
```

## Storage

Two JSON stores, one per scope:

| | Kept | For |
|---|---|---|
| `ctx.storage.workspace` | In the workspace, `.betelgeuse/plugins/<id>/data.json`, synced with the notes | Settings and data that belong to the workspace |
| `ctx.storage.local` | On this computer only, per workspace | Folder paths, API keys, caches of choices |

```ts
const { goal = 1000 } = await ctx.storage.workspace.get<{ goal: number }>();
await ctx.storage.workspace.set({ goal: 1500 });
await ctx.storage.workspace.update<{ runs: number }>((d) => ({ ...d, runs: (d.runs ?? 0) + 1 }));
```

The workspace store is plain JSON in git: don't put secrets there.

## Workspace

Present with the `workspace:read` permission (`ctx.workspace` is `undefined` otherwise).

| | |
|---|---|
| `listPages()` | Every page: path, title, icon, tags, kind (`"database"` for databases), modified and created times. |
| `readPage(path)` | `{ properties, body }`: the page's properties and its Markdown. |
| `databaseRows(path)` | A database's rows: path, title and properties of each. |
| `openPage(path, { newTab? })` | Opens a page in the app. |
| `onChange(listener)` | Called after any page changes on disk (by you, the person, git or an agent). Returns a `Disposable`. |
| `createPage(parent, title)` | Creates a page (inside `parent`'s sub-pages, or at the top level for `null`); returns its path. Needs `workspace:write`. |
| `writePage(path, body)` | Replaces a page's Markdown, keeping its properties. Needs `workspace:write`. |
| `setProperties(path, patch)` | Sets or (with `null`) removes properties. Needs `workspace:write`. |

Pages are Markdown files, and other editors open them too: write content that reads well as plain Markdown.

## Messages

```ts
ctx.ui.toast("Saved");
if (await ctx.ui.confirm("Delete all goals?", { confirmLabel: "Delete", danger: true })) { … }
```

## Network and links

```ts
// manifest: "permissions": ["network:api.example.com", "shell:open"]
const res = await ctx.http!.fetch("https://api.example.com/v1/search?q=…");
await ctx.shell!.openUrl("https://example.com/docs");
```

`ctx.http.fetch` is the browser's `fetch`, limited to the hosts your manifest lists; others are refused. The other side has to allow cross-origin requests.

## Stability

This is plugin API **1**. Within version 1, Betelgeuse only adds to the API; nothing listed here changes or goes away. Breaking changes would come as API 2, with plugins declaring which they support (`engines.api`).
