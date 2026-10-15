---
title: Move from Notion
description: Bring your Notion workspace into Betelgeuse, with its pages, databases, icons, covers, colours and links, and see what changes on the way.
---
Betelgeuse imports a Notion export: your pages and sub-pages, databases and their rows, icons, covers, colours, callouts, toggles, columns, images and the links between them. Everything lands under one new page, as Markdown files on your computer, in a single git commit you can undo.

## 1. Export from Notion

1. In Notion, open **Settings → General → Export all workspace content**. To move only part of your workspace, open that page's **••• → Export** instead.
2. Set **Export format** to **HTML**.
3. Set **Include content** to **Everything**, and turn on **Include subpages** and **Create folders for subpages**.
4. Click **Export**. For a big workspace, Notion emails you a download link when the export is ready.

> [!blue] 💡
> **Choose HTML.** Notion's **Markdown & CSV** export works too, but it leaves out page icons, covers, text colours, highlights, callout colours, toggles and columns, and Betelgeuse has to guess each database property's type from its values.

## 2. Import into Betelgeuse

1. Click **Import** at the bottom of the sidebar, or open **Settings → Import**.
2. Under **Notion**, click **Choose .zip…** and pick the download. You don't need to unzip it, even when Notion puts zips inside the zip. If you already unzipped it, click **Unzipped folder…** instead.
3. Wait for it to finish. Betelgeuse says how many pages, databases and files it brought in, and offers to open them.

Everything goes under a new **Notion import** page, so the rest of your workspace isn't touched. Move pages out of it wherever you like.

## What comes across

| In Notion | In Betelgeuse |
|---|---|
| Pages and sub-pages | Pages and sub-pages, in the same order. Each page is a `.md` file; its sub-pages are in a folder of the same name. |
| Links and @mentions of pages | Links between pages (`[[Page]]`), so backlinks work straight away |
| Page icons and covers | Icons and covers. Notion's built-in icons become matching icons in the same colour. |
| Text colours and highlights | Text colours and highlights |
| Headings, lists, to-dos, quotes, dividers, code | The same blocks |
| Callouts | Callouts, with their icon and colour |
| Toggles and toggle headings | Toggles |
| Columns | Columns, with their widths if you resized them |
| Tables | Tables |
| Images and files | Copied into the workspace's `.assets/` folder |
| Images shown from the web (gallery covers, hosted pictures) | Downloaded into `.assets/`, so nothing depends on Notion any more |
| Bookmarks and embeds | Links |
| Equations | LaTeX, in code |
| Databases | Databases, with every row as a page |
| Inline and linked databases | Database embeds in the page |

### Databases

- **Properties keep their type**: text, number, select, multi-select and status (with their option colours), date, checkbox, URL and email.
- **Created and edited times** become dates.
- **Relations** become relations when they link to rows of another database you imported, so rollups can follow them. Otherwise they become the names of the linked pages.
- **Formulas, rollups and people** come across as the values they showed when you exported. They don't recalculate. Betelgeuse has rollups (add them again on the relation), but no formulas yet.
- **Views**: each database gets a table view, plus a board view if it has a Status or Select property and a calendar view if it has a date. Notion's own views, filters and sorts aren't in the export, so add yours again. See [Databases](/docs/guide/databases/).
- An empty database comes across empty, and a database whose rows were exported without it is rebuilt from them.

## What doesn't come across

Notion's export doesn't include these, so they stay in Notion:

- comments and discussions
- sharing, permissions and guests
- page history
- reminders
- synced blocks, which come across as ordinary copies of their content
- button blocks
- automations, forms and integrations

## After importing

- **Check the report.** Images that couldn't be downloaded (usually because they no longer exist online) keep their web address, and the report lists them.
- **Tidy up.** Move pages out of **Notion import**, or rename it. Links follow the pages you move.
- **Undo if you need to.** The whole import is one commit. To start again, delete the **Notion import** page, or restore an earlier version from git.
- **Use it everywhere.** Connect a git repository to have your workspace on your other computers and phone. See [History and sync](/docs/guide/history-and-sync/).
- **Connect your AI agents.** They can now search and update your notes, and only the pages you share. See [Connect your AI agents](/docs/guide/connect-your-ai-agents/).

## If something looks wrong

- **Pages are missing their icons, colours or columns.** The export was Markdown & CSV. Export again as HTML and import that.
- **Sub-pages are missing.** **Include subpages** was off when you exported.
- **A link goes nowhere.** It points at a page that wasn't in the export, such as a page in another workspace or one you didn't include.

Still stuck? [Open an issue](https://github.com/devian-labs/betelgeuse/issues) with what you expected and what you got. A small export that shows the problem helps a lot.
