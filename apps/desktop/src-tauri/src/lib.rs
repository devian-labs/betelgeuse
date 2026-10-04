mod git;
mod importer;
mod vault;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

/// Changes are committed once the vault has been quiet for this long.
const AUTOCOMMIT_IDLE: Duration = Duration::from_secs(8);

struct Shared {
    vault: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    /// Time of the last file change that has not been committed yet.
    pending: Mutex<Option<Instant>>,
    /// Idle time before auto-committing; `None` turns auto-commit off.
    autocommit: Mutex<Option<Duration>>,
}

impl Default for Shared {
    fn default() -> Self {
        Self {
            vault: Mutex::default(),
            watcher: Mutex::default(),
            pending: Mutex::default(),
            autocommit: Mutex::new(Some(AUTOCOMMIT_IDLE)),
        }
    }
}

type AppState = Arc<Shared>;

#[derive(Serialize)]
struct VaultInfo {
    path: String,
    name: String,
}

#[derive(Serialize)]
struct McpInfo {
    server_path: String,
    built: bool,
    vault: String,
    /// Absolute path to Node.js, if installed.
    node_path: Option<String>,
}

fn vault(state: &AppState) -> Result<PathBuf, String> {
    state.vault.lock().unwrap().clone().ok_or_else(|| "no workspace open".into())
}

fn config_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("config.json"))
}

fn saved_vault(app: &AppHandle) -> Option<PathBuf> {
    let text = std::fs::read_to_string(config_file(app)?).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    json.get("vault")?.as_str().map(PathBuf::from).filter(|p| p.is_dir())
}

fn remember_vault(app: &AppHandle, path: &Path) {
    if let Some(file) = config_file(app) {
        let _ = std::fs::create_dir_all(file.parent().unwrap());
        let _ = std::fs::write(file, serde_json::json!({ "vault": path }).to_string());
    }
}

fn info(path: &Path) -> VaultInfo {
    VaultInfo {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name().map_or("Vault".into(), |n| n.to_string_lossy().into_owned()),
    }
}

/// Opens (creating and seeding if needed) a vault and starts watching it.
fn activate(app: &AppHandle, state: &AppState, path: PathBuf, remember: bool) -> Result<VaultInfo, String> {
    let fresh = !path.exists() || std::fs::read_dir(&path).map_err(|e| e.to_string())?.next().is_none();
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    if fresh {
        vault::seed(&path)?;
    }
    git::ensure_repo(&path)?;

    let handle = app.clone();
    let shared = state.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if event.kind.is_access() {
            return;
        }
        let paths: Vec<String> = event
            .paths
            .iter()
            .filter(|p| !p.components().any(|c| c.as_os_str() == ".git"))
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        if paths.is_empty() {
            return;
        }
        *shared.pending.lock().unwrap() = Some(Instant::now());
        let _ = handle.emit("vault-changed", paths);
    })
    .map_err(|e| e.to_string())?;
    watcher.watch(&path, RecursiveMode::Recursive).map_err(|e| e.to_string())?;

    *state.watcher.lock().unwrap() = Some(watcher);
    *state.vault.lock().unwrap() = Some(path.clone());
    if remember {
        remember_vault(app, &path);
    }
    Ok(info(&path))
}

fn spawn_autocommit(app: AppHandle, state: AppState) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        let Some(idle) = *state.autocommit.lock().unwrap() else { continue };
        let due = matches!(*state.pending.lock().unwrap(), Some(t) if t.elapsed() >= idle);
        if !due {
            continue;
        }
        *state.pending.lock().unwrap() = None;
        let Some(path) = state.vault.lock().unwrap().clone() else { continue };
        if let Some(message) = git::auto_message(&path) {
            if let Ok(Some(hash)) = git::commit_all(&path, &message) {
                let _ = app.emit("git-committed", hash);
            }
        }
    });
}

#[tauri::command]
fn current_vault(app: AppHandle, state: State<AppState>) -> Result<VaultInfo, String> {
    if let Ok(path) = vault(&state) {
        return Ok(info(&path));
    }
    // BETELGEUSE_WORKSPACE (also read by the MCP server) overrides the saved workspace for this run only.
    if let Some(path) = std::env::var_os("BETELGEUSE_WORKSPACE").or_else(|| std::env::var_os("BETELGEUSE_VAULT")) {
        return activate(&app, &state, PathBuf::from(path), false);
    }
    let path = saved_vault(&app)
        .or_else(|| dirs::home_dir().map(|h| h.join("Betelgeuse")))
        .ok_or("could not determine a workspace location")?;
    activate(&app, &state, path, true)
}

