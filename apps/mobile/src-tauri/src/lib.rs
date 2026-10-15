//! Betelgeuse for iOS and Android. The workspace engine is the shared core crate; this is the thin
//! layer that hands it to the interface, under the same command names the desktop app uses, so the
//! shared React code (editor, databases) works unchanged.
//!
//! The workspace lives in the app's private storage, and syncs with a git repository (see sync.rs).
mod plugin_host;
mod sync;

use betelgeuse_core::vault;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    workspace: PathBuf,
    /// The app's private storage (sync settings live here, outside the workspace).
    data: PathBuf,
    /// Held by every change to the workspace's files, and by a sync while it merges into them, so
    /// a page saved mid-sync is neither lost nor half-merged.
    lock: Arc<Mutex<()>>,
}

/// Tells the interface (and plugins, through `onChange`) that pages changed: the desktop app's
/// file watcher does this there; here every write and sync says so itself.
/// `paths` are the pages whose text changed (a save while typing); none means anything may have.
pub(crate) fn changed(app: &AppHandle, paths: &[&str]) {
    let _ = app.emit("vault-changed", paths);
}

impl AppState {
    fn write(&self) -> std::sync::MutexGuard<'_, ()> {
        self.lock.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[derive(Serialize)]
struct VaultInfo {
    path: String,
    name: String,
}

/// The pages a new phone workspace starts with.
const WELCOME: &[(&str, &str)] = &[("Welcome.md", include_str!("../welcome/Welcome.md")), ("Inbox.md", include_str!("../welcome/Inbox.md"))];

fn workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("Workspace");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Welcome pages earlier versions of the app wrote, which still count as untouched.
const PREVIOUS_WELCOME: &[(&str, &str)] = &[("Welcome.md", include_str!("../welcome/previous/Welcome.md"))];

/// A welcome page as this app wrote it, with nothing inside it: not worth keeping when the phone
/// connects to a repository that already has pages.
pub(crate) fn is_untouched_welcome(workspace: &Path, rel: &str, bytes: &[u8]) -> bool {
    WELCOME.iter().chain(PREVIOUS_WELCOME).any(|(page, content)| *page == rel && content.as_bytes() == bytes) && !workspace.join(rel.trim_end_matches(".md")).exists()
}

/// Writes the welcome pages into an empty workspace, and never over anything already there.
fn seed_if_empty(dir: &Path) -> Result<(), String> {
    if !vault::list_notes(dir).is_empty() {
        return Ok(());
    }
    for (rel, content) in WELCOME {
        vault::write_note(dir, rel, content)?;
    }
    Ok(())
}

#[tauri::command]
fn current_vault(state: State<AppState>) -> VaultInfo {
    VaultInfo { path: state.workspace.to_string_lossy().into_owned(), name: "Betelgeuse".into() }
}

#[tauri::command]
fn list_notes(state: State<AppState>) -> Vec<vault::NoteMeta> {
    vault::list_notes(&state.workspace)
}

#[tauri::command]
fn read_note(state: State<AppState>, path: String) -> Result<String, String> {
    vault::read_note(&state.workspace, &path)
}

#[tauri::command]
fn write_note(app: AppHandle, state: State<AppState>, path: String, content: String) -> Result<(), String> {
    let _writes = state.write();
    let done = vault::write_note(&state.workspace, &path, &content);
    changed(&app, &[&path]);
    done
}

#[tauri::command]
fn create_note(app: AppHandle, state: State<AppState>, parent: Option<String>, title: String) -> Result<String, String> {
    let _writes = state.write();
    let done = vault::create_note(&state.workspace, parent.as_deref(), &title);
    changed(&app, &[]);
    done
}

#[tauri::command]
fn database_rows(state: State<AppState>, path: String) -> Result<Vec<vault::Row>, String> {
    vault::database_rows(&state.workspace, &path)
}

#[tauri::command]
fn duplicate_note(app: AppHandle, state: State<AppState>, path: String) -> Result<String, String> {
    let _writes = state.write();
    let done = vault::duplicate_note(&state.workspace, &path);
    changed(&app, &[]);
    done
}

#[tauri::command]
fn save_asset(app: AppHandle, state: State<AppState>, name: String, bytes: Vec<u8>) -> Result<String, String> {
    let _writes = state.write();
    let done = vault::save_asset(&state.workspace, &name, &bytes);
    changed(&app, &[]);
    done
}

/// Returns raw bytes (an ArrayBuffer in JS) rather than a JSON number array.
#[tauri::command]
fn read_asset(state: State<AppState>, path: String) -> Result<tauri::ipc::Response, String> {
    vault::read_asset(&state.workspace, &path).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn rename_note(app: AppHandle, state: State<AppState>, path: String, title: String) -> Result<String, String> {
    let _writes = state.write();
    let done = vault::rename_note(&state.workspace, &path, &title);
    changed(&app, &[]);
    done
}

#[tauri::command]
fn move_note(app: AppHandle, state: State<AppState>, path: String, dest: String) -> Result<String, String> {
    let _writes = state.write();
    let done = vault::move_note(&state.workspace, &path, &dest);
    changed(&app, &[]);
    done
}

/// Moves a page to the Trash; returns the trash id.
#[tauri::command]
fn delete_note(app: AppHandle, state: State<AppState>, path: String) -> Result<String, String> {
    let _writes = state.write();
    let done = vault::delete_note(&state.workspace, &path);
    changed(&app, &[]);
    done
}

#[tauri::command]
fn list_trash(state: State<AppState>) -> Vec<vault::TrashItem> {
    vault::list_trash(&state.workspace)
}

#[tauri::command]
fn restore_trash(app: AppHandle, state: State<AppState>, id: String) -> Result<String, String> {
    let _writes = state.write();
    let done = vault::restore_trash(&state.workspace, &id);
    changed(&app, &[]);
    done
}

#[tauri::command]
fn purge_trash(app: AppHandle, state: State<AppState>, id: Option<String>) -> Result<(), String> {
    let _writes = state.write();
    let done = vault::purge_trash(&state.workspace, id.as_deref());
    changed(&app, &[]);
    done
}

#[tauri::command]
fn search_notes(state: State<AppState>, query: String) -> Vec<vault::SearchHit> {
    vault::search(&state.workspace, &query)
}

#[tauri::command]
fn backlinks(state: State<AppState>, path: String) -> Vec<vault::NoteMeta> {
    vault::backlinks(&state.workspace, &path)
}

/// On iOS the web view's scroll view shrinks the page by the safe areas (notch and home indicator)
/// on its own, leaving a blank band at the bottom of the screen. Turning that off gives the page the
/// whole screen; the interface keeps clear of the notch and home indicator with CSS
/// `env(safe-area-inset-*)` padding instead. It also turns on the edge swipe, which steps back
/// through the history entries the app pushes for each screen.
#[cfg(target_os = "ios")]
fn fill_screen(app: &tauri::App) {
    use objc2::{msg_send, runtime::AnyObject};
    let Some(window) = app.get_webview_window("main") else { return };
    let _ = window.with_webview(|webview| unsafe {
        let wk_webview = &*(webview.inner() as *const AnyObject);
        let scroll_view: *mut AnyObject = msg_send![wk_webview, scrollView];
        if let Some(scroll_view) = scroll_view.as_ref() {
            // UIScrollViewContentInsetAdjustmentBehavior.never
            let _: () = msg_send![scroll_view, setContentInsetAdjustmentBehavior: 2isize];
        }
        let _: () = msg_send![wk_webview, setAllowsBackForwardNavigationGestures: true];
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Links (cover photo credits, About) open in the phone's browser.
        .plugin(tauri_plugin_opener::init())
        // Plugins ask before doing something that can't be undone.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let workspace = workspace_dir(app.handle())?;
            seed_if_empty(&workspace)?;
            let data = app.path().app_data_dir()?;
            #[cfg(target_os = "android")]
            sync::trust_system_certificates();
            app.manage(AppState { workspace, data, lock: Arc::default() });
            #[cfg(target_os = "ios")]
            fill_screen(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            current_vault,
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
            sync::sync_status,
            sync::sync_connect,
            sync::sync_now,
            sync::sync_disconnect,
            sync::git_log,
            sync::git_show,
            plugin_host::plugins_list,
            plugin_host::plugin_file,
            plugin_host::plugin_install_folder,
            plugin_host::plugin_uninstall,
            plugin_host::plugins_enabled,
            plugin_host::plugins_set_enabled,
            plugin_host::plugin_data_get,
            plugin_host::plugin_data_set,
            plugin_host::plugin_store_index,
            plugin_host::plugin_store_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Betelgeuse");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeds_an_empty_workspace_once_and_never_over_existing_pages() {
        let dir = std::env::temp_dir().join(format!("bg-mobile-seed-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        seed_if_empty(&dir).unwrap();
        let titles: Vec<String> = vault::list_notes(&dir).into_iter().map(|n| n.title).collect();
        assert_eq!(titles.len(), WELCOME.len(), "{titles:?}");
        for (_, content) in WELCOME {
            for target in vault::wikilinks(content) {
                assert!(WELCOME.iter().any(|(page, _)| vault::link_matches(target, page)), "welcome links to missing [[{target}]]");
            }
        }

        vault::write_note(&dir, "Welcome.md", "edited").unwrap();
        seed_if_empty(&dir).unwrap();
        assert_eq!(vault::read_note(&dir, "Welcome.md").unwrap(), "edited");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
