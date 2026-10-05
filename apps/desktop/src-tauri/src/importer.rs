//! Importers for Notion exports ("Markdown & CSV" or "HTML") and Obsidian vaults.
//!
//! Everything is imported under one new top-level page so the rest of the workspace is
//! untouched. Pages become Markdown files, images go to `.assets/`, and Notion databases
//! (CSV files) become Betelgeuse databases with typed properties. Both Notion formats share
//! one pipeline; only reading a page differs (`notion_html` converts the HTML export's pages).

mod notion_html;
mod remote_images;

use crate::vault::{children_dir, sanitize_title, unique_path, write_note};
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use walkdir::WalkDir;

#[derive(Serialize, Default)]
pub struct ImportReport {
    /// The page everything was imported under.
    pub root: String,
    pub pages: usize,
    pub databases: usize,
    pub assets: usize,
    pub skipped: Vec<String>,
}

const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "heic"];

fn ext_of(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default()
}

fn stamp() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis())
}

/// Copies a file into `.assets/<batch>/`, flattening its path, and returns its workspace path.
fn copy_asset(vault: &Path, batch: &str, src: &Path, rel_hint: &str, used: &mut HashSet<String>) -> Option<String> {
    let (rel, dest) = asset_slot(vault, batch, rel_hint, used)?;
    fs::copy(src, &dest).ok()?;
    Some(rel)
}

/// Writes `bytes` into `.assets/<batch>/` under a name made from `rel_hint`; returns its workspace path.
fn store_asset(vault: &Path, batch: &str, bytes: &[u8], rel_hint: &str, used: &mut HashSet<String>) -> Option<String> {
    let (rel, dest) = asset_slot(vault, batch, rel_hint, used)?;
    fs::write(&dest, bytes).ok()?;
    Some(rel)
}

/// A free `.assets/<batch>/<name>` for an asset (its folder created): workspace path and file path.
fn asset_slot(vault: &Path, batch: &str, rel_hint: &str, used: &mut HashSet<String>) -> Option<(String, PathBuf)> {
    let flat: String = rel_hint
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let mut name = flat.trim_matches('-').to_string();
    if name.is_empty() {
        name = "asset".into();
    }
    // File systems cap names at 255 bytes; flattened paths can be longer. (`flat` is ASCII.)
    const MAX: usize = 120;
    if name.len() > MAX {
        let ext = name.rfind('.').filter(|&i| name.len() - i <= 10).map_or("", |i| &name[i..]).to_string();
        name = format!("{}{ext}", name[..MAX - ext.len()].trim_end_matches(['-', '.']));
    }
    let mut candidate = format!(".assets/{batch}/{name}");
    let mut n = 2;
    while !used.insert(candidate.clone()) {
        candidate = format!(".assets/{batch}/{n}-{name}");
        n += 1;
    }
    let dest = vault.join(&candidate);
    fs::create_dir_all(dest.parent()?).ok()?;
    Some((candidate, dest))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Joins a relative link onto the directory of the file that contains it, resolving `..`.
fn resolve_link(from_dir: &str, link: &str) -> String {
    let mut parts: Vec<&str> = if from_dir.is_empty() { vec![] } else { from_dir.split('/').collect() };
    for seg in link.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

fn make_root(vault: &Path, title: &str, icon: &str, intro: &str) -> Result<(String, String), String> {
    let root = unique_path(vault, "", &sanitize_title(title), None);
    write_note(vault, &root, &format!("---\nicon: {icon}\n---\n{intro}\n"))?;
    let dir = children_dir(&root).to_string();
    Ok((root, dir))
}

// ---------------------------------------------------------------- Obsidian

static OBSIDIAN_EMBED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"!\[\[([^\]|#\n]+)(?:[|#][^\]\n]*)?\]\]").unwrap());
static MD_IMAGE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+\x22[^\x22]*\x22)?\)").unwrap());
static CALLOUT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^(>\s*)\[!([A-Za-z-]+)\][+-]?[ \t]*(.*)$").unwrap());

/// Obsidian callout types -> (colour, icon).
fn callout_style(kind: &str) -> (&'static str, &'static str) {
    match kind.to_ascii_lowercase().as_str() {
        "note" => ("blue", "📝"),
        "abstract" | "summary" | "tldr" => ("blue", "📋"),
        "info" => ("blue", "ℹ️"),
        "todo" => ("blue", "☑️"),
        "tip" | "hint" | "important" => ("green", "💡"),
        "success" | "check" | "done" => ("green", "✅"),
        "question" | "help" | "faq" => ("yellow", "❓"),
        "warning" | "caution" | "attention" => ("yellow", "⚠️"),
        "failure" | "fail" | "missing" => ("red", "❌"),
        "danger" | "error" => ("red", "⛔"),
        "bug" => ("red", "🐛"),
        "example" => ("purple", "📌"),
        "quote" | "cite" => ("gray", "💬"),
        _ => ("gray", "💡"),
    }
}

const BETELGEUSE_COLORS: &[&str] = &["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

fn convert_callouts(text: &str) -> String {
    CALLOUT
        .replace_all(text, |c: &regex::Captures| {
            let (prefix, kind, title) = (&c[1], &c[2], c[3].trim());
            if BETELGEUSE_COLORS.contains(&kind) {
                return c[0].to_string(); // already Betelgeuse syntax
            }
            let (color, icon) = callout_style(kind);
            if title.is_empty() {
                format!("{prefix}[!{color}] {icon}")
            } else {
                format!("{prefix}[!{color}] {icon}\n{prefix}**{title}**")
            }
        })
        .into_owned()
}

pub fn import_obsidian(vault: &Path, src: &Path) -> Result<ImportReport, String> {
    if !src.is_dir() {
        return Err("Choose the folder of an Obsidian vault.".into());
    }
    let name = src.file_name().map_or("Obsidian".into(), |n| n.to_string_lossy().into_owned());
    let (root, dir) = make_root(vault, &name, "🗃️", &format!("Imported from the Obsidian vault “{name}”."))?;
    let mut report = ImportReport { root: root.clone(), ..Default::default() };
    let batch = format!("obsidian-{}", stamp());
    let mut used = HashSet::new();

    let files: Vec<PathBuf> = WalkDir::new(src)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect();

    // Attachments first, so embeds can point at their new location (Obsidian embeds by file name).
    let mut by_name: HashMap<String, String> = HashMap::new();
    let mut by_rel: HashMap<String, String> = HashMap::new();
    for f in files.iter().filter(|f| ext_of(f) != "md") {
        let rel = f.strip_prefix(src).unwrap().to_string_lossy().replace('\\', "/");
        if let Some(asset) = copy_asset(vault, &batch, f, &rel, &mut used) {
            report.assets += 1;
            by_name.insert(f.file_name().unwrap().to_string_lossy().to_lowercase(), asset.clone());
            by_rel.insert(rel.to_lowercase(), asset);
        }
    }

    for f in files.iter().filter(|f| ext_of(f) == "md") {
        let rel = f.strip_prefix(src).unwrap().to_string_lossy().replace('\\', "/");
        let Ok(text) = fs::read_to_string(f) else {
            report.skipped.push(rel);
            continue;
        };
        let from_dir = rel.rsplit_once('/').map_or("", |(d, _)| d).to_string();
        let mut out = convert_callouts(&text);
        out = OBSIDIAN_EMBED
            .replace_all(&out, |c: &regex::Captures| {
                let target = c[1].trim();
                let file = target.rsplit('/').next().unwrap_or(target).to_lowercase();
                let is_image = IMAGE_EXTS.iter().any(|e| file.ends_with(&format!(".{e}")));
                match by_name.get(&file).or_else(|| by_rel.get(&target.to_lowercase())) {
                    Some(asset) if is_image => format!("![{}]({asset})", file),
                    Some(_) => format!("[[{target}]]"),
                    None => c[0].to_string(), // a note embed: Betelgeuse renders ![[Note]] as a card
                }
            })
            .into_owned();
        out = MD_IMAGE
            .replace_all(&out, |c: &regex::Captures| {
                let link = percent_decode(&c[2]);
                if link.starts_with("http") {
                    return c[0].to_string();
                }
                match by_rel.get(&resolve_link(&from_dir, &link).to_lowercase()) {
                    Some(asset) => format!("![{}]({asset})", &c[1]),
                    None => c[0].to_string(),
                }
            })
            .into_owned();
        let dest = format!("{dir}/{rel}");
        write_note(vault, &dest, &out)?;
        report.pages += 1;
    }
    Ok(report)
}

// ---------------------------------------------------------------- Notion

/// Notion zips everything into `Export-<uuid>/` (sometimes prefixed with another id).
static EXPORT_WRAPPER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(?:.+_)?Export-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$").unwrap());
/// Linked database views are exported as `Name abcd-wxyz_all.csv`: the first and last four hex
/// digits of the id of the database they show.
static VIEW_ID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(.*) ([0-9a-f]{4})-([0-9a-f]{4})$").unwrap());
/// A row page's property line, e.g. `Bake date: October 4, 2026` or `Delivery day?: Monday`.
static PROPERTY_LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^([^\s:#>|`*\[!<-][^:\n]{0,79}?):(?: (.*))?$").unwrap());
/// ` (../Suppliers/Flour%20Mill%20<id>.md)` after a relation value.
static RELATION_LINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r" \(((?:[^()\s]|\([^()\s]*\))*\.(?:md|csv))\)").unwrap());
/// Notion's built-in callout icons: `<img src="https://…/icons/<name>_<colour>.svg" … />`.
static ICON_IMG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"^<img\s[^>]*src="([^"]*)"[^>]*>$"#).unwrap());
static LIST_ITEM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$").unwrap());
static TASK_BOX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\[([ xX])\](?:[ \t]+|$)").unwrap());
static BOLD_HEADING: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(\s*#{1,6}[ \t]+)\*\*(.+?)\*\*[ \t]*$").unwrap());

fn is_notion_id(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// A file or folder name from a Notion export, split into its parts.
struct NotionName {
    /// The name without id, `_all` suffix or extension; empty for id-only and `Export-…` folders.
    stem: String,
    id: Option<String>,
    ext: Option<String>,
}

fn parse_notion_name(name: &str) -> NotionName {
    if EXPORT_WRAPPER.is_match(name) {
        return NotionName { stem: String::new(), id: None, ext: None };
    }
    let (mut stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() && (1..=4).contains(&e.len()) && e.chars().all(|c| c.is_ascii_alphanumeric()) => (s, Some(e.to_ascii_lowercase())),
        _ => (name, None),
    };
    if ext.as_deref() == Some("csv") {
        stem = stem.strip_suffix("_all").unwrap_or(stem);
    }
    if is_notion_id(stem) {
        return NotionName { stem: String::new(), id: Some(stem.to_ascii_lowercase()), ext };
    }
    match stem.rsplit_once(' ') {
        Some((head, id)) if is_notion_id(id) => NotionName { stem: head.to_string(), id: Some(id.to_ascii_lowercase()), ext },
        _ => NotionName { stem: stem.to_string(), id: None, ext },
    }
}

/// Notion appends a 32-character hex id to every exported file and folder name, puts teamspace
/// pages in folders named only by an id, and wraps everything in `Export-<uuid>/`. Returns the
/// name without the id (and `_all` for CSVs); empty for the id-only and wrapper folders.
pub fn strip_notion_id(name: &str) -> String {
    let n = parse_notion_name(name);
    match n.ext {
        Some(e) if !n.stem.is_empty() => format!("{}.{e}", n.stem),
        _ => n.stem,
    }
}

/// Unzips (including the zips-inside-a-zip Notion produces for large exports) into a temp folder.
fn extract_zip(zip_path: &Path, into: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Not a valid zip file: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else { continue };
        let out = into.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        fs::create_dir_all(out.parent().unwrap()).map_err(|e| e.to_string())?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        fs::write(&out, &buf).map_err(|e| e.to_string())?;
        if ext_of(&out) == "zip" {
            extract_zip(&out, &out.with_extension(""))?;
            let _ = fs::remove_file(&out);
        }
    }
    Ok(())
}

/// Parses Notion's exported date formats into `YYYY-MM-DD` (ranges keep their start).
fn notion_date(value: &str) -> Option<String> {
    let v = value.split(" → ").next()?.trim();
    if let Some(iso) = v.get(..10).filter(|d| d.len() == 10 && d.as_bytes()[4] == b'-' && d.as_bytes()[7] == b'-') {
        return Some(iso.to_string());
    }
    if let Some(d) = v.get(..10).filter(|d| d.len() == 10 && d.as_bytes()[4] == b'/' && d.as_bytes()[7] == b'/') {
        return Some(d.replace('/', "-"));
    }
    // "October 4, 2026" optionally followed by a time.
    const MONTHS: [&str; 12] = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    let mut words = v.split_whitespace();
    let month = MONTHS.iter().position(|m| words.clone().next().is_some_and(|w| w.to_lowercase().starts_with(m)))? + 1;
    words.next();
    let day: u32 = words.next()?.trim_end_matches(',').parse().ok()?;
    let year: u32 = words.next()?.trim_end_matches(',').parse().ok()?;
    (1..=31).contains(&day).then(|| format!("{year:04}-{month:02}-{day:02}"))
}

const PALETTE: &[&str] = &["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

/// Picks a property type for a CSV column from its values.
fn infer_type(header: &str, values: &[&str]) -> &'static str {
    let filled: Vec<&str> = values.iter().copied().filter(|v| !v.trim().is_empty()).collect();
    if filled.is_empty() {
        return "text";
    }
    if filled.iter().all(|v| *v == "Yes" || *v == "No") {
        return "checkbox";
    }
    if filled.iter().all(|v| v.replace(',', "").trim_start_matches(['$', '€', '£', '₹']).trim_end_matches('%').parse::<f64>().is_ok()) {
        return "number";
    }
    if filled.iter().all(|v| notion_date(v).is_some()) {
        return "date";
    }
    if filled.iter().all(|v| v.starts_with("http://") || v.starts_with("https://")) {
        return "url";
    }
    if filled.iter().all(|v| v.contains('@') && !v.contains(' ')) {
        return "email";
    }
    let distinct: HashSet<&str> = filled.iter().flat_map(|v| v.split(", ")).collect();
    let repeats = filled.len() > distinct.len() || filled.len() <= 3;
    let short = distinct.iter().all(|d| d.chars().count() <= 40);
    if short && repeats && distinct.len() <= 40 && filled.iter().any(|v| v.contains(", ")) {
        return "multi_select";
    }
    if short && repeats && distinct.len() <= 20 {
        return if header.eq_ignore_ascii_case("status") { "status" } else { "select" };
    }
    "text"
}

fn convert_value(kind: &str, raw: &str) -> Option<Value> {
    let v = raw.trim();
    if v.is_empty() {
        return None;
    }
    Some(match kind {
        "checkbox" => json!(v == "Yes"),
        "number" => {
            let n: f64 = v.replace(',', "").trim_start_matches(['$', '€', '£', '₹']).trim_end_matches('%').parse().ok()?;
            if n.fract() == 0.0 && n.abs() < 1e15 { json!(n as i64) } else { json!(n) }
        }
        "date" => json!(notion_date(v)?),
        "multi_select" => json!(v.split(", ").map(str::trim).filter(|s| !s.is_empty()).collect::<Vec<_>>()),
        _ => json!(v),
    })
}

fn yaml_scalar(v: &Value) -> String {
    match v {
        Value::String(s) => {
            let plain = !s.is_empty()
                && s.chars().all(|c| c.is_alphanumeric() || " .-_/@+&()".contains(c))
                && s.trim() == s
                && !matches!(s.to_ascii_lowercase().as_str(), "true" | "false" | "yes" | "no" | "null" | "~")
                && s.parse::<f64>().is_err();
            if plain { s.clone() } else { serde_json::to_string(s).unwrap() }
        }
        Value::Array(items) => format!("[{}]", items.iter().map(yaml_scalar).collect::<Vec<_>>().join(", ")),
        other => other.to_string(),
    }
}

fn yaml_key(k: &str) -> String {
    if k.chars().all(|c| c.is_alphanumeric() || " _-".contains(c)) && !k.is_empty() && k.trim() == k {
        k.to_string()
    } else {
        serde_json::to_string(k).unwrap()
    }
}

/// Notion builds file names from page titles, replacing characters such as `:` `/` `.` `?` with
/// spaces (`Standup 7:30 AM` -> `Standup 7 30 AM`, `Week 1: Rye` -> `Week 1 Rye`) and cutting long
/// titles off at 50 characters. True when `file_stem` is such a rendering of the H1 `title`:
/// the same letters and digits, or (for a cut-off name) the start of them.
fn file_name_matches_title(file_stem: &str, title: &str) -> bool {
    let skeleton = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).collect::<String>();
    let (f, t) = (skeleton(file_stem), skeleton(title));
    if f.is_empty() {
        return file_stem.trim() == title.trim();
    }
    f == t || (file_stem.chars().count() >= 40 && t.starts_with(&f))
}

/// True when the letters and digits of one title appear, in order, in the other's.
fn loosely_same_title(a: &str, b: &str) -> bool {
    let skeleton = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect::<Vec<_>>();
    let (a, b) = (skeleton(a), skeleton(b));
    let (short, long) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    if short.len() < 3 {
        return false;
    }
    let mut it = long.iter();
    short.iter().all(|c| it.any(|x| x == c))
}

/// Splits Notion's leading `# Title` line off a page: returns the title to use and the rest.
/// The H1 wins over the file name when the file name is a mangled or truncated copy of it.
fn split_title<'a>(text: &'a str, file_stem: &str) -> (String, &'a str) {
    let (first, rest) = text.split_once('\n').unwrap_or((text, ""));
    if let Some(h1) = first.strip_prefix("# ").map(str::trim).filter(|h| !h.is_empty()) {
        if h1 == file_stem.trim() || file_name_matches_title(file_stem, h1) || file_stem.trim().is_empty() {
            return (h1.to_string(), rest.trim_start_matches(['\n', ' ', '\t']));
        }
    }
    let stem = file_stem.trim();
    (if stem.is_empty() { "Untitled".into() } else { stem.to_string() }, text)
}

/// Splits the `Key: value` block Notion writes right after a database row's title. It only counts
/// as a property block when at least one key is a column of the database and the block is
/// followed by a blank line or the end of the page.
fn split_properties<'a>(body: &'a str, columns: &HashSet<String>) -> (Vec<(String, String)>, &'a str) {
    let mut props = vec![];
    let mut end = 0;
    for line in body.split_inclusive('\n') {
        let l = line.trim_end_matches(['\n', '\r']);
        if l.trim().is_empty() {
            break;
        }
        let Some(c) = PROPERTY_LINE.captures(l) else { return (vec![], body) };
        props.push((c[1].trim().to_string(), c.get(2).map_or("", |m| m.as_str()).trim().to_string()));
        end += line.len();
    }
    if !props.iter().any(|(k, _)| columns.contains(k)) {
        return (vec![], body);
    }
    (props, body[end..].trim_start_matches(['\n', ' ', '\t']))
}

/// `Flour Mill (../Suppliers/Flour%20Mill%20<id>.md), Dairy Farm (…)` -> `Flour Mill, Dairy Farm`.
fn relation_text(value: &str) -> String {
    RELATION_LINK.replace_all(value, "").trim().to_string()
}

// ---------- Markdown clean-up passes (all skip fenced code) ----------

/// Tracks fenced code blocks while walking lines.
#[derive(Default)]
struct Fence(Option<(char, usize)>);

impl Fence {
    /// Feeds one line; true when it is part of a fenced code block (fence lines included).
    fn code(&mut self, line: &str) -> bool {
        let t = line.trim_start();
        let run = |c: char| t.chars().take_while(|&x| x == c).count();
        match self.0 {
            Some((c, n)) => {
                if run(c) >= n && t.trim_end().chars().all(|x| x == c) {
                    self.0 = None;
                }
                true
            }
            None => {
                for c in ['`', '~'] {
                    if run(c) >= 3 {
                        self.0 = Some((c, run(c)));
                        return true;
                    }
                }
                false
            }
        }
    }
}

fn indent_of(line: &str) -> &str {
    &line[..line.len() - line.trim_start().len()]
}

/// Skips a backtick code span starting at `i`; returns the index after it (or after the
/// backtick run when it is never closed).
fn skip_code_span(b: &[u8], i: usize) -> usize {
    let n = b[i..].iter().take_while(|&&c| c == b'`').count();
    let mut j = i + n;
    while j < b.len() {
        if b[j] == b'`' {
            let m = b[j..].iter().take_while(|&&c| c == b'`').count();
            if m == n {
                return j + m;
            }
            j += m;
        } else {
            j += 1;
        }
    }
    i + n
}

/// Byte offsets of the `|` that separate table cells: not escaped and not inside code spans
/// (the editor protects code-span pipes the same way).
fn pipe_boundaries(s: &str) -> Vec<usize> {
    let b = s.as_bytes();
    let (mut out, mut i) = (vec![], 0);
    while i < b.len() {
        match b[i] {
            b'\\' => i += 2,
            b'`' => i = skip_code_span(b, i),
            b'|' => {
                out.push(i);
                i += 1;
            }
            _ => i += 1,
        }
    }
    out
}

/// Cells of a one-line table row (`| a | b |`), untrimmed.
fn row_cells(row: &str) -> Option<Vec<&str>> {
    let t = row.trim();
    if !t.starts_with('|') {
        return None;
    }
    let bounds = pipe_boundaries(t);
    let mut cells: Vec<&str> = bounds.windows(2).map(|w| &t[w[0] + 1..w[1]]).collect();
    let last = *bounds.last()?;
    if last + 1 < t.len() {
        cells.push(&t[last + 1..]);
    }
    Some(cells)
}

fn is_delimiter_row(row: &str) -> bool {
    row_cells(row).is_some_and(|cells| {
        !cells.is_empty()
            && cells.iter().all(|c| {
                let c = c.trim();
                let inner = c.trim_start_matches(':').trim_end_matches(':');
                !inner.is_empty() && inner.chars().all(|x| x == '-') && c.len() - inner.len() <= 2
            })
    })
}

/// Whitespace runs -> one space, like the editor's table serializer (`/\s+/g`).
fn collapse_ws(s: &str) -> String {
    s.split(|c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}' || c == '\u{1f}')
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// A multi-line Notion table cell as one line: line breaks become `<br>` (the editor's in-cell
/// line break) and blank lines, i.e. paragraph breaks, become `<br><br>`.
fn join_cell_lines(raw: &str) -> String {
    let mut paragraphs: Vec<String> = vec![];
    let mut current: Vec<&str> = vec![];
    for line in raw.split('\n').map(str::trim) {
        if line.is_empty() {
            if !current.is_empty() {
                paragraphs.push(current.join("<br>"));
                current.clear();
            }
        } else {
            current.push(line);
        }
    }
    if !current.is_empty() {
        paragraphs.push(current.join("<br>"));
    }
    collapse_ws(&paragraphs.join("<br><br>"))
}

/// The cells of a (possibly multi-line) row once it has all `n` of them and ends with `|`.
fn complete_row(acc: &str, n: usize, exact: bool) -> Option<Vec<String>> {
    let t = acc.trim();
    if !t.starts_with('|') || !t.ends_with('|') {
        return None;
    }
    let bounds = pipe_boundaries(t);
    if bounds.len() < n + 1 || (exact && bounds.len() != n + 1) || bounds.last() != Some(&(t.len() - 1)) {
        return None;
    }
    Some(bounds.windows(2).take(n).map(|w| join_cell_lines(&t[w[0] + 1..w[1]])).collect())
}

/// Reads a table starting at `lines[start]` whose cells may contain raw line breaks (Notion
/// writes multi-line cells verbatim). Returns one-line rows and the index after the table.
fn read_table(lines: &[&str], start: usize) -> Option<(Vec<String>, usize)> {
    let first = lines[start];
    if !first.trim_start().starts_with('|') || is_delimiter_row(first) {
        return None;
    }
    let indent = indent_of(first);
    let delim = (start + 1..lines.len().min(start + 50)).find(|&j| is_delimiter_row(lines[j]))?;
    if lines[start + 1..delim].iter().any(|l| l.trim_start().starts_with('|')) {
        return None;
    }
    let delim_cells = row_cells(lines[delim])?;
    let n = delim_cells.len();
    let header = complete_row(&lines[start..delim].join("\n"), n, true)?;
    let render = |cells: &[String]| format!("{indent}| {} |", cells.join(" | "));
    let mut rows = vec![render(&header), render(&delim_cells.iter().map(|c| c.trim().to_string()).collect::<Vec<_>>())];
    let mut i = delim + 1;
    'rows: while i < lines.len() && lines[i].trim_start().starts_with('|') {
        let mut acc = lines[i].to_string();
        let mut j = i;
        loop {
            if let Some(cells) = complete_row(&acc, n, false) {
                rows.push(render(&cells));
                i = j + 1;
                continue 'rows;
            }
            j += 1;
            if j >= lines.len() || j - i > 200 || Fence::default().code(lines[j]) || lines[j].trim() == "</aside>" {
                break 'rows; // not a well-formed row: leave the rest as it was
            }
            acc.push('\n');
            acc.push_str(lines[j]);
        }
    }
    Some((rows, i))
}

/// Rebuilds GFM tables whose cells span several lines into one line per row.
fn rebuild_tables(text: &str) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    let (mut out, mut fence, mut i) = (Vec::<String>::new(), Fence::default(), 0);
    while i < lines.len() {
        if !fence.code(lines[i]) {
            if let Some((rows, next)) = read_table(&lines, i) {
                out.extend(rows);
                i = next;
                continue;
            }
        }
        out.push(lines[i].to_string());
        i += 1;
    }
    out.join("\n")
}

