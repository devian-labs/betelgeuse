//! The vault is a plain folder of Markdown files. A note `A/B.md` is the
//! sub-page of `A.md`, so a nested page tree maps 1:1 onto folders that
//! Obsidian, git and any agent can read without Betelgeuse running.

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
pub struct NoteMeta {
    pub path: String,
    pub title: String,
    pub icon: Option<String>,
    pub tags: Vec<String>,
    /// Frontmatter `type`, e.g. "database".
    pub kind: Option<String>,
    /// Frontmatter `ai`: `false` hides the page (and its sub-pages) from agents, `true` shares it.
    pub ai: Option<bool>,
    /// Frontmatter `order`: position among sibling pages (ascending; pages without one follow A–Z).
    pub order: Option<f64>,
    pub modified: u64,
    pub created: u64,
}

/// A database row: a direct sub-page of a database page, with its raw content.
#[derive(Serialize)]
pub struct Row {
    pub path: String,
    pub title: String,
    pub content: String,
    pub modified: u64,
    pub created: u64,
}

#[derive(Serialize)]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    pub icon: Option<String>,
    pub snippet: String,
    pub score: u32,
}

/// Resolves a vault-relative path, refusing anything that escapes the vault.
pub fn resolve(vault: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    let safe = !rel.is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)));
    if !safe {
        return Err(format!("invalid note path: {rel}"));
    }
    Ok(vault.join(p))
}

pub fn rel_string(vault: &Path, abs: &Path) -> String {
    abs.strip_prefix(vault)
        .unwrap_or(abs)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn markdown_files(vault: &Path) -> impl Iterator<Item = PathBuf> {
    WalkDir::new(vault)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0 || {
                let name = e.file_name().to_string_lossy();
                !name.starts_with('.') && name != "node_modules"
            }
        })
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && e.path().extension().is_some_and(|x| x == "md"))
        .map(|e| e.into_path())
}

pub fn title_of(rel: &str) -> String {
    let file = rel.rsplit('/').next().unwrap_or(rel);
    file.strip_suffix(".md").unwrap_or(file).to_string()
}

/// Splits `---\n...\n---` frontmatter from the body. Returns ("", content) when absent.
pub fn split_frontmatter(content: &str) -> (&str, &str) {
    let Some(rest) = content.strip_prefix("---\n").or_else(|| content.strip_prefix("---\r\n")) else {
        return ("", content);
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end() == "---" {
            let fm = &rest[..offset];
            let body = &rest[offset + line.len()..];
            return (fm, body);
        }
        offset += line.len();
    }
    ("", content)
}

fn unquote(v: &str) -> String {
    let v = v.trim();
    v.strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .or_else(|| v.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')))
        .unwrap_or(v)
        .to_string()
}

/// Minimal YAML reader for the scalar and list keys Betelgeuse cares about.
pub fn fm_value(fm: &str, key: &str) -> Option<String> {
    fm.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        (k.trim() == key && !v.trim().is_empty()).then(|| unquote(v))
    })
}

pub fn fm_bool(fm: &str, key: &str) -> Option<bool> {
    match fm_value(fm, key)?.to_ascii_lowercase().as_str() {
        "true" | "yes" => Some(true),
        "false" | "no" => Some(false),
        _ => None,
    }
}

/// A finite number, e.g. `order: 2.5`; anything else reads as `None`.
pub fn fm_number(fm: &str, key: &str) -> Option<f64> {
    fm_value(fm, key)?.parse::<f64>().ok().filter(|n| n.is_finite())
}

pub fn fm_list(fm: &str, key: &str) -> Vec<String> {
    let mut lines = fm.lines();
    while let Some(l) = lines.next() {
        let Some((k, v)) = l.split_once(':') else { continue };
        if k.trim() != key {
            continue;
        }
        let v = v.trim();
        if let Some(inner) = v.strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
            return inner.split(',').map(unquote).filter(|s| !s.is_empty()).collect();
        }
        if !v.is_empty() {
            return vec![unquote(v)];
        }
        return lines
            .map_while(|l| l.trim_start().strip_prefix("- ").map(unquote))
            .collect();
    }
    Vec::new()
}

