mod importer;
mod library;
mod seed;

// The workspace engine lives in the shared core crate; these keep `crate::vault` / `crate::git` paths working.
pub(crate) use betelgeuse_core::{git, plugin_store, plugins, vault};

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
    /// The media library service (plugins use it through `ctx.library`).
    library: library::Shared,
}

impl Default for Shared {
    fn default() -> Self {
        Self {
            vault: Mutex::default(),
            watcher: Mutex::default(),
            pending: Mutex::default(),
            autocommit: Mutex::new(Some(AUTOCOMMIT_IDLE)),
            library: Arc::default(),
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

/// Small bits of per-machine UI state (e.g. Recents) that must survive a quit or a crash. They live in
/// the app's config folder, not the workspace, so they never show up in the workspace's git history.
fn ui_state_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("ui-state.json"))
}

fn read_ui_state(app: &AppHandle) -> serde_json::Map<String, serde_json::Value> {
    ui_state_file(app)
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

#[tauri::command]
fn ui_state_get(app: AppHandle, key: String) -> Option<String> {
    read_ui_state(&app).get(&key).and_then(|v| v.as_str()).map(str::to_string)
}

/// Writes through a temporary file and a rename, so a crash mid-write can't leave it half written.
#[tauri::command]
fn ui_state_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let file = ui_state_file(&app).ok_or("no config folder")?;
    std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    let mut state = read_ui_state(&app);
    state.insert(key, serde_json::Value::String(value));
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::Value::Object(state).to_string()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &file).map_err(|e| e.to_string())
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
        seed::seed(&path)?;
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
    library::load(app, &state.library, &path);
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

// The media library service.

#[tauri::command]
fn library_status(app: AppHandle, state: State<AppState>) -> library::Status {
    library::status(&app, &state.library)
}

#[tauri::command]
fn library_set_settings(app: AppHandle, state: State<AppState>, settings: library::StudioSettings) -> Result<(), String> {
    library::update_settings(&app, &state.library, settings)
}

#[tauri::command]
fn library_add_folder(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    library::add_root(&app, &state.library, &path)
}

#[tauri::command]
fn library_remove_folder(app: AppHandle, state: State<AppState>, name: String) -> Result<(), String> {
    library::remove_root(&app, &state.library, &name)
}

/// Plugins that use the library turn it on while they run.
#[tauri::command]
fn library_set_active(app: AppHandle, state: State<AppState>, on: bool) {
    library::set_active(&app, &state.library, on)
}

#[tauri::command]
fn library_rescan(app: AppHandle, state: State<AppState>) {
    library::rescan(&app, &state.library)
}

#[tauri::command]
fn library_clear_cache(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    library::clear_cache(&app, &state.library)
}

#[tauri::command]
fn library_search(state: State<AppState>, query: library::Query) -> library::SearchResult {
    library::search(&state.library, &query)
}

#[tauri::command]
fn library_folders(state: State<AppState>) -> Vec<(String, usize)> {
    library::folders(&state.library)
}

#[tauri::command]
fn library_tags(state: State<AppState>) -> Vec<(String, usize)> {
    library::tags(&state.library)
}

#[tauri::command]
fn library_set_meta(state: State<AppState>, ids: Vec<String>, patch: library::MetaPatch) -> Result<(), String> {
    library::set_meta(&state.library, &ids, &patch)
}

/// The asset's thumbnail (PNG/JPEG bytes), or an empty response when there isn't one.
#[tauri::command]
async fn library_thumbnail(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<tauri::ipc::Response, String> {
    let lib = state.library.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || library::thumbnail(&app, &lib, &id))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes.unwrap_or_default()))
}

/// Opens the file in its default app (or `with`, an app name).
#[tauri::command]
fn library_open(app: AppHandle, state: State<AppState>, id: String, with: Option<String>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = library::path_of(&state.library, &id)?;
    app.opener().open_path(path.to_string_lossy(), with).map_err(|e| e.to_string())
}

#[tauri::command]
fn library_subfolders(state: State<AppState>, id: String) -> Result<Vec<String>, String> {
    library::subfolders(&state.library, &id)
}

