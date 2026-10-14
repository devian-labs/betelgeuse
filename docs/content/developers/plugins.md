---
title: Build a plugin
description: How Betelgeuse plugins work, and a step-by-step guide to your first one.
---
A Betelgeuse plugin is a small TypeScript and React project that builds into three files: a manifest (`betelgeuse-plugin.json`), the code (`main.js`) and optional styles (`styles.css`). The app loads that folder, calls your `activate(ctx)` function, and you add features through `ctx`.

## How plugins fit in

- **Contribution points.** Plugins add to the app only through named places: tab views, sidebar items, a settings section, panels on pages, commands and search results in `⌘K`. The app renders them; you never reach into its internals, so your plugin keeps working when Betelgeuse changes.
- **Shared React.** The app gives your plugin its own React and UI components. Your bundle stays small, and your screens look like the rest of the app in every theme.
- **Permissions.** Your manifest lists what the plugin needs (reading pages, writing them, talking to a website). The API only includes what you've asked for, and people see the list before installing.
- **Clean on/off.** Everything you register is undone when someone turns the plugin off. No restart, no leftovers.
- **Versioned.** Your manifest says which Betelgeuse versions and which plugin API version it works with. This is **API 1**.

## Quick start

> [!blue] 💡
> The plugin API package will be published to npm. Until then, build plugins inside the Betelgeuse repository, in `plugins/`, where everything is set up.

### 1. Copy the example

```sh
git clone https://github.com/devian-labs/betelgeuse && cd betelgeuse
npm install
cp -r plugins/hello-world plugins/my-plugin
```

### 2. Name it

Edit `plugins/my-plugin/betelgeuse-plugin.json`: give it a unique `id` (lowercase letters, digits and dashes), a `name` and a `description`. Change `"name"` in its `package.json` to `@betelgeuse/plugin-my-plugin`, then run `npm install` again so the workspace picks it up.

### 3. Write it

`src/main.tsx` exports `activate`. A minimal plugin that adds a command to `⌘K`:

```tsx
import { definePlugin } from "@betelgeuse/plugin-api";

export const { activate } = definePlugin({
  activate(ctx) {
    ctx.commands.register({
      id: "hello",
      title: "Say hello",
      run: () => ctx.ui.toast(`Hello from ${ctx.manifest.name}!`),
    });
  },
});
```

### 4. Build and run it

```sh
npm run build -w @betelgeuse/plugin-my-plugin    # once
npm run dev -w @betelgeuse/plugin-my-plugin      # or rebuild on every save
npm run app                                       # the app, from source
```

A development build of the app loads every plugin built in `plugins/` automatically; they're marked **Development** in **Settings → Plugins**. Turn yours on there. After a rebuild, click **Reload** under it to load the new code.

To try a plugin in an installed copy of Betelgeuse, use **Settings → Plugins → Install from folder…** and pick its `dist` folder.

## What to read next

- [The manifest](/docs/developers/plugins/manifest/): every field, and permissions.
- [API reference](/docs/developers/plugins/api/): views, panels, commands, storage, the workspace.
- [UI and styling](/docs/developers/plugins/ui/): the app's components and design tokens.
- [Testing and publishing](/docs/developers/plugins/publishing/): checks, guidelines and the store.

For a full, real plugin, read [Media Library](https://github.com/devian-labs/betelgeuse/tree/main/plugins/media-library): a view, settings, page panels, search and the media library.

The [Hello World plugin](https://github.com/devian-labs/betelgeuse/tree/main/plugins/hello-world) uses every contribution point; read it alongside these pages.
