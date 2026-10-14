---
title: Install Betelgeuse
description: Download Betelgeuse for macOS, Windows or Linux, or build it from source.
---
## Download

Get the latest version for macOS (Apple Silicon or Intel), Windows or Linux from the [releases page](https://github.com/devian-labs/betelgeuse/releases/latest).

The builds aren't code-signed yet, so the first time you open the app your system asks you to confirm:

- **macOS:** open the app once, then go to System Settings → Privacy & Security and click **Open Anyway**.
- **Windows:** click **More info**, then **Run anyway**.
- **Linux:** use the AppImage, or the `.deb`/`.rpm` package for your distribution.

## Build it yourself

Building from source avoids every warning above. You need [git](https://git-scm.com), [Node.js 20 or newer](https://nodejs.org) and [Rust](https://rustup.rs); the install script checks for anything else.

```sh
git clone https://github.com/devian-labs/betelgeuse && cd betelgeuse
./scripts/install.sh          # macOS and Linux
.\scripts\install.ps1         # Windows (PowerShell)
```

## Your first workspace

On first launch, Betelgeuse creates a workspace (a folder of Markdown files, kept in git) and opens the Welcome guide. To use another folder, including an existing Obsidian vault, choose **Open another…** in Settings → Workspace.

Next: [Writing and blocks](/docs/guide/writing-and-blocks/).
