//! The media library: an index of the media files in folders the user adds (footage,
//! audio, photos, Photoshop and Premiere files…), searchable from the app.
//!
//! Files are only read, never moved or copied into the workspace. What's derived from them (the file
//! list, media details, thumbnails) is a cache in the app's cache folder and can always be rebuilt.
//! What the user writes about them (tags, rating, notes) is saved in the workspace, in
//! `.betelgeuse/library.jsonl`, so it syncs with git and agents can read it.
//!
//! Assets are identified by `<folder name>/<path inside the folder>`, so the same id means the same
//! file on every machine even when the library folder lives at a different path.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

/// Workspace settings (shared by every machine): `.betelgeuse/studio.json`.
const SETTINGS_FILE: &str = ".betelgeuse/studio.json";
/// Tags, ratings and notes, one asset per line: `.betelgeuse/library.jsonl`.
const META_FILE: &str = ".betelgeuse/library.jsonl";
/// Thumbnails are generated a few at a time, so scrolling a big grid doesn't start hundreds of processes.
const THUMB_WORKERS: usize = 3;
const THUMB_SIZE: u32 = 480;

pub const KINDS: &[(&str, &[&str])] = &[
    ("video", &["mp4", "mov", "mkv", "avi", "wmv", "webm", "m4v", "mts", "m2ts", "mxf", "flv", "3gp"]),
    ("audio", &["wav", "mp3", "m4a", "aac", "flac", "aiff", "aif", "ogg", "opus", "wma"]),
    ("image", &["png", "jpg", "jpeg", "heic", "heif", "webp", "gif", "tif", "tiff", "bmp", "svg", "avif"]),
    ("raw", &["dng", "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "srw", "pef"]),
    ("design", &["psd", "psb", "ai", "eps", "afdesign", "afphoto", "afpub", "fig", "sketch", "xcf", "kra", "procreate", "indd"]),
    ("project", &["prproj", "aep", "drp", "fcpbundle", "fcpxml", "aup3", "aup", "kdenlive", "veg", "mlt", "osp", "logicx", "als", "flp", "band"]),
    ("font", &["ttf", "otf", "woff", "woff2", "eot"]),
    ("document", &["pdf", "md", "txt", "docx", "doc", "rtf", "pages", "key", "pptx", "xlsx", "csv", "srt", "vtt"]),
];

/// Cache and system files nobody searches for: Premiere's media cache, Finder's metadata, autosaves…
pub const DEFAULT_IGNORE: &[&str] = &[
    ".*",
    "*.pek",
    "*.cfa",
    "*.mcdb",
    "*.hash",
    "*.ims",
    "*.lrprev",
    // Sound Forge peak files and DJI's low-resolution proxies of each clip.
    "*.sfk",
    "*.lrf",
    "Thumbs.db",
    "desktop.ini",
    "Adobe Premiere Pro Auto-Save",
    "Adobe After Effects Auto-Save",
    "Media Cache",
    "Media Cache Files",
    "node_modules",
    "__MACOSX",
];

pub fn kind_of(ext: &str) -> &'static str {
    KINDS.iter().find(|(_, exts)| exts.contains(&ext)).map_or("other", |(k, _)| k)
}

// ---------------------------------------------------------------------------------------------
// Settings

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct StudioSettings {
    /// Set when the library was a built-in feature ("Creator Studio") switched on in Settings. Now it
    /// runs while a plugin uses it; this only tells the app to turn the Media Library plugin on once.
    pub enabled: bool,
    /// File and folder names (with `*` wildcards) the scanner skips.
    pub ignore: Vec<String>,
    pub thumbnails: bool,
    pub pipeline: Pipeline,
}

impl Default for StudioSettings {
    fn default() -> Self {
        Self { enabled: false, ignore: DEFAULT_IGNORE.iter().map(|s| s.to_string()).collect(), thumbnails: true, pipeline: Pipeline::default() }
    }
}

/// How productions (rows of a pipeline database) map to project folders in the library.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Pipeline {
    /// The pipeline database's page path, e.g. `Areas/Content Studio/StudioDB.md`.
    pub database: Option<String>,
    /// The select property that says which channel a production is for.
    pub channel_property: String,
    /// The text property holding each production's project folder (a library folder id).
    pub folder_property: String,
    /// Where new project folders go, per channel: `{ "Agile Coder": "Studio/YouTube/AgileCoder" }`.
    pub channel_folders: BTreeMap<String, String>,
    /// Where they go for productions without a channel.
    pub default_folder: Option<String>,
    /// Sub-folders every new project folder starts with.
    pub template: Vec<String>,
}

impl Default for Pipeline {
    fn default() -> Self {
        Self {
            database: None,
            channel_property: "Channel".into(),
            folder_property: "Project folder".into(),
            channel_folders: BTreeMap::new(),
            default_folder: None,
            template: ["Footage", "Audio", "Graphics", "Project", "Exports", "Thumbnail"].map(String::from).to_vec(),
        }
    }
}

pub fn read_settings(ws: &Path) -> StudioSettings {
    std::fs::read_to_string(ws.join(SETTINGS_FILE)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn write_settings(ws: &Path, s: &StudioSettings) -> Result<(), String> {
    let file = ws.join(SETTINGS_FILE);
    std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(file, serde_json::to_string_pretty(s).unwrap() + "\n").map_err(|e| e.to_string())
}

/// A library folder on this machine. The name is what asset ids start with.
#[derive(Serialize, Deserialize, Clone)]
pub struct Root {
    pub name: String,
    pub path: String,
}

// ---------------------------------------------------------------------------------------------
// Assets

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub root: String,
    /// Path inside the library folder, with `/` separators.
    pub rel: String,
    pub name: String,
    pub ext: String,
    pub kind: String,
    pub size: u64,
    /// Milliseconds since the epoch.
    pub modified: i64,
    pub created: i64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Seconds.
    pub duration: Option<f64>,
    pub fps: Option<f64>,
    pub codec: Option<String>,
    /// Media details have been read (or there were none to read).
    #[serde(default)]
    pub probed: bool,
    /// Its library folder isn't reachable right now (an unplugged drive): kept, but can't be opened.
    #[serde(default)]
    pub offline: bool,
    /// Hash of the file's first and last 64 KB, for files with tags or notes, so those follow the
    /// file when it's renamed or moved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
    /// Search words from the name and the folders, worked out once.
    #[serde(skip)]
    words: (Vec<String>, Vec<String>),
}

impl Asset {
    fn index_words(&mut self) {
        self.words = (words(&self.name), words(self.id.rsplit_once('/').map_or("", |(d, _)| d)));
    }
}

/// Size and a hash of the first and last 64 KB: cheap, and enough to recognise a moved file.
fn fingerprint(path: &Path) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    let mut h = std::collections::hash_map::DefaultHasher::new();
    len.hash(&mut h);
    let mut buf = vec![0u8; 65536];
    let n = f.read(&mut buf).ok()?;
    buf[..n].hash(&mut h);
    if len > 131072 {
        f.seek(SeekFrom::End(-65536)).ok()?;
        let n = f.read(&mut buf).ok()?;
        buf[..n].hash(&mut h);
    }
    Some(format!("{:016x}", h.finish()))
}

