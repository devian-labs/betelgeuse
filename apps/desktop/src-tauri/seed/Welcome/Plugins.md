---
icon: 🧩
tags: [guide]
---
Plugins add features to Betelgeuse: new screens in the sidebar, panels on pages, settings, commands and search results. The app stays small, and you add only what you need.

## Install one

1. Open **Settings → Plugins → Browse**.
2. Each plugin says what it does and what it may do. Click **Install**.
3. It's downloaded, checked and turned on for this workspace straight away.

Plugins in the store are built and **signed** by Betelgeuse's release pipeline, and the app refuses anything whose signature doesn't match. They update on their own.

## Plugins from Betelgeuse

- **Finance**: accounts and credit cards, transactions, monthly budgets, investments and your net worth, with charts. Also on your phone. [Read more](https://betelgeuse.devianlabs.com/docs/plugins/finance/)
- **Media Library**: browse and search your footage, audio, photos and project files where they already are, and link project folders to pages. [Read more](https://betelgeuse.devianlabs.com/docs/plugins/media-library/)

## Your data stays yours

> [!blue] 💡
> What a plugin keeps lives in your workspace: Finance, for one, keeps your money in ordinary databases on a **Finance** page. Open, edit and search them like any page, sync them with git, and keep them if you ever remove the plugin.

- **Turned on per workspace.** Each workspace remembers which plugins it uses. Sync it to another computer or your phone and Settings → Plugins offers to install them there.
- **Permissions.** Every plugin lists what it may do (read pages, change them, talk to one website) and gets nothing else. Click **N permissions** under a plugin in Settings to see its list.
- **Off means off.** Turning a plugin off removes everything it added, right away.

Want to make your own? Plugins are TypeScript and React: start with [Build a plugin](https://betelgeuse.devianlabs.com/docs/developers/plugins/).
