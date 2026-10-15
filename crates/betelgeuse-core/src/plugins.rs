//! Plugins: JavaScript bundles installed per machine and turned on per workspace.
//!
//! An installed plugin is a folder `<app data>/plugins/<id>/` holding `betelgeuse-plugin.json` (the
//! manifest), `main.js` and optionally `styles.css`. Development builds also load the plugins built
//! in this repository (`plugins/*/dist`), so plugin authors see changes without installing.
//!
//! Which plugins a workspace uses is saved in the workspace (`.betelgeuse/plugins.json`), so another
//! machine syncing it knows what to offer. A plugin's own data lives in the workspace too
//! (`.betelgeuse/plugins/<id>/data.json`); per-machine data (folder paths, keys) in the app's config.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const MANIFEST: &str = "betelgeuse-plugin.json";
const ENABLED_FILE: &str = ".betelgeuse/plugins.json";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    /// The manifest as written (the interface validates and interprets it).
    pub manifest: serde_json::Value,
    pub id: String,
    pub dir: String,
    /// "installed" (in the app's plugin folder) or "dev" (built in this repository).
    pub source: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Enabled {
    #[serde(default)]
    enabled: Vec<String>,
}

/// Where an app keeps plugins and their data on this machine: its data, cache and config folders.
pub struct Dirs {
    pub data: PathBuf,
    pub cache: PathBuf,
    pub config: PathBuf,
}

fn installed_dir(dirs: &Dirs) -> Result<PathBuf, String> {
    Ok(dirs.data.join("plugins"))
}

/// The repository's `plugins/` folder, for development builds.
fn dev_dir() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../plugins");
        p.is_dir().then(|| p.canonicalize().unwrap_or(p))
    } else {
        None
    }
}

/// Plugin ids are folder names and appear in paths: keep them to a safe, readable alphabet.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') && !id.starts_with('-')
}

fn read_manifest(dir: &Path) -> Option<serde_json::Value> {
    serde_json::from_str(&std::fs::read_to_string(dir.join(MANIFEST)).ok()?).ok()
}

fn info(dir: &Path, source: &str) -> Option<PluginInfo> {
    let manifest = read_manifest(dir)?;
    let id = manifest.get("id")?.as_str()?.to_string();
    valid_id(&id).then(|| PluginInfo { manifest, id, dir: dir.to_string_lossy().into_owned(), source: source.into() })
}

/// Every plugin this machine can run. A development copy wins over an installed one with the same id.
pub fn list(dirs: &Dirs) -> Vec<PluginInfo> {
    let mut out: Vec<PluginInfo> = Vec::new();
    if let Some(dev) = dev_dir() {
        for e in std::fs::read_dir(dev).into_iter().flatten().flatten() {
            if let Some(p) = info(&e.path().join("dist"), "dev") {
                out.push(p);
            }
        }
    }
    if let Ok(dir) = installed_dir(dirs) {
        for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
            if let Some(p) = info(&e.path(), "installed") {
                if !out.iter().any(|o| o.id == p.id) {
                    out.push(p);
                }
            }
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

fn dir_of(dirs: &Dirs, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("bad plugin id".into());
    }
    list(dirs).into_iter().find(|p| p.id == id).map(|p| PathBuf::from(p.dir)).ok_or_else(|| format!("plugin {id} isn't installed"))
}

/// A file from a plugin's folder (its code, styles), as text.
pub fn read_file(dirs: &Dirs, id: &str, file: &str) -> Result<String, String> {
    if file.split(['/', '\\']).any(|s| s == ".." || s.is_empty()) {
        return Err("bad plugin file".into());
    }
    std::fs::read_to_string(dir_of(dirs, id)?.join(file)).map_err(|e| e.to_string())
}

/// Installs a built plugin from a folder (its manifest at the top), replacing an older copy.
pub fn install_folder(dirs: &Dirs, src: &Path) -> Result<String, String> {
    let p = info(src, "installed").ok_or("That folder has no valid betelgeuse-plugin.json.")?;
    let main = p.manifest.get("main").and_then(|m| m.as_str()).unwrap_or("main.js");
    if !src.join(main).is_file() {
        return Err(format!("The plugin's {main} is missing. Build it first."));
    }
    let dest = installed_dir(dirs)?.join(&p.id);
    let tmp = installed_dir(dirs)?.join(format!(".{}-installing", p.id));
    let _ = std::fs::remove_dir_all(&tmp);
    copy_dir(src, &tmp).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&dest);
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    Ok(p.id)
}

