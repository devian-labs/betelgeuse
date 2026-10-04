//! Importers for Notion ("Markdown & CSV" exports) and Obsidian vaults.
//!
//! Everything is imported under one new top-level page so the rest of the workspace is
//! untouched. Pages become Markdown files, images go to `.assets/`, and Notion databases
//! (CSV files) become Betelgeuse databases with typed properties.

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
    let flat: String = rel_hint
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let mut name = flat.trim_matches('-').to_string();
    if name.is_empty() {
        name = "asset".into();
    }
    let mut candidate = format!(".assets/{batch}/{name}");
    let mut n = 2;
    while !used.insert(candidate.clone()) {
        candidate = format!(".assets/{batch}/{n}-{name}");
        n += 1;
    }
    let dest = vault.join(&candidate);
    fs::create_dir_all(dest.parent()?).ok()?;
    fs::copy(src, &dest).ok()?;
    Some(candidate)
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

/// Notion appends a 32-character hex id to every exported file and folder name.
pub fn strip_notion_id(name: &str) -> String {
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !e.contains(' ') && e.len() <= 4 => (s, Some(e)),
        _ => (name, None),
    };
    let stem = stem.strip_suffix("_all").unwrap_or(stem);
    let trimmed = match stem.rsplit_once(' ') {
        Some((head, id)) if id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit()) => head,
        _ => stem,
    };
    match ext {
        Some(e) => format!("{trimmed}.{e}"),
        None => trimmed.to_string(),
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

static MD_LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(!?)\[([^\]\n]*)\]\(([^)\n]+)\)").unwrap());

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

/// Removes Notion's leading "# Title" and, for database rows, the "Key: value" property block.
fn strip_notion_header(text: &str, title: &str, property_keys: &HashSet<String>) -> String {
    let mut lines: Vec<&str> = text.lines().collect();
    if lines.first().is_some_and(|l| l.trim_start_matches('#').trim() == title.trim() && l.starts_with('#')) {
        lines.remove(0);
    }
    while lines.first().is_some_and(|l| l.trim().is_empty()) {
        lines.remove(0);
    }
    if !property_keys.is_empty() {
        let n = lines
            .iter()
            .take_while(|l| l.split_once(": ").is_some_and(|(k, _)| property_keys.contains(k.trim())))
            .count();
        if n > 0 {
            lines.drain(..n);
        }
        while lines.first().is_some_and(|l| l.trim().is_empty()) {
            lines.remove(0);
        }
    }
    lines.join("\n")
}

struct NotionCtx<'a> {
    vault: &'a Path,
    /// Export-relative path (lowercased) of every .md/.csv -> its new page title.
    titles: HashMap<String, String>,
    /// Export-relative path (lowercased) of every attachment -> its `.assets/` path.
    assets: HashMap<String, String>,
}

impl NotionCtx<'_> {
    /// Rewrites Notion's relative Markdown links into wikilinks and image paths into assets.
    fn convert_links(&self, text: &str, from_dir: &str) -> String {
        MD_LINK
            .replace_all(text, |c: &regex::Captures| {
                let (bang, label, url) = (&c[1], &c[2], c[3].trim());
                if url.contains("://") || url.starts_with('#') || url.starts_with("mailto:") {
                    return c[0].to_string();
                }
                let target = resolve_link(from_dir, &percent_decode(url)).to_lowercase();
                if let Some(asset) = self.assets.get(&target) {
                    return format!("{bang}[{label}]({asset})");
                }
                if let Some(title) = self.titles.get(&target) {
                    return if label.is_empty() || label == title { format!("[[{title}]]") } else { format!("[[{title}|{label}]]") };
                }
                c[0].to_string()
            })
            .into_owned()
    }
}

pub fn import_notion(vault: &Path, src: &Path) -> Result<ImportReport, String> {
    let temp = std::env::temp_dir().join(format!("betelgeuse-notion-{}", stamp()));
    let export = if src.is_file() {
        extract_zip(src, &temp)?;
        temp.clone()
    } else if src.is_dir() {
        src.to_path_buf()
    } else {
        return Err("Choose the .zip (or unzipped folder) that Notion exported.".into());
    };
    let result = import_notion_dir(vault, &export);
    let _ = fs::remove_dir_all(&temp);
    result
}

