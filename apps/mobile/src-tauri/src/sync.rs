//! Sync with a git repository (the same one the desktop app pushes to), through libgit2: phones
//! have no `git` program. The repository is reached over HTTPS with an access token, which is kept
//! in the app's private storage, outside the workspace (so it is never committed).
use crate::AppState;
use betelgeuse_core::git::{Commit, GitSettings};
use betelgeuse_core::git_lib::{self as git, Auth, OnProgress};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

/// Where to sync and how to sign in.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct SyncConfig {
    pub url: String,
    #[serde(default)]
    pub username: String,
    pub token: String,
    /// When the last sync finished, in milliseconds since 1970.
    #[serde(default)]
    pub last_sync: Option<u64>,
}

impl SyncConfig {
    /// The credentials, with transfer progress sent to the app as `sync-progress` events.
    fn auth(&self, app: &AppHandle) -> Auth {
        let app = app.clone();
        let progress: OnProgress = Arc::new(move |p| {
            let _ = app.emit("sync-progress", p);
        });
        Auth { username: self.username.clone(), token: self.token.clone(), progress: Some(progress) }
    }
}

fn config_file(data: &Path) -> PathBuf {
    data.join("sync.json")
}

pub fn read_config(data: &Path) -> Option<SyncConfig> {
    serde_json::from_str(&std::fs::read_to_string(config_file(data)).ok()?).ok()
}

fn write_config(data: &Path, config: Option<&SyncConfig>) -> Result<(), String> {
    let file = config_file(data);
    match config {
        Some(c) => std::fs::write(file, serde_json::to_string_pretty(c).map_err(|e| e.to_string())?).map_err(|e| e.to_string()),
        None => match std::fs::remove_file(file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        },
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Serialize)]
pub struct SyncStatus {
    configured: bool,
    url: Option<String>,
    username: Option<String>,
    last_sync: Option<u64>,
    /// Pages changed on this phone since the last sync.
    changes: usize,
    git: Option<GitSettings>,
}

#[derive(Serialize)]
pub struct SyncResult {
    /// Pages arrived or changed: the app reloads what it shows.
    updated: bool,
    /// Pages changed on both sides, kept as "(conflicted copy)" pages.
    conflicts: Vec<String>,
    last_sync: u64,
}

