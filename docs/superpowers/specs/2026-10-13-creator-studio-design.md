# Creator Studio: asset library and production pipeline: design

Date: 2026-10-13 · Status: draft for review

## Goal

Give creators one place to plan content and find the files that make it: footage, audio, photos,
Photoshop and Premiere files, thumbnails and exports. Today most creators keep these in folders.
Folders are fine for storing files, but finding the right clip, the latest thumbnail or "the
project file for that video" means clicking through a dozen of them every time.

Creator Studio is an optional part of Betelgeuse, switched on in Settings. When it's on:

1. You point it at the folders where your files already live. Nothing is moved, copied or uploaded.
2. Every file in them becomes searchable in a **Library**: by name, folder, type, tags, length,
   resolution, camera, date, and (later) the words spoken in a video or written in an image.
3. Each video or post you make is a **Production**: a page in a pipeline database, with its own
   project folder and an Assets panel that shows everything that belongs to it.

Success looks like:

1. "Where's the B-roll of Goa at sunset?" is answered by typing `goa` in the Library and filtering
   to video: no Finder.
2. Starting a video creates its page and its folder (`Footage`, `Audio`, `Graphics`, `Project`,
   `Exports`, `Thumbnail`) in one step.
3. Opening a production shows its Premiere project, its footage and its thumbnail, each one click
   from opening in the right app.
4. Claude (through the MCP server) can search the library, so "edit the DJI footage from Goa" finds
   the files without being given paths.
5. With YouTube connected, a production goes from idea to uploaded and scheduled from its page,
   and its views and watch time keep updating on the row afterwards, so the whole history of every
   video is in one place for you and for agents.

## Who it's for, and what they need

Small and medium creators: one person or a team of two or three, one to five channels or brands,
tens to a few thousand GB of media, no media-asset-management budget. What they need, roughly in
the order it hurts:

| Need | Today | In Creator Studio |
|---|---|---|
| Find a file fast | Finder search by name, if you remember it | Library search across names, folders, tags and metadata, with type filters and thumbnails |
| See what you have at a glance | Icons; videos must be opened to see them | Thumbnail grid, hover-scrub for video, previews for PSD/RAW/PDF |
| Know which files belong to which video | Folder names, if consistent | Production ↔ project folder link, plus files linked by hand |
| Start a video without setup chores | Make folders by hand, every time | "New production" creates the page and the folder from a template |
| Track where each video stands | Spreadsheet, Notion or memory | Pipeline board and calendar over the productions database (already in Betelgeuse) |
| Reuse assets (logos, intros, music, fonts) | "Brandings" folders per channel | Tags and collections; a Brand Kit collection per channel |
| Know if music/footage is licensed | Rarely tracked | A source and licence field on any asset |
| Find text inside things | Not possible | Phase 3: text in images and screenshots, words spoken in videos |

Out of reach for this design: cloud storage and sharing, team permissions, review/approval links
with timecoded comments, editing media. Betelgeuse stays a local, plain-files app.

## Principles

- **Files stay where they are.** Media is large (the author's `~/Studio` is 38 GB in 4,440 files)
  and belongs to other apps. Betelgeuse only reads it; it never moves or rewrites a media file,
  except when you ask it to create a project folder or reveal a file.
- **The index is a cache.** Everything scanned (file list, metadata, thumbnails, search index) can
  be rebuilt from the folders, so it lives in the app's cache directory, not in the workspace or git.
- **What you write is plain text in the workspace.** Tags, ratings, notes, licences and links to
  productions are things you typed, so they're saved in the workspace (synced by git, readable by
  agents), keyed so they survive the files being renamed or moved.
- **Off means off.** With the toggle off, nothing is scanned, watched or shown.

## Concepts

**Library folders.** Folders you add in Settings, such as `~/Studio`. Each gets a short name
(`Studio`) used in links, so `Studio/YouTube/Smrutify/Goa, Nov 2026/clip.mp4` means the same file
on every machine even when the folder sits at a different path. The folder's path is per machine
(app config); its name and everything said about its files are in the workspace.

**Assets.** Every file in a library folder, sorted into a kind by extension (configurable):

| Kind | Extensions (defaults) |
|---|---|
| Video | mp4 mov mkv avi wmv webm m4v mts |
| Audio | wav mp3 m4a aac flac aiff ogg |
| Image | png jpg jpeg heic webp gif tiff bmp svg |
| Raw photo | dng cr2 cr3 nef arw raf orf rw2 |
| Design | psd psb ai afdesign afphoto fig sketch xcf kra |
| Project | prproj aep drp fcpbundle aup3 kdenlive veg |
| Font | ttf otf woff woff2 |
| Document | pdf md txt docx key pptx |
| Other | anything else |

