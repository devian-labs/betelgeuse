//! The plugin store: an index of plugins built and signed by Betelgeuse's release CI, and installing
//! from it.
//!
//! CI builds every plugin in `plugins/`, zips each one, and publishes with every release:
//! - `plugin-<id>-<version>.zip`, and
//! - `plugins.json`: one entry per plugin with its manifest fields, the zip's URL (relative to the
//!   index, or absolute), its SHA-256 and an Ed25519 signature of the zip.
//!
//! Installing downloads the zip, checks its size, hash and signature against the public key built
//! into the app (`plugin-signing.pub`), unpacks it with every path checked, makes sure the manifest
//! inside is the plugin the index promised, and only then swaps it into the plugins folder.

use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::{Duration, SystemTime};
use crate::plugins::Dirs;

const DEFAULT_INDEX: &str = "https://github.com/devian-labs/betelgeuse/releases/latest/download/plugins.json";
/// Refetch the index after this long (it's also refreshed on demand).
const MAX_AGE: Duration = Duration::from_secs(6 * 3600);
const MAX_ZIP: u64 = 25 * 1024 * 1024;

/// Base64 of the raw 32-byte Ed25519 public key that signs store plugins. Empty until the release
/// signing key is set up (scripts/plugin-keys.mjs); then only development builds install unsigned.
const PUBLIC_KEY: &str = include_str!("../plugin-signing.pub");

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub homepage: String,
    pub engines: serde_json::Value,
    #[serde(default)]
    pub platforms: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    pub url: String,
    pub sha256: String,
    #[serde(default)]
    pub signature: String,
    #[serde(default)]
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    #[serde(default)]
    pub plugins: Vec<Entry>,
    /// Where it came from (for resolving relative URLs) and when, filled in by the app.
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub fetched: u64,
    /// The store couldn't be reached; this is the last copy we had.
    #[serde(default)]
    pub stale: bool,
}

fn index_url() -> String {
    std::env::var("BETELGEUSE_PLUGIN_INDEX").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| DEFAULT_INDEX.into())
}

fn cache_file(dirs: &Dirs) -> Option<PathBuf> {
    Some(dirs.cache.join("plugin-index.json"))
}

fn now() -> u64 {
    SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

static AGENT: LazyLock<ureq::Agent> = LazyLock::new(|| {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(60)))
        .user_agent(concat!("Betelgeuse/", env!("CARGO_PKG_VERSION"), " (plugin store)"))
        .build()
        .into()
});

/// Reads a URL or (for testing and offline mirrors) a local file path or `file://` URL.
fn fetch(url: &str, limit: u64) -> Result<Vec<u8>, String> {
    if let Some(path) = url.strip_prefix("file://").or_else(|| (!url.contains("://")).then_some(url)) {
        let bytes = std::fs::read(path).map_err(|e| format!("{path}: {e}"))?;
        return if bytes.len() as u64 > limit { Err("too large".into()) } else { Ok(bytes) };
    }
    let mut res = AGENT.get(url).call().map_err(|e| format!("Couldn't reach the plugin store: {e}"))?;
    res.body_mut().with_config().limit(limit).read_to_vec().map_err(|e| e.to_string())
}

/// A URL in the index, resolved against the index's own location.
fn resolve(base: &str, url: &str) -> String {
    if url.contains("://") || url.starts_with('/') {
        return url.into();
    }
    match base.rfind('/') {
        Some(i) => format!("{}/{}", &base[..i], url),
        None => url.into(),
    }
}