fn import_notion_dir(vault: &Path, export: &Path) -> Result<ImportReport, String> {
    let files: Vec<String> = WalkDir::new(export)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| e.path().strip_prefix(export).unwrap().to_string_lossy().replace('\\', "/"))
        .collect();
    if !files.iter().any(|f| f.ends_with(".md") || f.ends_with(".csv")) {
        return Err("No pages found. In Notion choose Export → Markdown & CSV, with “Include subpages” on.".into());
    }

    let (root, root_dir) = make_root(vault, "Notion import", "📥", "Imported from Notion.")?;
    let mut report = ImportReport { root: root.clone(), ..Default::default() };

    // Destination paths: strip ids from every path component, keep the folder structure.
    // A database `X <id>.csv` takes the page slot `X.md`; prefer the `_all.csv` variant (all rows).
    let mut csvs: BTreeMap<String, String> = BTreeMap::new(); // dest stem -> csv path
    for f in files.iter().filter(|f| f.ends_with(".csv")) {
        let stem = dest_stem(f);
        if f.ends_with("_all.csv") || !csvs.contains_key(&stem) {
            csvs.insert(stem, f.clone());
        }
    }
    let mut dest_of: HashMap<String, String> = HashMap::new(); // export path -> workspace path
    let mut ctx = NotionCtx { vault, titles: HashMap::new(), assets: HashMap::new() };
    let mut taken: HashSet<String> = HashSet::new();
    let place = |stem: &str, taken: &mut HashSet<String>| -> String {
        let (dir, name) = stem.rsplit_once('/').map_or(("", stem), |(d, n)| (d, n));
        let dir = if dir.is_empty() { root_dir.clone() } else { format!("{root_dir}/{dir}") };
        let title = sanitize_title(name);
        let mut rel = format!("{dir}/{title}.md");
        let mut n = 2;
        while !taken.insert(rel.to_lowercase()) {
            rel = format!("{dir}/{title} {n}.md");
            n += 1;
        }
        rel
    };
    for (stem, csv) in &csvs {
        let rel = place(stem, &mut taken);
        ctx.titles.insert(csv.to_lowercase(), crate::vault::title_of(&rel));
        // The database's own .md export (if any) is the same page.
        if let Some(md) = files.iter().find(|f| f.ends_with(".md") && dest_stem(f) == *stem) {
            ctx.titles.insert(md.to_lowercase(), crate::vault::title_of(&rel));
        }
        dest_of.insert(csv.clone(), rel);
    }
    for f in files.iter().filter(|f| f.ends_with(".md")) {
        if ctx.titles.contains_key(&f.to_lowercase()) {
            continue;
        }
        let rel = place(&dest_stem(f), &mut taken);
        ctx.titles.insert(f.to_lowercase(), crate::vault::title_of(&rel));
        dest_of.insert(f.clone(), rel);
    }
    let batch = format!("notion-{}", stamp());
    let mut used = HashSet::new();
    for f in files.iter().filter(|f| !f.ends_with(".md") && !f.ends_with(".csv")) {
        if let Some(asset) = copy_asset(vault, &batch, &export.join(f), &strip_path_ids(f), &mut used) {
            ctx.assets.insert(f.to_lowercase(), asset);
            report.assets += 1;
        }
    }

    // Databases: schema from the CSV, rows from the CSV merged with each row's own page.
    let mut row_pages: HashSet<String> = HashSet::new();
    for (stem, csv) in &csvs {
        let db_rel = dest_of[csv].clone();
        let mut reader = csv::ReaderBuilder::new().flexible(true).from_path(export.join(csv)).map_err(|e| e.to_string())?;
        let headers: Vec<String> = reader.headers().map_err(|e| e.to_string())?.iter().map(|h| h.trim_start_matches('\u{feff}').to_string()).collect();
        let records: Vec<Vec<String>> = reader.records().filter_map(Result::ok).map(|r| r.iter().map(str::to_string).collect()).collect();
        if headers.is_empty() {
            continue;
        }
        let mut properties = vec![];
        let mut kinds = vec!["title"];
        for (i, h) in headers.iter().enumerate().skip(1) {
            let col: Vec<&str> = records.iter().map(|r| r.get(i).map_or("", String::as_str)).collect();
            let kind = infer_type(h, &col);
            kinds.push(kind);
            let mut prop = json!({ "name": h, "type": kind });
            if matches!(kind, "select" | "status" | "multi_select") {
                let mut seen: Vec<&str> = vec![];
                for v in col.iter().flat_map(|v| v.split(", ")).map(str::trim).filter(|s| !s.is_empty()) {
                    if !seen.contains(&v) {
                        seen.push(v);
                    }
                }
                prop["options"] = json!(seen.iter().enumerate().map(|(i, n)| json!({ "name": n, "color": PALETTE[i % PALETTE.len()] })).collect::<Vec<_>>());
            }
            properties.push(prop);
        }
        let mut views = vec![json!({ "id": "table", "name": "Table", "type": "table" })];
        if let Some(status) = headers.iter().zip(&kinds).find(|(_, k)| matches!(**k, "status" | "select")).map(|(h, _)| h) {
            views.push(json!({ "id": "board", "name": "Board", "type": "board", "groupBy": status }));
        }
        if let Some(date) = headers.iter().zip(&kinds).find(|(_, k)| **k == "date").map(|(h, _)| h) {
            views.push(json!({ "id": "calendar", "name": "Calendar", "type": "calendar", "dateProperty": date }));
        }
        let schema = json!({ "properties": properties, "views": views });
        let description = files
            .iter()
            .find(|f| f.ends_with(".md") && dest_stem(f) == *stem)
            .and_then(|md| fs::read_to_string(export.join(md)).ok())
            .map(|t| ctx.convert_links(&strip_notion_header(&t, &crate::vault::title_of(&db_rel), &HashSet::new()), parent_dir(csv)))
            .unwrap_or_default();
        let body = format!(
            "{}```database\n{}\n```\n",
            if description.trim().is_empty() { String::new() } else { format!("{}\n\n", description.trim()) },
            serde_json::to_string_pretty(&schema).unwrap()
        );
        write_note(vault, &db_rel, &format!("---\ntype: database\n---\n{body}"))?;
        report.databases += 1;

        // Row pages live in a folder named after the database: compare paths with ids stripped.
        let rows_dir = stem.to_lowercase();
        let keys: HashSet<String> = headers.iter().cloned().collect();
        let mut row_taken = HashSet::new();
        for record in &records {
            let title = sanitize_title(record.first().map_or("Untitled", String::as_str));
            // The row's own page in the export (for its body text), matched by title.
            let page = files.iter().find(|f| {
                f.ends_with(".md") && strip_path_ids(parent_dir(f)).to_lowercase() == rows_dir && sanitize_title(strip_notion_id(file_name(f)).trim_end_matches(".md")) == title
            });
            let mut fm = String::new();
            for (i, h) in headers.iter().enumerate().skip(1) {
                if let Some(v) = record.get(i).and_then(|raw| convert_value(kinds[i], raw)) {
                    fm.push_str(&format!("{}: {}\n", yaml_key(h), yaml_scalar(&v)));
                }
            }
            let body = page
                .and_then(|p| fs::read_to_string(export.join(p)).ok())
                .map(|t| ctx.convert_links(&strip_notion_header(&t, &title, &keys), parent_dir(page.unwrap())))
                .unwrap_or_default();
            let dir = children_dir(&db_rel).to_string();
            let mut rel = format!("{dir}/{title}.md");
            let mut n = 2;
            while !row_taken.insert(rel.to_lowercase()) {
                rel = format!("{dir}/{title} {n}.md");
                n += 1;
            }
            let content = if fm.is_empty() { body } else { format!("---\n{fm}---\n{body}") };
            write_note(vault, &rel, &with_newline(content))?;
            if let Some(p) = page {
                row_pages.insert(p.clone());
            }
            report.pages += 1;
        }
    }

    // Regular pages.
    for f in files.iter().filter(|f| f.ends_with(".md") && !row_pages.contains(*f)) {
        let Some(rel) = dest_of.get(f) else { continue };
        let Ok(text) = fs::read_to_string(export.join(f)) else {
            report.skipped.push(f.clone());
            continue;
        };
        let body = ctx.convert_links(&strip_notion_header(&text, &crate::vault::title_of(rel), &HashSet::new()), parent_dir(f));
        write_note(ctx.vault, rel, &with_newline(body))?;
        report.pages += 1;
    }
    Ok(report)
}

