---
title: Testing and publishing
description: Check your Betelgeuse plugin, share it, and get it into the plugin store.
---
## Check it

From the repository root:

```sh
npm run plugins                    # typecheck and build every plugin in plugins/
npm run plugins -- my-plugin       # just yours (by id)
```

CI runs the same command on every pull request, so a plugin that stops building against the API is caught straight away.

Before you share it, try it with:

- the plugin turned **off and on again** (nothing should be left behind, nothing registered twice);
- **light and dark** themes and a couple of palettes;
- an **empty workspace** and a big one;
- **without network**, if it uses `ctx.http`.

Plugin code runs in the app's window: open the developer console of a development build to see `ctx.log` output and errors.

## Share it

Zip your plugin's `dist/` folder (`betelgeuse-plugin.json`, `main.js`, `styles.css`). Others install it with **Settings → Plugins → Install from folder…** after unzipping.

## The plugin store

The store is coming. Plugins in the store will be:

- **built by CI** from source in the Betelgeuse repository's `plugins/` folder (open a pull request to add yours);
- **reviewed** for what they do and the permissions they ask for;
- **signed**, so the app can check that what it downloads is what was reviewed;
- **updated** automatically when you release a new version that works with the person's Betelgeuse.

## Guidelines

- **Ask for the fewest permissions** that do the job, and say why in your description.
- **Keep content readable without your plugin.** Anything you write into pages should be plain Markdown, properties or HTML comments, so it still makes sense in other editors and if your plugin is uninstalled.
- **Don't block startup.** Register quickly in `activate`; load data lazily, when a view or panel first needs it.
- **Clean up.** Use `ctx.subscriptions` for anything you start yourself.
- **No secrets in the workspace store**: it's synced with git. Use `ctx.storage.local`.
- **Respect people's data.** Don't send pages anywhere without saying so clearly in the plugin's description and UI.