/// The store's plugins: the cached copy if it's fresh, else fetched (falling back to the cache).
pub fn index(dirs: &Dirs, refresh: bool) -> Result<Index, String> {
    let cached: Option<Index> = cache_file(dirs).and_then(|f| std::fs::read(f).ok()).and_then(|b| serde_json::from_slice(&b).ok());
    let url = index_url();
    if let Some(c) = &cached {
        if !refresh && c.source == url && now().saturating_sub(c.fetched) < MAX_AGE.as_secs() {
            return Ok(c.clone());
        }
    }
    match fetch(&url, 5 * 1024 * 1024).and_then(|b| serde_json::from_slice::<Index>(&b).map_err(|e| format!("The plugin store's index is malformed: {e}"))) {
        Ok(mut fresh) => {
            fresh.plugins.retain(|e| crate::plugins::valid_id(&e.id));
            fresh.source = url;
            fresh.fetched = now();
            fresh.stale = false;
            if let Some(f) = cache_file(dirs) {
                let _ = std::fs::create_dir_all(f.parent().unwrap());
                let _ = std::fs::write(f, serde_json::to_vec(&fresh).unwrap_or_default());
            }
            Ok(fresh)
        }
        Err(e) => match cached {
            Some(mut c) => {
                c.stale = true;
                Ok(c)
            }
            None => Err(e),
        },
    }
}

fn public_key() -> Option<VerifyingKey> {
    let raw = base64::engine::general_purpose::STANDARD.decode(PUBLIC_KEY.trim()).ok()?;
    VerifyingKey::from_bytes(&raw.try_into().ok()?).ok()
}

/// Checks the zip's hash and signature. Development builds accept unsigned plugins when the app
/// has no signing key yet (local testing); release builds never do.
pub fn verify(bytes: &[u8], entry: &Entry) -> Result<(), String> {
    let digest = hex::encode(Sha256::digest(bytes));
    if !digest.eq_ignore_ascii_case(entry.sha256.trim()) {
        return Err(format!("The download of {} is damaged (its checksum doesn't match). Try again.", entry.name));
    }
    match public_key() {
        Some(key) => {
            let sig = base64::engine::general_purpose::STANDARD.decode(entry.signature.trim()).map_err(|_| format!("{} isn't signed.", entry.name))?;
            let sig = Signature::from_slice(&sig).map_err(|_| format!("{} has an invalid signature.", entry.name))?;
            key.verify(bytes, &sig).map_err(|_| format!("{} isn't signed by Betelgeuse. It wasn't installed.", entry.name))
        }
        None if cfg!(debug_assertions) => Ok(()),
        None => Err("This build of Betelgeuse can't verify plugins, so it can't install them from the store.".into()),
    }
}

/// Unpacks a plugin zip into `dest`, refusing any path that would land outside it.
fn unpack(bytes: &[u8], dest: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("Not a valid plugin package: {e}"))?;
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let rel = entry.enclosed_name().ok_or("The plugin package has an unsafe file path.")?;
        let out = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        total += entry.size();
        if total > 4 * MAX_ZIP {
            return Err("The plugin package is too large.".into());
        }
        std::fs::create_dir_all(out.parent().unwrap()).map_err(|e| e.to_string())?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        std::fs::write(&out, buf).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Downloads, verifies and installs a plugin from the store. Returns its id.
pub fn install(dirs: &Dirs, id: &str) -> Result<String, String> {
    let idx = index(dirs, false)?;
    let entry = idx.plugins.iter().find(|e| e.id == id).cloned().ok_or_else(|| format!("{id} isn't in the plugin store."))?;
    let bytes = fetch(&resolve(&idx.source, &entry.url), MAX_ZIP)?;
    verify(&bytes, &entry)?;
    install_bytes(dirs, &bytes, &entry)
}