/// What the user wrote about an asset. Saved in the workspace.
#[derive(Serialize, Deserialize, Clone, Default, PartialEq)]
#[serde(default)]
pub struct Meta {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "is_zero")]
    pub rating: u8,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub notes: String,
}

fn is_zero(n: &u8) -> bool {
    *n == 0
}

impl Meta {
    fn is_empty(&self) -> bool {
        self.tags.is_empty() && self.rating == 0 && self.notes.is_empty()
    }
}

#[derive(Serialize, Deserialize)]
struct MetaLine {
    id: String,
    #[serde(flatten)]
    meta: Meta,
}

fn read_meta(ws: &Path) -> HashMap<String, Meta> {
    let Ok(text) = std::fs::read_to_string(ws.join(META_FILE)) else { return HashMap::new() };
    text.lines().filter_map(|l| serde_json::from_str::<MetaLine>(l).ok()).map(|l| (l.id, l.meta)).collect()
}

/// Sorted by id, one line each, so two machines' edits merge cleanly in git.
fn write_meta(ws: &Path, meta: &HashMap<String, Meta>) -> Result<(), String> {
    let sorted: BTreeMap<_, _> = meta.iter().filter(|(_, m)| !m.is_empty()).collect();
    let mut out = String::new();
    for (id, m) in sorted {
        out += &serde_json::to_string(&MetaLine { id: id.clone(), meta: m.clone() }).unwrap();
        out.push('\n');
    }
    let file = ws.join(META_FILE);
    std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(file, out).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------
// State

#[derive(Default)]
pub struct Library {
    inner: Mutex<Inner>,
    /// Thumbnail jobs: running now (at most THUMB_WORKERS) and waiting, newest first.
    thumb_slots: (Mutex<Slots>, Condvar),
}

#[derive(Default)]
struct Inner {
    workspace: Option<PathBuf>,
    settings: StudioSettings,
    roots: Vec<Root>,
    assets: Vec<Asset>,
    meta: HashMap<String, Meta>,
    watcher: Option<RecommendedWatcher>,
    /// Bumped on every (re)load, so a scan that started before a workspace switch can't save over it.
    generation: u64,
    scanning: bool,
    rescan_requested: bool,
    last_scan: Option<i64>,
    ffprobe: Option<Option<String>>,
    ffmpeg: Option<Option<String>>,
    /// When `library.jsonl` was last read, to pick up edits from git pulls and agents.
    meta_stamp: Option<std::time::SystemTime>,
    /// Bumped whenever the watcher is replaced, so the old one's debounce thread stops.
    watch_generation: u64,
    /// A plugin is using the library: scan and watch the folders. Off until one asks.
    active: bool,
}

fn meta_stamp(ws: &Path) -> Option<std::time::SystemTime> {
    std::fs::metadata(ws.join(META_FILE)).and_then(|m| m.modified()).ok()
}

impl Inner {
    /// Re-reads tags and notes if the file changed on disk since we last read it.
    fn sync_meta(&mut self) {
        let Some(ws) = self.workspace.clone() else { return };
        let stamp = meta_stamp(&ws);
        if stamp != self.meta_stamp {
            self.meta = read_meta(&ws);
            self.meta_stamp = stamp;
        }
    }
}

pub type Shared = Arc<Library>;

/// Thumbnail work is served newest first: when someone scrolls quickly, the tiles now on screen
/// asked last, and the ones scrolled past shouldn't make them wait.
#[derive(Default)]
struct Slots {
    busy: usize,
    waiting: std::collections::BTreeSet<u64>,
    next: u64,
}

fn cache_dir(app: &AppHandle, ws: &Path) -> Option<PathBuf> {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    ws.hash(&mut h);
    app.path().app_cache_dir().ok().map(|d| d.join("library").join(format!("{:016x}", h.finish())))
}

fn roots_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("library-folders.json"))
}

/// Library folders per workspace, on this machine: `{ "<workspace path>": [Root, …] }`.
fn read_roots(app: &AppHandle, ws: &Path) -> Vec<Root> {
    roots_file(app)
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str::<HashMap<String, Vec<Root>>>(&t).ok())
        .and_then(|mut m| m.remove(&*ws.to_string_lossy()))
        .unwrap_or_default()
}

fn write_roots(app: &AppHandle, ws: &Path, roots: &[Root]) -> Result<(), String> {
    let file = roots_file(app).ok_or("no config folder")?;
    let mut all: HashMap<String, Vec<Root>> =
        std::fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
    all.insert(ws.to_string_lossy().into_owned(), roots.to_vec());
    std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(file, serde_json::to_string_pretty(&all).unwrap()).map_err(|e| e.to_string())
}

fn index_file(app: &AppHandle, ws: &Path) -> Option<PathBuf> {
    cache_dir(app, ws).map(|d| d.join("index.json"))
}

fn save_index(app: &AppHandle, ws: &Path, assets: &[Asset]) {
    if let Some(file) = index_file(app, ws) {
        let _ = std::fs::create_dir_all(file.parent().unwrap());
        let tmp = file.with_extension("json.tmp");
        if std::fs::write(&tmp, serde_json::to_vec(assets).unwrap_or_default()).is_ok() {
            let _ = std::fs::rename(tmp, file);
        }
    }
}

