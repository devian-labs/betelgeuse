---
title: Install Betelgeuse
description: Download Betelgeuse for macOS, Windows, Linux or Android, or build it from source with one command, then open your first workspace of Markdown notes.
---
## Download

Get the latest version for macOS (Apple Silicon or Intel), Windows or Linux from the [releases page](https://github.com/devian-labs/betelgeuse/releases/latest).

The builds aren't code-signed yet, so the first time you open the app your system asks you to confirm:

- **macOS:** open the app once, then go to System Settings → Privacy & Security and click **Open Anyway**.
- **Windows:** click **More info**, then **Run anyway**.
- **Linux:** use the AppImage, or the `.deb`/`.rpm` package for your distribution.

## On your phone

The Android app is a preview: install `Betelgeuse_*_android.apk` from the [releases page](https://github.com/devian-labs/betelgeuse/releases/latest). Your phone may ask you to allow installs from your browser or files app.

It has your pages, databases and plugins that support phones, such as [Finance](/docs/plugins/finance/). To have the same workspace on your phone and computer, connect both to one git repository: see [History and sync](/docs/guide/history-and-sync/#on-your-phone). The iOS app builds, but isn't distributed yet: that needs an Apple Developer account.

## In your browser

The [web app](https://app.betelgeuse.pro) is a preview with nothing to install. Sign in with GitHub, choose which repositories it can reach, and open one as your workspace. It's the same editor and databases, and your browser talks to GitHub directly, so your pages stay in your repository. To have the same workspace everywhere, connect your computer and phone to that repository too. AI agents and importing need the desktop app.

## Build it yourself

Building from source avoids every warning above. You need [git](https://git-scm.com), [Node.js 20 or newer](https://nodejs.org) and [Rust](https://rustup.rs); the install script checks for anything else.

```sh
git clone https://github.com/devian-labs/betelgeuse && cd betelgeuse
./scripts/install.sh          # macOS and Linux
.\scripts\install.ps1         # Windows (PowerShell)
```

## Your first workspace

On first launch, Betelgeuse creates a workspace (a folder of Markdown files, kept in git) and opens the Welcome guide. To use another folder, including an existing Obsidian vault, choose **Open another…** in Settings → Workspace.

Coming from another app? See [Move from Notion](/docs/migrate/notion/) and [Move from Obsidian](/docs/migrate/obsidian/).

Next: [Writing and blocks](/docs/guide/writing-and-blocks/).