fn install_bytes(dirs: &Dirs, bytes: &[u8], entry: &Entry) -> Result<String, String> {
    let dir = dirs.data.join("plugins");
    let tmp = dir.join(format!(".{}-download", entry.id));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let result = (|| {
        unpack(bytes, &tmp)?;
        let manifest: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(tmp.join(crate::plugins::MANIFEST)).map_err(|_| "The plugin package has no manifest.")?)
            .map_err(|e| format!("The plugin's manifest is malformed: {e}"))?;
        if manifest.get("id").and_then(|v| v.as_str()) != Some(entry.id.as_str()) || manifest.get("version").and_then(|v| v.as_str()) != Some(entry.version.as_str()) {
            return Err("The plugin package doesn't match the store's listing.".to_string());
        }
        crate::plugins::install_folder(dirs, &tmp)
    })();
    let _ = std::fs::remove_dir_all(&tmp);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn entry(bytes: &[u8]) -> Entry {
        Entry {
            id: "x".into(),
            name: "X".into(),
            version: "1.0.0".into(),
            description: String::new(),
            author: String::new(),
            icon: String::new(),
            homepage: String::new(),
            engines: serde_json::json!({}),
            platforms: vec![],
            permissions: vec![],
            url: "plugin-x-1.0.0.zip".into(),
            sha256: hex::encode(Sha256::digest(bytes)),
            signature: String::new(),
            size: bytes.len() as u64,
        }
    }

    #[test]
    fn checks_the_hash() {
        let mut e = entry(b"hello");
        assert!(verify(b"hello", &e).is_ok() || public_key().is_some());
        e.sha256 = "00".into();
        assert!(verify(b"hello", &e).unwrap_err().contains("damaged"));
    }

    #[test]
    fn signatures_round_trip() {
        // The same scheme CI uses: Ed25519 over the zip's bytes, base64.
        let key = SigningKey::from_bytes(&[7u8; 32]);
        let sig = base64::engine::general_purpose::STANDARD.encode(key.sign(b"zip bytes").to_bytes());
        let raw = base64::engine::general_purpose::STANDARD.decode(sig).unwrap();
        assert!(key.verifying_key().verify(b"zip bytes", &Signature::from_slice(&raw).unwrap()).is_ok());
        assert!(key.verifying_key().verify(b"other bytes", &Signature::from_slice(&raw).unwrap()).is_err());
    }

    #[test]
    fn resolves_relative_urls() {
        assert_eq!(resolve("https://x.com/a/plugins.json", "plugin-y.zip"), "https://x.com/a/plugin-y.zip");
        assert_eq!(resolve("/tmp/store/plugins.json", "plugin-y.zip"), "/tmp/store/plugin-y.zip");
        assert_eq!(resolve("https://x.com/a/plugins.json", "https://cdn.x/p.zip"), "https://cdn.x/p.zip");
    }

    /// Checks what `node scripts/package-plugins.mjs --key …` produced against the public key built
    /// into the app, the way installing does: `cargo test -p betelgeuse-core --features plugins packaged -- --ignored`.
    #[test]
    #[ignore]
    fn packaged_plugins_verify() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../dist-plugins");
        let index: Index = serde_json::from_slice(&std::fs::read(dir.join("plugins.json")).unwrap()).unwrap();
        assert!(!index.plugins.is_empty());
        for e in &index.plugins {
            let bytes = std::fs::read(dir.join(&e.url)).unwrap();
            verify(&bytes, e).unwrap_or_else(|err| panic!("{}: {err}", e.id));
            let dest = std::env::temp_dir().join(format!("betelgeuse-store-{}-{}", e.id, std::process::id()));
            unpack(&bytes, &dest).unwrap();
            let m: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dest.join("betelgeuse-plugin.json")).unwrap()).unwrap();
            assert_eq!(m["id"], e.id.as_str());
            assert!(dest.join("main.js").is_file());
            // A tampered package fails, even with a matching checksum.
            let mut bad = bytes.clone();
            let last = bad.len() - 1;
            bad[last] ^= 1;
            let forged = Entry { sha256: hex::encode(Sha256::digest(&bad)), ..e.clone() };
            assert!(verify(&bad, &forged).unwrap_err().contains("isn't signed by Betelgeuse"));
            let _ = std::fs::remove_dir_all(dest);
            println!("{} {}: signature ok, unpacked", e.id, e.version);
        }
    }

    #[test]
    fn refuses_unsafe_paths() {
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut w = zip::ZipWriter::new(&mut buf);
            w.start_file("../evil.txt", zip::write::SimpleFileOptions::default()).unwrap();
            std::io::Write::write_all(&mut w, b"x").unwrap();
            w.finish().unwrap();
        }
        let dest = std::env::temp_dir().join(format!("betelgeuse-unpack-{}", std::process::id()));
        assert!(unpack(buf.get_ref(), &dest).unwrap_err().contains("unsafe"));
        let _ = std::fs::remove_dir_all(dest);
    }
}