Ignored by default: `.DS_Store`, Premiere media caches (`.pek`, `.cfa`, `.mcdb`), `Adobe Premiere Pro
Auto-Save/`, `.hash`, `node_modules/`, hidden folders. The ignore list is editable.

**Productions.** Rows of a pipeline database chosen in Settings (an existing one such as StudioDB,
or a new one made from a template). Creator Studio adds two properties if they're missing:
`Project folder` (text: a library path) and `Assets` (a list of linked library paths). Everything
under the project folder belongs to the production automatically; files elsewhere (a logo, a
music track) can be linked by hand.

**Collections.** Saved searches (`kind:video tag:broll`) and hand-picked sets (a channel's Brand
Kit). Both show in the Library's sidebar.

## Storage

| What | Where | Why |
|---|---|---|
| Library folder paths (per machine) | App config (`config.json`, beside the saved vault path) | Paths differ between machines |
| Settings (toggle, kinds, ignore list, folder template, pipeline database) | `.betelgeuse/studio.json` in the workspace | Same on every machine; agents can read it |
| Tags, rating, notes, source/licence, collections | `.betelgeuse/library.jsonl`, one sorted line per asset | Small, line-based so git merges cleanly |
| File index and media details | `index.json` in the app's cache directory, one per workspace, searched in memory | Rebuildable. A 4,000-file library scans in 0.2 s and searches in ~15 ms; move to SQLite FTS5 if libraries reach hundreds of thousands of files |
| Thumbnails, scrub strips | App cache directory, by content fingerprint | Rebuildable; can be cleared in Settings |

**Following renamed files.** Each asset has a fingerprint: size plus a hash of its first and last
64 KB. When a file disappears and a file with the same fingerprint appears, it's the same asset:
its tags and links move with it, and links in pages are rewritten (as page renames already do).

## Scanning and metadata

A background scanner (Rust, `crates/betelgeuse-core/src/library/`) walks each library folder,
skipping ignored paths, and records path, kind, size, dates and fingerprint. A file watcher
(`notify`, already a dependency) keeps it current. Expensive work runs after the walk, at low
priority, newest files first:

- **Metadata:** `ffprobe` for duration, resolution, frame rate, codec and audio channels;
  EXIF (the `kamadak-exif` crate) for camera, lens, ISO and GPS; image size from the header.
- **Thumbnails:** on macOS, Quick Look (`qlmanage -t`) covers video, PSD, RAW, PDF and fonts with
  no extra installs. Elsewhere, `ffmpeg` for video and the `image` crate for images; other kinds
  get their file-type icon. Video also gets a 10-frame strip for hover-scrubbing.
- **Project files:** `.prproj` is gzipped XML; reading its media paths shows which footage a
  Premiere project uses ("Used by: PS1 Emulator Comparison.prproj"). Phase 2.

EXIF (camera, lens) is not read yet in phase 1.

ffmpeg and ffprobe are found on the PATH (or set in Settings). Without them the Library still
works; video simply shows less detail, and Settings says what's missing and how to install it.

## Search

One search box with free text and optional filters, also reachable as chips:

```
goa sunset kind:video duration:>10s
tag:thumbnail channel:AgileCoder modified:<30d
kind:project in:"PS1 Emulator Comparison"
```

Free text matches file and folder names (split on spaces, dashes, underscores and camelCase), tags,
notes and metadata, with prefix matching (`emul` finds `Emulator`). Results rank by match quality
and then recency. Filters: kind, folder, tag, rating, production, channel, duration, resolution,
orientation, date, size, "untagged", "not in any production".

⌘K searches the library too, in its own group below pages, when Creator Studio is on.

## Interface

### Sidebar

With Creator Studio on, the sidebar gets a **Studio** group above Pages: **Library**,
**Pipeline** (opens the productions database) and pinned collections. Each opens in a tab like a page.

### Library

```
┌───────────────┬───────────────────────────────────────────────┬──────────────────┐
│ Search  ⌘F    │ [ goa sunset          ] [Video ×] [>10s ×]  ⊞ ☰ │  ▶ preview       │
│               │ 23 results · sorted by Relevance ▾   size ━━○━  │                  │
│ KINDS         │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │ goa-sunset-03.mp4│
│  All     4,412│ │ ▶0:42│ │ ▶1:05│ │ ▶0:18│ │ ▶2:31│ │ ▶0:09│     │ 4K · 60fps · 0:42│
│  Video     381│ │      │ │      │ │      │ │      │ │      │     │ DJI Action 4     │
│  Audio   1,389│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘     │ 12 Nov 2026      │
│  Image     540│  goa-su…  goa-su…  beach-…  drone-…  sunset…     │                  │
│  Raw       916│                                                  │ Tags  broll goa +│
│  Design      9│ ┌──────┐ ┌──────┐ ┌──────┐ ...                  │ ★★★★☆            │
│  Project   146│                                                  │ Used in          │
│ FOLDERS       │                                                  │  Goa Vlog (Edit) │
│  ▸ Studio     │                                                  │                  │
│ TAGS          │                                                  │ Open · Reveal ·  │
│ COLLECTIONS   │                                                  │ Copy path · Link │
└───────────────┴───────────────────────────────────────────────┴──────────────────┘
```