/// Escapes `|` inside code spans, which is how the editor writes them in table cells.
fn escape_code_pipes(cell: &str) -> String {
    let b = cell.as_bytes();
    let (mut out, mut i, mut last) = (String::new(), 0, 0);
    while i < b.len() {
        match b[i] {
            b'\\' => i += 2,
            b'`' => {
                let end = skip_code_span(b, i);
                let span = &cell[i..end.min(cell.len())];
                out.push_str(&cell[last..i]);
                let mut prev = ' ';
                for c in span.chars() {
                    if c == '|' && prev != '\\' {
                        out.push('\\');
                    }
                    out.push(c);
                    prev = c;
                }
                last = end.min(cell.len());
                i = end;
            }
            _ => i += 1,
        }
    }
    out.push_str(&cell[last.min(cell.len())..]);
    out
}

/// Pads every table exactly like the editor's serializer (column width = the longest cell in
/// UTF-16 units, at least 3), so opening and saving an imported page changes nothing.
fn pad_tables(text: &str) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    let (mut out, mut fence, mut i) = (Vec::<String>::new(), Fence::default(), 0);
    while i < lines.len() {
        let line = lines[i];
        let header = (!fence.code(line) && line.trim_start().starts_with('|') && i + 1 < lines.len() && is_delimiter_row(lines[i + 1]))
            .then(|| row_cells(line))
            .flatten();
        let delim = row_cells(lines.get(i + 1).copied().unwrap_or(""));
        let (Some(header), Some(delim)) = (header, delim) else {
            out.push(line.to_string());
            i += 1;
            continue;
        };
        if header.len() != delim.len() {
            out.push(line.to_string());
            i += 1;
            continue;
        }
        let n = header.len();
        let indent = indent_of(line);
        let clean = |cells: Vec<&str>| -> Vec<String> {
            let mut v: Vec<String> = cells.into_iter().take(n).map(|c| escape_code_pipes(&collapse_ws(c))).collect();
            v.resize(n, String::new());
            v
        };
        let mut rows = vec![clean(header)];
        let mut j = i + 2;
        while j < lines.len() && lines[j].trim_start().starts_with('|') {
            rows.push(clean(row_cells(lines[j]).unwrap_or_default()));
            j += 1;
        }
        let widths: Vec<usize> = (0..n).map(|c| rows.iter().map(|r| r[c].encode_utf16().count()).max().unwrap_or(0).max(3)).collect();
        let pad = |s: &str, w: usize| format!("{s}{}", " ".repeat(w.saturating_sub(s.encode_utf16().count())));
        let render = |r: &[String]| format!("{indent}| {} |", r.iter().zip(&widths).map(|(c, &w)| pad(c, w)).collect::<Vec<_>>().join(" | "));
        out.push(render(&rows[0]));
        let rule: Vec<String> = delim
            .iter()
            .zip(&widths)
            .map(|(d, &w)| {
                let d = d.trim();
                let dashes = "-".repeat(w);
                match (d.starts_with(':'), d.ends_with(':')) {
                    (true, true) => format!(":{dashes}:"),
                    (true, false) => format!(":{dashes}"),
                    (false, true) => format!("{dashes}:"),
                    _ => dashes,
                }
            })
            .collect();
        out.push(format!("{indent}| {} |", rule.join(" | ")));
        out.extend(rows[1..].iter().map(|r| render(r)));
        i = j;
    }
    out.join("\n")
}

/// Notion indents nested blocks by 4 spaces; Markdown nests a block under a list item by the
/// width of its marker (`- ` = 2, `1. ` = 3), which is also what the editor writes. Re-indents
/// list content (fenced code included), tidies `- [x]  task` spacing, drops empty bullets and
/// spaces sibling lists like the editor: a blank line between a to-do list and a bullet list
/// that follows it, none between items of one list.
fn reindent_lists(text: &str) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    let mut out: Vec<String> = vec![];
    // (original indent, new content column, kind) of each open list item, outermost first.
    let mut stack: Vec<(usize, usize, char)> = vec![];
    let (mut fence, mut shift) = (Fence::default(), 0isize);
    let width = |s: &str| s.chars().map(|c| if c == '\t' { 4 } else { 1 }).sum::<usize>();
    for (idx, line) in lines.iter().enumerate() {
        if fence.0.is_some() {
            fence.code(line);
            let n = width(indent_of(line)) as isize;
            let keep = (n + shift).max(0) as usize;
            out.push(format!("{}{}", " ".repeat(keep), line.trim_start()));
            continue;
        }
        if line.trim().is_empty() {
            out.push(String::new());
            continue;
        }
        let indent = width(indent_of(line));
        let body = line.trim_start();
        let empty_item = LIST_ITEM.captures(body).is_some_and(|c| c.get(2).is_none_or(|m| m.as_str().trim().is_empty()));
        if empty_item && !lines[idx + 1..].iter().find(|l| !l.trim().is_empty()).is_some_and(|l| width(indent_of(l)) > indent) {
            continue; // an empty bullet (the editor can't represent one); the list goes on around it
        }
        let mut sibling = None;
        while let Some(&(o, _, kind)) = stack.last().filter(|&&(o, _, _)| o >= indent) {
            if o == indent {
                sibling = Some(kind);
            }
            stack.pop();
        }
        let new_indent = if indent == 0 { 0 } else { stack.last().map_or(indent, |&(_, col, _)| col) };
        let pad = " ".repeat(new_indent);
        if fence.code(line) {
            shift = new_indent as isize - indent as isize;
            out.push(format!("{pad}{body}"));
            continue;
        }
        let Some(item) = LIST_ITEM.captures(body) else {
            out.push(format!("{pad}{body}"));
            continue;
        };
        let marker = &item[1];
        let content = item.get(2).map_or("", |m| m.as_str());
        let (content, kind) = match TASK_BOX.captures(content) {
            Some(c) => (format!("[{}] {}", &c[1], &content[c[0].len()..]), 't'),
            None => (content.to_string(), if marker.starts_with(|c: char| c.is_ascii_digit()) { 'o' } else { 'b' }),
        };
        match sibling {
            Some(k) if k == kind => {
                while out.last().is_some_and(String::is_empty) {
                    out.pop();
                }
            }
            Some(_) if out.last().is_some_and(|l| !l.is_empty()) => out.push(String::new()),
            _ => {}
        }
        out.push(if content.is_empty() { format!("{pad}{marker}") } else { format!("{pad}{marker} {content}") });
        stack.push((indent, new_indent + marker.chars().count() + 1, kind));
    }
    out.join("\n")
}

/// The emoji a callout starts with, if any (with its modifiers / ZWJ sequence), and the rest.
fn leading_emoji(s: &str) -> Option<(&str, &str)> {
    let mut chars = s.char_indices();
    let (_, first) = chars.next()?;
    let starts = matches!(first as u32, 0x1F000..=0x1FAFF | 0x2300..=0x23FF | 0x2600..=0x27BF | 0x2B00..=0x2BFF | 0x3030 | 0x303D | 0x3297 | 0x3299 | 0x203C | 0x2049);
    if !starts {
        return None;
    }
    let mut end = first.len_utf8();
    let mut joined = false;
    for (i, c) in chars {
        let modifier = matches!(c as u32, 0xFE0E | 0xFE0F | 0x20E3 | 0x1F3FB..=0x1F3FF | 0xE0020..=0xE007F)
            || (matches!(c as u32, 0x1F1E6..=0x1F1FF) && matches!(first as u32, 0x1F1E6..=0x1F1FF) && i == first.len_utf8());
        if modifier || joined || c == '\u{200D}' {
            joined = c == '\u{200D}';
            end = i + c.len_utf8();
        } else {
            break;
        }
    }
    let rest = &s[end..];
    (rest.is_empty() || rest.starts_with(char::is_whitespace)).then(|| (&s[..end], rest.trim_start()))
}

/// Prefixes every line with `> `, using a bare `>` for blank lines (as the editor does).
fn quote_lines(text: &str) -> String {
    text.split('\n').map(|l| if l.is_empty() { ">".to_string() } else { format!("> {l}") }).collect::<Vec<_>>().join("\n")
}

/// `<aside>` content -> a Betelgeuse callout. The leading emoji becomes the callout's icon;
/// Notion's built-in icon images set its colour (`…/icons/egg_yellow.svg` -> yellow).
fn callout_from_aside(inner: &str) -> String {
    let inner = tidy_markdown(inner);
    let (first, rest) = inner.split_once('\n').unwrap_or((&inner, ""));
    let (mut color, mut icon, mut body) = ("gray", "💡".to_string(), inner.clone());
    if let Some(img) = ICON_IMG.captures(first.trim()) {
        let name = img[1].rsplit('/').next().unwrap_or("").trim_end_matches(".svg");
        if let Some(c) = name.rsplit_once('_').map(|(_, c)| c).and_then(|c| BETELGEUSE_COLORS.iter().find(|&&k| k == c && k != "default")) {
            color = c;
        }
        body = rest.to_string();
    } else if let Some((emoji, text)) = leading_emoji(first) {
        icon = emoji.to_string();
        body = if text.is_empty() { rest.to_string() } else { format!("{text}\n{rest}") };
    }
    format!("> [!{color}] {icon}\n{}", quote_lines(&tidy_markdown(&body)))
}