#[tauri::command]
fn open_vault(app: AppHandle, state: State<AppState>, path: String) -> Result<VaultInfo, String> {
    activate(&app, &state, PathBuf::from(path), true)
}

#[tauri::command]
fn list_notes(state: State<AppState>) -> Result<Vec<vault::NoteMeta>, String> {
    Ok(vault::list_notes(&vault(&state)?))
}

#[tauri::command]
fn read_note(state: State<AppState>, path: String) -> Result<String, String> {
    vault::read_note(&vault(&state)?, &path)
}

#[tauri::command]
fn write_note(state: State<AppState>, path: String, content: String) -> Result<(), String> {
    vault::write_note(&vault(&state)?, &path, &content)
}

#[tauri::command]
fn create_note(state: State<AppState>, parent: Option<String>, title: String) -> Result<String, String> {
    vault::create_note(&vault(&state)?, parent.as_deref(), &title)
}

#[tauri::command]
fn database_rows(state: State<AppState>, path: String) -> Result<Vec<vault::Row>, String> {
    vault::database_rows(&vault(&state)?, &path)
}

#[tauri::command]
fn duplicate_note(state: State<AppState>, path: String) -> Result<String, String> {
    vault::duplicate_note(&vault(&state)?, &path)
}

#[tauri::command]
fn save_asset(state: State<AppState>, name: String, bytes: Vec<u8>) -> Result<String, String> {
    vault::save_asset(&vault(&state)?, &name, &bytes)
}

