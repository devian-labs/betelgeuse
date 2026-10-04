---
icon: 📄
tags: [guide, pages]
---
## Creating pages

- `⌘N`, the pen icon at the top of the sidebar, or **Add new** creates a page at the top level.
- `+` next to a page in the sidebar, or **Add a page inside** in its `•••` menu, creates a sub-page.
- `/Page` inside a page creates a sub-page and links to it where you typed.
- Searching (`⌘K`) for a title that doesn't exist offers **New page**.

A page's title is its file name. Characters that can't go in a file name or a link, such as `/`, `:` and `#`, become spaces.

## Sub-pages

A sub-page lives in a folder named after its parent. This page is `Welcome/Pages and sub-pages.md`, under [[Welcome]]. Sub-pages are nested under their parent in the sidebar and in the breadcrumbs, and moving a page to the [[Trash]] takes its sub-pages with it.

Pages are listed A–Z until you drag one into place in the sidebar. The order is saved as a number in each page's frontmatter, such as `order: 2`. The first time you reorder a list, every page in it gets a number; after that, usually only the page you moved changes. New pages go after the ones you've ordered.

## Icon, cover and tags

Hover above a page's title to see **Add icon**, **Add cover** and **Add tags**.

- **Icon:** pick an emoji, or an icon in the colour you choose, or upload an image or paste a link to one. There's a random button, and your recent icons are kept at the top. Click the icon later to change or remove it.
- **Cover:** starts as a gradient. Hover it and click **Change cover** to pick another gradient, a colour or a link to an image, or **Remove**.
- **Tags:** type a tag and press Enter. Hover a tag and click × to remove it.

Uploaded images are stored in the workspace's `.assets/` folder, so they're versioned in git with your pages.

## The page menu

Click `•••` in the top right of a page:

| Option               | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| Style                | Default, Serif or Mono text for this page            |
| Small text           | Smaller text on this page                            |
| Full width           | Use the whole window width                           |
| Visible to AI agents | Hide this page and its sub-pages from agents         |
| Add to Favorites     | Pin it to the top of the sidebar, like the star does |
| Copy link            | Copy the page's link, ready to paste                 |
| Duplicate            | Make a copy of the page                              |
| Move to Trash        | Delete it, with an Undo                              |

The bottom of the menu shows the word count, when the page was last edited and its file path.

Favorites are kept on this computer, not in the workspace. See [[What AI agents can see]] for the AI switch.

## Empty pages

A new, empty page offers **Get started with**: Table, Board or Calendar. Each one turns the page into a database. See [[Databases]].

## How it's stored

Everything above, apart from Favorites, is saved in the page's YAML frontmatter at the top of its file:

```yaml
---
icon: 📄
cover: gradient_3
tags: [guide, pages]
font: serif
small: true
fullWidth: true
ai: false
order: 2
---
```

See [[Your files on disk]] for the full list.