/// Notion exports callouts as `<aside>` HTML blocks; turns them into the editor's callouts.
fn convert_asides(text: &str) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    let (mut out, mut fence, mut i) = (Vec::<String>::new(), Fence::default(), 0);
    while i < lines.len() {
        let line = lines[i];
        if !fence.code(line) && line.trim() == "<aside>" {
            let mut depth = 0;
            let mut inner_fence = Fence::default();
            let end = (i..lines.len()).find(|&j| {
                if inner_fence.code(lines[j]) {
                    return false;
                }
                match lines[j].trim() {
                    "<aside>" => depth += 1,
                    "</aside>" => depth -= 1,
                    _ => {}
                }
                depth == 0
            });
            if let Some(end) = end {
                let indent = indent_of(line);
                let inner: Vec<&str> = lines[i + 1..end].iter().map(|l| l.strip_prefix(indent).unwrap_or(l.trim_start())).collect();
                let callout = callout_from_aside(&convert_asides(&inner.join("\n")));
                out.extend(callout.split('\n').map(|l| format!("{indent}{l}")));
                i = end + 1;
                continue;
            }
        }
        out.push(line.to_string());
        i += 1;
    }
    out.join("\n")
}

/// `### **Today**` -> `### Today` (Notion bolds some headings; they are bold anyway).
fn unbold_headings(text: &str) -> String {
    let mut fence = Fence::default();
    text.split('\n')
        .map(|line| match BOLD_HEADING.captures(line) {
            _ if fence.code(line) => line.to_string(),
            Some(c) if !c[2].contains("**") => format!("{}{}", &c[1], &c[2]),
            _ => line.to_string(),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Final clean-up outside code, matching what the editor writes: one blank line between blocks,
/// one bare `>` between paragraphs of a quote (none at its edges), no trailing spaces except a
/// two-space line break inside a paragraph.
fn tidy_markdown(text: &str) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    let is_quote = |l: &str| l.trim_start().starts_with('>');
    let is_bare_quote = |l: &str| l.trim() == ">";
    let mut fence = Fence::default();
    let mut out: Vec<String> = vec![];
    for (i, line) in lines.iter().enumerate() {
        if fence.code(line) {
            out.push(line.to_string());
            continue;
        }
        if line.trim().is_empty() {
            if out.last().is_some_and(|l| !l.is_empty()) {
                out.push(String::new());
            }
            continue;
        }
        let next = lines.get(i + 1).copied().unwrap_or("");
        if is_bare_quote(line) {
            let prev = out.last().map_or("", String::as_str);
            let keep = if CALLOUT.is_match(prev) {
                !is_quote(next) // an empty callout is `> [!gray] 💡` + `>`
            } else {
                is_quote(prev) && !is_bare_quote(prev) && is_quote(next)
            };
            if keep {
                out.push(line.trim().to_string());
            }
            continue;
        }
        let t = line.trim_end();
        let next_t = next.trim_start();
        let line_break = line.len() - t.len() >= 2
            && !next_t.is_empty()
            && is_quote(line) == is_quote(next)
            && !LIST_ITEM.is_match(next_t.trim_start_matches(['>', ' ']))
            && !next_t.trim_start_matches(['>', ' ']).starts_with(['#', '|', '`', '~', '<']);
        out.push(if line_break { format!("{t}  ") } else { t.to_string() });
    }
    while out.last().is_some_and(String::is_empty) {
        out.pop();
    }
    while out.first().is_some_and(String::is_empty) {
        out.remove(0);
    }
    out.join("\n")
}

/// Finds a `[label](url)` starting at the `[` at `open` (nested brackets in the label and
/// parentheses in the url allowed): returns (end, label, url).
fn parse_link_at(s: &str, open: usize) -> Option<(usize, &str, &str)> {
    let b = s.as_bytes();
    let (mut depth, mut j) = (0i32, open);
    loop {
        match b.get(j)? {
            b'\\' => {
                j += 2;
                continue;
            }
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            _ => {}
        }
        j += 1;
    }
    if b.get(j + 1) != Some(&b'(') {
        return None;
    }
    let (mut depth, mut k) = (0i32, j + 1);
    while k < b.len() {
        match b[k] {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            _ => {}
        }
        k += 1;
    }
    // Unbalanced: Notion cuts long names off, leaving e.g. `Week%206%20Rye%20(70%20<id>.md)`. Its
    // urls have no spaces, so then the url ends at the first `)` right after a file extension.
    if k >= b.len() || s[j + 2..k].contains(' ') {
        static END: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[^\s()]*(?:\([^\s()]*)?[^\s()]*\.[A-Za-z0-9]{1,5}\)").unwrap());
        k = END.find(&s[j + 2..]).map(|m| j + 2 + m.end() - 1).or((k < b.len()).then_some(k))?;
    }
    Some((k + 1, &s[open + 1..j], s[j + 2..k].trim()))
}

/// Rewrites every `[label](url)` / `![alt](url)` outside code spans; `f(is_image, label, url)`
/// returns the replacement, or `None` to keep the link.
fn replace_links(line: &str, mut f: impl FnMut(bool, &str, &str) -> Option<String>) -> String {
    let b = line.as_bytes();
    let (mut out, mut i, mut last) = (String::new(), 0, 0);
    while i < b.len() {
        match b[i] {
            b'\\' => i += 2,
            b'`' => i = skip_code_span(b, i),
            b'[' => match parse_link_at(line, i) {
                Some((end, label, url)) => {
                    let image = i > 0 && b[i - 1] == b'!';
                    if let Some(rep) = f(image, label, url) {
                        out.push_str(&line[last..if image { i - 1 } else { i }]);
                        out.push_str(&rep);
                        last = end;
                    }
                    i = end;
                }
                None => i += 1,
            },
            _ => i += 1,
        }
    }
    out.push_str(&line[last.min(line.len())..]);
    out
}

/// A line that is nothing but one (non-image) link: Notion's form for child databases and
/// linked database views.
fn solo_link(line: &str) -> Option<(&str, &str)> {
    let t = line.trim();
    let (end, label, url) = parse_link_at(t, 0)?;
    (end == t.len()).then_some((label, url))
}

/// One page or database of the export.
struct NotionPage {
    /// The page's own file: `.md` in a Markdown export, `.html` in an HTML export.
    doc: Option<String>,
    csv: Option<String>,
    id: Option<String>,
    /// Export path without ids, wrapper folders and extension: also the folder of its sub-pages.
    key: String,
    title: String,
    /// The page's Markdown with the title line removed, or the HTML of its body.
    body: String,
    /// What only the HTML export has: icon, cover and typed database properties.
    html: Option<notion_html::HtmlPage>,
    rel: String,
    /// A database Notion left out of the export (its rows' folder is there, its page and CSV
    /// aren't), rebuilt from a linked view's CSV or from the rows' property tables.
    rebuilt: bool,
}

enum Target {
    Asset(String),
    Page(usize),
    /// A linked view (`Name abcd-wxyz_all.csv`) of a database.
    View(usize),
    /// A page or database that isn't in the export.
    Missing,
}

struct NotionCtx {
    /// An HTML export (pages are `.html`) rather than a Markdown one.
    html: bool,
    pages: Vec<NotionPage>,
    /// Export path (lowercased) of every .md/.csv -> page.
    by_path: HashMap<String, usize>,
    by_id: HashMap<String, usize>,
    /// Export path (lowercased) of every attachment -> its `.assets/` path.
    assets: HashMap<String, String>,
    /// How many pages (imported and already in the workspace) have each title, lowercased.
    title_count: HashMap<String, usize>,
}

impl NotionCtx {
    fn is_database(&self, i: usize) -> bool {
        self.pages[i].csv.is_some() || self.pages[i].rebuilt
    }

    /// Link target for a page: its title when that is unambiguous, else its full path.
    fn link_target(&self, i: usize) -> String {
        let rel = &self.pages[i].rel;
        let title = crate::vault::title_of(rel);
        if self.title_count.get(&title.to_lowercase()).copied().unwrap_or(0) <= 1 {
            title
        } else {
            children_dir(rel).to_string()
        }
    }

    fn wikilink(&self, i: usize, label: &str, in_table: bool) -> String {
        let title = crate::vault::title_of(&self.pages[i].rel);
        let target = self.link_target(i);
        let label = label.trim();
        let label = if label.is_empty() || label == "Untitled" { title.as_str() } else { label };
        if target == title && label == title {
            return format!("[[{title}]]");
        }
        let (sep, label) = if in_table { ("\\|", label.replace('|', "\\|")) } else { ("|", label.to_string()) };
        format!("[[{target}{sep}{label}]]")
    }

    fn resolve(&self, from_dir: &str, url: &str) -> Option<Target> {
        if url.contains("://") || url.starts_with('#') || url.starts_with("mailto:") || url.starts_with("tel:") {
            return None;
        }
        let path = resolve_link(from_dir, &percent_decode(url));
        let lower = path.to_lowercase();
        if let Some(asset) = self.assets.get(&lower) {
            return Some(Target::Asset(asset.clone()));
        }
        if let Some(&i) = self.by_path.get(&lower) {
            return Some(Target::Page(i));
        }
        let name = parse_notion_name(file_name(&path));
        if let Some(&i) = name.id.as_ref().and_then(|id| self.by_id.get(id)) {
            return Some(Target::Page(i));
        }
        if name.ext.as_deref() == Some("csv") {
            if let Some(c) = VIEW_ID.captures(&name.stem) {
                let db = (0..self.pages.len())
                    .find(|&i| self.is_database(i) && self.pages[i].id.as_ref().is_some_and(|id| id.starts_with(&c[2]) && id.ends_with(&c[3])));
                return Some(db.map_or(Target::Missing, Target::View));
            }
        }
        let page_ext = if self.html { "html" } else { "md" };
        (name.ext.as_deref() == Some("csv") || name.ext.as_deref() == Some(page_ext)).then_some(Target::Missing)
    }

    /// Rewrites Notion's relative links: pages -> wikilinks, attachments -> `.assets/` paths,
    /// a line that is just a database (or a linked view of one) -> an inline database embed.
    fn convert_links(&self, text: &str, from_dir: &str, me: Option<usize>, notes: &mut Vec<String>) -> String {
        let lines: Vec<&str> = text.split('\n').collect();
        let (mut out, mut fence, mut i) = (Vec::<String>::new(), Fence::default(), 0);
        let mut after_view = false;
        while i < lines.len() {
            let line = lines[i];
            i += 1;
            if fence.code(line) {
                out.push(line.to_string());
                continue;
            }
            if after_view && !line.trim().is_empty() {
                after_view = false;
                // Notion describes the view's settings under it ("filters: …", "sort: …").
                let t = line.trim();
                if ["filters:", "sort:", "sorts:"].iter().any(|p| t.starts_with(p)) {
                    while i < lines.len() && !lines[i].trim().is_empty() {
                        i += 1;
                    }
                    continue;
                }
            }
            if let Some((label, url)) = solo_link(line).filter(|_| !line.trim_start().starts_with('|')) {
                let is_csv = percent_decode(url).to_lowercase().ends_with(".csv");
                let indent = indent_of(line);
                match self.resolve(from_dir, url) {
                    // The database page's own link to its table, or a page linking to itself.
                    Some(Target::Page(t) | Target::View(t)) if Some(t) == me => {
                        after_view = true;
                        continue;
                    }
                    Some(Target::View(t)) => {
                        out.push(format!("{indent}![[{}]]", self.link_target(t)));
                        after_view = true;
                        continue;
                    }
                    Some(Target::Page(t)) if is_csv && self.is_database(t) => {
                        out.push(format!("{indent}![[{}]]", self.link_target(t)));
                        after_view = true;
                        continue;
                    }
                    Some(Target::Missing) if is_csv => {
                        let page = me.map_or(String::new(), |m| crate::vault::title_of(&self.pages[m].rel));
                        notes.push(format!("{page}: a linked database that isn't in the export (“{label}”)"));
                        after_view = true;
                        continue;
                    }
                    _ => {}
                }
            }
            let in_table = line.trim_start().starts_with('|');
            out.push(replace_links(line, |image, label, url| match self.resolve(from_dir, url)? {
                Target::Asset(asset) => Some(format!("{}[{label}]({asset})", if image { "!" } else { "" })),
                Target::Page(t) | Target::View(t) => Some(self.wikilink(t, label, in_table)),
                Target::Missing => Some(label.to_string()),
            }));
        }
        out.join("\n")
    }

    /// A page body (Notion Markdown, or HTML) -> the Markdown the editor reads and writes back
    /// unchanged.
    fn convert_body(&self, text: &str, from_dir: &str, me: Option<usize>, notes: &mut Vec<String>) -> String {
        if self.html {
            return notion_html::Conv::new(self, from_dir, me, notes).convert(text);
        }
        let text = rebuild_tables(text);
        let text = self.convert_links(&text, from_dir, me, notes);
        let text = pad_tables(&text);
        let text = reindent_lists(&text);
        let text = convert_asides(&text);
        let text = unbold_headings(&text);
        tidy_markdown(&text)
    }
}

impl NotionCtx {
    /// Frontmatter lines every imported page may get: `icon:` and `cover:` (HTML exports only)
    /// and `order:`, its position among its siblings in Notion.
    fn page_frontmatter(&self, i: usize, order: Option<usize>) -> String {
        let page = &self.pages[i];
        let mut fm = String::new();
        if let Some(meta) = &page.html {
            let from_dir = parent_dir(page.doc.as_deref().unwrap_or(""));
            let mut notes = vec![];
            let conv = notion_html::Conv::new(self, from_dir, Some(i), &mut notes);
            if let Some(icon) = meta.icon.as_ref().and_then(|icon| conv.icon_value(icon, false)) {
                fm.push_str(&format!("icon: {}\n", yaml_text(&icon)));
            }
            if let Some(cover) = meta.cover.as_deref().and_then(|c| conv.cover_value(c)) {
                fm.push_str(&format!("cover: {}\n", yaml_text(&cover)));
            }
        }
        if let Some(order) = order {
            fm.push_str(&format!("order: {order}\n"));
        }
        fm
    }

    /// The pages a page's body links to (sub-page blocks, mentions, links, inline databases),
    /// in order of first appearance.
    fn linked_pages(&self, i: usize) -> Vec<usize> {
        let page = &self.pages[i];
        let from_dir = parent_dir(page.doc.as_deref().unwrap_or(""));
        let mut out: Vec<usize> = vec![];
        let mut add = |url: &str| {
            if let Some(Target::Page(t) | Target::View(t)) = self.resolve(from_dir, url) {
                if !out.contains(&t) {
                    out.push(t);
                }
            }
        };
        if self.html {
            notion_html::hrefs(&page.body).iter().for_each(|h| add(h));
        } else {
            let mut fence = Fence::default();
            for line in page.body.split('\n').filter(|l| !fence.code(l)) {
                replace_links(line, |_, _, url| {
                    add(url);
                    None
                });
            }
        }
        out
    }

    /// Notion's order of each page among its siblings, where the export shows it: a parent page
    /// lists its sub-pages in order. (Teamspace top-level pages have no parent page, so no order;
    /// database rows are ordered by their CSV, which follows the database's view.)
    fn sibling_orders(&self) -> HashMap<usize, usize> {
        let mut orders = HashMap::new();
        for p in 0..self.pages.len() {
            if self.pages[p].doc.is_none() || self.is_database(p) {
                continue;
            }
            let dir = children_dir(&self.pages[p].rel);
            let mut n = 0;
            for t in self.linked_pages(p) {
                if t != p && parent_dir(&self.pages[t].rel) == dir && !orders.contains_key(&t) {
                    n += 1;
                    orders.insert(t, n);
                }
            }
        }
        orders
    }

    #[cfg(test)]
    fn empty() -> NotionCtx {
        NotionCtx { html: true, pages: vec![], by_path: HashMap::new(), by_id: HashMap::new(), assets: HashMap::new(), title_count: HashMap::new() }
    }
}

/// A frontmatter string, unquoted when YAML reads it back as the same string (as the app writes
/// icons: `icon: 💡`, `icon: lucide:Rocket:blue`).
fn yaml_text(s: &str) -> String {
    let plain = !s.is_empty()
        && s.trim() == s
        && !s.starts_with(['-', '?', ':', ',', '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', '\'', '"', '%', '@', '`'])
        && !s.contains(": ")
        && !s.contains(" #")
        && !s.ends_with(':')
        && !s.contains(['\n', '"', '\''])
        && !matches!(s.to_ascii_lowercase().as_str(), "true" | "false" | "yes" | "no" | "null" | "~")
        && s.parse::<f64>().is_err();
    if plain { s.to_string() } else { serde_json::to_string(s).unwrap() }
}

/// Downloads one web image: its bytes and file extension, or None if it isn't one or can't be fetched.
type Fetch = dyn Fn(&str) -> Option<remote_images::Image> + Sync;

/// Imports a Notion export, downloading the web images its pages show into the workspace.
pub fn import_notion(vault: &Path, src: &Path) -> Result<ImportReport, String> {
    import_notion_with(vault, src, Some(&remote_images::fetch))
}

/// `import_notion`, with web images fetched by `fetch` (None leaves them on the web).
fn import_notion_with(vault: &Path, src: &Path, fetch: Option<&Fetch>) -> Result<ImportReport, String> {
    let temp = std::env::temp_dir().join(format!("betelgeuse-notion-{}", stamp()));
    let export = if src.is_file() {
        extract_zip(src, &temp)?;
        temp.clone()
    } else if src.is_dir() {
        src.to_path_buf()
    } else {
        return Err("Choose the .zip (or unzipped folder) that Notion exported.".into());
    };
    let result = import_notion_dir(vault, &export, fetch);
    let _ = fs::remove_dir_all(&temp);
    result
}

fn read_notion_text(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    Some(text.trim_start_matches('\u{feff}').replace("\r\n", "\n"))
}

/// Picks a free `dir/title.md`, numbering duplicates (`Ideas`, `Ideas 2`, …).
fn place(dir: &str, title: &str, taken: &mut HashSet<String>) -> String {
    let title = sanitize_title(title);
    let mut rel = format!("{dir}/{title}.md");
    let mut n = 2;
    while !taken.insert(rel.to_lowercase()) {
        rel = format!("{dir}/{title} {n}.md");
        n += 1;
    }
    rel
}

/// Workspace folder for an export folder (ids stripped): a page's sub-page folder, or a plain folder.
fn dest_dir(dir_key: &str, root_dir: &str, pages: &[NotionPage], by_key: &HashMap<String, usize>) -> String {
    if dir_key.is_empty() {
        return root_dir.to_string();
    }
    match by_key.get(&dir_key.to_lowercase()) {
        Some(&i) if !pages[i].rel.is_empty() => children_dir(&pages[i].rel).to_string(),
        _ => {
            let (parent, name) = dir_key.rsplit_once('/').unwrap_or(("", dir_key));
            format!("{}/{}", dest_dir(parent, root_dir, pages, by_key), sanitize_title(name))
        }
    }
}

/// Finds the databases Notion left out of the export but whose rows it kept: a folder with no page
/// of its own is a database when a linked view's CSV lists its pages (the CSV becomes the
/// database's, and links to the view resolve to it) or, in an HTML export, when its pages have
/// database property tables. Adds a page for each; returns those rebuilt without a CSV.
fn rebuild_missing_databases(export: &Path, html: bool, views: &[String], pages: &mut Vec<NotionPage>, by_path: &mut HashMap<String, usize>) -> Vec<usize> {
    let keys: HashSet<String> = pages.iter().map(|p| p.key.to_lowercase()).collect();
    // Folder (lowercased key) -> its pages.
    let mut folders: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (j, p) in pages.iter().enumerate() {
        let dir = parent_dir(&p.key);
        if p.doc.is_some() && p.csv.is_none() && !dir.is_empty() && !keys.contains(&dir.to_lowercase()) {
            folders.entry(dir.to_lowercase()).or_default().push(j);
        }
    }
    // Views of a database that is in the export.
    let shown = |view: &str| {
        VIEW_ID
            .captures(&parse_notion_name(file_name(view)).stem)
            .is_some_and(|c| pages.iter().any(|p| p.csv.is_some() && p.id.as_ref().is_some_and(|id| id.starts_with(&c[2]) && id.ends_with(&c[3]))))
    };
    let orphan_views: Vec<&String> = views.iter().filter(|v| !shown(v)).collect();
    let add = |pages: &mut Vec<NotionPage>, folder: usize, csv: Option<String>| {
        let key = parent_dir(&pages[folder].key).to_string();
        let title = key.rsplit('/').next().filter(|t| !t.trim().is_empty()).unwrap_or("Untitled").to_string();
        pages.push(NotionPage { doc: None, csv, id: None, key, title, body: String::new(), html: None, rel: String::new(), rebuilt: true });
        pages.len() - 1
    };
    let mut done: HashSet<String> = HashSet::new();
    for view in orphan_views {
        let Some(names) = csv::ReaderBuilder::new().flexible(true).from_path(export.join(view)).ok().map(|mut r| {
            r.records().filter_map(Result::ok).filter_map(|r| r.get(0).map(|n| sanitize_title(n.trim()).to_lowercase())).collect::<HashSet<_>>()
        }) else {
            continue;
        };
        // The folder most of whose pages the view lists.
        let best = folders
            .iter()
            .filter(|(dir, _)| !done.contains(*dir))
            .map(|(dir, js)| (dir, js, js.iter().filter(|&&j| names.contains(&sanitize_title(&pages[j].title).to_lowercase())).count()))
            .filter(|&(_, js, n)| n > 0 && n * 2 >= js.len())
            .max_by_key(|&(_, _, n)| n)
            .map(|(dir, js, _)| (dir.clone(), js[0]));
        if let Some((dir, first)) = best {
            let i = add(pages, first, Some(view.clone()));
            by_path.insert(view.to_lowercase(), i);
            done.insert(dir);
        }
    }
    let mut rebuilt = vec![];
    if html {
        for (dir, js) in &folders {
            if !done.contains(dir) && js.iter().any(|&j| pages[j].html.as_ref().is_some_and(|h| !h.props.is_empty())) {
                rebuilt.push(add(pages, js[0], None));
            }
        }
    }
    rebuilt
}

/// Inline databases a page links to (`Page/Name <id>.csv`, in the page's own folder) that aren't in
/// the export and have no rows in it: Notion leaves out empty databases' CSVs. Each becomes an empty
/// database. (A link elsewhere is a view of a database outside the export, reported as missing.)
fn add_unexported_databases(html: bool, files: &[String], pages: &mut Vec<NotionPage>, by_id: &mut HashMap<String, usize>) -> Vec<usize> {
    let exported: HashSet<String> = files.iter().map(|f| f.to_lowercase()).collect();
    // (export path of the CSV, key of the page linking to it)
    let mut links: Vec<(String, String)> = vec![];
    for page in pages.iter() {
        let Some(doc) = &page.doc else { continue };
        let from_dir = parent_dir(doc);
        let mut add = |url: &str| {
            if !url.contains("://") {
                links.push((resolve_link(from_dir, &percent_decode(url)), page.key.clone()));
            }
        };
        if html {
            notion_html::hrefs(&page.body).iter().for_each(|h| add(h));
        } else {
            let mut fence = Fence::default();
            for line in page.body.split('\n').filter(|l| !fence.code(l)) {
                replace_links(line, |_, _, url| {
                    add(url);
                    None
                });
            }
        }
    }
    let mut added = vec![];
    for (path, owner) in links {
        let name = parse_notion_name(file_name(&path));
        let Some(id) = name.id.filter(|_| name.ext.as_deref() == Some("csv") && !exported.contains(&path.to_lowercase())) else { continue };
        let dir_key = strip_path_ids(parent_dir(&path));
        if by_id.contains_key(&id) || !dir_key.eq_ignore_ascii_case(&owner) {
            continue;
        }
        let key = if dir_key.is_empty() { name.stem.clone() } else { format!("{dir_key}/{}", name.stem) };
        // Its rows' folder is in the export after all: not empty, just missing (handled above).
        if pages.iter().any(|p| parent_dir(&p.key).eq_ignore_ascii_case(&key)) {
            continue;
        }
        let title = if name.stem.trim().is_empty() { "Untitled".to_string() } else { name.stem.clone() };
        pages.push(NotionPage { doc: None, csv: None, id: Some(id.clone()), key, title, body: String::new(), html: None, rel: String::new(), rebuilt: true });
        by_id.insert(id, pages.len() - 1);
        added.push(pages.len() - 1);
    }
    added
}

struct NotionDb {
    page: usize,
    headers: Vec<String>,
    records: Vec<Vec<String>>,
    /// (CSV record, row page) pairs, in CSV order; rows only found as pages come last.
    rows: Vec<(Option<usize>, Option<usize>)>,
}

fn import_notion_dir(vault: &Path, export: &Path, fetch: Option<&Fetch>) -> Result<ImportReport, String> {
    let mut files: Vec<String> = WalkDir::new(export)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| e.path().strip_prefix(export).unwrap().to_string_lossy().replace('\\', "/"))
        .collect();
    files.sort();
    // An HTML export has `.html` pages and no `.md` ones; otherwise it's a Markdown export.
    let html = files.iter().any(|f| f.to_lowercase().ends_with(".html")) && !files.iter().any(|f| f.to_lowercase().ends_with(".md"));
    let page_ext = if html { ".html" } else { ".md" };
    let is_page = |f: &str| f.to_lowercase().ends_with(page_ext);
    let is_csv = |f: &str| f.to_lowercase().ends_with(".csv");
    if !files.iter().any(|f| is_page(f) || is_csv(f)) {
        return Err("No pages found. In Notion choose Export → HTML (or Markdown & CSV), with “Include subpages” on.".into());
    }
    let mut title_count: HashMap<String, usize> = HashMap::new();
    for note in crate::vault::list_notes(vault) {
        *title_count.entry(note.title.to_lowercase()).or_default() += 1;
    }

    let (root, root_dir) = make_root(vault, "Notion import", "📥", "Imported from Notion.")?;
    *title_count.entry(crate::vault::title_of(&root).to_lowercase()).or_default() += 1;
    let mut report = ImportReport { root: root.clone(), ..Default::default() };

    // 1. Pages: a page's `.md` and its database `.csv` share an id (prefer the `_all.csv`).
    let mut pages: Vec<NotionPage> = vec![];
    let mut by_id: HashMap<String, usize> = HashMap::new();
    let mut by_path: HashMap<String, usize> = HashMap::new();
    // Linked views (`Name abcd-wxyz_all.csv`): links to one resolve to the database it shows.
    let mut views: Vec<String> = vec![];
    for f in files.iter().filter(|f| is_page(f) || is_csv(f)) {
        let name = parse_notion_name(file_name(f));
        let is_csv = is_csv(f);
        if is_csv && VIEW_ID.is_match(&name.stem) {
            views.push(f.clone());
            continue;
        }
        let dir_key = strip_path_ids(parent_dir(f));
        let key = if dir_key.is_empty() { name.stem.clone() } else { format!("{dir_key}/{}", name.stem) };
        let existing = match &name.id {
            Some(id) => by_id.get(id).copied(),
            None => pages.iter().position(|p| p.id.is_none() && p.key.eq_ignore_ascii_case(&key) && (if is_csv { p.csv.is_none() } else { p.doc.is_none() })),
        };
        let i = existing.unwrap_or_else(|| {
            pages.push(NotionPage { doc: None, csv: None, id: name.id.clone(), key: key.clone(), title: String::new(), body: String::new(), html: None, rel: String::new(), rebuilt: false });
            pages.len() - 1
        });
        if let Some(id) = &name.id {
            by_id.insert(id.clone(), i);
        }
        by_path.insert(f.to_lowercase(), i);
        let page = &mut pages[i];
        if is_csv {
            if page.csv.is_none() || f.ends_with("_all.csv") {
                page.csv = Some(f.clone());
            }
        } else {
            page.doc = Some(f.clone());
        }
    }

    // 2. Titles: from the H1 when the file name mangled it (HTML pages always have the real one).
    for page in &mut pages {
        let stem = page.key.rsplit('/').next().unwrap_or(&page.key).to_string();
        match page.doc.as_ref().map(|doc| read_notion_text(&export.join(doc))) {
            Some(Some(text)) if html => {
                let mut parsed = notion_html::parse_page(&text);
                page.body = std::mem::take(&mut parsed.body);
                page.title = if !parsed.title.is_empty() { std::mem::take(&mut parsed.title) } else if stem.trim().is_empty() { "Untitled".into() } else { stem };
                page.html = Some(parsed);
            }
            Some(Some(text)) => {
                let (title, body) = split_title(&text, &stem);
                page.body = body.to_string();
                page.title = title;
            }
            Some(None) => {
                report.skipped.push(strip_path_ids(page.doc.as_deref().unwrap()));
                page.doc = None;
                page.title = if stem.trim().is_empty() { "Untitled".into() } else { stem };
            }
            None => page.title = if stem.trim().is_empty() { "Untitled".into() } else { stem },
        }
    }

    // 2b. Databases Notion left out of the export (e.g. one in a teamspace or page that wasn't
    //     included) whose rows are there: a folder of pages with no page of its own.
    let mut no_csv = rebuild_missing_databases(export, html, &views, &mut pages, &mut by_path);
    no_csv.extend(add_unexported_databases(html, &files, &mut pages, &mut by_id));

    // 3. Databases and their rows: CSV records matched to the row pages in the database's folder.
    let mut dbs: Vec<NotionDb> = vec![];
    for i in 0..pages.len() {
        let Some(csv_path) = pages[i].csv.clone() else { continue };
        let parsed = csv::ReaderBuilder::new().flexible(true).from_path(export.join(&csv_path)).ok().and_then(|mut reader| {
            let headers: Vec<String> = reader.headers().ok()?.iter().map(|h| h.trim_start_matches('\u{feff}').trim().to_string()).collect();
            let records: Vec<Vec<String>> = reader.records().filter_map(Result::ok).map(|r| r.iter().map(str::to_string).collect()).collect();
            (!headers.is_empty()).then_some((headers, records))
        });
        let Some((headers, records)) = parsed else {
            report.skipped.push(strip_path_ids(&csv_path));
            pages[i].csv = None;
            continue;
        };
        let mut candidates: Vec<usize> = (0..pages.len())
            .filter(|&j| j != i && pages[j].csv.is_none() && pages[j].doc.is_some() && parent_dir(&pages[j].key).eq_ignore_ascii_case(&pages[i].key))
            .collect();
        let mut rows = vec![];
        for (r, record) in records.iter().enumerate() {
            let name = record.first().map_or("", |s| s.trim());
            let found = candidates
                .iter()
                .position(|&j| pages[j].title == name)
                .or_else(|| candidates.iter().position(|&j| sanitize_title(&pages[j].title) == sanitize_title(name)));
            let page = found.map(|k| candidates.remove(k));
            rows.push((Some(r), page));
        }
        // Titles can differ between the CSV and the page (a link in the title is `http://mill.co` in
        // the CSV but `mill.co` in the page): pair what's left when one's letters contain the other's.
        for row in rows.iter_mut().filter(|(_, p)| p.is_none()) {
            let name = row.0.and_then(|r| records[r].first()).map_or("", |s| s.as_str());
            if let Some(k) = candidates.iter().position(|&j| loosely_same_title(&pages[j].title, name)) {
                row.1 = Some(candidates.remove(k));
            }
        }
        rows.extend(candidates.into_iter().map(|j| (None, Some(j))));
        dbs.push(NotionDb { page: i, headers, records, rows });
    }
    // Rebuilt databases with no CSV: the schema comes from the rows' property tables.
    for i in no_csv {
        let rows = (0..pages.len()).filter(|&j| j != i && pages[j].doc.is_some() && parent_dir(&pages[j].key).eq_ignore_ascii_case(&pages[i].key)).map(|j| (None, Some(j))).collect();
        dbs.push(NotionDb { page: i, headers: vec!["Name".into()], records: vec![], rows });
    }

    // 4. Workspace paths: parents first, so sub-pages land in their parent's (renamed) folder.
    let mut order: Vec<usize> = (0..pages.len()).collect();
    order.sort_by_cached_key(|&i| (pages[i].key.matches('/').count(), pages[i].doc.clone().or(pages[i].csv.clone())));
    let mut by_key: HashMap<String, usize> = HashMap::new();
    for &i in &order {
        by_key.entry(pages[i].key.to_lowercase()).or_insert(i);
    }
    let mut taken: HashSet<String> = HashSet::new();
    for &i in &order {
        let dir = dest_dir(parent_dir(&pages[i].key), &root_dir, &pages, &by_key);
        pages[i].rel = place(&dir, &pages[i].title, &mut taken);
    }
    // Rows with no page of their own.
    let mut row_rels: HashMap<(usize, usize), String> = HashMap::new();
    for (d, db) in dbs.iter().enumerate() {
        let dir = children_dir(&pages[db.page].rel).to_string();
        for &(r, p) in &db.rows {
            if let (Some(r), None) = (r, p) {
                let title = db.records[r].first().map(|s| s.trim()).filter(|s| !s.is_empty()).unwrap_or("Untitled");
                row_rels.insert((d, r), place(&dir, title, &mut taken));
            }
        }
    }
    for rel in pages.iter().map(|p| &p.rel).chain(row_rels.values()) {
        *title_count.entry(crate::vault::title_of(rel).to_lowercase()).or_default() += 1;
    }

    // 5. Attachments.
    let batch = format!("notion-{}", stamp());
    let mut used = HashSet::new();
    let mut assets = HashMap::new();
    for f in files.iter().filter(|f| !is_page(f) && !is_csv(f)) {
        if let Some(asset) = copy_asset(vault, &batch, &export.join(f), &strip_path_ids(f), &mut used) {
            assets.insert(f.to_lowercase(), asset);
            report.assets += 1;
        }
    }

    let ctx = NotionCtx { html, pages, by_path, by_id, assets, title_count };
    let orders = ctx.sibling_orders();
    let mut notes: Vec<String> = vec![];

    // 6. Databases: schema from the CSV (plus properties only the row pages have, e.g.
    //    relations), rows from the CSV merged with each row's own page.
    let mut written: HashSet<usize> = HashSet::new();
    // Row page -> its database, to tell which database a relation's links lead into.
    let row_db: HashMap<usize, usize> = dbs.iter().enumerate().flat_map(|(d, db)| db.rows.iter().filter_map(move |&(_, p)| Some((p?, d)))).collect();
    for (d, db) in dbs.iter().enumerate() {
        let page = &ctx.pages[db.page];
        let columns: HashSet<String> = db.headers.iter().cloned().collect();
        // Row page -> (properties, body).
        let mut row_pages: HashMap<usize, (Vec<(String, String)>, String)> = HashMap::new();
        let mut extra: Vec<String> = vec![];
        // HTML exports type each property and colour its options in every row page's header.
        let typed: Vec<&notion_html::HtmlProp> = db.rows.iter().filter_map(|&(_, p)| ctx.pages[p?].html.as_ref()).flat_map(|h| &h.props).collect();
        let hints = notion_html::property_hints(&typed);
        for &(_, p) in &db.rows {
            let Some(p) = p else { continue };
            let (props, rest) = match &ctx.pages[p].html {
                Some(h) => (h.props.iter().map(|x| (x.name.clone(), x.value.clone())).collect(), ctx.pages[p].body.as_str()),
                None => split_properties(&ctx.pages[p].body, &columns),
            };
            for (k, _) in &props {
                if !columns.contains(k) && !extra.contains(k) {
                    extra.push(k.clone());
                }
            }
            row_pages.insert(p, (props, rest.to_string()));
        }
        let names: Vec<String> = db.headers.iter().skip(1).chain(&extra).cloned().collect();
        // Raw value of every property for every row.
        let values: Vec<Vec<String>> = db
            .rows
            .iter()
            .map(|&(r, p)| {
                let props = p.and_then(|p| row_pages.get(&p)).map(|(props, _)| props.as_slice()).unwrap_or(&[]);
                names
                    .iter()
                    .map(|name| {
                        let from_csv = r.and_then(|r| db.headers.iter().position(|h| h == name).and_then(|c| db.records[r].get(c)));
                        match from_csv {
                            Some(v) => relation_text(v),
                            None => props.iter().find(|(k, _)| k == name).map(|(_, v)| relation_text(v)).unwrap_or_default(),
                        }
                    })
                    .collect()
            })
            .collect();
        // Pages each value links to (relations), per row and column; `None` when a link leads nowhere
        // in the export, or a value names pages without links.
        let csv_dir = parent_dir(page.csv.as_deref().unwrap_or(""));
        let linked: Vec<Vec<Option<Vec<usize>>>> = db
            .rows
            .iter()
            .enumerate()
            .map(|(k, &(r, p))| {
                let props = p.and_then(|p| row_pages.get(&p)).map(|(props, _)| props.as_slice()).unwrap_or(&[]);
                let doc_dir = p.map_or("", |p| parent_dir(ctx.pages[p].doc.as_deref().unwrap_or("")));
                names
                    .iter()
                    .enumerate()
                    .map(|(c, name)| {
                        let from_csv = r.is_some_and(|r| db.headers.iter().position(|h| h == name).is_some_and(|c| db.records[r].get(c).is_some()));
                        let html = p.and_then(|p| ctx.pages[p].html.as_ref()).and_then(|h| h.props.iter().find(|x| &x.name == name));
                        let links_in = |raw: &str| RELATION_LINK.captures_iter(raw).map(|m| m[1].to_string()).collect::<Vec<_>>();
                        let page_raw = props.iter().find(|(n, _)| n == name).map(|(_, v)| v.as_str()).unwrap_or("");
                        // The row page's links (HTML property table, or `Title (path.md)` text), else the CSV's.
                        let (urls, dir): (Vec<String>, &str) = match html {
                            Some(h) if h.kind == "relation" || !from_csv => (h.links.clone(), doc_dir),
                            _ if !links_in(page_raw).is_empty() => (links_in(page_raw), doc_dir),
                            _ => {
                                let raw = r.and_then(|r| db.headers.iter().position(|h| h == name).and_then(|c| db.records[r].get(c)));
                                (raw.map_or(vec![], |v| links_in(v)), csv_dir)
                            }
                        };
                        let pages: Option<Vec<usize>> = urls.iter().map(|u| match ctx.resolve(dir, u) {
                            Some(Target::Page(i)) => Some(i),
                            _ => None,
                        }).collect();
                        pages.filter(|ps| !ps.is_empty() || values[k][c].trim().is_empty())
                    })
                    .collect()
            })
            .collect();
        // A column whose every value links only to rows of one database relates to that database.
        let relation_to: Vec<Option<usize>> = (0..names.len())
            .map(|c| {
                let mut target = None;
                for row in &linked {
                    for i in row[c].as_ref()? {
                        let rd = *row_db.get(i)?;
                        if target.is_some_and(|t| t != rd) {
                            return None;
                        }
                        target = Some(rd);
                    }
                }
                target
            })
            .collect();
        let mut properties = vec![];
        let mut kinds = vec![];
        // Percent columns are stored as fractions (`12.6%` -> 0.126), as the app formats them.
        let mut percent = vec![];
        for (c, name) in names.iter().enumerate() {
            let col: Vec<&str> = values.iter().map(|v| v[c].as_str()).collect();
            let hint = hints.get(name);
            let kind = hint.and_then(|(k, _)| notion_html::property_type(k)).unwrap_or_else(|| infer_type(name, &col));
            let kind = if relation_to[c].is_some() { "relation" } else { kind };
            kinds.push(kind);
            let mut prop = json!({ "name": name, "type": kind });
            if let Some(rd) = relation_to[c] {
                prop["database"] = json!(format!("[[{}]]", children_dir(&ctx.pages[dbs[rd].page].rel)));
            }
            if matches!(kind, "select" | "status" | "multi_select") {
                let mut seen: Vec<&str> = vec![];
                // A single select's value is one option even when it contains ", ".
                let sep = if kind == "multi_select" { ", " } else { "\n" };
                for v in col.iter().flat_map(|v| v.split(sep)).map(str::trim).filter(|s| !s.is_empty()) {
                    if !seen.contains(&v) {
                        seen.push(v);
                    }
                }
                let colors = hint.map(|(_, c)| c);
                prop["options"] = json!(seen
                    .iter()
                    .enumerate()
                    .map(|(i, n)| json!({ "name": n, "color": colors.and_then(|c| c.get(*n)).map_or(PALETTE[i % PALETTE.len()], String::as_str) }))
                    .collect::<Vec<_>>());
            }
            let format = if kind == "number" { number_format(&col) } else { None };
            // A currency symbol could be part of the data in a Markdown export; `%` can't.
            if let Some(format) = format.filter(|f| hint.is_some() || *f == "percent") {
                prop["format"] = json!(format);
            }
            percent.push(format == Some("percent"));
            properties.push(prop);
        }
        let mut views = vec![json!({ "id": "table", "name": "Table", "type": "table" })];
        if let Some(status) = names.iter().zip(&kinds).find(|(_, k)| matches!(**k, "status" | "select")).map(|(h, _)| h) {
            views.push(json!({ "id": "board", "name": "Board", "type": "board", "groupBy": status }));
        }
        if let Some(date) = names.iter().zip(&kinds).find(|(_, k)| **k == "date").map(|(h, _)| h) {
            views.push(json!({ "id": "calendar", "name": "Calendar", "type": "calendar", "dateProperty": date }));
        }
        let mut schema = json!({ "properties": properties, "views": views });
        // Notion lets the title column have any name ("Source"); the app calls it "Name" unless told.
        if let Some(title) = db.headers.first().map(|h| h.trim()).filter(|h| !h.is_empty() && *h != "Name") {
            schema["title"] = json!(title);
        }
        let from_dir = parent_dir(page.doc.as_deref().or(page.csv.as_deref()).unwrap_or(""));
        let description = ctx.convert_body(&page.body, from_dir, Some(db.page), &mut notes);
        let body = format!(
            "{}```database\n{}\n```\n",
            if description.is_empty() { String::new() } else { format!("{description}\n\n") },
            serde_json::to_string_pretty(&schema).unwrap()
        );
        write_note(vault, &page.rel, &format!("---\ntype: database\n{}---\n{body}", ctx.page_frontmatter(db.page, orders.get(&db.page).copied())))?;
        written.insert(db.page);
        report.databases += 1;

        for (k, &(r, p)) in db.rows.iter().enumerate() {
            // Rows keep the CSV's order (the database's view order), unless a column is called "order".
            let order = r.map(|r| r + 1).filter(|_| !names.iter().any(|n| n.eq_ignore_ascii_case("order")));
            let mut fm = match p {
                Some(p) => ctx.page_frontmatter(p, order),
                None => order.map_or(String::new(), |o| format!("order: {o}\n")),
            };
            for (c, name) in names.iter().enumerate() {
                let value = match &linked[k][c] {
                    Some(pages) if relation_to[c].is_some() => {
                        (!pages.is_empty()).then(|| json!(pages.iter().map(|&i| format!("[[{}]]", ctx.link_target(i))).collect::<Vec<_>>()))
                    }
                    _ => convert_value(kinds[c], &values[k][c]).map(|v| if percent[c] { as_fraction(v) } else { v }),
                };
                if let Some(v) = value {
                    fm.push_str(&format!("{}: {}\n", yaml_key(name), yaml_scalar(&v)));
                }
            }
            let (rel, body) = match p {
                Some(p) => {
                    let rest = row_pages.get(&p).map_or("", |(_, rest)| rest.as_str());
                    let doc = ctx.pages[p].doc.as_deref().unwrap_or("");
                    written.insert(p);
                    (ctx.pages[p].rel.clone(), ctx.convert_body(rest, parent_dir(doc), Some(p), &mut notes))
                }
                None => (row_rels[&(d, r.unwrap_or_default())].clone(), String::new()),
            };
            let content = if fm.is_empty() { with_newline(body) } else { format!("---\n{fm}---\n{}", with_newline(body)) };
            write_note(vault, &rel, &content)?;
            report.pages += 1;
        }
    }

    // 7. Regular pages.
    for (i, page) in ctx.pages.iter().enumerate() {
        let Some(doc) = &page.doc else { continue };
        if written.contains(&i) {
            continue;
        }
        let body = with_newline(ctx.convert_body(&page.body, parent_dir(doc), Some(i), &mut notes));
        let fm = ctx.page_frontmatter(i, orders.get(&i).copied());
        write_note(vault, &page.rel, &if fm.is_empty() { body } else { format!("---\n{fm}---\n{body}") })?;
        report.pages += 1;
    }
    notes.sort();
    notes.dedup();
    report.skipped.extend(notes);

    // 8. Web images (Notion's cover gallery, icons and images hosted elsewhere): downloaded into the
    //    workspace, so the pages are fully local and don't call out to those servers.
    if let Some(fetch) = fetch {
        let done = remote_images::localize(&vault.join(&root_dir), fetch, |name, bytes, _| store_asset(vault, &batch, bytes, name, &mut used));
        report.assets += done.downloaded;
        if !done.failed.is_empty() {
            let n = done.failed.len();
            report.skipped.push(format!("{n} web image{} couldn't be downloaded, so {} still load from the web", if n == 1 { "" } else { "s" }, if n == 1 { "it will" } else { "they" }));
        }
    }
    Ok(report)
}

/// The number format of a currency or percent column (`₹1,000` -> rupee, `12.6%` -> percent).
fn number_format(values: &[&str]) -> Option<&'static str> {
    let filled: Vec<&str> = values.iter().map(|v| v.trim()).filter(|v| !v.is_empty()).collect();
    if !filled.is_empty() && filled.iter().all(|v| v.ends_with('%')) {
        return Some("percent");
    }
    let first = filled.first()?.chars().next()?;
    let format = match first {
        '₹' => "rupee",
        '$' => "dollar",
        '€' => "euro",
        '£' => "pound",
        '¥' => "yen",
        _ => return None,
    };
    filled.iter().all(|v| v.starts_with(first)).then_some(format)
}