fn with_newline(mut s: String) -> String {
    if !s.ends_with('\n') {
        s.push('\n');
    }
    s
}

fn file_name(p: &str) -> &str {
    p.rsplit('/').next().unwrap_or(p)
}

fn parent_dir(p: &str) -> &str {
    p.rsplit_once('/').map_or("", |(d, _)| d)
}

fn strip_path_ids(p: &str) -> String {
    p.split('/').map(strip_notion_id).collect::<Vec<_>>().join("/")
}

/// "Projects abc…/Plan def….md" -> "Projects/Plan" (also for "X_all.csv").
fn dest_stem(p: &str) -> String {
    let stripped = strip_path_ids(p);
    stripped.rsplit_once('.').map_or(stripped.clone(), |(s, _)| s.to_string())
}

fn yaml_key(k: &str) -> String {
    if k.chars().all(|c| c.is_alphanumeric() || " _-".contains(c)) && !k.is_empty() && k.trim() == k {
        k.to_string()
    } else {
        serde_json::to_string(k).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_notion_ids() {
        assert_eq!(strip_notion_id("Project Plan 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md"), "Project Plan.md");
        assert_eq!(strip_notion_id("Tasks 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d_all.csv"), "Tasks.csv");
        assert_eq!(strip_notion_id("Folder 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"), "Folder");
        assert_eq!(strip_notion_id("Plain name.md"), "Plain name.md");
    }

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

    #[test]
    fn imports_a_notion_export_end_to_end() {
        let base = std::env::temp_dir().join(format!("bg-notion-{}", stamp()));
        let export = base.join("export");
        let ws = base.join("ws");
        let id = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
        let id2 = "ffffffffffffffffffffffffffffffff";
        fs::create_dir_all(export.join(format!("Home {id}/Tasks {id2}"))).unwrap();
        fs::write(
            export.join(format!("Home {id}.md")),
            format!("# Home\n\nSee [the tasks](Home%20{id}/Tasks%20{id2}.csv) and ![logo](Home%20{id}/logo.png).\n"),
        )
        .unwrap();
        fs::write(export.join(format!("Home {id}/logo.png")), b"png").unwrap();
        fs::write(
            export.join(format!("Home {id}/Tasks {id2}.csv")),
            "\u{feff}Name,Status,Points,Due,Done\nWrite docs,Done,3,\"October 4, 2026\",Yes\nShip it,Todo,5,,No\n",
        )
        .unwrap();
        fs::write(export.join(format!("Home {id}/Tasks {id2}/Write docs {id}.md")), "# Write docs\n\nStatus: Done\nPoints: 3\n\nThe body.\n").unwrap();
        fs::create_dir_all(&ws).unwrap();

        let report = import_notion(&ws, &export).unwrap();
        assert_eq!((report.databases, report.assets), (1, 1));
        let home = fs::read_to_string(ws.join("Notion import/Home.md")).unwrap();
        assert!(home.contains("[[Tasks|the tasks]]"), "{home}");
        assert!(home.contains("![logo](.assets/notion-"), "{home}");
        let db = fs::read_to_string(ws.join("Notion import/Home/Tasks.md")).unwrap();
        assert!(db.starts_with("---\ntype: database\n---\n```database"), "{db}");
        assert!(db.contains("\"type\": \"status\"") && db.contains("\"type\": \"checkbox\"") && db.contains("\"groupBy\": \"Status\""), "{db}");
        let row = fs::read_to_string(ws.join("Notion import/Home/Tasks/Write docs.md")).unwrap();
        assert_eq!(row, "---\nStatus: Done\nPoints: 3\nDue: 2026-10-04\nDone: true\n---\nThe body.\n");
        assert!(ws.join("Notion import/Home/Tasks/Ship it.md").exists());
        let _ = fs::remove_dir_all(&base);
    }
}