fn meta_for(vault: &Path, abs: &Path) -> NoteMeta {
    let rel = rel_string(vault, abs);
    let content = fs::read_to_string(abs).unwrap_or_default();
    let (fm, _) = split_frontmatter(&content);
    let (modified, created) = times(abs);
    NoteMeta {
        title: title_of(&rel),
        icon: fm_value(fm, "icon"),
        tags: fm_list(fm, "tags"),
        kind: fm_value(fm, "type"),
        ai: fm_bool(fm, "ai"),
        order: fm_number(fm, "order"),
        path: rel,
        modified,
        created,
    }
}

/// (modified, created) in unix millis; created falls back to modified where unsupported.
fn times(abs: &Path) -> (u64, u64) {
    let millis = |t: std::io::Result<std::time::SystemTime>| {
        t.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64)
    };
    let Ok(meta) = fs::metadata(abs) else { return (0, 0) };
    let modified = millis(meta.modified()).unwrap_or(0);
    (modified, millis(meta.created()).unwrap_or(modified))
}

/// Rows of the database page `rel`: the `.md` files directly inside its sub-page folder.
pub fn database_rows(vault: &Path, rel: &str) -> Result<Vec<Row>, String> {
    let dir = resolve(vault, children_dir(rel))?;
    let Ok(entries) = fs::read_dir(&dir) else { return Ok(Vec::new()) };
    let mut rows: Vec<Row> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "md"))
        .filter(|p| !p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')))
        .map(|p| {
            let path = rel_string(vault, &p);
            let (modified, created) = times(&p);
            Row { title: title_of(&path), content: fs::read_to_string(&p).unwrap_or_default(), path, modified, created }
        })
        .collect();
    // Rows with an `order` (e.g. imported in Notion's order) come first by it; the rest follow
    // in the order they were created.
    let mut keyed: Vec<(Option<f64>, Row)> = rows.into_iter().map(|r| (fm_number(split_frontmatter(&r.content).0, "order"), r)).collect();
    keyed.sort_by(|(oa, a), (ob, b)| {
        let by_order = match (oa, ob) {
            (Some(x), Some(y)) => x.total_cmp(y),
            (x, y) => y.is_some().cmp(&x.is_some()),
        };
        by_order.then_with(|| (a.created, a.title.to_lowercase()).cmp(&(b.created, b.title.to_lowercase())))
    });
    rows = keyed.into_iter().map(|(_, r)| r).collect();
    Ok(rows)
}

/// Copies a note next to itself as "Title copy". Sub-pages are not copied.
pub fn duplicate_note(vault: &Path, rel: &str) -> Result<String, String> {
    let dir = rel.rsplit_once('/').map_or("", |(d, _)| d);
    let copy = unique_path(vault, dir, &format!("{} copy", title_of(rel)), None);
    fs::copy(resolve(vault, rel)?, resolve(vault, &copy)?).map_err(|e| e.to_string())?;
    Ok(copy)
}

pub fn list_notes(vault: &Path) -> Vec<NoteMeta> {
    let mut notes: Vec<_> = markdown_files(vault).map(|p| meta_for(vault, &p)).collect();
    notes.sort_by_cached_key(|n| n.path.to_lowercase());
    notes
}

pub fn read_note(vault: &Path, rel: &str) -> Result<String, String> {
    fs::read_to_string(resolve(vault, rel)?).map_err(|e| e.to_string())
}

pub fn write_note(vault: &Path, rel: &str, content: &str) -> Result<(), String> {
    let abs = resolve(vault, rel)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(abs, content).map_err(|e| e.to_string())
}

pub fn sanitize_title(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| if "/\\:*?\"<>|#^[]".contains(c) || c.is_control() { ' ' } else { c })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.is_empty() || cleaned.starts_with('.') {
        "Untitled".into()
    } else {
        cleaned
    }
}