/// Points the library at a workspace (on open or switch): loads its settings, folders, tags and the
/// cached index, then rescans in the background while a plugin uses it.
pub fn load(app: &AppHandle, lib: &Shared, ws: &Path) {
    let mut assets: Vec<Asset> = index_file(app, ws)
        .and_then(|f| std::fs::read(f).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    assets.iter_mut().for_each(Asset::index_words);
    {
        let mut g = lib.inner.lock().unwrap();
        g.generation += 1;
        g.workspace = Some(ws.to_path_buf());
        g.settings = read_settings(ws);
        g.roots = read_roots(app, ws);
        g.meta = read_meta(ws);
        g.meta_stamp = meta_stamp(ws);
        g.assets = assets;
        g.watcher = None;
        g.watch_generation += 1;
        // Each workspace starts idle; its plugins turn the library on.
        g.active = false;
    }
}

/// Turns the library on (scan, watch) or off, for the plugins that use it.
pub fn set_active(app: &AppHandle, lib: &Shared, on: bool) {
    {
        let mut g = lib.inner.lock().unwrap();
        if g.active == on {
            return;
        }
        g.active = on;
    }
    let (app, lib) = (app.clone(), lib.clone());
    std::thread::spawn(move || apply(&app, &lib));
}

/// Starts or stops watching and scanning to match the settings.
fn apply(app: &AppHandle, lib: &Shared) {
    let (enabled, roots) = {
        let g = lib.inner.lock().unwrap();
        (g.active, g.roots.clone())
    };
    if !enabled {
        let mut g = lib.inner.lock().unwrap();
        g.watcher = None;
        g.watch_generation += 1;
        return;
    }
    // Let the webview stream these files (video and audio previews play straight from disk).
    for r in &roots {
        let _ = app.asset_protocol_scope().allow_directory(&r.path, true);
    }
    watch(app, lib, &roots);
    scan(app, lib);
}

/// Watches the library folders. Changes come in bursts (a copy, an export, a render), so the rescan
/// waits until the folders have been quiet for a moment; nothing that changes in the meantime is missed.
fn watch(app: &AppHandle, lib: &Shared, roots: &[Root]) {
    let dirty: Arc<Mutex<Option<Instant>>> = Arc::default();
    let mark = dirty.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !event.kind.is_access() {
            *mark.lock().unwrap() = Some(Instant::now());
        }
    });
    let Ok(mut w) = watcher else { return };
    for r in roots {
        let _ = w.watch(Path::new(&r.path), RecursiveMode::Recursive);
    }
    let generation = {
        let mut g = lib.inner.lock().unwrap();
        g.watch_generation += 1;
        g.watcher = Some(w);
        g.watch_generation
    };
    let (app, lib) = (app.clone(), lib.clone());
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        if lib.inner.lock().unwrap().watch_generation != generation {
            return;
        }
        let due = matches!(*dirty.lock().unwrap(), Some(t) if t.elapsed() >= Duration::from_millis(1500));
        if due {
            *dirty.lock().unwrap() = None;
            scan(&app, &lib);
        }
    });
}

// ---------------------------------------------------------------------------------------------
// Scanning

fn glob_match(pattern: &str, name: &str) -> bool {
    let (p, n) = (pattern.to_lowercase(), name.to_lowercase());
    match p.split_once('*') {
        None => p == n,
        Some((pre, post)) if !post.contains('*') => n.len() >= pre.len() + post.len() && n.starts_with(pre) && n.ends_with(post),
        // Several wildcards: match the pieces in order.
        Some(_) => {
            let parts: Vec<&str> = p.split('*').collect();
            let mut at = 0;
            for (i, part) in parts.iter().enumerate() {
                if part.is_empty() {
                    continue;
                }
                match n[at..].find(part) {
                    Some(k) if i > 0 || k == 0 => at += k + part.len(),
                    _ => return false,
                }
            }
            parts.last().is_some_and(|l| l.is_empty() || n.ends_with(l))
        }
    }
}

fn millis(t: std::io::Result<std::time::SystemTime>) -> i64 {
    t.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as i64)
}

/// Walks the library folders and refreshes the index. Files whose size and date haven't changed keep
/// their media details; new ones are probed afterwards.
pub fn scan(app: &AppHandle, lib: &Shared) {
    let (ws, generation, roots, ignore, previous) = {
        let mut g = lib.inner.lock().unwrap();
        if !g.active {
            return;
        }
        if g.scanning {
            g.rescan_requested = true;
            return;
        }
        let Some(ws) = g.workspace.clone() else { return };
        g.scanning = true;
        g.rescan_requested = false;
        let previous: HashMap<String, Asset> = g.assets.iter().map(|a| (a.id.clone(), a.clone())).collect();
        (ws, g.generation, g.roots.clone(), g.settings.ignore.clone(), previous)
    };
    let _ = app.emit("library-progress", serde_json::json!({ "phase": "scanning" }));

    let mut assets = walk(&roots, &ignore, &ws, &previous);

    {
        let mut g = lib.inner.lock().unwrap();
        if g.generation != generation {
            g.scanning = false;
            return;
        }
        g.sync_meta();
        let mut meta = std::mem::take(&mut g.meta);
        if follow_moves(&mut assets, &previous, &mut meta, &roots) {
            let _ = write_meta(&ws, &meta);
            g.meta_stamp = meta_stamp(&ws);
        }
        g.meta = meta;
        g.assets = assets.clone();
        g.last_scan = Some(millis(Ok(std::time::SystemTime::now())));
    }
    save_index(app, &ws, &assets);
    let _ = app.emit("library-changed", ());

    probe_all(app, lib, generation, &ws, &roots);

    let again = {
        let mut g = lib.inner.lock().unwrap();
        g.scanning = false;
        std::mem::take(&mut g.rescan_requested)
    };
    let _ = app.emit("library-progress", serde_json::json!({ "phase": "idle" }));
    if again {
        scan(app, lib);
    }
}

/// Lists the files in the library folders. Files whose size and date haven't changed keep their
/// previous record (with its media details).
fn walk(roots: &[Root], ignore: &[String], ws: &Path, previous: &HashMap<String, Asset>) -> Vec<Asset> {
    let mut assets = Vec::new();
    for root in roots {
        let base = PathBuf::from(&root.path);
        // An unplugged drive: keep what we knew about it, marked offline, rather than forgetting it.
        if !base.is_dir() {
            assets.extend(previous.values().filter(|a| a.root == root.name).map(|a| Asset { offline: true, ..a.clone() }));
            continue;
        }
        // Never index the workspace itself (its own assets are pages' business).
        let mut walker = walkdir::WalkDir::new(&base).follow_links(false).into_iter().filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            e.depth() == 0 || (!ignore.iter().any(|p| glob_match(p, &name)) && e.path() != ws)
        });
        while let Some(entry) = walker.next() {
            let Ok(entry) = entry else { continue };
            // Bundles like .fcpbundle are folders: one asset, without their insides.
            let is_bundle = entry.depth() > 0 && entry.file_type().is_dir() && kind_of(&ext_of(entry.path())) == "project";
            if is_bundle {
                walker.skip_current_dir();
            } else if !entry.file_type().is_file() {
                continue;
            }
            let Ok(rel) = entry.path().strip_prefix(&base) else { continue };
            let rel = rel.to_string_lossy().replace('\\', "/");
            let id = format!("{}/{}", root.name, rel);
            let Ok(md) = entry.metadata() else { continue };
            let (size, modified) = (md.len(), millis(md.modified()));
            if let Some(old) = previous.get(&id).filter(|o| o.size == size && o.modified == modified) {
                assets.push(Asset { offline: false, ..old.clone() });
                continue;
            }
            let ext = ext_of(entry.path());
            let mut asset = Asset {
                id,
                root: root.name.clone(),
                name: entry.file_name().to_string_lossy().into_owned(),
                kind: kind_of(&ext).to_string(),
                ext,
                rel,
                size,
                modified,
                created: millis(md.created()),
                probed: false,
                ..Default::default()
            };
            asset.index_words();
            assets.push(asset);
        }
    }
    assets
}

