# Changelog

What changed in each release. Downloads and full notes are on [GitHub Releases](https://github.com/devian-labs/betelgeuse/releases).

## Unreleased

## 0.5.2 (2026-11-08)

- **Web app** (preview) at [app.betelgeuse.pro](https://app.betelgeuse.pro): the same interface in a browser, on a GitHub repository, with a [demo](https://app.betelgeuse.pro/demo) that needs no sign-in. The interface all three apps share now lives in `packages/ui`, and every new workspace starts with the same pages.
- **Usage counts and error reports**: anonymous, never your pages, and off with one switch in **Settings → Privacy**. See [what's sent](https://betelgeuse.pro/privacy/).
- The website moved to [betelgeuse.pro](https://betelgeuse.pro), and counts visits without cookies.
- In-app updates work again: 0.5.1 shipped without the file installed apps check, so they never saw it.

## 0.5.1 (2026-11-05)

- Windows: git no longer flashes console windows, and git calls stay off the main thread.
- Notion imports no longer fail with "File name too long".

## 0.5.0 (2026-10-15)

- **Finance plugin**: accounts, transactions, budgets, investments and net worth.
- The app offers its own updates, in the sidebar.

## 0.4.0 (2026-10-14)

- **Plugin store**, with signed plugins and updates, and the **Media Library** plugin.
- Notion-style editing: tables, columns and database views.
- The workspace engine moved into `crates/betelgeuse-core`, shared by the desktop and phone apps.
- Faster startup.

## 0.2.1 (2026-10-05)

- Fixes for the 0.2.0 release builds.

## 0.2.0 (2026-10-05)

- The first public release: block-based pages on Markdown and git, databases with relations, import from Notion and Obsidian, and the MCP server for AI agents.