/// Directory that holds the sub-pages of `parent` (`A/B.md` -> `A/B`).
pub fn children_dir(parent: &str) -> &str {
    parent.strip_suffix(".md").unwrap_or(parent)
}

pub fn unique_path(vault: &Path, dir: &str, title: &str, except: Option<&str>) -> String {
    let join = |name: &str| if dir.is_empty() { format!("{name}.md") } else { format!("{dir}/{name}.md") };
    let mut candidate = join(title);
    let mut n = 2;
    while vault.join(&candidate).exists() && Some(candidate.as_str()) != except {
        candidate = join(&format!("{title} {n}"));
        n += 1;
    }
    candidate
}

pub fn create_note(vault: &Path, parent: Option<&str>, title: &str) -> Result<String, String> {
    let dir = parent.map(children_dir).unwrap_or("");
    let rel = unique_path(vault, dir, &sanitize_title(title), None);
    write_note(vault, &rel, "")?;
    Ok(rel)
}

/// Renames a note (and its sub-page folder) and rewrites `[[Old]]` links vault-wide.
pub fn rename_note(vault: &Path, rel: &str, new_title: &str) -> Result<String, String> {
    let old_title = title_of(rel);
    let new_title = sanitize_title(new_title);
    if new_title == old_title {
        return Ok(rel.to_string());
    }
    let dir = rel.rsplit_once('/').map_or("", |(d, _)| d);
    let new_rel = unique_path(vault, dir, &new_title, Some(rel));
    let final_title = title_of(&new_rel);
    fs::rename(resolve(vault, rel)?, resolve(vault, &new_rel)?).map_err(|e| e.to_string())?;
    let old_children = vault.join(children_dir(rel));
    if old_children.is_dir() {
        fs::rename(old_children, vault.join(children_dir(&new_rel))).map_err(|e| e.to_string())?;
    }
    for file in markdown_files(vault) {
        let Ok(text) = fs::read_to_string(&file) else { continue };
        // Path links (`[[Areas/Old]]`, as relations name their database) follow too.
        let updated = rewrite_link_paths(&text, children_dir(rel), children_dir(&new_rel));
        let updated = rewrite_links(&updated, &old_title, &final_title);
        if updated != text {
            let _ = fs::write(&file, updated);
        }
    }
    Ok(new_rel)
}