/// Tags and notes follow files that were renamed or moved: a file that disappeared and a new file
/// with the same size and fingerprint are the same file. Also fingerprints files that have tags or
/// notes but no fingerprint yet, so a later move can be followed. Returns true if any moved.
fn follow_moves(assets: &mut [Asset], previous: &HashMap<String, Asset>, meta: &mut HashMap<String, Meta>, roots: &[Root]) -> bool {
    let path = |a: &Asset| roots.iter().find(|r| r.name == a.root).map(|r| Path::new(&r.path).join(&a.rel));
    let present: HashSet<&str> = assets.iter().map(|a| a.id.as_str()).collect();
    let gone: Vec<&Asset> = previous
        .values()
        .filter(|a| !present.contains(a.id.as_str()) && a.fingerprint.is_some() && meta.contains_key(&a.id))
        .collect();
    let mut moved = false;
    for old in gone {
        let mut found = None;
        for a in assets.iter_mut().filter(|a| !previous.contains_key(&a.id) && a.size == old.size && !a.offline) {
            if a.fingerprint.is_none() {
                a.fingerprint = path(a).and_then(|p| fingerprint(&p));
            }
            if a.fingerprint == old.fingerprint && !meta.contains_key(&a.id) {
                found = Some(a.id.clone());
                break;
            }
        }
        if let Some(new_id) = found {
            if let Some(m) = meta.remove(&old.id) {
                meta.insert(new_id, m);
                moved = true;
            }
        }
    }
    for a in assets.iter_mut().filter(|a| a.fingerprint.is_none() && !a.offline && meta.contains_key(&a.id)) {
        a.fingerprint = path(a).and_then(|p| fingerprint(&p));
    }
    moved
}

fn ext_of(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// Reads media details for files that don't have them yet: newest first, saving as it goes.
fn probe_all(app: &AppHandle, lib: &Shared, generation: u64, ws: &Path, roots: &[Root]) {
    let todo: Vec<(String, PathBuf, String)> = {
        let g = lib.inner.lock().unwrap();
        let mut v: Vec<&Asset> = g.assets.iter().filter(|a| !a.probed).collect();
        v.sort_by_key(|a| -a.modified);
        v.iter()
            .filter_map(|a| roots.iter().find(|r| r.name == a.root).map(|r| (a.id.clone(), Path::new(&r.path).join(&a.rel), a.kind.clone())))
            .collect()
    };
    if todo.is_empty() {
        return;
    }
    let ffprobe = tool(lib, "ffprobe");
    let total = todo.len();
    let mut last_save = Instant::now();
    for (i, (id, path, kind)) in todo.into_iter().enumerate() {
        let details = match kind.as_str() {
            "video" | "audio" => ffprobe.as_deref().and_then(|p| probe_media(p, &path)),
            "image" => imagesize::size(&path).ok().map(|s| Probe { width: Some(s.width as u32), height: Some(s.height as u32), ..Default::default() }),
            _ => None,
        };
        {
            let mut g = lib.inner.lock().unwrap();
            if g.generation != generation {
                return;
            }
            if let Some(a) = g.assets.iter_mut().find(|a| a.id == id) {
                a.probed = true;
                if let Some(d) = details {
                    a.width = d.width;
                    a.height = d.height;
                    a.duration = d.duration;
                    a.fps = d.fps;
                    a.codec = d.codec;
                }
            }
        }
        if last_save.elapsed() > Duration::from_secs(3) || i + 1 == total {
            last_save = Instant::now();
            let assets = lib.inner.lock().unwrap().assets.clone();
            save_index(app, ws, &assets);
            let _ = app.emit("library-changed", ());
            let _ = app.emit("library-progress", serde_json::json!({ "phase": "probing", "done": i + 1, "total": total }));
        }
    }
}

#[derive(Default)]
struct Probe {
    width: Option<u32>,
    height: Option<u32>,
    duration: Option<f64>,
    fps: Option<f64>,
    codec: Option<String>,
}

fn probe_media(ffprobe: &str, path: &Path) -> Option<Probe> {
    let out = Command::new(ffprobe)
        .args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams"])
        .arg(path)
        .output()
        .ok()?;
    let json: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    let streams = json["streams"].as_array().cloned().unwrap_or_default();
    let video = streams.iter().find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"] != 1);
    let first = video.or_else(|| streams.iter().find(|s| s["codec_type"] == "audio"));
    let fps = video.and_then(|v| v["avg_frame_rate"].as_str()).and_then(|r| {
        let (n, d) = r.split_once('/')?;
        let (n, d): (f64, f64) = (n.parse().ok()?, d.parse().ok()?);
        (d > 0.0 && n > 0.0).then(|| (n / d * 100.0).round() / 100.0)
    });
    Some(Probe {
        width: video.and_then(|v| v["width"].as_u64()).map(|w| w as u32),
        height: video.and_then(|v| v["height"].as_u64()).map(|h| h as u32),
        duration: json["format"]["duration"].as_str().and_then(|d| d.parse().ok()),
        fps,
        codec: first.and_then(|s| s["codec_name"].as_str()).map(str::to_string),
    })
}

/// Finds a command-line tool (ffmpeg, ffprobe). Apps opened from Finder don't get the shell's PATH,
/// so ask a login shell, and remember the answer.
fn tool(lib: &Shared, name: &str) -> Option<String> {
    {
        let g = lib.inner.lock().unwrap();
        let cached = if name == "ffprobe" { &g.ffprobe } else { &g.ffmpeg };
        if let Some(found) = cached {
            return found.clone();
        }
    }
    let found = find_tool(name);
    let mut g = lib.inner.lock().unwrap();
    if name == "ffprobe" { g.ffprobe = Some(found.clone()) } else { g.ffmpeg = Some(found.clone()) }
    found
}

fn find_tool(name: &str) -> Option<String> {
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        let p = Path::new(dir).join(name);
        if p.exists() {
            return Some(p.to_string_lossy().into_owned());
        }
    }
    #[cfg(windows)]
    let out = Command::new("where").arg(name).output().ok()?;
    #[cfg(not(windows))]
    let out = {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
        Command::new(shell).args(["-lc", &format!("command -v {name}")]).output().ok()?
    };
    let path = String::from_utf8_lossy(&out.stdout).lines().last()?.trim().to_string();
    (out.status.success() && Path::new(&path).is_absolute()).then_some(path)
}