fn copy_dir(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for e in std::fs::read_dir(src)? {
        let e = e?;
        let to = dest.join(e.file_name());
        if e.file_type()?.is_dir() {
            copy_dir(&e.path(), &to)?;
        } else {
            std::fs::copy(e.path(), to)?;
        }
    }
    Ok(())
}

pub fn uninstall(dirs: &Dirs, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("bad plugin id".into());
    }
    let dir = installed_dir(dirs)?.join(id);
    if dir.exists() {
        std::fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let _ = std::fs::remove_dir_all(dirs.cache.join("plugins").join(id));
    Ok(())
}

pub fn enabled(ws: &Path) -> Vec<String> {
    std::fs::read_to_string(ws.join(ENABLED_FILE))
        .ok()
        .and_then(|t| serde_json::from_str::<Enabled>(&t).ok())
        .map(|e| e.enabled)
        .unwrap_or_default()
}

pub fn set_enabled(ws: &Path, ids: Vec<String>) -> Result<(), String> {
    let mut ids: Vec<String> = ids.into_iter().filter(|i| valid_id(i)).collect();
    ids.sort();
    ids.dedup();
    write_json(&ws.join(ENABLED_FILE), &serde_json::json!({ "enabled": ids }))
}

fn write_json(file: &Path, value: &serde_json::Value) -> Result<(), String> {
    std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(value).unwrap() + "\n").map_err(|e| e.to_string())?;
    std::fs::rename(tmp, file).map_err(|e| e.to_string())
}

/// Where a plugin's data lives: `workspace` (synced with the notes) or `local` (this machine only).
fn data_file(dirs: &Dirs, ws: &Path, id: &str, scope: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("bad plugin id".into());
    }
    match scope {
        "workspace" => Ok(ws.join(".betelgeuse/plugins").join(id).join("data.json")),
        "local" => {
            let mut h = std::collections::hash_map::DefaultHasher::new();
            std::hash::Hash::hash(ws, &mut h);
            let key = format!("{:016x}", std::hash::Hasher::finish(&h));
            Ok(dirs.config.join("plugin-data").join(id).join(format!("{key}.json")))
        }
        _ => Err("scope is workspace or local".into()),
    }
}

pub fn data_get(dirs: &Dirs, ws: &Path, id: &str, scope: &str) -> Result<serde_json::Value, String> {
    let file = data_file(dirs, ws, id, scope)?;
    Ok(std::fs::read_to_string(file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(serde_json::json!({})))
}

pub fn data_set(dirs: &Dirs, ws: &Path, id: &str, scope: &str, value: serde_json::Value) -> Result<(), String> {
    if !value.is_object() {
        return Err("plugin data is a JSON object".into());
    }
    write_json(&data_file(dirs, ws, id, scope)?, &value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids() {
        assert!(valid_id("media-library"));
        assert!(valid_id("hello-world2"));
        assert!(!valid_id("../evil"));
        assert!(!valid_id("Upper"));
        assert!(!valid_id("-x"));
        assert!(!valid_id(""));
    }

    #[test]
    fn enabled_round_trip() {
        let ws = std::env::temp_dir().join(format!("betelgeuse-plugins-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&ws);
        std::fs::create_dir_all(&ws).unwrap();
        assert!(enabled(&ws).is_empty());
        set_enabled(&ws, vec!["b".into(), "a".into(), "a".into(), "../x".into()]).unwrap();
        assert_eq!(enabled(&ws), ["a", "b"]);
        let _ = std::fs::remove_dir_all(&ws);
    }
}