/// Moves a page (and its sub-pages) into the folder `dest_dir`: another page's sub-page folder, or
/// "" for the top level. Links that name the page or a sub-page by path follow it. Returns the new path.
pub fn move_note(vault: &Path, rel: &str, dest_dir: &str) -> Result<String, String> {
    let dest_dir = dest_dir.trim_matches('/');
    let own = children_dir(rel);
    let inside = |d: &str| d.eq_ignore_ascii_case(own) || d.to_lowercase().starts_with(&format!("{}/", own.to_lowercase()));
    if inside(dest_dir) {
        return Err("A page can't be moved inside itself.".into());
    }
    let dir = rel.rsplit_once('/').map_or("", |(d, _)| d);
    if dir == dest_dir {
        return Ok(rel.to_string());
    }
    if !dest_dir.is_empty() {
        resolve(vault, dest_dir)?;
    }
    let title = title_of(rel);
    let new_rel = unique_path(vault, dest_dir, &title, None);
    let to = resolve(vault, &new_rel)?;
    fs::create_dir_all(to.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::rename(resolve(vault, rel)?, &to).map_err(|e| e.to_string())?;
    let old_children = vault.join(own);
    if old_children.is_dir() {
        fs::rename(old_children, vault.join(children_dir(&new_rel))).map_err(|e| e.to_string())?;
    }
    // A folder left empty (the page was its only content) goes too.
    if !dir.is_empty() {
        let _ = fs::remove_dir(vault.join(dir));
    }
    let new_title = title_of(&new_rel);
    for file in markdown_files(vault) {
        let Ok(text) = fs::read_to_string(&file) else { continue };
        let mut updated = rewrite_link_paths(&text, own, children_dir(&new_rel));
        // Numbered to avoid a page of the same name there ("Plan 2"): title links follow, as on rename.
        if new_title != title {
            updated = rewrite_links(&updated, &title, &new_title);
        }
        if updated != text {
            let _ = fs::write(&file, updated);
        }
    }
    Ok(new_rel)
}

// ---------- Trash ----------
//
// Deleting moves a page (and its sub-pages) to `.trash/<id>/`, next to a `meta.json` recording
// where it came from. `.trash/` is git-ignored; git history still has every version.

pub const TRASH: &str = ".trash";
const TRASH_DAYS: u64 = 30;

#[derive(Serialize)]
pub struct TrashItem {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    /// Where the page lived, e.g. "Projects/Plan.md".
    pub original: String,
    /// Unix millis.
    pub deleted: u64,
    /// The page plus its sub-pages.
    pub pages: usize,
}

fn now_millis() -> u64 {
    std::time::SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// Moves a page and its sub-pages to the trash. Returns the trash item's id.
pub fn delete_note(vault: &Path, rel: &str) -> Result<String, String> {
    let src = resolve(vault, rel)?;
    if !src.is_file() {
        return Err(format!("no such page: {rel}"));
    }
    let mut id = now_millis().to_string();
    while vault.join(TRASH).join(&id).exists() {
        id.push('x');
    }
    let dir = vault.join(TRASH).join(&id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = rel.rsplit('/').next().unwrap_or(rel);
    fs::rename(&src, dir.join(file)).map_err(|e| e.to_string())?;
    let children = vault.join(children_dir(rel));
    if children.is_dir() {
        fs::rename(&children, dir.join(children_dir(file))).map_err(|e| e.to_string())?;
    }
    let meta = serde_json::json!({ "original": rel, "deleted": now_millis() });
    fs::write(dir.join("meta.json"), meta.to_string()).map_err(|e| e.to_string())?;
    Ok(id)
}

fn trash_meta(dir: &Path) -> Option<(String, u64)> {
    let meta: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("meta.json")).ok()?).ok()?;
    Some((meta.get("original")?.as_str()?.to_string(), meta.get("deleted")?.as_u64()?))
}

/// Lists trashed pages, newest first, permanently removing ones older than 30 days.
pub fn list_trash(vault: &Path) -> Vec<TrashItem> {
    let Ok(entries) = fs::read_dir(vault.join(TRASH)) else { return Vec::new() };
    let cutoff = now_millis().saturating_sub(TRASH_DAYS * 24 * 3600 * 1000);
    let mut items: Vec<TrashItem> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let dir = e.path();
            let (original, deleted) = trash_meta(&dir)?;
            if deleted < cutoff {
                let _ = fs::remove_dir_all(&dir);
                return None;
            }
            let file = original.rsplit('/').next().unwrap_or(&original).to_string();
            let content = fs::read_to_string(dir.join(&file)).unwrap_or_default();
            let pages = WalkDir::new(&dir).into_iter().filter_map(Result::ok).filter(|f| f.path().extension().is_some_and(|x| x == "md")).count();
            Some(TrashItem {
                id: e.file_name().to_string_lossy().into_owned(),
                title: title_of(&original),
                icon: fm_value(split_frontmatter(&content).0, "icon"),
                original,
                deleted,
                pages,
            })
        })
        .collect();
    items.sort_by_key(|i| std::cmp::Reverse(i.deleted));
    items
}

fn trash_dir(vault: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("invalid trash id".into());
    }
    Ok(vault.join(TRASH).join(id))
}

/// Puts a trashed page back where it was (renamed if that name is now taken). Returns its path.
pub fn restore_trash(vault: &Path, id: &str) -> Result<String, String> {
    let dir = trash_dir(vault, id)?;
    let (original, _) = trash_meta(&dir).ok_or("this item is no longer in the trash")?;
    let file = original.rsplit('/').next().unwrap_or(&original).to_string();
    let parent = original.rsplit_once('/').map_or("", |(d, _)| d);
    let dest = unique_path(vault, parent, &title_of(&original), None);
    let abs = resolve(vault, &dest)?;
    fs::create_dir_all(abs.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::rename(dir.join(&file), &abs).map_err(|e| e.to_string())?;
    let children = dir.join(children_dir(&file));
    if children.is_dir() {
        fs::rename(children, vault.join(children_dir(&dest))).map_err(|e| e.to_string())?;
    }
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dest)
}