// ---------------------------------------------------------------------------------------------
// Search

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Query {
    pub text: String,
    pub kinds: Vec<String>,
    /// Only assets under this folder id (`Studio/YouTube/AgileCoder`).
    pub folder: Option<String>,
    pub tags: Vec<String>,
    /// Smart lists: "recent", "favorites", "untagged".
    pub list: Option<String>,
    pub sort: Option<String>,
    pub desc: Option<bool>,
    pub limit: Option<usize>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    #[serde(flatten)]
    pub asset: Asset,
    pub tags: Vec<String>,
    pub rating: u8,
    pub notes: String,
    /// Absolute path on this machine.
    pub path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub hits: Vec<Hit>,
    pub total: usize,
    /// How many matches each kind has, ignoring the kind filter (for the sidebar counts).
    pub kinds: BTreeMap<String, usize>,
}

/// Words in a name or path: split on separators and camelCase, lowercased.
fn words(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut prev_lower = false;
    for ch in s.chars() {
        if ch.is_alphanumeric() {
            if ch.is_uppercase() && prev_lower && !cur.is_empty() {
                out.push(std::mem::take(&mut cur).to_lowercase());
            }
            prev_lower = ch.is_lowercase() || ch.is_ascii_digit();
            cur.push(ch);
        } else {
            if !cur.is_empty() {
                out.push(std::mem::take(&mut cur).to_lowercase());
            }
            prev_lower = false;
        }
    }
    if !cur.is_empty() {
        out.push(cur.to_lowercase());
    }
    out
}

/// Inline filters typed in the search box: `kind:video tag:broll ext:psd duration:>30 rating:>=4`.
struct Filters {
    terms: Vec<String>,
    kinds: Vec<String>,
    tags: Vec<String>,
    exts: Vec<String>,
    duration: Option<(String, f64)>,
    rating: Option<(String, f64)>,
}

fn parse_text(text: &str) -> Filters {
    let mut f = Filters { terms: vec![], kinds: vec![], tags: vec![], exts: vec![], duration: None, rating: None };
    let cmp = |v: &str| -> Option<(String, f64)> {
        let op: String = v.chars().take_while(|c| "<>=".contains(*c)).collect();
        let n = v[op.len()..].trim_end_matches(['s', 'S']);
        let secs = match n.split_once(':') {
            Some((m, s)) => m.parse::<f64>().ok()? * 60.0 + s.parse::<f64>().ok()?,
            None if n.ends_with('m') => n.trim_end_matches('m').parse::<f64>().ok()? * 60.0,
            None => n.parse().ok()?,
        };
        Some((if op.is_empty() { ">=".into() } else { op }, secs))
    };
    for tok in text.split_whitespace() {
        match tok.split_once(':') {
            Some(("kind" | "type", v)) => f.kinds.push(v.to_lowercase()),
            Some(("tag" | "#", v)) => f.tags.push(v.to_lowercase()),
            Some(("ext", v)) => f.exts.push(v.trim_start_matches('.').to_lowercase()),
            Some(("duration" | "length", v)) => f.duration = cmp(v),
            Some(("rating", v)) => f.rating = cmp(v),
            _ if tok.starts_with('#') && tok.len() > 1 => f.tags.push(tok[1..].to_lowercase()),
            _ => f.terms.extend(words(tok)),
        }
    }
    f
}

fn compare(value: f64, (op, n): &(String, f64)) -> bool {
    match op.as_str() {
        ">" => value > *n,
        "<" => value < *n,
        "<=" => value <= *n,
        "=" | "==" => (value - n).abs() < 0.5,
        _ => value >= *n,
    }
}

pub fn search(lib: &Shared, q: &Query) -> SearchResult {
    let mut g = lib.inner.lock().unwrap();
    g.sync_meta();
    let g = g;
    let f = parse_text(&q.text);
    let want_tags: Vec<String> = q.tags.iter().map(|t| t.to_lowercase()).chain(f.tags.iter().cloned()).collect();
    let kinds: Vec<String> = q.kinds.iter().cloned().chain(f.kinds.iter().cloned()).collect();
    let week_ago = millis(Ok(std::time::SystemTime::now())) - 7 * 24 * 3600 * 1000;
    let empty = Meta::default();

    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut scored: Vec<(f64, &Asset, &Meta)> = Vec::new();
    for a in &g.assets {
        let m = g.meta.get(&a.id).unwrap_or(&empty);
        if let Some(folder) = &q.folder {
            if !a.id.starts_with(&format!("{folder}/")) {
                continue;
            }
        }
        if !want_tags.iter().all(|t| m.tags.iter().any(|x| x.to_lowercase() == *t)) {
            continue;
        }
        if !f.exts.is_empty() && !f.exts.contains(&a.ext) {
            continue;
        }
        if let Some(d) = &f.duration {
            if !a.duration.is_some_and(|v| compare(v, d)) {
                continue;
            }
        }
        if let Some(r) = &f.rating {
            if !compare(m.rating as f64, r) {
                continue;
            }
        }
        match q.list.as_deref() {
            Some("recent") if a.modified < week_ago => continue,
            Some("favorites") if m.rating < 4 => continue,
            Some("untagged") if !m.tags.is_empty() => continue,
            _ => {}
        }
        // Every word typed must match something: a word of the name (best), a tag, the notes, the folders.
        let mut score = 0.0;
        if !f.terms.is_empty() {
            let (name_words, dir_words) = &a.words;
            let name_lower = a.name.to_lowercase();
            let notes = m.notes.to_lowercase();
            let mut all = true;
            for t in &f.terms {
                let s = if name_words.iter().any(|w| w == t) {
                    10.0
                } else if name_words.iter().any(|w| w.starts_with(t.as_str())) {
                    7.0
                } else if m.tags.iter().any(|x| x.to_lowercase().starts_with(t.as_str())) {
                    6.0
                } else if name_lower.contains(t.as_str()) {
                    4.0
                } else if dir_words.iter().any(|w| w.starts_with(t.as_str())) {
                    3.0
                } else if notes.contains(t.as_str()) || a.codec.as_deref().is_some_and(|c| c.starts_with(t.as_str())) || a.ext == *t {
                    2.0
                } else {
                    0.0
                };
                if s == 0.0 {
                    all = false;
                    break;
                }
                score += s;
            }
            if !all {
                continue;
            }
        }
        *counts.entry(a.kind.clone()).or_default() += 1;
        if !kinds.is_empty() && !kinds.contains(&a.kind) {
            continue;
        }
        scored.push((score + m.rating as f64 * 0.5, a, m));
    }

    let desc = q.desc.unwrap_or(true);
    let order = |o: std::cmp::Ordering| if desc { o.reverse() } else { o };
    match q.sort.as_deref() {
        Some("name") => scored.sort_by(|x, y| order(x.1.name.to_lowercase().cmp(&y.1.name.to_lowercase()))),
        Some("size") => scored.sort_by(|x, y| order(x.1.size.cmp(&y.1.size))),
        Some("duration") => scored.sort_by(|x, y| order(x.1.duration.unwrap_or(0.0).total_cmp(&y.1.duration.unwrap_or(0.0)))),
        Some("modified") => scored.sort_by(|x, y| order(x.1.modified.cmp(&y.1.modified))),
        // Relevance: best match first, newest among equals. With nothing typed, that's newest first.
        _ => scored.sort_by(|x, y| y.0.total_cmp(&x.0).then(y.1.modified.cmp(&x.1.modified))),
    }
    let total = scored.len();
    let roots: HashMap<&str, &str> = g.roots.iter().map(|r| (r.name.as_str(), r.path.as_str())).collect();
    let hits = scored
        .into_iter()
        .take(q.limit.unwrap_or(600))
        .map(|(_, a, m)| Hit {
            path: roots.get(a.root.as_str()).map(|r| Path::new(r).join(&a.rel).to_string_lossy().into_owned()).unwrap_or_default(),
            asset: a.clone(),
            tags: m.tags.clone(),
            rating: m.rating,
            notes: m.notes.clone(),
        })
        .collect();
    SearchResult { hits, total, kinds: counts }
}