/// Returns raw bytes (an ArrayBuffer in JS) rather than a JSON number array.
#[tauri::command]
fn read_asset(state: State<AppState>, path: String) -> Result<tauri::ipc::Response, String> {
    vault::read_asset(&vault(&state)?, &path).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn rename_note(state: State<AppState>, path: String, title: String) -> Result<String, String> {
    vault::rename_note(&vault(&state)?, &path, &title)
}

/// Moves a page (and its sub-pages) under another page, or to the top level (`dest` "").
#[tauri::command]
fn move_note(state: State<AppState>, path: String, dest: String) -> Result<String, String> {
    vault::move_note(&vault(&state)?, &path, &dest)
}

/// Moves a page to the trash; returns the trash id (for Undo).
#[tauri::command]
fn delete_note(state: State<AppState>, path: String) -> Result<String, String> {
    vault::delete_note(&vault(&state)?, &path)
}

#[tauri::command]
fn list_trash(state: State<AppState>) -> Result<Vec<vault::TrashItem>, String> {
    Ok(vault::list_trash(&vault(&state)?))
}

#[tauri::command]
fn restore_trash(state: State<AppState>, id: String) -> Result<String, String> {
    vault::restore_trash(&vault(&state)?, &id)
}

#[tauri::command]
fn purge_trash(state: State<AppState>, id: Option<String>) -> Result<(), String> {
    vault::purge_trash(&vault(&state)?, id.as_deref())
}

#[tauri::command]
fn search_notes(state: State<AppState>, query: String) -> Result<Vec<vault::SearchHit>, String> {
    Ok(vault::search(&vault(&state)?, &query))
}

#[tauri::command]
fn backlinks(state: State<AppState>, path: String) -> Result<Vec<vault::NoteMeta>, String> {
    Ok(vault::backlinks(&vault(&state)?, &path))
}

#[tauri::command]
fn git_status(state: State<AppState>) -> Result<git::RepoStatus, String> {
    git::status(&vault(&state)?)
}

#[tauri::command]
fn git_commit(state: State<AppState>, message: Option<String>) -> Result<Option<String>, String> {
    let path = vault(&state)?;
    let message = message.filter(|m| !m.trim().is_empty()).or_else(|| git::auto_message(&path));
    *state.pending.lock().unwrap() = None;
    match message {
        Some(m) => git::commit_all(&path, &m),
        None => Ok(None),
    }
}

#[tauri::command]
fn git_log(state: State<AppState>, path: Option<String>, limit: Option<usize>) -> Result<Vec<git::Commit>, String> {
    git::log(&vault(&state)?, path.as_deref(), limit.unwrap_or(50))
}

#[tauri::command]
fn git_show(state: State<AppState>, rev: String, path: String) -> Result<String, String> {
    git::show(&vault(&state)?, &rev, &path)
}

#[tauri::command]
fn git_sync(state: State<AppState>) -> Result<String, String> {
    let path = vault(&state)?;
    if let Some(m) = git::auto_message(&path) {
        git::commit_all(&path, &m)?;
    }
    git::sync(&path)
}

#[tauri::command]
fn git_settings(state: State<AppState>) -> Result<git::GitSettings, String> {
    git::settings(&vault(&state)?)
}

#[tauri::command]
fn git_set_remote(state: State<AppState>, url: String) -> Result<(), String> {
    git::set_remote(&vault(&state)?, &url)
}

#[tauri::command]
fn git_set_identity(state: State<AppState>, name: String, email: String) -> Result<(), String> {
    git::set_identity(&vault(&state)?, &name, &email)
}

#[tauri::command]
fn git_test_remote(state: State<AppState>) -> Result<String, String> {
    git::test_remote(&vault(&state)?)
}

#[tauri::command]
fn git_publish(state: State<AppState>) -> Result<String, String> {
    let path = vault(&state)?;
    if let Some(m) = git::auto_message(&path) {
        git::commit_all(&path, &m)?;
    }
    git::publish(&path)
}

/// Seconds of quiet before auto-committing; 0 disables auto-commit.
#[tauri::command]
fn set_autocommit(state: State<AppState>, seconds: u64) {
    *state.autocommit.lock().unwrap() = (seconds > 0).then(|| Duration::from_secs(seconds));
}

#[tauri::command]
fn get_ai_policy(state: State<AppState>) -> Result<String, String> {
    Ok(vault::ai_policy(&vault(&state)?))
}

#[tauri::command]
fn set_ai_policy(state: State<AppState>, policy: String) -> Result<(), String> {
    vault::set_ai_policy(&vault(&state)?, &policy)
}

/// Imports a Notion export (.zip or folder) or an Obsidian vault, then commits it as one change.
#[tauri::command]
async fn import_pages(state: State<'_, AppState>, source: String, path: String) -> Result<importer::ImportReport, String> {
    let ws = vault(&state)?;
    let src = PathBuf::from(path);
    let report = tauri::async_runtime::spawn_blocking({
        let ws = ws.clone();
        move || match source.as_str() {
            "notion" => importer::import_notion(&ws, &src),
            "obsidian" => importer::import_obsidian(&ws, &src),
            other => Err(format!("unknown import source: {other}")),
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    let label = vault::title_of(&report.root);
    git::commit_all(&ws, &format!("Import {label} ({} pages, {} databases)", report.pages, report.databases))?;
    *state.pending.lock().unwrap() = None;
    Ok(report)
}

#[tauri::command]
fn mcp_info(app: AppHandle, state: State<AppState>) -> Result<McpInfo, String> {
    // Installed apps ship the server as a bundled resource; source checkouts can also use packages/mcp/dist.
    let bundled = app.path().resolve("mcp/betelgeuse-mcp.mjs", tauri::path::BaseDirectory::Resource).ok();
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../packages/mcp/dist/betelgeuse-mcp.mjs");
    let server = bundled.filter(|p| p.exists()).unwrap_or(source);
    let server = server.canonicalize().unwrap_or(server);
    Ok(McpInfo {
        built: server.exists(),
        server_path: server.to_string_lossy().into_owned(),
        vault: vault(&state)?.to_string_lossy().into_owned(),
        node_path: find_node(),
    })
}

/// Apps opened from Finder don't inherit the shell's PATH (Homebrew, nvm, …), so ask a login
/// shell where `node` is. The absolute path also works in clients like Claude Desktop.
fn find_node() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = std::process::Command::new(shell).args(["-lc", "command -v node"]).output().ok()?;
    let path = String::from_utf8_lossy(&out.stdout).lines().last()?.trim().to_string();
    (out.status.success() && Path::new(&path).is_absolute()).then_some(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state: AppState = Arc::default();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state.clone())
        .setup(move |app| {
            spawn_autocommit(app.handle().clone(), state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            current_vault,
            open_vault,
            list_notes,
            read_note,
            write_note,
            create_note,
            database_rows,
            duplicate_note,
            save_asset,
            read_asset,
            rename_note,
            move_note,
            delete_note,
            list_trash,
            restore_trash,
            purge_trash,
            search_notes,
            backlinks,
            git_status,
            git_commit,
            git_log,
            git_show,
            git_sync,
            git_settings,
            git_set_remote,
            git_set_identity,
            git_test_remote,
            git_publish,
            set_autocommit,
            get_ai_policy,
            import_pages,
            set_ai_policy,
            mcp_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running Betelgeuse");
}
