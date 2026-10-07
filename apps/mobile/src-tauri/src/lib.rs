//! Betelgeuse for iOS and Android. The workspace engine is the shared core crate; this is the thin
//! layer that hands it to the interface, under the same command names the desktop app uses, so the
//! shared React code (editor, databases) works unchanged.
//!
//! The workspace lives in the app's private storage. There is no git here yet: phones have no `git`
//! program, so sync arrives with the core's move to a git library.
use betelgeuse_core::vault;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

struct AppState {
    workspace: PathBuf,
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
fn write_note(state: State<AppState>, path: String, content: String) -> Result<(), String> {
    vault::write_note(&state.workspace, &path, &content)
}

#[tauri::command]
fn create_note(state: State<AppState>, parent: Option<String>, title: String) -> Result<String, String> {
    vault::create_note(&state.workspace, parent.as_deref(), &title)
}

#[tauri::command]
fn database_rows(state: State<AppState>, path: String) -> Result<Vec<vault::Row>, String> {
    vault::database_rows(&state.workspace, &path)
}

#[tauri::command]
fn duplicate_note(state: State<AppState>, path: String) -> Result<String, String> {
    vault::duplicate_note(&state.workspace, &path)
}

#[tauri::command]
fn save_asset(state: State<AppState>, name: String, bytes: Vec<u8>) -> Result<String, String> {
    vault::save_asset(&state.workspace, &name, &bytes)
}

/// Returns raw bytes (an ArrayBuffer in JS) rather than a JSON number array.
#[tauri::command]
fn read_asset(state: State<AppState>, path: String) -> Result<tauri::ipc::Response, String> {
    vault::read_asset(&state.workspace, &path).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn rename_note(state: State<AppState>, path: String, title: String) -> Result<String, String> {
    vault::rename_note(&state.workspace, &path, &title)
}

#[tauri::command]
fn move_note(state: State<AppState>, path: String, dest: String) -> Result<String, String> {
    vault::move_note(&state.workspace, &path, &dest)
}

/// Moves a page to the Trash; returns the trash id.
#[tauri::command]
fn delete_note(state: State<AppState>, path: String) -> Result<String, String> {
    vault::delete_note(&state.workspace, &path)
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
/// `env(safe-area-inset-*)` padding instead.
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
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let workspace = workspace_dir(app.handle())?;
            seed_if_empty(&workspace)?;
            app.manage(AppState { workspace });
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
            search_notes,
            backlinks,
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