/// Folders (as ids) that hold assets, for the sidebar tree.
pub fn folders(lib: &Shared) -> Vec<(String, usize)> {
    let g = lib.inner.lock().unwrap();
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for a in &g.assets {
        let mut id = a.id.as_str();
        while let Some((dir, _)) = id.rsplit_once('/') {
            *counts.entry(dir.to_string()).or_default() += 1;
            id = dir;
        }
    }
    counts.into_iter().collect()
}

pub fn tags(lib: &Shared) -> Vec<(String, usize)> {
    let mut g = lib.inner.lock().unwrap();
    g.sync_meta();
    let ids: HashSet<&str> = g.assets.iter().map(|a| a.id.as_str()).collect();
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for (id, m) in &g.meta {
        if ids.contains(id.as_str()) {
            for t in &m.tags {
                *counts.entry(t.clone()).or_default() += 1;
            }
        }
    }
    let mut v: Vec<_> = counts.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    v
}

pub fn set_meta(lib: &Shared, ids: &[String], patch: &MetaPatch) -> Result<(), String> {
    let mut g = lib.inner.lock().unwrap();
    let ws = g.workspace.clone().ok_or("no workspace open")?;
    // Start from what's on disk, so edits synced from another machine aren't written over.
    g.sync_meta();
    for id in ids {
        let m = g.meta.entry(id.clone()).or_default();
        if let Some(tags) = &patch.tags {
            m.tags = tags.clone();
        }
        for t in &patch.add_tags {
            if !m.tags.iter().any(|x| x.eq_ignore_ascii_case(t)) {
                m.tags.push(t.clone());
            }
        }
        m.tags.retain(|x| !patch.remove_tags.iter().any(|t| t.eq_ignore_ascii_case(x)));
        if let Some(r) = patch.rating {
            m.rating = r.min(5);
        }
        if let Some(n) = &patch.notes {
            m.notes = n.clone();
        }
    }
    write_meta(&ws, &g.meta)?;
    g.meta_stamp = meta_stamp(&ws);
    // Fingerprint them now, while they're where the tags say, so a later move can be followed.
    let roots = g.roots.clone();
    for a in g.assets.iter_mut().filter(|a| ids.contains(&a.id) && a.fingerprint.is_none() && !a.offline) {
        if let Some(r) = roots.iter().find(|r| r.name == a.root) {
            a.fingerprint = fingerprint(&Path::new(&r.path).join(&a.rel));
        }
    }
    Ok(())
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MetaPatch {
    pub tags: Option<Vec<String>>,
    pub add_tags: Vec<String>,
    pub remove_tags: Vec<String>,
    pub rating: Option<u8>,
    pub notes: Option<String>,
}

// ---------------------------------------------------------------------------------------------
// Thumbnails

/// The asset's file on this machine.
pub fn path_of(lib: &Shared, id: &str) -> Result<PathBuf, String> {
    let g = lib.inner.lock().unwrap();
    let (root, rel) = id.split_once('/').unwrap_or((id, ""));
    let r = g.roots.iter().find(|r| r.name == root).ok_or("library folder not found")?;
    if rel.split('/').any(|s| s == ".." || s == ".") {
        return Err("bad asset id".into());
    }
    Ok(if rel.is_empty() { PathBuf::from(&r.path) } else { Path::new(&r.path).join(rel) })
}

/// A PNG/JPEG preview of the asset, made once and cached. `None` when there's no way to make one
/// (the interface shows the file type's icon instead).
pub fn thumbnail(app: &AppHandle, lib: &Shared, id: &str) -> Result<Option<Vec<u8>>, String> {
    let (ws, thumbs_on, asset) = {
        let g = lib.inner.lock().unwrap();
        let a = g.assets.iter().find(|a| a.id == id).cloned().ok_or("asset not found")?;
        (g.workspace.clone().ok_or("no workspace open")?, g.settings.thumbnails, a)
    };
    if !thumbs_on || matches!(asset.kind.as_str(), "font" | "other" | "project") {
        return Ok(None);
    }
    let src = path_of(lib, id)?;
    let dir = cache_dir(app, &ws).ok_or("no cache folder")?.join("thumbs");
    let mut h = std::collections::hash_map::DefaultHasher::new();
    (&asset.id, asset.size, asset.modified).hash(&mut h);
    let cached = dir.join(format!("{:016x}.png", h.finish()));
    let missing = dir.join(format!("{:016x}.none", h.finish()));
    if let Ok(bytes) = std::fs::read(&cached) {
        return Ok(Some(bytes));
    }
    if missing.exists() {
        return Ok(None);
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Wait for a free slot, newest request first.
    {
        let (lock, cv) = &lib.thumb_slots;
        let mut slots = lock.lock().unwrap();
        let ticket = slots.next;
        slots.next += 1;
        slots.waiting.insert(ticket);
        while slots.busy >= THUMB_WORKERS || slots.waiting.last() != Some(&ticket) {
            slots = cv.wait(slots).unwrap();
        }
        slots.waiting.remove(&ticket);
        slots.busy += 1;
    }
    let made = make_thumbnail(lib, &src, &asset.kind, &cached);
    {
        let (lock, cv) = &lib.thumb_slots;
        lock.lock().unwrap().busy -= 1;
        cv.notify_all();
    }
    match made.and_then(|_| std::fs::read(&cached).ok()) {
        Some(bytes) => Ok(Some(bytes)),
        None => {
            let _ = std::fs::write(missing, b"");
            Ok(None)
        }
    }
}

fn make_thumbnail(lib: &Shared, src: &Path, kind: &str, out: &Path) -> Option<()> {
    // macOS Quick Look reads nearly everything: video, PSD, RAW, PDF, HEIC.
    #[cfg(target_os = "macos")]
    {
        let tmp = out.with_extension("ql");
        let _ = std::fs::create_dir_all(&tmp);
        let ok = Command::new("qlmanage")
            .args(["-t", "-s", &THUMB_SIZE.to_string(), "-o"])
            .arg(&tmp)
            .arg(src)
            .output()
            .is_ok_and(|o| o.status.success());
        let made = tmp.join(format!("{}.png", src.file_name()?.to_string_lossy()));
        let moved = ok && std::fs::rename(&made, out).is_ok();
        let _ = std::fs::remove_dir_all(&tmp);
        if moved {
            return Some(());
        }
    }
    if kind == "video" {
        let ffmpeg = tool(lib, "ffmpeg")?;
        let ok = Command::new(ffmpeg)
            .args(["-v", "quiet", "-y", "-ss", "1", "-i"])
            .arg(src)
            .args(["-frames:v", "1", "-vf", &format!("scale={THUMB_SIZE}:-2")])
            .arg(out)
            .status()
            .is_ok_and(|s| s.success());
        return ok.then_some(());
    }
    if kind == "image" && matches!(src.extension()?.to_string_lossy().to_lowercase().as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp") {
        // Small enough to show as is.
        if std::fs::metadata(src).ok()?.len() < 4_000_000 {
            std::fs::copy(src, out).ok()?;
            return Some(());
        }
    }
    None
}

// ---------------------------------------------------------------------------------------------
// Commands' helpers

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub settings: StudioSettings,
    /// Scanning and watching (a plugin has turned the library on).
    pub active: bool,
    pub roots: Vec<RootStatus>,
    pub scanning: bool,
    pub last_scan: Option<i64>,
    pub total: usize,
    pub ffmpeg: Option<String>,
    pub ffprobe: Option<String>,
    pub cache_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RootStatus {
    pub name: String,
    pub path: String,
    pub files: usize,
    pub exists: bool,
}

pub fn status(app: &AppHandle, lib: &Shared) -> Status {
    let ffmpeg = tool(lib, "ffmpeg");
    let ffprobe = tool(lib, "ffprobe");
    let g = lib.inner.lock().unwrap();
    let cache_bytes = g
        .workspace
        .as_ref()
        .and_then(|ws| cache_dir(app, ws))
        .map(|d| walkdir::WalkDir::new(d).into_iter().filter_map(Result::ok).filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum())
        .unwrap_or(0);
    Status {
        settings: g.settings.clone(),
        active: g.active,
        roots: g
            .roots
            .iter()
            .map(|r| RootStatus {
                name: r.name.clone(),
                path: r.path.clone(),
                files: g.assets.iter().filter(|a| a.root == r.name).count(),
                exists: Path::new(&r.path).is_dir(),
            })
            .collect(),
        scanning: g.scanning,
        last_scan: g.last_scan,
        total: g.assets.len(),
        ffmpeg,
        ffprobe,
        cache_bytes,
    }
}

pub fn update_settings(app: &AppHandle, lib: &Shared, s: StudioSettings) -> Result<(), String> {
    let ws = {
        let mut g = lib.inner.lock().unwrap();
        let ws = g.workspace.clone().ok_or("no workspace open")?;
        let rescan = g.settings.ignore != s.ignore;
        g.settings = s.clone();
        if rescan {
            // Changed ignore rules: start over so newly ignored files drop out and others come in.
            g.assets.clear();
        }
        ws
    };
    write_settings(&ws, &s)?;
    let lib = lib.clone();
    let app = app.clone();
    std::thread::spawn(move || apply(&app, &lib));
    Ok(())
}

pub fn add_root(app: &AppHandle, lib: &Shared, path: &str) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !p.is_dir() {
        return Err("That folder doesn't exist.".into());
    }
    let mut g = lib.inner.lock().unwrap();
    let ws = g.workspace.clone().ok_or("no workspace open")?;
    let canon = p.canonicalize().unwrap_or(p.clone());
    let ws_canon = ws.canonicalize().unwrap_or(ws.clone());
    if canon.starts_with(&ws_canon) {
        return Err("Library folders can't be inside the workspace: media would end up in its git history.".into());
    }
    if g.roots.iter().any(|r| Path::new(&r.path) == p) {
        return Ok(());
    }
    // A folder inside another library folder (or around one) would list the same files twice.
    for r in &g.roots {
        let other = Path::new(&r.path).canonicalize().unwrap_or_else(|_| PathBuf::from(&r.path));
        if canon.starts_with(&other) {
            return Err(format!("This folder is already in the Library, inside \"{}\".", r.name));
        }
        if other.starts_with(&canon) {
            return Err(format!("This folder contains \"{}\", which is already in the Library. Remove that one first.", r.name));
        }
    }
    // The folder's name, made unique: `Studio`, `Studio 2`…
    let base = p.file_name().map_or("Library".into(), |n| n.to_string_lossy().replace('/', "-"));
    let mut name = base.clone();
    let mut n = 2;
    while g.roots.iter().any(|r| r.name == name) {
        name = format!("{base} {n}");
        n += 1;
    }
    g.roots.push(Root { name, path: p.to_string_lossy().into_owned() });
    write_roots(app, &ws, &g.roots)?;
    drop(g);
    let (app, lib) = (app.clone(), lib.clone());
    std::thread::spawn(move || apply(&app, &lib));
    Ok(())
}

pub fn remove_root(app: &AppHandle, lib: &Shared, name: &str) -> Result<(), String> {
    let mut g = lib.inner.lock().unwrap();
    let ws = g.workspace.clone().ok_or("no workspace open")?;
    g.roots.retain(|r| r.name != name);
    g.assets.retain(|a| a.root != name);
    write_roots(app, &ws, &g.roots)?;
    let assets = g.assets.clone();
    drop(g);
    save_index(app, &ws, &assets);
    let _ = app.emit("library-changed", ());
    let (app, lib) = (app.clone(), lib.clone());
    std::thread::spawn(move || apply(&app, &lib));
    Ok(())
}

/// The sub-folders of a library folder, read from disk (so new, still-empty ones show too).
pub fn subfolders(lib: &Shared, id: &str) -> Result<Vec<String>, String> {
    let dir = path_of(lib, id)?;
    let ignore = lib.inner.lock().unwrap().settings.ignore.clone();
    let mut out: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !ignore.iter().any(|p| glob_match(p, n)) && kind_of(&ext_of(Path::new(n))) != "project")
        .collect();
    out.sort_by_key(|n| n.to_lowercase());
    Ok(out)
}

