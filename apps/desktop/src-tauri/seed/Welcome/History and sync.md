---
icon: 🕰️
tags: [guide, git]
---
Your workspace is a git repository, so every version of every page is kept.

## Saving

Pages save as you type. The top bar shows "Saving…" and then when the page was last edited. There's nothing to press.

## Commits

- After **8 seconds** without changes, Betelgeuse commits everything that changed, with a message such as "Update Welcome".
- Press `⌘S`, or click the commit button at the bottom of the sidebar, to commit right away. Its badge counts the uncommitted changes.
- Every change an agent makes is its own commit. See [[Connect your AI agents]].

**Settings → Git &amp; sync** shows the branch and the number of commits. You can also change the auto-commit delay there, from 5 seconds to 5 minutes, or turn it off, and set the name and email used for commits in this workspace.

## Page history

Click the clock in a page's top bar to open its history: every commit that changed the page, newest first, with who made it and when. Commits made by agents have a robot icon.

1. Click a commit to preview the page as it was.
2. Click **Restore** to bring that version back.
3. The restore is a new commit, so you can undo it the same way.

## Syncing with GitHub, GitLab or any git server

Sync keeps your workspace the same on every computer and phone you use, through a private git repository you control.

1. Create an empty, private repository on GitHub, GitLab or another git host.
2. Open **Settings → Git &amp; sync**, paste the repository's HTTPS or SSH address under **Remote repository** and click **Save**.
3. Click **Test connection**, then **Push** to upload your workspace.

From then on, Betelgeuse **syncs on its own**: once you've stopped editing for a moment, it pulls what changed elsewhere and pushes your changes, every 5 minutes and whenever you come back to the window. Change how often, or turn it off, with **Sync automatically** in **Settings → Git &amp; sync**. To sync right away, click the sync button at the bottom of the sidebar, or **Sync (pull + push)** in Settings.

Betelgeuse uses the git installed on your computer and its credentials, such as SSH keys, a credential helper or the GitHub CLI.

### On your phone

The Betelgeuse phone app syncs with the same repository:

1. On your phone, open **Settings → Sync** and paste the repository's HTTPS address.
2. Paste an access token from your git host (the app links to the page that makes one) and tap **Connect**.

Your pages download, and from then on the phone syncs every couple of minutes while it's open, and soon after you change something.

### When a page changed in two places

If a page was edited on two devices between syncs, sync never stops half-way and nothing is lost: the other device's version takes the page's place, and yours is kept beside it as "*Page* (conflicted copy)". Betelgeuse tells you when that happens. Copy what you need across, then delete the copy.

> [!orange] ⚠️
> On one computer, if you and an agent edit the same page at the same moment, the last save wins, but git keeps both versions.

## Using git yourself

It's an ordinary repository, so any git tool works on it:

```bash
cd ~/Betelgeuse
git log --oneline -5
```

Deleted pages are in git history too. See [[Trash]] and [[Your files on disk]].