/// Permanently deletes one trashed item, or everything when `id` is `None`.
pub fn purge_trash(vault: &Path, id: Option<&str>) -> Result<(), String> {
    match id {
        Some(id) => fs::remove_dir_all(trash_dir(vault, id)?).map_err(|e| e.to_string()),
        None => match fs::remove_dir_all(vault.join(TRASH)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        },
    }
}

/// Yields the target of every `[[target|alias]]` / `[[target#heading]]` link.
pub fn wikilinks(text: &str) -> impl Iterator<Item = &str> {
    text.split("[[").skip(1).filter_map(|chunk| {
        let inner = chunk.split_once("]]")?.0;
        let target = inner.split(['|', '#']).next()?.trim();
        (!target.is_empty() && !target.contains('\n')).then_some(target)
    })
}

fn rewrite_links(text: &str, old: &str, new: &str) -> String {
    ["]]", "|", "#"].iter().fold(text.to_string(), |acc, end| {
        acc.replace(&format!("[[{old}{end}"), &format!("[[{new}{end}"))
    })
}

/// Rewrites links that name a page by path, `[[A/B]]`, or a page under it, `[[A/B/C]]`.
fn rewrite_link_paths(text: &str, old: &str, new: &str) -> String {
    let text = rewrite_links(text, old, new);
    text.replace(&format!("[[{old}/"), &format!("[[{new}/"))
}

/// Whether a link target (`[[Title]]` or `[[Path/To/Page]]`) names the page at `rel`.
pub fn link_matches(target: &str, rel: &str) -> bool {
    let target = target.strip_suffix(".md").unwrap_or(target);
    target.eq_ignore_ascii_case(&title_of(rel)) || target.eq_ignore_ascii_case(children_dir(rel))
}

pub fn backlinks(vault: &Path, rel: &str) -> Vec<NoteMeta> {
    markdown_files(vault)
        .filter(|p| rel_string(vault, p) != rel)
        .filter(|p| {
            fs::read_to_string(p).is_ok_and(|t| wikilinks(&t).any(|target| link_matches(target, rel)))
        })
        .map(|p| meta_for(vault, &p))
        .collect()
}

fn snippet_around(text: &str, byte_idx: usize, len: usize) -> String {
    let start = text[..byte_idx].char_indices().rev().nth(60).map_or(0, |(i, _)| i);
    let end = text[byte_idx + len..]
        .char_indices()
        .nth(100)
        .map_or(text.len(), |(i, _)| byte_idx + len + i);
    let mut s = text[start..end].split_whitespace().collect::<Vec<_>>().join(" ");
    if start > 0 {
        s.insert(0, '…');
    }
    if end < text.len() {
        s.push('…');
    }
    s
}

pub fn search(vault: &Path, query: &str) -> Vec<SearchHit> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Vec::new();
    }
    let mut hits: Vec<SearchHit> = markdown_files(vault)
        .filter_map(|p| {
            let meta = meta_for(vault, &p);
            let content = fs::read_to_string(&p).ok()?;
            let (_, body) = split_frontmatter(&content);
            // Lowercasing can change byte lengths for some scripts; only use the
            // index for a snippet when it is still a valid boundary.
            let lower = body.to_lowercase();
            let body_hits = lower.matches(&q).count() as u32;
            let title_hit = meta.title.to_lowercase().contains(&q);
            let tag_hit = meta.tags.iter().any(|t| t.to_lowercase() == q.trim_start_matches('#'));
            let score = body_hits + if title_hit { 100 } else { 0 } + if tag_hit { 50 } else { 0 };
            if score == 0 {
                return None;
            }
            let snippet = match lower.find(&q) {
                Some(i) if lower.len() == body.len() && body.is_char_boundary(i) => snippet_around(body, i, q.len()),
                _ => body.trim().chars().take(140).collect(),
            };
            Some(SearchHit { path: meta.path, title: meta.title, icon: meta.icon, snippet, score })
        })
        .collect();
    hits.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.title.cmp(&b.title)));
    hits.truncate(50);
    hits
}