pub fn folder_exists(lib: &Shared, id: &str) -> bool {
    path_of(lib, id).is_ok_and(|p| p.is_dir())
}

/// Characters file systems (Windows especially) don't allow in names.
fn safe_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if "/\\:*?\"<>|".contains(c) || c.is_control() { '-' } else { c }).collect();
    cleaned.trim().trim_end_matches('.').trim().to_string()
}

/// Creates a production's project folder, `<parent>/<name>/`, with the template's sub-folders
/// (missing ones only: an existing folder is filled in, never emptied). Returns its id.
pub fn create_folder(app: &AppHandle, lib: &Shared, parent: &str, name: &str, template: &[String]) -> Result<String, String> {
    let name = safe_name(name);
    if name.is_empty() {
        return Err("The folder needs a name.".into());
    }
    let base = path_of(lib, parent)?;
    if !base.is_dir() {
        return Err(format!("{parent} isn't available. Is the drive connected?"));
    }
    let dir = base.join(&name);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for sub in template.iter().map(|t| safe_name(t)).filter(|t| !t.is_empty()) {
        std::fs::create_dir_all(dir.join(sub)).map_err(|e| e.to_string())?;
    }
    rescan(app, lib);
    Ok(format!("{parent}/{name}"))
}

pub fn clear_cache(app: &AppHandle, lib: &Shared) -> Result<(), String> {
    let ws = lib.inner.lock().unwrap().workspace.clone().ok_or("no workspace open")?;
    if let Some(d) = cache_dir(app, &ws) {
        let _ = std::fs::remove_dir_all(d.join("thumbs"));
    }
    Ok(())
}

