---
icon: 📥
tags: [guide]
---
Bring pages in from Notion or Obsidian. Click **Import** at the bottom of the sidebar, or go to **Settings → Import**.

Everything you import lands under one new page and is committed to git as a single change, so it's easy to undo. When it's done, Betelgeuse says how many pages, databases and files it imported, with a button to open them.

## From Notion

1. In Notion, open **Settings → General → Export all workspace content**, or a page's **••• → Export**.
2. Choose **HTML** as the format and turn on **Include subpages**. **Markdown and CSV** works too, but only HTML keeps page icons, covers, text colours, highlights, callout colours, toggles and columns.
3. In Betelgeuse, choose the downloaded `.zip`, or the folder if you unzipped it. Betelgeuse works out which format it is.

What happens to your pages:

- Notion's IDs are removed from file names, and links between pages become wikilinks.
- Images and files are copied into the workspace's `.assets/` folder.
- Images your pages show from the web (covers from Notion's gallery, icons and pictures hosted elsewhere) are downloaded into `.assets/` too, so the imported pages are fully local. Any that can't be downloaded, usually because they no longer exist, keep their web address and are listed when the import finishes.
- Empty databases come along as empty databases, and a database whose rows were exported without it is rebuilt from them.
- Sub-pages keep the order they have in Notion.
- From an HTML export, Notion's icons become matching flat icons in the same colour, and covers, colours and toggles come along. See [[Formatting and colours]].
- Each database becomes a Betelgeuse database. From an HTML export, property types and the colours of select options come from Notion. From Markdown and CSV, types are worked out from the values: number, date, checkbox, select, status, multi-select, URL and email.
- Each database gets a table view, a board view if it has a Status or Select property, and a calendar view if it has a date. See [[Databases]].

## From Obsidian

Choose your vault folder.

- Folders and links are kept as they are.
- Attachments and embedded images are copied into `.assets/`.
- Callouts get matching colours and icons. See [[Formatting and colours]].
- The `.obsidian` settings folder is skipped.

> [!blue] ↔️
> It works the other way too: Obsidian can open a Betelgeuse workspace as a vault. See [[Your files on disk]].