/// Saves an uploaded file (e.g. a custom page icon) under the hidden `.assets/` folder,
/// which is versioned with the vault but kept out of the page tree. Returns its vault path.
pub fn save_asset(vault: &Path, name: &str, bytes: &[u8]) -> Result<String, String> {
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| e.len() <= 5 && e.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("png")
        .to_ascii_lowercase();
    let stem: String = Path::new(name)
        .file_stem()
        .map(|s| s.to_string_lossy().chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect())
        .filter(|s: &String| !s.is_empty())
        .unwrap_or_else(|| "asset".into());
    let stamp = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis());
    let rel = format!(".assets/{stem}-{stamp}.{ext}");
    let abs = vault.join(&rel);
    fs::create_dir_all(abs.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(abs, bytes).map_err(|e| e.to_string())?;
    Ok(rel)
}

pub fn read_asset(vault: &Path, rel: &str) -> Result<Vec<u8>, String> {
    fs::read(resolve(vault, rel)?).map_err(|e| e.to_string())
}

// ---------- AI visibility ----------
//
// Shared with the MCP server through `.betelgeuse/config.json` (versioned with the workspace):
//   "all"    every page is visible to agents unless it or an ancestor has `ai: false`
//   "shared" only pages with `ai: true` on themselves or an ancestor (and none with `ai: false`)

const CONFIG: &str = ".betelgeuse/config.json";

pub fn ai_policy(vault: &Path) -> String {
    fs::read_to_string(vault.join(CONFIG))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("ai")?.get("policy")?.as_str().map(str::to_string))
        .filter(|p| p == "shared")
        .unwrap_or_else(|| "all".into())
}

pub fn set_ai_policy(vault: &Path, policy: &str) -> Result<(), String> {
    let path = vault.join(CONFIG);
    let mut config: serde_json::Value = fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .filter(serde_json::Value::is_object)
        .unwrap_or_else(|| serde_json::json!({}));
    config["ai"] = serde_json::json!({ "policy": if policy == "shared" { "shared" } else { "all" } });
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(path, serde_json::to_string_pretty(&config).unwrap() + "\n").map_err(|e| e.to_string())
}

