---
title: Creator Studio
description: A searchable library of your footage, audio, photos and project files, and a production pipeline for videos and posts.
---
Creator Studio is for people who make videos, podcasts and posts. It turns the folders where your media already lives into a searchable **Library**, and links each video in your pipeline to its **project folder**, so the footage, the Premiere project and the thumbnail are one click from the page that plans them.

> [!blue] 🧩
> Creator Studio is built into Betelgeuse today, behind a switch in **Settings → Creator Studio**. It's becoming the first plugin, so people who don't make content don't carry it.

## Turn it on

1. Open **Settings → Creator Studio** and switch it on.
2. Click **Add folder…** and choose where your media lives, such as `~/Studio` or an external drive.
3. **Library** appears in the sidebar. The first scan takes a moment; media details (length, resolution) fill in over the next minutes.

Your files are never moved, copied or uploaded: Betelgeuse only reads them. Tags, ratings and notes you add are saved in the workspace (`.betelgeuse/library.jsonl`); thumbnails and the file index are a cache on this computer.

## The Library

- **Search** names, folders, tags and notes as you type. Narrow it down with filters: `goa kind:video duration:>30`, `#broll`, `ext:psd`, `rating:>=4`.
- **Browse** by kind (video, audio, images, raw photos, design files, project files, fonts, documents), by folder, by tag, or by production.
- **Preview**: hover a video to play it; select a file to see it in the panel on the right (video and audio play from disk); press **Space** for a big preview.
- **Open** a file in its app (double-click or **Enter**), reveal it in Finder, or copy its path.
- **Tag, rate and annotate** one file or many at once. Tags and notes follow a file when you rename or move it.
- **Offline drives** keep their files listed, marked offline, until the drive is back.

Video length and resolution need [ffmpeg](https://ffmpeg.org) (`brew install ffmpeg` on a Mac). Thumbnails use Quick Look on macOS and ffmpeg elsewhere.

## Productions

Choose your pipeline database in **Settings → Creator Studio → Pipeline** (for example your videos database), say which property holds the channel, and where each channel's project folders go. Then each row's page gets an **Assets** panel:

- **Create project folder** makes `Footage`, `Audio`, `Graphics`, `Project`, `Exports` and `Thumbnail` in the channel's folder (the template is yours to change).
- Or **link an existing folder**: Betelgeuse suggests folders whose names match the title.
- The panel lists the folder's files by sub-folder, with **Open project** for the newest Premiere, After Effects, Resolve or Audacity file.

**Import existing projects** creates a production for each project folder that doesn't have one, so videos made before you started are in the pipeline too. **Link folders** links productions to folders that clearly match their titles.

## Settings

| Setting | What it does |
|---|---|
| Library folders | The folders indexed, with file counts. Removing one forgets its index, never the files. |
| Thumbnails | Turn previews off, or clear their cache. |
| Video details | Shows whether ffmpeg was found. |
| Skip these files and folders | Names to ignore, with `*` wildcards. Premiere's media cache and similar are skipped by default. |
| Pipeline | The database, channel property, folder per channel and folder template. |
