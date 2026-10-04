---
icon: 🎨
tags: [guide, editor]
---
## The selection menu

Select some text and a toolbar appears above it:

- **Turn into** shows the block's type and changes it.
- **Link** adds a web link: paste the address and press Enter. Leave it empty to remove a link. Web addresses you type or paste become links automatically.
- **Bold** (`⌘B`), *italic* (`⌘I`), ~~strikethrough~~ (`⌘⇧S`) and `inline code` (`⌘E`).
- **A** sets the text colour and the highlighter sets the background colour.

You can also type the Markdown: `**bold**`, `*italic*`, `~~strike~~` and backticks for code.

## Colours

There are nine colours, for text or background:

<span data-color="gray">Gray</span> · <span data-color="brown">Brown</span> · <span data-color="orange">Orange</span> · <span data-color="yellow">Yellow</span> · <span data-color="green">Green</span> · <span data-color="blue">Blue</span> · <span data-color="purple">Purple</span> · <span data-color="pink">Pink</span> · <span data-color="red">Red</span>

<span data-bg="gray">Gray</span> · <span data-bg="brown">Brown</span> · <span data-bg="orange">Orange</span> · <span data-bg="yellow">Yellow</span> · <span data-bg="green">Green</span> · <span data-bg="blue">Blue</span> · <span data-bg="purple">Purple</span> · <span data-bg="pink">Pink</span> · <span data-bg="red">Red</span>

There are a few ways to add colour:

1. Select text, then use **A** or the highlighter in the selection menu. Pick **Default** to remove a colour.
2. Press `⌘⇧H` to <span data-bg="yellow">highlight the selection in yellow</span>.
3. Click a block's `⋮⋮` handle and choose **Color** to colour the whole block.
4. Type `/` and a colour, such as `/red` or `/blue background`, to colour the current block. On an empty line, the colour applies to what you type next.

Pressing Enter at the end of a coloured line starts the next line without the colour.

## Callout colours

A callout's colour is its background. Choose **Color** in its block menu to change it, and click its icon to pick a new one.

<div class="columns">
<div class="column">

> [!blue] 🧭
> A blue callout.

</div>
<div class="column">

> [!green] ✅
> A green callout.

</div>
<div class="column">

> [!red] ⚠️
> A red callout.

</div>
</div>

## How it's stored

Colours are saved as small HTML tags, so other Markdown tools still show the text:

```html
<span data-color="red" data-bg="yellow">Red text on yellow</span>
```

Callouts use Obsidian's callout syntax. The word in brackets is the colour, and the emoji after it is the icon:

```markdown
> [!green] ✅
> A green callout.
```

See [[Writing and blocks]] for every block's Markdown, and [[Keyboard shortcuts]] for all the shortcuts.
