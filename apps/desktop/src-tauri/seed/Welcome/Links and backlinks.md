---
icon: 🔗
tags: [guide, links]
---
Pages link to each other with double square brackets, like this: [[Ideas]]. Click a link to open the page.

## Linking a page

- Type `[[` and start typing a page's name. Pick the page, or pick **New page** to create one and link to it in one step.
- Type `@` for the same list, plus **Today**, **Tomorrow** and **Yesterday**, which insert the date.
- `/Link to page` in the block menu works the same as typing `[[`.
- **Copy link** in a page's `•••` menu copies its link, ready to paste into another page.

If a link points at a page that doesn't exist yet, clicking it creates the page.

## Labels and paths

A link can show different text from the page's title. In the Markdown file, `[[Ideas|my scratchpad]]` links to Ideas but reads [[Ideas|my scratchpad]].

A link only needs the page's title, wherever the page sits. Database rows are pages too: [[Ship the MCP server]] is a row in [[Roadmap]]. If two pages share a title, add the path to pick one, as in `[[Roadmap/Ship the MCP server]]`.

## Backlinks

The bottom of each page lists its **backlinks**: every page that links to it. Scroll to the end of this page to see the pages that link here. Agents can follow backlinks too.

## Renaming

Click a page's title to rename it. Betelgeuse renames the file and its sub-page folder, then updates every link to it across the workspace, so no links break. Agents can rename pages the same way.

## Embeds

A line with just an embed on it shows a database inside the page:

```markdown
![[Roadmap]]
```

See [[Databases]] for a live one. Embedding an ordinary page shows a card that opens it.

> [!purple] 🔗
> Links are plain text in the file, so Obsidian and other wiki-style editors understand them too. See [[Your files on disk]].
