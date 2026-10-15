---
title: Plugins
description: Add features to Betelgeuse with plugins, and decide what each one may do.
---
Plugins add features to Betelgeuse: new screens, panels on pages, settings, commands and search results. The core app stays small and focused; you add only what you need.

## Plugins from Betelgeuse

| Plugin | What it does | Where |
|---|---|---|
| [Finance](/docs/plugins/finance/) | Accounts and credit cards, transactions, monthly budgets, investments, assets and liabilities, and your net worth, with charts. Your money stays in databases you own. | Desktop and phone |
| [Media Library](/docs/plugins/media-library/) | Browse and search your footage, audio, photos and project files where they already are, and link project folders to pages. | Desktop |


## Where plugins live

- **Installed per device.** A plugin's code goes in the app's data folder, never in your workspace, so it never ends up in your notes' git history.
- **Turned on per workspace.** Each workspace remembers which plugins it uses (in `.betelgeuse/plugins.json`). Sync the workspace to another computer or your phone and it knows which plugins to offer.
- **Their data stays with you.** Settings a plugin saves for a workspace go in `.betelgeuse/plugins/<plugin>/`, inside the workspace, synced with your notes. Things that only make sense on one computer (folder paths, keys) stay on that computer.

## Manage plugins

Open **Settings → Plugins**. For each plugin you'll see its version, what it does, its permissions and a switch to turn it on or off for this workspace. Turning a plugin off removes everything it added, right away, with no restart.

Plugins with their own settings get their own entry in the Settings sidebar.

## Install from the plugin store

1. Open **Settings → Plugins → Browse**.
2. Each plugin shows what it does and what it may do. Click **Install**, and confirm.
3. It's downloaded, checked and turned on for this workspace straight away.

Store plugins are built from source by Betelgeuse's release pipeline and **signed**; the app checks the signature and refuses anything that doesn't match, so what you install is exactly what was published.

**Updates** install automatically when a new version works with your Betelgeuse (switch this off with **Update automatically** under the Installed tab, then use **Update to …** on each plugin). **Check for updates** looks right away.

If you open a workspace that uses a plugin this computer doesn't have (say, after syncing it from another machine), Settings → Plugins offers to install it.

## On your phone

The phone app runs plugins made for phones, such as Finance. Open **Settings → Plugins** in the app: it lists what's installed, plugins your workspace uses that this phone doesn't have yet, and the store. Plugins that only work on a computer, such as Media Library, are listed as **Desktop only**. New plugins come from the store, so you don't need to update the app to get them.

## Install a plugin from a folder

For plugins that aren't in the store, such as one you're building or one a friend shared:

1. Get the plugin's built folder: the one with `betelgeuse-plugin.json`, `main.js` and maybe `styles.css`.
2. In **Settings → Plugins**, click **Install from folder…** and choose it.
3. The plugin is copied into Betelgeuse, turned on for this workspace, and starts immediately.

To update, install the newer folder the same way. To remove a plugin, click **Uninstall**: its code and cached data are deleted; what it saved in your workspace stays, in case you install it again.

## Permissions

Every plugin lists what it may do, and Betelgeuse holds it to that:

| Permission | Means |
|---|---|
| Read your pages and databases | It can list and read pages and database rows. |
| Create and change pages | It can create pages and edit their content and properties. |
| Open links and files in other apps | It can open web links in your browser and files in their apps. |
| Connect to *a website* | It can talk to that website (only that one), for example to search photos. |
| Index the folders you choose and preview their files | It can use the media library: folders you add, their files' details and thumbnails. |

A plugin without a permission doesn't get the part of the API that needs it. Click **N permissions** under a plugin in Settings to see its list.

> [!yellow] ⚠️
> Plugins run inside the app with the access their permissions describe. Store plugins are reviewed and signed; install plugins from a folder only from sources you trust.

## When a plugin can't run

Settings → Plugins explains why: it needs a newer Betelgeuse, it was made for a different plugin API version, it's for the phone app only, or it ran into an error (with the message). A plugin that crashes only takes down its own panel or view, which shows the error and a **Try again** button; the rest of the app keeps working.

## Make your own

Plugins are written in TypeScript and React. Start with [Build a plugin](/docs/developers/plugins/).