pub fn rescan(app: &AppHandle, lib: &Shared) {
    let (app, lib) = (app.clone(), lib.clone());
    std::thread::spawn(move || scan(&app, &lib));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn globs() {
        assert!(glob_match("*.pek", "clip.mp4.pek"));
        assert!(glob_match(".*", ".DS_Store"));
        assert!(glob_match("Media Cache", "media cache"));
        assert!(!glob_match("*.pek", "clip.mp4"));
        assert!(glob_match("*cache*", "Media Cache Files"));
    }

    #[test]
    fn splits_words() {
        assert_eq!(words("PS1 Emulator Comparison - post_processed.wav"), ["ps1", "emulator", "comparison", "post", "processed", "wav"]);
        assert_eq!(words("goaSunset03.MP4"), ["goa", "sunset03", "mp4"]);
    }

    #[test]
    fn parses_filters() {
        let f = parse_text("goa kind:video duration:>1:30 #broll ext:.MOV");
        assert_eq!(f.terms, ["goa"]);
        assert_eq!(f.kinds, ["video"]);
        assert_eq!(f.tags, ["broll"]);
        assert_eq!(f.exts, ["mov"]);
        assert_eq!(f.duration, Some((">".into(), 90.0)));
    }

    /// Scans the real ~/Studio when there is one: `cargo test -p betelgeuse studio_scan -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn studio_scan() {
        let home = dirs::home_dir().unwrap();
        let roots = vec![Root { name: "Studio".into(), path: home.join("Studio").to_string_lossy().into_owned() }];
        let ignore: Vec<String> = DEFAULT_IGNORE.iter().map(|s| s.to_string()).collect();
        let t = Instant::now();
        let assets = walk(&roots, &ignore, Path::new("/nonexistent"), &HashMap::new());
        let mut by_kind: BTreeMap<&str, usize> = BTreeMap::new();
        for a in &assets {
            *by_kind.entry(&a.kind).or_default() += 1;
        }
        println!("{} files in {:?}: {by_kind:?}", assets.len(), t.elapsed());
        let lib: Shared = Arc::default();
        lib.inner.lock().unwrap().assets = assets;
        lib.inner.lock().unwrap().roots = roots;
        for q in ["emulator", "ps1 kind:audio", "goa", "kind:video duration:>60", "brandings kind:design", "gow"] {
            let t = Instant::now();
            let r = search(&lib, &Query { text: q.into(), ..Default::default() });
            println!("{q:30} {:>5} hits in {:?}: {:?}", r.total, t.elapsed(), r.hits.iter().take(3).map(|h| &h.asset.id).collect::<Vec<_>>());
        }
    }

    #[test]
    fn follows_moved_files() {
        let dir = std::env::temp_dir().join(format!("betelgeuse-lib-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("a")).unwrap();
        std::fs::create_dir_all(dir.join("b")).unwrap();
        std::fs::write(dir.join("a/clip.mp4"), vec![7u8; 200_000]).unwrap();
        std::fs::write(dir.join("a/other.mp4"), vec![9u8; 200_000]).unwrap();
        let roots = vec![Root { name: "Lib".into(), path: dir.to_string_lossy().into_owned() }];
        let ignore: Vec<String> = vec![];
        let ws = Path::new("/nonexistent");

        let mut first = walk(&roots, &ignore, ws, &HashMap::new());
        let mut meta = HashMap::from([("Lib/a/clip.mp4".to_string(), Meta { tags: vec!["broll".into()], ..Default::default() })]);
        follow_moves(&mut first, &HashMap::new(), &mut meta, &roots);
        assert!(first.iter().find(|a| a.id == "Lib/a/clip.mp4").unwrap().fingerprint.is_some());

        std::fs::rename(dir.join("a/clip.mp4"), dir.join("b/renamed.mp4")).unwrap();
        let previous: HashMap<String, Asset> = first.iter().map(|a| (a.id.clone(), a.clone())).collect();
        let mut second = walk(&roots, &ignore, ws, &previous);
        assert!(follow_moves(&mut second, &previous, &mut meta, &roots));
        assert_eq!(meta.keys().collect::<Vec<_>>(), ["Lib/b/renamed.mp4"]);

        // An unplugged drive keeps its files, marked offline.
        let gone = vec![Root { name: "Lib".into(), path: "/no/such/drive".into() }];
        let previous: HashMap<String, Asset> = second.iter().map(|a| (a.id.clone(), a.clone())).collect();
        let third = walk(&gone, &ignore, ws, &previous);
        assert_eq!(third.len(), 2);
        assert!(third.iter().all(|a| a.offline));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn safe_names() {
        assert_eq!(safe_name("What: a/b?"), "What- a-b-");
        assert_eq!(safe_name("  Trailing dot. "), "Trailing dot");
    }

    #[test]
    fn kinds() {
        assert_eq!(kind_of("prproj"), "project");
        assert_eq!(kind_of("dng"), "raw");
        assert_eq!(kind_of("xyz"), "other");
    }
}