/// Off the main thread, as counting changes reads the workspace (seconds on a large one, the first
/// time). Saving what it learns to git's index needs the lock; while a page save or a sync holds
/// it (or the index can't be written), it counts without saving rather than hold up the save.
#[tauri::command]
pub async fn sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let (workspace, data, lock) = (state.workspace.clone(), state.data.clone(), state.lock.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let config = read_config(&data);
        let saved = match lock.try_lock() {
            Ok(_writes) => git::status(&workspace),
            Err(_) => Err("busy".into()),
        };
        let changes = saved.or_else(|_| git::status_unsaved(&workspace)).map(|s| s.changes.len()).unwrap_or(0);
        SyncStatus {
            configured: config.is_some(),
            url: config.as_ref().map(|c| c.url.clone()),
            username: config.as_ref().map(|c| c.username.clone()).filter(|u| !u.is_empty()),
            last_sync: config.and_then(|c| c.last_sync),
            changes,
            git: git::settings(&workspace).ok(),
        }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Connects the workspace to a repository: the first sync. The welcome pages this app started
/// with stay behind unless they were edited (or have pages inside).
#[tauri::command]
pub async fn sync_connect(app: AppHandle, state: State<'_, AppState>, url: String, username: String, token: String, name: String, email: String) -> Result<String, String> {
    let (workspace, data, lock) = (state.workspace.clone(), state.data.clone(), state.lock.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let url = git::https_url(&url)?;
        let config = SyncConfig { url: url.clone(), username: username.trim().into(), token: token.trim().into(), last_sync: None };
        let _writes = lock.lock().unwrap();
        git::ensure_repo(&workspace)?;
        if !name.trim().is_empty() || !email.trim().is_empty() {
            git::set_identity(&workspace, &name, &email)?;
        }
        let keep = |rel: &str, bytes: &[u8]| !crate::is_untouched_welcome(&workspace, rel, bytes);
        let message = git::connect(&workspace, &url, &config.auth(&app), &keep)?;
        crate::changed(&app, &[]);
        write_config(&data, Some(&SyncConfig { last_sync: Some(now_ms()), ..config }))?;
        Ok(message)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Pulls what changed elsewhere and pushes what changed here.
#[tauri::command]
pub async fn sync_now(app: AppHandle, state: State<'_, AppState>) -> Result<SyncResult, String> {
    let (workspace, data, lock) = (state.workspace.clone(), state.data.clone(), state.lock.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let mut config = read_config(&data).ok_or("Sync isn't set up")?;
        let auth = config.auth(&app);
        // The network first, with page edits still going on; the merge with them held off.
        git::fetch(&workspace, &auth)?;
        let integrated = {
            let _writes = lock.lock().unwrap();
            git::integrate(&workspace)?
        };
        if integrated.updated {
            crate::changed(&app, &[]);
        }
        git::push(&workspace, &auth)?;
        let last_sync = now_ms();
        config.last_sync = Some(last_sync);
        write_config(&data, Some(&config))?;
        Ok(SyncResult { updated: integrated.updated, conflicts: integrated.conflicts, last_sync })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stops syncing. The pages and their history stay on the phone.
#[tauri::command]
pub fn sync_disconnect(state: State<AppState>) -> Result<(), String> {
    let _writes = state.lock.lock().unwrap();
    if Path::new(&state.workspace).join(".git").exists() {
        git::disconnect(&state.workspace)?;
    }
    write_config(&state.data, None)
}

/// A page's history, under the desktop app's command name (the shared history panel calls it).
#[tauri::command]
pub fn git_log(state: State<AppState>, path: Option<String>, limit: Option<usize>) -> Result<Vec<Commit>, String> {
    if !state.workspace.join(".git").exists() {
        return Ok(vec![]);
    }
    git::log(&state.workspace, path.as_deref(), limit.unwrap_or(50))
}

#[tauri::command]
pub fn git_show(state: State<AppState>, rev: String, path: String) -> Result<String, String> {
    git::show(&state.workspace, &rev, &path)
}

/// Android has no certificate store libgit2's OpenSSL can use: it doesn't look in Android's, and
/// the OpenSSL built into the app can't read certificate files at all (it's built without file
/// I/O for Android). So the system's certificate authorities (Conscrypt's on Android 14+) are
/// parsed here and handed to libgit2 in memory. Returns how many were trusted.
#[cfg(target_os = "android")]
pub fn trust_system_certificates() -> usize {
    use foreign_types_shared::ForeignType;
    // libgit2 must be set up before its options can be changed; any git2 call does that.
    let _ = git2::Config::new();
    let mut trusted = 0;
    for dir in ["/apex/com.android.conscrypt/cacerts", "/system/etc/security/cacerts"] {
        let Ok(entries) = std::fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let Ok(pem) = std::fs::read(entry.path()) else { continue };
            for cert in openssl::x509::X509::stack_from_pem(&pem).unwrap_or_default() {
                // SAFETY: libgit2 takes its own reference to the certificate (X509_STORE_add_cert).
                let added = unsafe { libgit2_sys::git_libgit2_opts(libgit2_sys::GIT_OPT_ADD_SSL_X509_CERT as std::os::raw::c_int, cert.as_ptr()) };
                if added == 0 {
                    trusted += 1;
                }
            }
        }
        if trusted > 0 {
            break;
        }
    }
    trusted
}

#[cfg(all(test, target_os = "android"))]
mod tests {
    /// On a device or emulator (needs the network): with Android's certificate authorities handed
    /// to libgit2, it reaches an HTTPS remote.
    #[test]
    #[ignore]
    fn fetches_over_https_on_android() {
        assert!(super::trust_system_certificates() > 50, "too few system certificates");
        let ws = std::env::temp_dir().join("bg-android-https");
        let _ = std::fs::remove_dir_all(&ws);
        std::fs::create_dir_all(&ws).unwrap();
        super::git::ensure_repo(&ws).unwrap();
        git2::Repository::open(&ws).unwrap().remote("origin", "https://github.com/octocat/Hello-World.git").unwrap();
        super::git::fetch(&ws, &super::Auth::default()).unwrap();
    }
}
