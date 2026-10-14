---
title: Media Library
description: Browse and search your footage, audio, photos, design and project files where they already are, and link project folders to pages.
---
Media Library turns the folders where your files already live (footage, audio, photos, Photoshop and Premiere files, fonts, documents) into a searchable **Library** with previews, so you stop digging through folders. It can also link pages to **project folders**, so the files for a video, a post or any project are one click from the page that plans them.

> [!blue] 🧩
> Media Library is a plugin, so people who don't need it don't carry it. It used to be built in as "Creator Studio"; if you used that, your folders, tags and settings carry over when you install it.

## Install it

1. Open **Settings → Plugins → Browse** and install **Media Library**.
2. Open **Settings → Media Library**, click **Add folder…** and choose where your files live, such as `~/Studio` or an external drive.
3. **Library** appears in the sidebar. The first scan takes a moment; media details (length, resolution) fill in over the next minutes.

Your files are never moved, copied or uploaded: Betelgeuse only reads them. Tags, ratings and notes you add are saved in the workspace (`.betelgeuse/library.jsonl`); the project folder settings in `.betelgeuse/plugins/media-library/`; thumbnails and the file index are a cache on this computer. Turning the plugin off stops scanning; your data stays for when you turn it back on.

## The Library

- **Search** names, folders, tags and notes as you type. Narrow it down with filters: `goa kind:video duration:>30`, `#broll`, `ext:psd`, `rating:>=4`.
- **Browse** by kind (video, audio, images, raw photos, design files, project files, fonts, documents), by folder, by tag, or by project.
- **Preview**: hover a video to play it; select a file to see it in the panel on the right (video and audio play from disk); press **Space** for a big preview.
- **Open** a file in its app (double-click or **Enter**), reveal it in Finder, or copy its path.
- **Tag, rate and annotate** one file or many at once. Tags and notes follow a file when you rename or move it.
- **Offline drives** keep their files listed, marked offline, until the drive is back.

Video length and resolution need [ffmpeg](https://ffmpeg.org) (`brew install ffmpeg` on a Mac). Thumbnails use Quick Look on macOS and ffmpeg elsewhere.

## Project folders

Link a database's pages to folders: choose the database in **Settings → Media Library → Project folders** (a videos pipeline, a client list, a projects database), say which property groups them (a channel, say) and where each group's folders go. Then each row's page gets an **Assets** panel:

- **Create project folder** makes `Footage`, `Audio`, `Graphics`, `Project`, `Exports` and `Thumbnail` in the channel's folder (the template is yours to change).
- Or **link an existing folder**: Betelgeuse suggests folders whose names match the title.
- The panel lists the folder's files by sub-folder, with **Open project** for the newest Premiere, After Effects, Resolve or Audacity file.

**Import existing projects** creates a page for each project folder that doesn't have one, so work from before you started is in the database too. **Link folders** links pages to folders that clearly match their titles.

## Settings

| Setting | What it does |
|---|---|
| Library folders | The folders indexed, with file counts. Removing one forgets its index, never the files. |
| Thumbnails | Turn previews off, or clear their cache. |
| Video details | Shows whether ffmpeg was found. |
| Skip these files and folders | Names to ignore, with `*` wildcards. Premiere's media cache and similar are skipped by default. |
| Project folders | The database, the property that groups its pages, the folder per group and the folder template. |
