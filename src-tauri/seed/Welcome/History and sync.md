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

1. Create an empty repository on GitHub, GitLab or another git host.
2. Open **Settings → Git &amp; sync**, paste the repository's HTTPS or SSH address under **Remote repository** and click **Save**.
3. Click **Test connection**, then **Push** to upload your workspace.
4. From then on, click the sync button at the bottom of the sidebar, or **Sync (pull + push)** in Settings, to pull and push.

Betelgeuse uses the git installed on your computer and its credentials, such as SSH keys, a credential helper or the GitHub CLI.

> [!orange] ⚠️
> There's no conflict view yet. If you and an agent edit the same page at the same moment, the last save wins, but git keeps both versions.

## Using git yourself

It's an ordinary repository, so any git tool works on it:

```bash
cd ~/Betelgeuse
git log --oneline -5
```

Deleted pages are in git history too. See [[Trash]] and [[Your files on disk]].
