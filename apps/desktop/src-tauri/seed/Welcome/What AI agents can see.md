---
icon: 🛡️
tags: [guide, agents, privacy]
---
You decide which pages AI agents can see through the MCP server.

## Hiding a page

Every page has a **Visible to AI agents** switch in its `•••` menu. The sidebar's `•••` menu next to each page has the same option.

- Hiding a page also hides its sub-pages. A sub-page of a hidden page says so in its menu.
- A hidden page shows **Hidden from AI** in its top bar.
- To also mark hidden pages in the sidebar, turn on **Show AI visibility in the sidebar** in **Settings → AI agents**.
- The setting is saved as `ai: false`, or `ai: true` to share a page, in the page's frontmatter.

## The workspace policy

Choose a policy in **Settings → AI agents**:

<div class="columns">
<div class="column">

> [!green] 👀
> **All pages, except ones I hide**
>
> The default. Agents see everything except the pages you hide.

</div>
<div class="column">

> [!purple] 🔒
> **Only pages I share**
>
> Agents see nothing until you share a page. Pages agents create are shared automatically.

</div>
</div>

The same screen lists every hidden page (or every shared page), with a button to unhide or unshare each one. The policy is saved in `.betelgeuse/config.json` in the workspace.

## What hiding does

The MCP server checks visibility on every tool. Hidden pages are left out of listings, search, links, backlinks, history, database rows and resources. Reading, editing or creating pages under a hidden page fails as if it didn't exist. Automatic commit messages say "private page" instead of naming a hidden page, because agents can read the git log.

> [!red] ⚠️
> This applies to agents that use the Betelgeuse MCP server. An agent that you give direct access to the workspace folder can still read the files.

See [[Connect your AI agents]] to set up an agent.