/// A percentage as the fraction the app stores (`12.6` -> 0.126), without float noise.
fn as_fraction(v: Value) -> Value {
    match v.as_f64() {
        Some(n) => json!(((n / 100.0) * 1e12).round() / 1e12),
        None => v,
    }
}

/// Page files end with exactly one newline; an empty page is an empty file.
fn with_newline(s: String) -> String {
    let s = s.trim_end().to_string();
    if s.is_empty() { s } else { s + "\n" }
}

fn file_name(p: &str) -> &str {
    p.rsplit('/').next().unwrap_or(p)
}

fn parent_dir(p: &str) -> &str {
    p.rsplit_once('/').map_or("", |(d, _)| d)
}

/// Strips ids from every path component and drops the wrapper / id-only folders.
fn strip_path_ids(p: &str) -> String {
    p.split('/').map(strip_notion_id).filter(|s| !s.is_empty()).collect::<Vec<_>>().join("/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn parses_notion_dates_and_types() {
        assert_eq!(notion_date("October 4, 2026").as_deref(), Some("2026-10-04"));
        assert_eq!(notion_date("Oct 4, 2026 3:00 PM").as_deref(), Some("2026-10-04"));
        assert_eq!(notion_date("2026/10/04").as_deref(), Some("2026-10-04"));
        assert_eq!(notion_date("October 4, 2026 → October 6, 2026").as_deref(), Some("2026-10-04"));
        assert_eq!(infer_type("Done", &["Yes", "No", ""]), "checkbox");
        assert_eq!(infer_type("Points", &["3", "5", "1,200"]), "number");
        assert_eq!(infer_type("Status", &["Done", "Todo", "Done"]), "status");
        assert_eq!(infer_type("Tags", &["a, b", "b", "a"]), "multi_select");
        assert_eq!(infer_type("Notes", &["long unique text one", "another different note", "third thing written here", "fourth"]), "text");
        assert_eq!(number_format(&["", "12.6%", "8%"]), Some("percent"));
        assert_eq!(number_format(&["₹835,000.00", ""]), Some("rupee"));
        assert_eq!(number_format(&["12.6%", "3"]), None);
        assert_eq!(as_fraction(json!(12.6)), json!(0.126));
        assert_eq!(as_fraction(json!(7)), json!(0.07));
    }

    #[test]
    fn converts_obsidian_callouts() {
        assert_eq!(convert_callouts("> [!warning] Careful\n> body"), "> [!yellow] ⚠️\n> **Careful**\n> body");
        assert_eq!(convert_callouts("> [!note]-\n> x"), "> [!blue] 📝\n> x");
        assert_eq!(convert_callouts("> [!gray] 💡\n> keep"), "> [!gray] 💡\n> keep");
    }

    #[test]
    fn imports_an_obsidian_vault_end_to_end() {
        let base = std::env::temp_dir().join(format!("bg-obsidian-{}", stamp()));
        let src = base.join("My Vault");
        let ws = base.join("ws");
        fs::create_dir_all(src.join(".obsidian")).unwrap();
        fs::create_dir_all(src.join("Projects/attachments")).unwrap();
        fs::create_dir_all(&ws).unwrap();
        fs::write(src.join(".obsidian/app.json"), "{}").unwrap();
        fs::write(src.join("Projects/attachments/diagram.png"), b"png").unwrap();
        fs::write(src.join("Projects/Plan.md"), "---\ntags: [work]\n---\nSee [[Ideas]].\n\n![[diagram.png|300]]\n\n> [!tip] Remember\n> Ship it\n").unwrap();
        fs::write(src.join("Ideas.md"), "- one\n").unwrap();

        let report = import_obsidian(&ws, &src).unwrap();
        assert_eq!((report.pages, report.assets), (2, 1));
        assert!(!ws.join("My Vault/.obsidian").exists());
        let plan = fs::read_to_string(ws.join("My Vault/Projects/Plan.md")).unwrap();
        assert!(plan.starts_with("---\ntags: [work]\n---\nSee [[Ideas]]."), "{plan}");
        assert!(plan.contains("![diagram.png](.assets/obsidian-"), "{plan}");
        assert!(plan.contains("> [!green] 💡\n> **Remember**\n> Ship it"), "{plan}");
        let _ = fs::remove_dir_all(&base);
    }

    // ---------------------------------------------------------------- Notion

    const ID_A: &str = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";

    #[test]
    fn strips_notion_ids() {
        assert_eq!(strip_notion_id(&format!("Project Plan {ID_A}.md")), "Project Plan.md");
        assert_eq!(strip_notion_id(&format!("Tasks {ID_A}_all.csv")), "Tasks.csv");
        assert_eq!(strip_notion_id(&format!("Folder {ID_A}")), "Folder");
        assert_eq!(strip_notion_id("Plain name.md"), "Plain name.md");
        assert_eq!(strip_notion_id("v2.0 notes"), "v2.0 notes");
        // Teamspace folders named only by an id, and the export wrapper, disappear.
        assert_eq!(strip_notion_id(ID_A), "");
        assert_eq!(strip_notion_id("Export-0f1e2d3c-4b5a-4968-8776-655443322110"), "");
        assert_eq!(
            strip_path_ids(&format!("Export-0f1e2d3c-4b5a-4968-8776-655443322110/Team/{ID_A}/Page {ID_A}.md")),
            "Team/Page.md"
        );
        // Linked views keep their short id: they are not pages.
        assert!(VIEW_ID.is_match(&parse_notion_name("Untitled a1b2-eda5_all.csv").stem));
    }

    #[test]
    fn rebuilds_multi_line_table_cells() {
        let notion = "Intro\n\n| Products | Services |\n| --- | --- |\n| **Desktop**\n\n**The control center.** \nBuilt for devs. | **Software**\n\nEnd-to-end. |\n|  | **Gigs**  \n  • one\n  • two |\n\nAfter";
        let expected = "Intro\n\n\
            | Products                                                      | Services                        |\n\
            | ------------------------------------------------------------- | ------------------------------- |\n\
            | **Desktop**<br><br>**The control center.**<br>Built for devs. | **Software**<br><br>End-to-end. |\n\
            |                                                               | **Gigs**<br>• one<br>• two      |\n\nAfter";
        assert_eq!(pad_tables(&rebuild_tables(notion)), expected);
    }

    #[test]
    fn table_padding_matches_the_editor() {
        assert_eq!(pad_tables("| a | b |\n| --- | --- |\n| x<br>y | z |"), "| a      | b   |\n| ------ | --- |\n| x<br>y | z   |");
        // UTF-16 widths, like JavaScript's String.length (the emoji counts twice).
        assert_eq!(pad_tables("| 名前 | é |\n| --- | --- |\n| 日本語 | 💡x |"), "| 名前  | é   |\n| --- | --- |\n| 日本語 | 💡x |");
        // Escaped pipes and pipes in code are not cell boundaries; code pipes get escaped.
        assert_eq!(pad_tables("| a | b |\n| --- | --- |\n| `x|y` | 1 \\| 2 |"), "| a      | b      |\n| ------ | ------ |\n| `x\\|y` | 1 \\| 2 |");
        // Tables in code fences are left alone.
        assert_eq!(pad_tables("```\n| a | b |\n| --- | --- |\n```"), "```\n| a | b |\n| --- | --- |\n```");
        assert_eq!(rebuild_tables("```\n| a |\n| --- |\n| b\nc |\n```"), "```\n| a |\n| --- |\n| b\nc |\n```");
    }

    #[test]
    fn a_broken_table_row_is_left_alone() {
        let text = "| a | b |\n| --- | --- |\n| 1 | 2 |\n| unfinished\n\nmore text";
        assert_eq!(rebuild_tables(text), "| a | b |\n| --- | --- |\n| 1 | 2 |\n| unfinished\n\nmore text");
    }

    #[test]
    fn converts_asides_to_callouts() {
        assert_eq!(convert_asides("<aside>\n\nControl center.\n\n</aside>"), "> [!gray] 💡\n> Control center.");
        assert_eq!(convert_asides("<aside>\n✏️ Your private space.\n\n</aside>"), "> [!gray] ✏️\n> Your private space.");
        assert_eq!(
            convert_asides("<aside>\n📢\n\n- one\n- two\n\nSecond paragraph.\n</aside>"),
            "> [!gray] 📢\n> - one\n> - two\n>\n> Second paragraph."
        );
        assert_eq!(
            convert_asides("<aside>\n<img src=\"https://app.notion.com/icons/notion_yellow.svg\" alt=\"x\" width=\"40px\" />\n\n**Tip**\n\n</aside>"),
            "> [!yellow] 💡\n> **Tip**"
        );
        assert_eq!(convert_asides("<aside>\n</aside>"), "> [!gray] 💡\n>");
        assert_eq!(convert_asides("```\n<aside>\n```"), "```\n<aside>\n```");
        assert_eq!(leading_emoji("👩‍💻 text"), Some(("👩‍💻", "text")));
        assert_eq!(leading_emoji("→ not an icon"), None);
    }

    #[test]
    fn reindents_notion_lists() {
        assert_eq!(reindent_lists("- a\n    - b\n        - c\n- d"), "- a\n  - b\n    - c\n- d");
        assert_eq!(reindent_lists("1. a\n    - b\n2. c"), "1. a\n   - b\n2. c");
        assert_eq!(reindent_lists("- [x]  done\n    - [ ]  sub\n- [ ] "), "- [x] done\n  - [ ] sub\n- [ ] ");
        // Empty bullets can't be represented by the editor; ones with children stay.
        assert_eq!(reindent_lists("- \n- a\n-\n    - child"), "- a\n-\n  - child");
        // Code fences inside list items move with them.
        assert_eq!(reindent_lists("- a\n    \n    ```\n    code\n      more\n    ```\nAfter"), "- a\n\n  ```\n  code\n    more\n  ```\nAfter");
        assert_eq!(reindent_lists("Para\n\n    indented"), "Para\n\n    indented");
        // A to-do list followed by a bullet list needs a blank line; one list needs none.
        assert_eq!(reindent_lists("- [ ] task\n- bullet\n    - child\n\n- next"), "- [ ] task\n\n- bullet\n  - child\n- next");
        assert_eq!(reindent_lists("- bullet\n- \n- [ ]  task"), "- bullet\n\n- [ ] task");
    }

    #[test]
    fn tidies_quotes_and_trailing_spaces() {
        assert_eq!(tidy_markdown("> a\n>\n>\n> b\n>\n\nAfter"), "> a\n>\n> b\n\nAfter");
        assert_eq!(tidy_markdown("> [!gray] 💡\n>"), "> [!gray] 💡\n>");
        assert_eq!(tidy_markdown("> [!gray] 💡\n>\n> text"), "> [!gray] 💡\n> text");
        assert_eq!(tidy_markdown("one \ntwo   \nthree  \n\n- item \n```\nkeep \n```"), "one\ntwo  \nthree\n\n- item\n```\nkeep \n```");
    }

    #[test]
    fn unbolds_headings() {
        assert_eq!(unbold_headings("### **Domains**\n# **A** and **B**\n```\n## **kept**\n```"), "### Domains\n# **A** and **B**\n```\n## **kept**\n```");
    }

    #[test]
    fn takes_titles_from_the_h1_when_the_file_name_mangled_them() {
        assert_eq!(split_title("# @May 6, 2026 4:09 PM\n\nBody", "@May 6, 2026 4 09 PM"), ("@May 6, 2026 4:09 PM".into(), "Body"));
        assert_eq!(split_title("# Migrate site.in now\n", "Migrate site in now").0, "Migrate site.in now");
        let long = "Plan to Monetize Silicon Mulation in the Next 6 Months";
        assert_eq!(split_title(&format!("# {long}\n"), &long[..50]).0, long);
        // An unrelated H1 stays in the body.
        assert_eq!(split_title("# Something else\n\nBody", "Page"), ("Page".into(), "# Something else\n\nBody"));
        assert_eq!(sanitize_title("@May 6, 2026 4:09 PM"), "@May 6, 2026 4 09 PM");
    }

    #[test]
    fn splits_row_properties() {
        let cols: HashSet<String> = ["Name", "Status", "How did we connect?"].iter().map(|s| s.to_string()).collect();
        let (props, rest) = split_properties("Status: Done\nHow did we connect?: Twitter\nEmail: a@b.c\n\nThe body.", &cols);
        assert_eq!(props.len(), 3);
        assert_eq!(props[1], ("How did we connect?".to_string(), "Twitter".to_string()));
        assert_eq!(rest, "The body.");
        // The file may end right after the properties.
        assert_eq!(split_properties("Status: Planned", &cols), (vec![("Status".into(), "Planned".into())], ""));
        // Text that merely looks like a property is kept.
        assert_eq!(split_properties("Note: nothing\n\nBody", &cols).1, "Note: nothing\n\nBody");
        assert_eq!(relation_text("Agile Coder (../Products/Agile%20Coder%201a2b.md), Ch 1 (1950) (../x/Ch%201%20(1950)%201a.md)"), "Agile Coder, Ch 1 (1950)");
    }

    #[test]
    fn parses_links_with_parentheses() {
        let line = "See [Ch 1](Indian%20History/Chapter%201%20(1950%20-%20present)%20abc.md) and `[x](y)` and ![i](a.png).";
        let mut seen = vec![];
        let out = replace_links(line, |image, label, url| {
            seen.push((image, label.to_string(), url.to_string()));
            Some(format!("<{label}>"))
        });
        assert_eq!(out, "See <Ch 1> and `[x](y)` and <i>.");
        assert_eq!(seen[0].2, "Indian%20History/Chapter%201%20(1950%20-%20present)%20abc.md");
        assert!(seen[1].0);
        assert_eq!(solo_link("[Untitled](../../Untitled%20a1b2-eda5_all.csv)"), Some(("Untitled", "../../Untitled%20a1b2-eda5_all.csv")));
        assert_eq!(solo_link("[a](b) more"), None);
        // Notion cut the name off inside parentheses: `(60` is never closed.
        let cut = "[Ch 6: Ancient (600 BCE)](Indian%20History/Chapter%206%20Ancient%20(60%203b082ddb9d1d8050a87fea012f798fdf.md) and (more)";
        assert_eq!(parse_link_at(cut, 0).map(|(_, _, url)| url), Some("Indian%20History/Chapter%206%20Ancient%20(60%203b082ddb9d1d8050a87fea012f798fdf.md"));
        assert_eq!(parse_link_at("[a](b%20(60.md) x)", 0).map(|(_, _, url)| url), Some("b%20(60.md"));
        assert_eq!(parse_link_at("[a](b", 0), None);
    }

    #[test]
    fn matches_rows_whose_csv_title_differs() {
        assert!(loosely_same_title("Migrate site.in to a new site", "Migrate http://site.in to a new site"));
        assert!(!loosely_same_title("Write docs", "Ship it"));
    }

    #[test]
    fn caps_long_asset_names() {
        let base = std::env::temp_dir().join(format!("bg-asset-{}", stamp()));
        fs::create_dir_all(&base).unwrap();
        let src = base.join("a.pdf");
        fs::write(&src, "pdf").unwrap();
        let hint = format!("Team/Resources/{}.pdf", "Very_long_name_".repeat(20));
        let asset = copy_asset(&base, "b", &src, &hint, &mut HashSet::new()).unwrap();
        let name = asset.rsplit('/').next().unwrap();
        assert!(name.len() <= 120 && name.starts_with("Team-Resources-Very_long_name") && name.ends_with(".pdf"), "{name}");
        assert!(base.join(&asset).exists());
        let _ = fs::remove_dir_all(&base);
    }

    const TASKS_ID: &str = "a1b2c3d4e5f68001a630e6beb4d8eda5";
    const ROW_ID: &str = "a1b2c3d4e5f680a0a07fda4f186496f5";
    const LAUNCH_ID: &str = "a1b2c3d4e5f680aeaccacfe80d6443a1";

    /// A small export with every Notion quirk the importer handles.
    fn synthetic_export(export: &Path) {
        let root = export.join("Export-11111111-2222-3333-4444-555555555555");
        let team = root.join("Team HQ/a1b2c3d4e5f68157901f00426f19e90d");
        let private = root.join("Private & Shared");
        for dir in [team.join("Tasks"), private.join("Notes")] {
            fs::create_dir_all(dir).unwrap();
        }
        let w = |p: PathBuf, s: &str| fs::write(p, s).unwrap();
        // A linked view of Tasks (first/last 4 hex digits of its id) sits next to the teamspaces.
        w(root.join("Untitled a1b2-eda5_all.csv"), "\u{feff}Name,Status\nWrite docs,Done\n");
        w(
            team.join(format!("HQ {ID_A}.md")),
            "# HQ\n\n<aside>\n\nControl center for everything.\n\n</aside>\n\n[Untitled](../../Untitled%20a1b2-eda5_all.csv)\n\nfilters: \nStatus\n\n### **Domains**\n\n| Products | Services |\n| --- | --- |\n| **Desktop**\n\n**The control center.** \nBuilt for devs. | **Software**\n\nEnd-to-end, see [Launch](Launch%20a1b2c3d4e5f680aeaccacfe80d6443a1.md). |\n|  | **Gigs** |\n\nOpen [the tasks](Tasks%20a1b2c3d4e5f68001a630e6beb4d8eda5_all.csv) or a [view](../../Untitled%20a1b2-eda5_all.csv) inline.\n",
        );
        w(team.join(format!("Launch {LAUNCH_ID}.md")), "# Launch\n\nShip it.");
        w(
            team.join(format!("Tasks {TASKS_ID}.md")),
            &format!("# Tasks\n\n[Tasks](Tasks%20{TASKS_ID}_all.csv)\n\nfilters: \nStatus\nsort: \nName: ascending"),
        );
        w(
            team.join(format!("Tasks {TASKS_ID}_all.csv")),
            "\u{feff}Name,Status,Due Date,Done?\nWrite docs,Done,\"October 4, 2026\",Yes\nPlan v2.0,Todo,,No\nShip it,Todo,,No\n",
        );
        w(
            team.join(format!("Tasks/Write docs {ROW_ID}.md")),
            &format!("# Write docs\n\nStatus: Done\nDue Date: October 4, 2026\nDone?: Yes\nProject: Launch (../Launch%20{LAUNCH_ID}.md)\n\nThe body.\n"),
        );
        w(team.join("Tasks/Plan v2 0 a1b2c3d4e5f680939507d4e6afb140dc.md"), "# Plan v2.0\n\nStatus: Todo\nDone?: No");
        let libraries = ["61282ddb9d1d839f920701e22794d169", "85782ddb9d1d832e9945019b5228cc18", "d8282ddb9d1d8269943c010adf52f0f8"];
        for id in libraries {
            w(private.join(format!("Library {id}.md")), &format!("# Library\n\n[Library](Library%20{id}.csv)"));
        }
        w(private.join("@May 6, 2026 4 09 PM c0ffee00c0ffee00c0ffee00c0ffee01.md"), "# @May 6, 2026 4:09 PM\n\nMeeting notes.\n");
        w(private.join("Chapter 1 Intro (1950 - now) 3b082ddb9d1d80d1a1b2dd745ede8381.md"), "# Chapter 1: Intro (1950 - now)\n\nText.\n");
        w(private.join("Notes/image.png"), "png");
        // Sub-pages, linked from their parent out of alphabetical order (one not linked at all).
        w(private.join("Notes/Zeta a1b2c3d4e5f680000000000000000001.md"), "# Zeta\n\nZ.\n");
        w(private.join("Notes/Alpha a1b2c3d4e5f680000000000000000002.md"), "# Alpha\n\nA.\n");
        w(private.join("Notes/Beta a1b2c3d4e5f680000000000000000003.md"), "# Beta\n\nB.\n");
        w(private.join("Notes/Contract.pdf"), "pdf");
        w(
            private.join("Notes 3ed82ddb9d1d80abbd04d236c669be4b.md"),
            &format!(
                "# Notes\n\n<aside>\n💡 Tip with a list:\n\n- one\n    - nested\n\n</aside>\n\n- [x]  done\n- [ ]  todo\n    - [ ]  sub\n\n1. first\n    1. inner\n\n```bash\n| not | a table |\n```\n\n![image.png](Notes/image.png)\n\n[Contract.pdf](Notes/Contract.pdf)\n\n---\n\n[Zeta](Notes/Zeta%20a1b2c3d4e5f680000000000000000001.md)\n\n[Alpha](Notes/Alpha%20a1b2c3d4e5f680000000000000000002.md) and [Zeta](Notes/Zeta%20a1b2c3d4e5f680000000000000000001.md) again\n\nSee [Library](Library%20{}.md), [Chapter 1: Intro (1950 - now)](Chapter%201%20Intro%20(1950%20-%20now)%203b082ddb9d1d80d1a1b2dd745ede8381.md) and [Gone](Gone%20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md).\n",
                libraries[1]
            ),
        );
    }

    fn import_synthetic(name: &str) -> (PathBuf, PathBuf, ImportReport) {
        let base = std::env::temp_dir().join(format!("bg-notion-{name}-{}", stamp()));
        let export = base.join("export");
        let ws = base.join("ws");
        fs::create_dir_all(&ws).unwrap();
        synthetic_export(&export);
        let report = import_notion_with(&ws, &export, None).unwrap();
        (base, ws.join("Notion import"), report)
    }

    #[test]
    fn imports_a_notion_export_end_to_end() {
        let (base, out, report) = import_synthetic("e2e");
        let read = |p: &str| fs::read_to_string(out.join(p)).unwrap_or_else(|_| panic!("missing {p}"));
        assert_eq!((report.pages, report.databases, report.assets), (14, 1, 2), "{:?}", report.skipped);
        assert!(report.skipped.is_empty(), "{:?}", report.skipped);

        // No Export-… wrapper or id-only folder: teamspaces sit right under the import page.
        let mut tree: Vec<String> = WalkDir::new(&out).into_iter().filter_map(Result::ok).map(|e| e.path().strip_prefix(&out).unwrap().to_string_lossy().into_owned()).collect();
        tree.sort();
        assert!(tree.iter().all(|p| !p.contains("Export-") && !p.contains("a1b2c3d4e5f68157")), "{tree:#?}");

        let hq = read("Team HQ/HQ.md");
        assert!(hq.starts_with("> [!gray] 💡\n> Control center for everything.\n\n![[Tasks]]\n\n### Domains\n\n| Products"), "{hq}");
        assert!(!hq.contains("filters:") && !hq.contains(".csv") && !hq.contains("%20"), "{hq}");
        assert!(hq.contains("| **Desktop**<br><br>**The control center.**<br>Built for devs. | **Software**<br><br>End-to-end, see [[Launch]]. |"), "{hq}");
        assert!(hq.contains("Open [[Tasks|the tasks]] or a [[Tasks|view]] inline."), "{hq}");

        let db = read("Team HQ/Tasks.md");
        assert!(db.starts_with("---\ntype: database\n---\n```database"), "{db}");
        assert!(db.contains("\"type\": \"status\"") && db.contains("\"type\": \"checkbox\"") && db.contains("\"name\": \"Project\""), "{db}");
        // Row values come from the CSV; the property block is gone from the body; relations become text.
        // Rows are ordered like the CSV (Notion's view order).
        assert_eq!(read("Team HQ/Tasks/Write docs.md"), "---\norder: 1\nStatus: Done\nDue Date: 2026-10-04\n\"Done?\": true\nProject: Launch\n---\nThe body.\n");
        assert_eq!(read("Team HQ/Tasks/Plan v2.0.md"), "---\norder: 2\nStatus: Todo\n\"Done?\": false\n---\n");
        assert_eq!(read("Team HQ/Tasks/Ship it.md"), "---\norder: 3\nStatus: Todo\n\"Done?\": false\n---\n");

        // Sub-pages are ordered as their parent lists them; unlisted ones (and top-level pages,
        // which have no parent page) get no order.
        assert_eq!(read("Private & Shared/Notes/Zeta.md"), "---\norder: 1\n---\nZ.\n");
        assert_eq!(read("Private & Shared/Notes/Alpha.md"), "---\norder: 2\n---\nA.\n");
        assert_eq!(read("Private & Shared/Notes/Beta.md"), "B.\n");
        assert!(!read("Team HQ/Launch.md").contains("order:"));

        // Same-named pages get distinct titles, and links go to the right one.
        for p in ["Library.md", "Library 2.md", "Library 3.md"] {
            assert_eq!(read(&format!("Private & Shared/{p}")), "", "{p} keeps no self-link");
        }
        let notes = read("Private & Shared/Notes.md");
        assert!(notes.contains("See [[Library 2|Library]], [[Chapter 1 Intro (1950 - now)|Chapter 1: Intro (1950 - now)]] and Gone."), "{notes}");
        assert!(notes.starts_with("> [!gray] 💡\n> Tip with a list:\n>\n> - one\n>   - nested\n\n- [x] done\n- [ ] todo\n  - [ ] sub\n\n1. first\n   1. inner\n\n```bash\n| not | a table |\n```"), "{notes}");
        assert!(notes.contains("![image.png](.assets/notion-") && notes.contains("[Contract.pdf](.assets/notion-") && notes.contains("\n---\n"), "{notes}");

        // Titles come from the H1 (sanitised for the file system) when the file name mangled it.
        assert_eq!(read("Private & Shared/@May 6, 2026 4 09 PM.md"), "Meeting notes.\n");
        assert_eq!(read("Private & Shared/Chapter 1 Intro (1950 - now).md"), "Text.\n");
        assert!(!out.join("Untitled.md").exists(), "the linked view is not imported as a database");
        let _ = fs::remove_dir_all(&base);
    }

    /// A relation whose links all lead to rows of another imported database becomes a relation
    /// to it, with `[[Title]]` links as values; one that leads to plain pages stays text.
    #[test]
    fn imports_relations_between_databases() {
        let base = std::env::temp_dir().join(format!("bg-notion-relations-{}", stamp()));
        let (export, ws) = (base.join("export"), base.join("ws"));
        let team = export.join("Team");
        for dir in [team.join("Products"), team.join("Tasks"), ws.clone()] {
            fs::create_dir_all(dir).unwrap();
        }
        let w = |p: PathBuf, s: &str| fs::write(p, s).unwrap();
        let (products, khao, axon) = ("aaaa0000000000000000000000000001", "aaaa0000000000000000000000000002", "aaaa0000000000000000000000000003");
        let (tasks, design, build, note) = ("bbbb0000000000000000000000000001", "bbbb0000000000000000000000000002", "bbbb0000000000000000000000000003", "cccc0000000000000000000000000001");
        w(team.join(format!("Products {products}.md")), &format!("# Products\n\n[Products](Products%20{products}.csv)\n"));
        w(team.join(format!("Products {products}.csv")), "\u{feff}Name\nKhao\nAxon\n");
        w(team.join(format!("Products/Khao {khao}.md")), "# Khao\n");
        w(team.join(format!("Products/Axon {axon}.md")), "# Axon\n");
        w(team.join(format!("Note {note}.md")), "# Note\n");
        w(team.join(format!("Tasks {tasks}.md")), &format!("# Tasks\n\n[Tasks](Tasks%20{tasks}.csv)\n"));
        w(
            team.join(format!("Tasks {tasks}.csv")),
            &format!("\u{feff}Name,Product,See\nDesign,Khao (Products/Khao%20{khao}.md),Note (Note%20{note}.md)\nBuild,\"Khao (Products/Khao%20{khao}.md), Axon (Products/Axon%20{axon}.md)\",\n"),
        );
        w(team.join(format!("Tasks/Design {design}.md")), &format!("# Design\n\nProduct: Khao (../Products/Khao%20{khao}.md)\nSee: Note (../Note%20{note}.md)\n"));
        w(team.join(format!("Tasks/Build {build}.md")), &format!("# Build\n\nProduct: Khao (../Products/Khao%20{khao}.md), Axon (../Products/Axon%20{axon}.md)\n"));
        import_notion_with(&ws, &export, None).unwrap();
        let read = |p: &str| fs::read_to_string(ws.join("Notion import").join(p)).unwrap_or_else(|_| panic!("missing {p}"));

        let db = read("Team/Tasks.md");
        let schema: Value = serde_json::from_str(db.split("```database\n").nth(1).unwrap().split("\n```").next().unwrap()).unwrap();
        let prop = |n: &str| schema["properties"].as_array().unwrap().iter().find(|p| p["name"] == n).unwrap().clone();
        assert_eq!(prop("Product"), json!({ "name": "Product", "type": "relation", "database": "[[Notion import/Team/Products]]" }));
        assert_ne!(prop("See")["type"], "relation", "links to a plain page stay names");
        assert!(read("Team/Tasks/Design.md").contains("Product: [\"[[Khao]]\"]\nSee: Note\n"), "{}", read("Team/Tasks/Design.md"));
        assert!(read("Team/Tasks/Build.md").contains("Product: [\"[[Khao]]\", \"[[Axon]]\"]\n"), "{}", read("Team/Tasks/Build.md"));
        let _ = fs::remove_dir_all(&base);
    }

    /// Compares imported pages with checked-in fixtures (`tests/markdown.test.mjs` asserts the
    /// editor saves every one of them back unchanged). `UPDATE_FIXTURES=1` rewrites them.
    fn check_fixtures(out: &Path, dir: &str) {
        let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures").join(dir);
        let stamp = Regex::new(r"\.assets/notion-\d+/").unwrap();
        let pages: BTreeMap<String, String> = WalkDir::new(out)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "md"))
            .map(|e| {
                let rel = e.path().strip_prefix(out).unwrap().to_string_lossy().replace('\\', "/");
                (rel, stamp.replace_all(&fs::read_to_string(e.path()).unwrap(), ".assets/notion-0/").into_owned())
            })
            .collect();
        if std::env::var_os("UPDATE_FIXTURES").is_some() {
            let _ = fs::remove_dir_all(&fixtures);
            for (rel, text) in &pages {
                let p = fixtures.join(rel);
                fs::create_dir_all(p.parent().unwrap()).unwrap();
                fs::write(p, text).unwrap();
            }
        }
        for (rel, text) in &pages {
            let want = fs::read_to_string(fixtures.join(rel)).unwrap_or_else(|_| panic!("no fixture for {rel}; run with UPDATE_FIXTURES=1"));
            assert_eq!(text, &want, "{rel}");
        }
        let checked_in = WalkDir::new(&fixtures).into_iter().filter_map(Result::ok).filter(|e| e.path().extension().is_some_and(|x| x == "md")).count();
        assert_eq!(checked_in, pages.len(), "stale fixtures in {dir}; run with UPDATE_FIXTURES=1");
    }

    /// The synthetic Markdown export's imported pages, checked in as fixtures. Regenerate with
    /// `UPDATE_FIXTURES=1 cargo test notion_import_fixture`.
    #[test]
    fn notion_import_fixture() {
        let (base, out, _) = import_synthetic("fixture");
        check_fixtures(&out, "notion-import");
        let _ = fs::remove_dir_all(&base);
    }

    // ---------------------------------------------------------------- Notion HTML export

    /// A Notion HTML page: header (cover, icon, title, properties) and body.
    fn html_page(title: &str, header: &str, props: &str, body: &str) -> String {
        let props = if props.is_empty() { String::new() } else { format!(r#"<table class="properties"><tbody>{props}</tbody></table>"#) };
        format!(
            r#"<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><title>{title}</title><style>.highlight-teal {{ color: green; }}</style></head><body><article id="x" class="page sans"><header>{header}<h1 class="page-title" dir="auto">{title}</h1><p class="page-description" dir="auto"></p>{props}</header><div class="page-body">{body}</div></article><span class="sans" style="font-size:14px;padding-top:2em"></span></body></html>"#
        )
    }

    fn prop(kind: &str, name: &str, td: &str) -> String {
        format!(r#"<tr class="property-row property-row-{kind}"><th><span class="icon property-icon"><img src="https://app.notion.com/icons/burst_gray.svg" style="width:14px;height:14px;display:block"/></span>{name}</th><td>{td}</td></tr>"#)
    }

    fn builtin(name: &str) -> String {
        format!(r#"<div class="page-header-icon undefined"><img class="icon notion-static-icon" src="https://app.notion.com/icons/{name}.svg"/></div>"#)
    }

    const H_TASKS: &str = "b1b2c3d4e5f68001a630e6beb4d8eda5";
    const H_LAUNCH: &str = "b1b2c3d4e5f680aeaccacfe80d6443a1";

    /// A small HTML export (made-up ids) with every construct the HTML importer handles.
    fn synthetic_html_export(export: &Path) {
        let root = export.join("Export-22222222-3333-4444-5555-666666666666");
        let team = root.join("Team HQ/b1b2c3d4e5f68157901f00426f19e90d");
        let private = root.join("Private & Shared");
        for dir in [team.join("HQ"), team.join("Launch"), team.join("Tasks/Write docs"), private.join("Reading")] {
            fs::create_dir_all(dir).unwrap();
        }
        let w = |p: PathBuf, s: &str| fs::write(p, s).unwrap();
        let task = |t: &str| format!("Tasks%20{H_TASKS}.csv{t}");
        w(
            team.join("HQ b1b2c3d4e5f6807b998ace21104d6d6e.html"),
            &html_page(
                "HQ",
                &format!(r#"<img class="page-cover-image" src="https://www.notion.so/images/page-cover/met_william_turner_1835.jpg" style="object-position:center 60%"/>{}"#, builtin("globe_pink").replace("undefined", "page-header-icon-with-cover")),
                "",
                &[
                    r#"<aside class="block-color-blue_background callout" style="white-space:pre-wrap;display:flex"><div style="width:100%"><p>Control center for everything.</p></div></aside>"#.to_string(),
                    format!(r#"<div class="column-list"><div class="column" style="width:50%"><div class="collection-content"><h4 class="collection-title">Tasks</h4><a href="{}"><code>Tasks {H_TASKS}.csv</code></a><br/><div style="font-size:0.7em"><b>Metadata: Filters &amp; Sorts</b><br/><table><tbody><tr><th>Property name</th></tr></tbody></table></div></div></div><div class="column" style="width:50%"><p>See <a href="Launch%20{H_LAUNCH}.html" data-notion-page-id="x">Launch</a> and <mark class="highlight-red_background">the plan</mark>.</p></div></div>"#, task("")),
                    r#"<h3><strong>Domains</strong></h3><table class="simple-table"><thead class="simple-table-header"><tr><th class="block-color-gray_background simple-table-header">Products</th><th class="block-color-gray_background simple-table-header">Services</th></tr></thead><tbody><tr><td><mark class="highlight-teal"><strong>Desktop</strong></mark><br/><br/><strong>The control center. <br/></strong>Built for devs | ops.</td><td><a href="https://example.com/services">Services</a></td></tr><tr><td></td><td><code>a|b</code></td></tr></tbody></table>"#.to_string(),
                    // Sub-pages in Notion's order (not alphabetical); "Gamma" isn't listed.
                    r#"<figure class="link-to-page"><a href="HQ/Beta%20b1b2c3d4e5f680000000000000000002.html"><span class="icon">📄</span>Beta</a></figure><figure class="link-to-page"><a href="HQ/Alpha%20b1b2c3d4e5f680000000000000000001.html"><img class="icon" src="https://example.com/a.png"/>Alpha</a></figure><p>
</p>"#.to_string(),
                ]
                .concat(),
            ),
        );
        for (name, id) in [("Alpha", "1"), ("Beta", "2"), ("Gamma", "3")] {
            w(team.join(format!("HQ/{name} b1b2c3d4e5f68000000000000000000{id}.html")), &html_page(name, "", "", &format!("<p>{name} page.</p>")));
        }
        w(team.join("Launch/cover.png"), "png");
        w(team.join("Launch/diagram.png"), "png");
        w(team.join("Launch/spec.pdf"), "pdf");
        w(
            team.join(format!("Launch {H_LAUNCH}.html")),
            &html_page(
                "Launch",
                r#"<img class="page-cover-image" src="Launch/cover.png" style="object-position:center 50%"/><div class="page-header-icon page-header-icon-with-cover"><span class="icon" data-emoji="🚀"></span></div>"#,
                "",
                concat!(
                    r#"<p>Some <mark class="highlight-teal">green <strong>bold</strong></mark> text, <em>italics</em>, <del>gone</del>, <code>code_span</code> and a_b.<br/>Next line.</p>"#,
                    r#"<p class="block-color-purple">A purple paragraph.</p>"#,
                    r#"<details open="" class="toggle"><summary>Read <mark class="highlight-gray">more</mark></summary><div class="indented"><p>Hidden <strong>text</strong>.</p><ul class="bulleted-list"><li>inside</li></ul></div></details>"#,
                    r#"<details open=""><summary style="font-weight:600"><h3 style="display:inline-block">Phase 1 &amp; 2</h3></summary><div class="indented"><ul class="to-do-list"><li><input type="checkbox" class="checkbox checkbox-on" disabled="" checked=""/> <span class="to-do-children-checked">Init <code>repo</code>.</span><div class="indented"><ul class="to-do-list"><li><input type="checkbox" class="checkbox checkbox-off" disabled=""/> <span class="to-do-children-unchecked">Sub task</span><div class="indented"></div></li></ul></div></li></ul></div></details>"#,
                    r#"<ol type="1" class="numbered-list" start="1"><li>first<ol type="a" class="numbered-list" start="1"><li>inner</li></ol></li></ol><ol type="1" class="numbered-list" start="2"><li>second</li></ol>"#,
                    r#"<ul class="bulleted-list"><li>bullet<ul class="bulleted-list"><li>nested</li></ul></li></ul><ul class="bulleted-list"><li>bullet two</li></ul>"#,
                    r#"<pre class="code code-wrap" data-notion-code-syntax="jsx"><code class="language-jsx" style="white-space:pre-wrap">const a = 1;
if (a &lt; 2) {}</code></pre>"#,
                    r#"<blockquote>Ship <em>small</em>.<br/>Ship often.</blockquote><hr/>"#,
                    r#"<figure class="image"><a href="Launch/diagram.png"><img style="width:432px" src="Launch/diagram.png"/></a></figure>"#,
                    r#"<figure><div class="source"><a href="Launch/spec.pdf">spec.pdf</a></div></figure>"#,
                    r#"<figure><a href="https://example.com/post" class="bookmark source"><div class="bookmark-info"><div class="bookmark-text"><div class="bookmark-title">A post</div></div></div></a></figure>"#,
                    r#"<p>Mail team@example.com or visit https://example.com/docs.</p>"#,
                ),
            ),
        );
        w(team.join(format!("Tasks {H_TASKS}.html")), &html_page("Tasks", &builtin("checklist_orange"), "", &format!(r#"<a href="{}"><code>Tasks {H_TASKS}.csv</code></a><br/>"#, task(""))));
        w(team.join(format!("Tasks {H_TASKS}.csv")), "\u{feff}Name,Status,Priority,Tags,Due,Done,Budget,Project\nWrite docs,Done,High,\"Docs, Web\",\"October 4, 2026\",Yes,\"₹1,000\",Launch\nShip it,To Do,Low,,,No,₹0,\n");
        w(team.join("Tasks/Write docs/icon.png"), "png");
        let rows = |status: &str, priority: &str, tags: &str, extra: &str| {
            [
                prop("status", "Status", status),
                prop("select", "Priority", priority),
                prop("multi_select", "Tags", tags),
                extra.to_string(),
            ]
            .concat()
        };
        w(
            team.join("Tasks/Write docs b1b2c3d4e5f680a0a07fda4f186496f5.html"),
            &html_page(
                "Write docs",
                r#"<div class="page-header-icon undefined"><img class="icon" src="Write%20docs/icon.png"/></div>"#,
                &rows(
                    r#"<span class="status-value select-value-color-green"><div class="status-dot status-dot-color-green"></div>Done</span>"#,
                    r#"<span class="selected-value select-value-color-red">High</span>"#,
                    r#"<span class="selected-value select-value-color-teal">Docs</span><span class="selected-value select-value-color-default">Web</span>"#,
                    &[
                        prop("date", "Due", r#"<time datetime="2026-10-04">October 4, 2026</time>"#),
                        prop("checkbox", "Done", r#"<div class="checkbox checkbox-on"></div>"#),
                        prop("number", "Budget", "₹1,000"),
                        prop("relation", "Project", &format!(r#"<a href="../Launch%20{H_LAUNCH}.html">Launch</a>"#)),
                        prop("person", "Owner", r#"<span class="user"><img src="https://example.com/u.png" class="icon user-icon"/>Ada</span>"#),
                    ]
                    .concat(),
                ),
                "<p>The body.</p>",
            ),
        );
        w(
            team.join("Tasks/Ship it b1b2c3d4e5f680939507d4e6afb140dc.html"),
            &html_page(
                "Ship it",
                &builtin("rocket_blue"),
                &rows(r#"<span class="status-value"><div class="status-dot"></div>To Do</span>"#, r#"<span class="selected-value select-value-color-blue">Low</span>"#, "", &prop("checkbox", "Done", r#"<div class="checkbox checkbox-off"></div>"#)),
                "",
            ),
        );
        let libraries = ["61282ddb9d1d839f920701e22794d170", "85782ddb9d1d832e9945019b5228cc19"];
        for id in libraries {
            w(private.join(format!("Library {id}.html")), &html_page("Library", "", "", "<p>Books.</p>"));
        }
        w(
            private.join("Notes 3ed82ddb9d1d80abbd04d236c669be4c.html"),
            &html_page(
                "Notes",
                &builtin("pencil_lightgray"),
                "",
                &[
                    r#"<aside class="block-color-gray_background callout"><div style="font-size:1.5em"><img class="icon notion-static-icon" src="https://app.notion.com/icons/bell_yellow.svg"/></div><div style="width:100%"><p><strong>Tip</strong>: a callout with a list.</p><ul class="bulleted-list"><li>one</li></ul></div></aside>"#.to_string(),
                    r#"<aside class="block-color-teal_background callout"><div style="font-size:1.5em"><span class="icon" data-emoji="✏️"></span></div><div style="width:100%">Your private space.</div></aside>"#.to_string(),
                    r#"<aside class="block-color-gray_background callout"><div style="font-size:1.5em"><img class="icon notion-static-icon" src="https://app.notion.com/icons/notion_gray.svg"/></div><div style="width:100%"><p>Unmapped icon.</p></div></aside>"#.to_string(),
                    r#"<div class="transcription"><div style="border-bottom:0.05em solid">Summary<br/></div><h3>Topic</h3><ul class="bulleted-list"><li>point</li></ul></div>"#.to_string(),
                    format!(r#"<p>See <a href="Library%20{}.html">Library</a> and <a href="Gone%20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html">Gone</a>.</p>"#, libraries[1]),
                    r#"<div class="collection-content"><h4 class="collection-title">Elsewhere</h4><a href="../Elsewhere%20cccccccccccccccccccccccccccccccc.csv"><code>Elsewhere.csv</code></a></div>"#.to_string(),
                    r#"<div class="collection-content"><h4 class="collection-title">Reading</h4><a href="Reading%20d1d2d3d4d5d6d7d8d9d0d1d2d3d4d5d6.csv"><code>Reading.csv</code></a></div>"#.to_string(),
                ]
                .concat(),
            ),
        );
        // A database exported only as CSV (no page of its own), with one row page.
        w(private.join("Reading d1d2d3d4d5d6d7d8d9d0d1d2d3d4d5d6.csv"), "\u{feff}Book,Status\nDune,Reading\n");
        w(private.join("Reading/Dune e1e2e3e4e5e6e7e8e9e0e1e2e3e4e5e6.html"), &html_page("Dune", "", &prop("status", "Status", r#"<span class="status-value select-value-color-blue"><div class="status-dot status-dot-color-blue"></div>Reading</span>"#), "<p>Spice.</p>"));
    }

    fn import_synthetic_html(name: &str) -> (PathBuf, PathBuf, ImportReport) {
        let base = std::env::temp_dir().join(format!("bg-notion-html-{name}-{}", stamp()));
        let export = base.join("export");
        let ws = base.join("ws");
        fs::create_dir_all(&ws).unwrap();
        synthetic_html_export(&export);
        let report = import_notion_with(&ws, &export, None).unwrap();
        (base, ws.join("Notion import"), report)
    }

    /// Web images (here HQ's Notion-gallery cover) are downloaded into the import's assets folder.
    #[test]
    fn downloads_web_images_into_the_workspace() {
        let base = std::env::temp_dir().join(format!("bg-notion-web-{}", stamp()));
        let (export, ws) = (base.join("export"), base.join("ws"));
        fs::create_dir_all(&ws).unwrap();
        synthetic_html_export(&export);
        let fake = |url: &str| url.contains("met_william_turner").then(|| (vec![0xFF, 0xD8, 0xFF, 0xE0], "jpg"));
        let report = import_notion_with(&ws, &export, Some(&fake)).unwrap();
        let hq = fs::read_to_string(ws.join("Notion import/Team HQ/HQ.md")).unwrap();
        let cover = hq.lines().find_map(|l| l.strip_prefix("cover: ")).unwrap();
        assert!(cover.starts_with(".assets/notion-") && cover.ends_with("web-met_william_turner_1835.jpg"), "{cover}");
        assert_eq!(fs::read(ws.join(cover)).unwrap(), [0xFF, 0xD8, 0xFF, 0xE0]);
        assert_eq!(report.assets, 5);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn imports_a_notion_html_export_end_to_end() {
        let (base, out, report) = import_synthetic_html("e2e");
        let read = |p: &str| fs::read_to_string(out.join(p)).unwrap_or_else(|_| panic!("missing {p}"));
        assert_eq!((report.pages, report.databases, report.assets), (11, 2, 4), "{:?}", report.skipped);
        assert_eq!(report.skipped, vec!["Notes: a linked database that isn't in the export (“Elsewhere”)".to_string()]);

        let hq = read("Team HQ/HQ.md");
        assert!(hq.starts_with("---\nicon: lucide:Globe:pink\ncover: https://www.notion.so/images/page-cover/met_william_turner_1835.jpg\n---\n> [!blue] 💡\n> Control center for everything.\n\n<div class=\"columns\">\n<div class=\"column\">\n\n![[Tasks]]\n\n</div>\n<div class=\"column\">\n\nSee [[Launch]] and <span data-bg=\"red\">the plan</span>.\n\n</div>\n</div>\n\n### Domains\n\n| <span data-bg=\"gray\">Products</span>"), "{hq}");
        assert!(hq.contains("| **<span data-color=\"green\">Desktop</span>**<br><br>**The control center.**<br>Built for devs \\| ops. | [Services](https://example.com/services) |"), "{hq}");
        assert!(hq.ends_with("[[Beta]]\n\n[[Alpha]]\n"), "{hq}");
        // Sub-pages are ordered as HQ lists them.
        assert_eq!(read("Team HQ/HQ/Beta.md"), "---\norder: 1\n---\nBeta page.\n");
        assert_eq!(read("Team HQ/HQ/Alpha.md"), "---\norder: 2\n---\nAlpha page.\n");
        assert_eq!(read("Team HQ/HQ/Gamma.md"), "Gamma page.\n");

        let launch = read("Team HQ/Launch.md");
        assert!(launch.starts_with("---\nicon: 🚀\ncover: .assets/notion-"), "{launch}");
        for part in [
            "Some <span data-color=\"green\">green **bold**</span> text, *italics*, ~~gone~~, `code_span` and a\\_b.  \nNext line.",
            "<span data-color=\"purple\">A purple paragraph.</span>",
            "<details open>\n<summary>Read <span data-color=\"gray\">more</span></summary>\n\nHidden **text**.\n\n- inside\n\n</details>",
            "<details open>\n<summary>**Phase 1 &amp; 2**</summary>\n\n- [x] Init `repo`.\n  - [ ] Sub task\n\n</details>",
            "1. first\n   1. inner\n2. second\n\n- bullet\n  - nested\n- bullet two",
            "```jsx\nconst a = 1;\nif (a < 2) {}\n```",
            "> Ship *small*.  \n> Ship often.\n\n---",
            "![diagram.png](.assets/notion-",
            "[spec.pdf](.assets/notion-",
            "[A post](https://example.com/post)",
            "Mail [team@example.com](mailto:team@example.com) or visit [https://example.com/docs](https://example.com/docs).",
        ] {
            assert!(launch.contains(part), "missing {part:?} in\n{launch}");
        }

        // Databases: typed from the row pages' property tables, option colours from Notion.
        let db = read("Team HQ/Tasks.md");
        assert!(db.starts_with("---\ntype: database\nicon: lucide:ListChecks:orange\n---\n```database"), "{db}");
        let schema: Value = serde_json::from_str(db.split("```database\n").nth(1).unwrap().split("\n```").next().unwrap()).unwrap();
        let prop = |n: &str| schema["properties"].as_array().unwrap().iter().find(|p| p["name"] == n).unwrap().clone();
        assert_eq!(prop("Status")["type"], "status");
        assert_eq!(prop("Status")["options"], json!([{ "name": "Done", "color": "green" }, { "name": "To Do", "color": "default" }]));
        assert_eq!(prop("Priority")["options"], json!([{ "name": "High", "color": "red" }, { "name": "Low", "color": "blue" }]));
        assert_eq!(prop("Tags")["type"], "multi_select");
        assert_eq!(prop("Tags")["options"], json!([{ "name": "Docs", "color": "green" }, { "name": "Web", "color": "default" }]));
        assert_eq!((prop("Due")["type"].as_str(), prop("Done")["type"].as_str()), (Some("date"), Some("checkbox")));
        assert_eq!((prop("Budget")["type"].as_str(), prop("Budget")["format"].as_str()), (Some("number"), Some("rupee")));
        assert_eq!(prop("Project")["type"], "text");
        assert_eq!(prop("Owner")["type"], "select", "a property only the row pages have, typed from its values");

        let row = read("Team HQ/Tasks/Write docs.md");
        assert!(row.starts_with("---\nicon: .assets/notion-"), "{row}");
        assert!(row.ends_with("order: 1\nStatus: Done\nPriority: High\nTags: [Docs, Web]\nDue: 2026-10-04\nDone: true\nBudget: 1000\nProject: Launch\nOwner: Ada\n---\nThe body.\n"), "{row}");
        assert_eq!(read("Team HQ/Tasks/Ship it.md"), "---\nicon: lucide:Rocket:blue\norder: 2\nStatus: To Do\nPriority: Low\nDone: false\nBudget: 0\n---\n");

        let notes = read("Private & Shared/Notes.md");
        assert!(notes.starts_with("---\nicon: lucide:Pencil:gray\n---\n> [!gray] lucide:Bell:yellow\n> **Tip**: a callout with a list.\n>\n> - one\n\n> [!green] ✏️\n> Your private space.\n\n> [!gray] 💡\n> Unmapped icon.\n\n<details open>\n<summary>Summary</summary>\n\n### Topic\n\n- point\n\n</details>"), "{notes}");
        assert!(notes.contains("See [[Library 2|Library]] and Gone.\n\n![[Reading]]"), "{notes}");
        assert_eq!(read("Private & Shared/Reading/Dune.md"), "---\norder: 1\nStatus: Reading\n---\nSpice.\n");
        assert!(read("Private & Shared/Reading.md").contains("\"color\": \"blue\""));
        let _ = fs::remove_dir_all(&base);
    }

    /// The synthetic HTML export's imported pages, checked in as fixtures. Regenerate with
    /// `UPDATE_FIXTURES=1 cargo test notion_html_import_fixture`.
    #[test]
    fn notion_html_import_fixture() {
        let (base, out, _) = import_synthetic_html("fixture");
        check_fixtures(&out, "notion-html-import");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn markdown_exports_still_win_when_html_files_are_attachments() {
        let base = std::env::temp_dir().join(format!("bg-notion-mixed-{}", stamp()));
        let export = base.join("export");
        let ws = base.join("ws");
        fs::create_dir_all(export.join("Page")).unwrap();
        fs::create_dir_all(&ws).unwrap();
        fs::write(export.join(format!("Page {ID_A}.md")), "# Page\n\n[saved](Page/saved.html)\n").unwrap();
        fs::write(export.join("Page/saved.html"), "<p>an attachment</p>").unwrap();
        let report = import_notion_with(&ws, &export, None).unwrap();
        assert_eq!((report.pages, report.assets), (1, 1));
        assert!(fs::read_to_string(ws.join("Notion import/Page.md")).unwrap().contains("[saved](.assets/notion-"));
        let _ = fs::remove_dir_all(&base);
    }

    /// Notion sometimes exports a database's rows but not the database (nor the pages above it):
    /// the rows' folder becomes the database, typed by a linked view's CSV when one lists the rows,
    /// else by the rows' property tables.
    #[test]
    fn rebuilds_databases_missing_from_the_export() {
        let base = std::env::temp_dir().join(format!("bg-notion-orphans-{}", stamp()));
        let (export, ws) = (base.join("export"), base.join("ws"));
        let id = |n: u32| format!("{n:032x}");
        let w = |rel: String, text: String| {
            let p = export.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, text).unwrap();
        };
        let status = |v: &str| prop("status", "Status", &format!(r#"<span class="status-value select-value-color-blue">{v}</span>"#));
        // Rows of a missing "Shelf" database, shown on Hub through a linked view.
        w(format!("Space/Shelf/Shelf/Lamp {}.html", id(1)), html_page("Lamp", "", &status("Lit"), "<p>Brass.</p>"));
        w(format!("Space/Shelf/Shelf/Rug {}.html", id(2)), html_page("Rug", "", &status("Dim"), ""));
        w("Untitled a1b2-c3d4.csv".into(), "\u{feff}Name,Status,Price\nLamp,Lit,3\nRug,Dim,5\n".into());
        let view = r#"<div class="collection-content"><h4 class="collection-title">Shelf</h4><a href="Untitled%20a1b2-c3d4.csv"><code>Untitled a1b2-c3d4.csv</code></a></div>"#;
        // An empty database: Notion links its CSV but doesn't export it.
        let empty = format!(r#"<div class="collection-content"><h4 class="collection-title">Bin</h4><a href="Hub/Bin%20{}.csv">Bin</a></div>"#, id(6));
        w(format!("Hub {}.html", id(3)), html_page("Hub", "", "", &format!("{view}{empty}")));
        // Rows of a missing "Crate" database that no CSV lists.
        w(format!("Space/Crate/Box {}.html", id(4)), html_page("Box", "", &status("Full"), ""));
        // A teamspace's top-level page: its folder has no page either, but it isn't a database.
        w(format!("Space/Notes {}.html", id(5)), html_page("Notes", "", "", "<p>Plain.</p>"));
        fs::create_dir_all(&ws).unwrap();
        let report = import_notion_with(&ws, &export, None).unwrap();
        let read = |rel: &str| fs::read_to_string(ws.join("Notion import").join(rel)).unwrap_or_else(|_| panic!("missing {rel}"));

        assert!(report.skipped.is_empty(), "{:?}", report.skipped);
        assert_eq!(report.databases, 3);
        assert!(read("Hub/Bin.md").starts_with("---\ntype: database\n"), "{}", read("Hub/Bin.md"));
        assert!(read("Hub.md").contains("![[Bin]]"), "{}", read("Hub.md"));
        let shelf = read("Space/Shelf/Shelf.md");
        assert!(shelf.starts_with("---\ntype: database\n") && shelf.contains(r#""name": "Price""#), "{shelf}");
        assert_eq!(read("Space/Shelf/Shelf/Lamp.md"), "---\norder: 1\nStatus: Lit\nPrice: 3\n---\nBrass.\n");
        assert!(read("Hub.md").contains("![[Shelf]]"), "{}", read("Hub.md"));
        let crate_db = read("Space/Crate.md");
        assert!(crate_db.contains("type: database") && crate_db.contains(r#""name": "Status""#), "{crate_db}");
        assert_eq!(read("Space/Crate/Box.md"), "---\nStatus: Full\n---\n");
        assert!(!read("Space/Notes.md").contains("database"));
        assert!(!ws.join("Notion import/Space.md").exists());
        let _ = fs::remove_dir_all(&base);
    }

    /// Imports a real export for manual inspection (never committed with private paths):
    /// `NOTION_EXPORT=/path/to/export.zip cargo test real_notion_export -- --ignored --nocapture`.
    /// Prints page titles only; the workspace is left in a temp folder (printed) to inspect.
    #[test]
    #[ignore]
    fn real_notion_export() {
        let src = PathBuf::from(std::env::var("NOTION_EXPORT").expect("set NOTION_EXPORT"));
        let ws = std::env::temp_dir().join(format!("bg-notion-real-{}", stamp()));
        fs::create_dir_all(&ws).unwrap();
        let report = import_notion(&ws, &src).unwrap();
        println!("workspace: {}", ws.display());
        println!("pages {} databases {} assets {} skipped {:?}", report.pages, report.databases, report.assets, report.skipped);
        let mut tree: Vec<String> = WalkDir::new(ws.join("Notion import"))
            .into_iter()
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "md"))
            .map(|e| e.path().strip_prefix(&ws).unwrap().to_string_lossy().into_owned())
            .collect();
        tree.sort();
        for p in &tree {
            let depth = p.matches('/').count();
            println!("{}{}", "  ".repeat(depth), crate::vault::title_of(p));
        }
        // Export-relative links the importer didn't rewrite (web links may end in `.html` or contain `%20`).
        let leftovers = Regex::new(r"\]\((?:[^)/:]|/[^/)])[^):]*(?:%20|\.md\)|\.csv\)|\.html\))").unwrap();
        // HTML the editor doesn't own (its own: colour spans, toggles, columns, <br> in tables).
        let tag = Regex::new(r"</?([a-zA-Z][a-zA-Z0-9]*)[^>]*>").unwrap();
        let own = Regex::new(r#"^(?:<span(?: data-(?:color|bg)="[a-z]+")+>|</span>|<details(?: open)?>|</details>|</?summary>|<div class="columns?"(?: data-width="[\d.]+")?>|</div>|<br>)$"#).unwrap();
        let code = Regex::new(r"(?s)```.*?```|`[^`\n]*`|\[\[[^\]\n]*\]\]").unwrap();
        let mut stats: BTreeMap<String, usize> = BTreeMap::new();
        let mut count = |k: String, n: usize| *stats.entry(k).or_default() += n;
        for p in &tree {
            let text = fs::read_to_string(ws.join(p)).unwrap();
            let n = leftovers.find_iter(&text).count() + text.matches("<aside>").count();
            if n > 0 {
                println!("LEFTOVER in {p}: {n}");
            }
            let (fm, body) = crate::vault::split_frontmatter(&text);
            if let Some(icon) = crate::vault::fm_value(fm, "icon") {
                let kind = if icon.starts_with("lucide:") { "lucide" } else if icon.starts_with(".assets/") { "image (.assets)" } else if icon.starts_with("http") { "image (link)" } else { "emoji" };
                count(format!("icon: {kind}"), 1);
            }
            if crate::vault::fm_value(fm, "order").is_some() {
                count("ordered among siblings".into(), 1);
            }
            if let Some(cover) = crate::vault::fm_value(fm, "cover") {
                count(format!("cover: {}", if cover.starts_with(".assets/") { "image (.assets)" } else { "link" }), 1);
            }
            count("colour spans (text)".into(), body.matches("<span data-color=").count());
            count("colour spans (highlight)".into(), body.matches(" data-bg=").count());
            count("toggles".into(), body.matches("<details").count());
            count("column layouts".into(), body.matches("<div class=\"columns\">").count());
            count("tables".into(), body.lines().filter(|l| l.trim_start_matches(['>', ' ']).starts_with("| ---") || l.trim_start_matches(['>', ' ']).starts_with("| :--")).count());
            count("database embeds".into(), body.lines().filter(|l| l.trim_start().starts_with("![[")).count());
            for c in CALLOUT.captures_iter(body) {
                count(format!("callouts: {}", &c[2]), 1);
            }
            let prose = code.replace_all(body, "");
            for t in tag.find_iter(&prose).filter(|t| !own.is_match(t.as_str())) {
                println!("RAW HTML in {p}: {}", t.as_str());
                count("raw html tags".into(), 1);
            }
        }
        for (k, v) in &stats {
            println!("{k}: {v}");
        }
    }
}