#[tauri::command]
fn library_folder_exists(state: State<AppState>, id: String) -> bool {
    library::folder_exists(&state.library, &id)
}

/// Creates a production's project folder with the template's sub-folders; returns its id.
#[tauri::command]
fn library_create_folder(app: AppHandle, state: State<AppState>, parent: String, name: String, template: Vec<String>) -> Result<String, String> {
    library::create_folder(&app, &state.library, &parent, &name, &template)
}

#[tauri::command]
fn library_reveal(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = library::path_of(&state.library, &id)?;
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}

// Plugins.

/// Where this app keeps plugins: its data, cache and config folders.
fn plugin_dirs(app: &AppHandle) -> plugins::Dirs {
    let path = app.path();
    let or_temp = |r: tauri::Result<PathBuf>| r.unwrap_or_else(|_| std::env::temp_dir().join("betelgeuse"));
    plugins::Dirs { data: or_temp(path.app_data_dir()), cache: or_temp(path.app_cache_dir()), config: or_temp(path.app_config_dir()) }
}

#[tauri::command]
fn plugins_list(app: AppHandle) -> Vec<plugins::PluginInfo> {
    plugins::list(&plugin_dirs(&app))
}

/// A file from a plugin's folder (its code or styles).
#[tauri::command]
fn plugin_file(app: AppHandle, id: String, file: String) -> Result<String, String> {
    plugins::read_file(&plugin_dirs(&app), &id, &file)
}

#[tauri::command]
fn plugin_install_folder(app: AppHandle, path: String) -> Result<String, String> {
    plugins::install_folder(&plugin_dirs(&app), Path::new(&path))
}

#[tauri::command]
fn plugin_uninstall(app: AppHandle, id: String) -> Result<(), String> {
    plugins::uninstall(&plugin_dirs(&app), &id)
}

#[tauri::command]
fn plugins_enabled(state: State<AppState>) -> Result<Vec<String>, String> {
    Ok(plugins::enabled(&vault(&state)?))
}

#[tauri::command]
fn plugins_set_enabled(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    plugins::set_enabled(&vault(&state)?, ids)
}

#[tauri::command]
fn plugin_data_get(app: AppHandle, state: State<AppState>, id: String, scope: String) -> Result<serde_json::Value, String> {
    plugins::data_get(&plugin_dirs(&app), &vault(&state)?, &id, &scope)
}

#[tauri::command]
fn plugin_data_set(app: AppHandle, state: State<AppState>, id: String, scope: String, value: serde_json::Value) -> Result<(), String> {
    plugins::data_set(&plugin_dirs(&app), &vault(&state)?, &id, &scope, value)
}

/// The plugin store's list of plugins (cached; `refresh` fetches it again).
#[tauri::command]
async fn plugin_store_index(app: AppHandle, refresh: bool) -> Result<plugin_store::Index, String> {
    tauri::async_runtime::spawn_blocking(move || plugin_store::index(&plugin_dirs(&app), refresh)).await.map_err(|e| e.to_string())?
}

/// Downloads, verifies and installs a plugin from the store; returns its id.
#[tauri::command]
async fn plugin_store_install(app: AppHandle, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || plugin_store::install(&plugin_dirs(&app), &id)).await.map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state: AppState = Arc::default();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            ui_state_get,
            ui_state_set,
            import_pages,
            set_ai_policy,
            mcp_info,
            library_status,
            library_set_settings,
            library_add_folder,
            library_remove_folder,
            library_set_active,
            library_rescan,
            library_clear_cache,
            library_search,
            library_folders,
            library_tags,
            library_set_meta,
            library_thumbnail,
            library_open,
            library_reveal,
            library_subfolders,
            library_folder_exists,
            library_create_folder,
            plugins_list,
            plugin_file,
            plugin_install_folder,
            plugin_uninstall,
            plugins_enabled,
            plugins_set_enabled,
            plugin_data_get,
            plugin_data_set,
            plugin_store_index,
            plugin_store_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running Betelgeuse");
}