/// Whether agents may see `rel`, given its own and its ancestor pages' `ai` flags.
pub fn ai_visible(vault: &Path, rel: &str, policy: &str) -> bool {
    let mut shared = false;
    let mut current = Some(rel.to_string());
    while let Some(page) = current {
        let content = fs::read_to_string(vault.join(&page)).unwrap_or_default();
        match fm_bool(split_frontmatter(&content).0, "ai") {
            Some(false) => return false,
            Some(true) => shared = true,
            None => {}
        }
        current = page.rsplit_once('/').map(|(dir, _)| format!("{dir}.md"));
    }
    policy != "shared" || shared
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_frontmatter() {
        let (fm, body) = split_frontmatter("---\nicon: 🚀\ntags: [a, \"b\"]\n---\n# Hi\n");
        assert_eq!(fm_value(fm, "icon").as_deref(), Some("🚀"));
        assert_eq!(fm_list(fm, "tags"), vec!["a", "b"]);
        assert_eq!(body, "# Hi\n");
        let (fm, _) = split_frontmatter("---\ntags:\n  - x\n  - y\nicon: a\n---\n");
        assert_eq!(fm_list(fm, "tags"), vec!["x", "y"]);
    }

    #[test]
    fn list_notes_exposes_order() {
        let dir = std::env::temp_dir().join(format!("bg-order-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        write_note(&dir, "A.md", "---\nicon: 🚀\norder: 2\n---\n").unwrap();
        write_note(&dir, "B.md", "---\norder: -0.5\n---\nbody").unwrap();
        write_note(&dir, "C.md", "no frontmatter").unwrap();
        write_note(&dir, "D.md", "---\norder: soon\n---\n").unwrap();
        write_note(&dir, "E.md", "---\norder: inf\n---\n").unwrap();
        let orders: Vec<_> = list_notes(&dir).into_iter().map(|n| (n.title, n.order)).collect();
        assert_eq!(
            orders,
            vec![("A".into(), Some(2.0)), ("B".into(), Some(-0.5)), ("C".into(), None), ("D".into(), None), ("E".into(), None)]
        );
        let json = serde_json::to_value(&list_notes(&dir)[0]).unwrap();
        assert_eq!(json["order"], serde_json::json!(2.0));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn moves_pages_with_their_sub_pages_and_links() {
        let dir = std::env::temp_dir().join(format!("bg-move-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        write_note(&dir, "Work.md", "").unwrap();
        write_note(&dir, "Work/Plan.md", "").unwrap();
        write_note(&dir, "Work/Plan/Step.md", "").unwrap();
        write_note(&dir, "Home.md", "See [[Work/Plan]], [[Work/Plan/Step|the step]] and [[Plan]].").unwrap();
        write_note(&dir, "Ideas/Plan.md", "").unwrap();

        // Into another page: its sub-pages come along, path links follow.
        assert_eq!(move_note(&dir, "Work/Plan.md", "Home").unwrap(), "Home/Plan.md");
        assert!(dir.join("Home/Plan/Step.md").exists() && !dir.join("Work/Plan").exists());
        assert_eq!(read_note(&dir, "Home.md").unwrap(), "See [[Home/Plan]], [[Home/Plan/Step|the step]] and [[Plan]].");
        // A page can't go inside itself or its own sub-pages.
        assert!(move_note(&dir, "Home.md", "Home/Plan").is_err());
        // To the top level; the folder it leaves empty goes too.
        assert_eq!(move_note(&dir, "Ideas/Plan.md", "").unwrap(), "Plan.md");
        assert!(!dir.join("Ideas").exists());
        // Same folder: nothing to do.
        assert_eq!(move_note(&dir, "Plan.md", "").unwrap(), "Plan.md");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn database_rows_follow_their_order() {
        let dir = std::env::temp_dir().join(format!("bg-row-order-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        write_note(&dir, "Db.md", "---\ntype: database\n---\n").unwrap();
        write_note(&dir, "Db/Apple.md", "---\norder: 3\n---\n").unwrap();
        write_note(&dir, "Db/Zebra.md", "---\norder: 1\n---\n").unwrap();
        write_note(&dir, "Db/New row.md", "").unwrap();
        write_note(&dir, "Db/Mango.md", "---\norder: 2\n---\n").unwrap();
        let titles: Vec<_> = database_rows(&dir, "Db.md").unwrap().into_iter().map(|r| r.title).collect();
        // Ordered rows first, by `order`; rows without one after them.
        assert_eq!(titles, ["Zebra", "Mango", "Apple", "New row"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn finds_and_rewrites_links() {
        let t = "see [[Ideas]] and [[Ideas|my ideas]] and [[Other#h]]";
        assert_eq!(wikilinks(t).collect::<Vec<_>>(), vec!["Ideas", "Ideas", "Other"]);
        assert_eq!(rewrite_links(t, "Ideas", "Plans"), "see [[Plans]] and [[Plans|my ideas]] and [[Other#h]]");
        assert!(link_matches("ideas", "Ideas.md"));
        assert!(link_matches("Welcome/Ideas", "Welcome/Ideas.md"));
    }

    #[test]
    fn relations_in_frontmatter_are_backlinks_and_follow_renames() {
        let dir = std::env::temp_dir().join(format!("bg-relations-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Areas/Projects")).unwrap();
        fs::create_dir_all(dir.join("Tasks")).unwrap();
        fs::write(dir.join("Areas/Projects.md"), "---\ntype: database\n---\n").unwrap();
        fs::write(dir.join("Areas/Projects/Khao.md"), "").unwrap();
        let schema = "---\ntype: database\n---\n```database\n{\"properties\":[{\"name\":\"Project\",\"type\":\"relation\",\"database\":\"[[Areas/Projects]]\"}]}\n```\n";
        fs::write(dir.join("Tasks.md"), schema).unwrap();
        fs::write(dir.join("Tasks/Design.md"), "---\nProject: [\"[[Khao]]\"]\n---\n").unwrap();

        assert_eq!(backlinks(&dir, "Areas/Projects/Khao.md").iter().map(|n| n.path.as_str()).collect::<Vec<_>>(), vec!["Tasks/Design.md"]);
        rename_note(&dir, "Areas/Projects/Khao.md", "Khaoo").unwrap();
        assert_eq!(fs::read_to_string(dir.join("Tasks/Design.md")).unwrap(), "---\nProject: [\"[[Khaoo]]\"]\n---\n");
        rename_note(&dir, "Areas/Projects.md", "Products").unwrap();
        assert!(fs::read_to_string(dir.join("Tasks.md")).unwrap().contains("\"[[Areas/Products]]\""));
        move_note(&dir, "Areas/Products.md", "").unwrap();
        assert!(fs::read_to_string(dir.join("Tasks.md")).unwrap().contains("\"[[Products]]\""));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ai_visibility_inherits_from_parent_pages() {
        let dir = std::env::temp_dir().join(format!("bg-ai-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        write_note(&dir, "Open.md", "hello").unwrap();
        write_note(&dir, "Secret.md", "---\nai: false\n---\nshh").unwrap();
        write_note(&dir, "Secret/Child.md", "inner").unwrap();
        write_note(&dir, "Shared.md", "---\nai: true\n---\n").unwrap();
        write_note(&dir, "Shared/Child.md", "").unwrap();
        assert!(ai_visible(&dir, "Open.md", "all"));
        assert!(!ai_visible(&dir, "Secret.md", "all"));
        assert!(!ai_visible(&dir, "Secret/Child.md", "all"));
        assert!(!ai_visible(&dir, "Open.md", "shared"));
        assert!(ai_visible(&dir, "Shared/Child.md", "shared"));
        set_ai_policy(&dir, "shared").unwrap();
        assert_eq!(ai_policy(&dir), "shared");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn trash_round_trip() {
        let dir = std::env::temp_dir().join(format!("bg-trash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        write_note(&dir, "Projects.md", "---\nicon: 🚀\n---\nhi").unwrap();
        write_note(&dir, "Projects/Plan.md", "plan").unwrap();
        let id = delete_note(&dir, "Projects.md").unwrap();
        assert!(!dir.join("Projects.md").exists() && !dir.join("Projects").exists());
        let items = list_trash(&dir);
        assert_eq!((items.len(), items[0].pages, items[0].icon.as_deref()), (1, 2, Some("🚀")));
        assert!(list_notes(&dir).is_empty(), "trash is not part of the page tree");
        // Restoring while the name is taken keeps both pages.
        write_note(&dir, "Projects.md", "new").unwrap();
        assert_eq!(restore_trash(&dir, &id).unwrap(), "Projects 2.md");
        assert_eq!(fs::read_to_string(dir.join("Projects 2/Plan.md")).unwrap(), "plan");
        assert!(list_trash(&dir).is_empty());
        let id = delete_note(&dir, "Projects 2.md").unwrap();
        purge_trash(&dir, Some(&id)).unwrap();
        assert!(list_trash(&dir).is_empty());
        assert!(trash_dir(&dir, "../x").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_escaping_paths() {
        let v = Path::new("/vault");
        assert!(resolve(v, "../etc/passwd").is_err());
        assert!(resolve(v, "/etc/passwd").is_err());
        assert!(resolve(v, "A/B.md").is_ok());
    }
}