- **Left:** kinds with counts, the folder tree, tags, collections and smart lists (Recent,
  Favourites, Untagged, Not in a production).
- **Middle:** a grid (thumbnail size slider; video length and kind badges; hover to scrub video) or
  a list (sortable columns: name, kind, length, resolution, size, modified, tags). Shift/⌘ to select
  several; bulk tag, rate, link to a production, or reveal.
- **Right:** the inspector. Preview (video and audio play in place; images zoom), metadata, tags,
  rating, notes, source/licence, "Used in" productions and Premiere projects, and actions: Open
  (default app), Open with…, Reveal in Finder, Copy path, Link to production.
- Space opens Quick Look on macOS, as in Finder. Arrow keys move through results.
- **Drag out:** dragging a file to Premiere, Photoshop, Finder or a browser upload drops the real
  file (Tauri's drag plugin). Dragging onto a page inserts an asset card; onto a production card or
  page, links it.

### Productions

A production is an ordinary page in the pipeline database, so the board, calendar, filters and
per-page views built so far all apply. Creator Studio adds:

- **New production** (button on the pipeline, ⌘K, and the database's New menu): asks for the title
  and channel, creates the row and its project folder from the template
  (`{root}/{channel}/{title}/01 Footage …`), and sets `Project folder`.
- **Assets panel** at the top of a production page (collapsible, like backlinks): files from the
  project folder and linked files, grouped by kind, with thumbnails. "Open project" opens the
  newest `.prproj`/`.aep`/`.drp` directly. "Thumbnail" shows the newest image in `Thumbnail/` and is
  used as the board card's cover.
- **Asset cards in pages:** `/asset` (or a drop from the Library) inserts a card with thumbnail,
  name and length that opens the file. In Markdown it's a normal link, so the file stays readable:
  `[goa-sunset-03.mp4](library:Studio/YouTube/Smrutify/Goa%2C%20Nov%202026/goa-sunset-03.mp4)`.

### Settings → Creator Studio

A new section, between Workspace and Import:

- **Creator Studio** on/off, with one line on what it does.
- **Library folders:** list with name, path, file count, last scan and status; Add folder, Rescan,
  Remove (removing forgets the index, never the files).
- **File types:** the kinds table, editable; the ignore list.
- **Previews:** thumbnails on/off; video scrub strips on/off; ffmpeg/ffprobe status and path;
  cache size and Clear cache.
- **Pipeline:** the productions database (pick, or create from the template with stages Idea →
  Scripting → Recording → Editing → Packaging → Scheduled → Published); the project folder
  template and naming pattern; the default library folder for new projects.
- **YouTube:** connected channels (with the `Channel` value each maps to), Connect / Disconnect,
  Import channel, last sync and today's API quota use; stats refresh interval; advanced: your own
  Google client ID.
- **Smart search** (phase 3): text in images, transcripts, visual search; each with its download
  size and on/off.

## YouTube

Connecting YouTube closes the loop: the workspace already knows the idea, the script, the files
and the stage; YouTube adds what happened after publishing. With both, the pipeline is one
continuous record from idea to performance, kept current automatically, which is what lets an
agent plan, package and review content without being told everything each time.

**Connecting.** Settings → Creator Studio → YouTube → Connect channel. Google sign-in in the
browser (OAuth for installed apps: loopback redirect with PKCE), once per channel; brand-account
channels are picked on Google's consent screen, so all three of the author's channels can be
connected. Each connected channel maps to a value of the pipeline's `Channel` property. Tokens are
stored in the OS keychain (the `keyring` crate), never in the workspace or git.

Scopes, requested only when a feature needs them:

| Scope | For |
|---|---|
| `youtube.readonly` | Channel and video details, playlists, comments |
| `yt-analytics.readonly` | Views, watch time, average view duration, subscribers gained, traffic sources |
| `youtube.upload` / `youtube` | Upload, set thumbnails, schedule, edit titles and descriptions |

**What it does, by stage:**

| Stage | With YouTube connected |
|---|---|
| Idea → Packaging | Nothing changes: planning stays in pages. Titles, description, tags and chapters are written in the production page (sections the content-manager skill already fills). |
| Scheduled | **Upload from the production:** the newest file in `Exports/`, the page's title, description, tags and chapters, the newest image in `Thumbnail/`, privacy and a publish time. Uploads resume after interruptions. The row gets `Video ID` and `URL`, and moves to Scheduled. |
| Published | When the publish time passes (or the video is found on the channel), the row moves to Published. |
| After | **Stats sync:** latest views, likes, comments, watch time and average view duration on the row; a daily history kept for charts and for agents. New comments are listed on the production page. |

**Existing videos.** "Import channel" creates (or matches by URL or title) a Published row for each
video already on the channel, with its stats, so the history starts complete rather than from today.

**Where the data lives.** Latest numbers are ordinary row properties (`Views`, `Likes`,
`Comments`, `Watch time`, `Avg view duration`, `Published`), so boards, tables, sorts and filters
work on them. The daily history is `.betelgeuse/youtube/<channel>.csv` (date, video ID, metrics),
one small file per channel; it's in the workspace so it syncs and agents can read it.

**Sync schedule.** Stats refresh when the app opens and every 6 hours while it's open; uploads
and edits happen when you ask. The Data API has a daily quota (10,000 units by default): a stats
refresh of a few hundred videos costs tens of units, while an upload costs about 1,600, so roughly
six uploads a day. Settings shows the day's usage.

**Two Google constraints that shape this:**

- **Upload needs a verified app.** Google locks videos uploaded through unverified API projects to
  Private until the project passes an audit. Reading stats has no such limit. So phase 5a (read)
  ships first; uploads need Devian Labs' Google project to pass verification, or a user's own
  client ID (an "advanced" option in Settings for people who set up their own Google Cloud project).
- **Some numbers aren't in the API.** YouTube Studio shows figures (thumbnail click-through rate,
  for one) that the public Analytics API may not offer, or offers only through bulk reports. The
  implementation plan should check each metric against the current API before promising it in the UI.

## Agents (MCP)

When Creator Studio is on, the MCP server gains tools for agents:

- **Library (read):** `library_search(query, filters)` and `library_asset(path)` (metadata, tags,
  productions, absolute path), so the video-editor skill can find footage and brand assets by
  description. They read the app's index; if there isn't one yet, they say so.
- **YouTube (read):** `youtube_channel(channel)` and `youtube_video_stats(video, range)`, from the
  synced history, so the content-manager skill's weekly review uses real numbers ("the emulator
  comparisons hold viewers twice as long as the setup guides: make more").
- **YouTube (write):** `youtube_update_metadata` and `youtube_schedule_upload`. They go through
  the app, which asks you to confirm each one: an agent can prepare an upload, but publishing to
  your channel is your click. Each write is recorded in the production's page history.

With that, the loop an agent can run: read last month's performance → suggest ideas into Idea
Backlog → draft the script and package → find the footage in the Library → after you approve,
schedule the upload → report how it did.

## Mobile

Out of scope: the media lives on the desktop. Tags, notes and production links sync to the phone
with the workspace and show on production pages as text; the Library itself isn't on the phone.

## Phases

Each phase gets its own implementation plan and ships on its own.

1. **Library.** Toggle and Settings section; library folders; scanner, watcher and
   index; ffprobe/EXIF metadata; thumbnails (Quick Look / ffmpeg); Library view (grid, list,
   inspector, filters, search); Open/Reveal/Copy path; ⌘K results; tags, ratings and notes in
   `library.jsonl`.
2. **Pipeline.** Productions database setting and template; New production with folder templates;
   the Assets panel; asset cards and `library:` links; drag in and out; Premiere project parsing;
   collections; rename tracking.
3. **Smart search.** Text in images and screenshots (Apple Vision on macOS, Tesseract elsewhere);
   transcripts with on-device Whisper; visual search ("beach at sunset") with an on-device CLIP
   model; duplicate detection; MCP tools.
4. **Ingest.** Import from an SD card or camera into a production's Footage folder, with renaming
   and a checksum, so cards can be wiped safely.
5. **YouTube.** (a) Connect channels, import existing videos, stats sync and history, comments,
   read-only MCP tools. (b) Upload, thumbnails, scheduling and metadata edits from a production,
   and the confirmed write tools for agents; needs Google app verification. 5a doesn't depend on
   the Library and could ship right after phase 2, or even before phase 1.

## Open questions

- Should library folders be allowed inside the workspace? Simplest is no: media inside a git
  workspace bloats the repository. The Settings picker would warn and refuse.
- Licence tracking: a free-text field (phase 1) or a small structured one (source, licence,
  expiry, attribution) with a "licences expiring" list? Proposed: structured, phase 2.
