//! Plugins on the phone: the same commands the desktop app gives its plugin runtime, over the
//! shared core (installed plugins, which ones a workspace uses, their data, and the plugin store).
//! Plugins come from the store at run time, so new ones and updates never need a new app; each
//! says where it runs (`platforms`), and the runtime only loads those made for the phone.
use crate::AppState;
use betelgeuse_core::{plugin_store, plugins};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

fn dirs(app: &AppHandle) -> plugins::Dirs {
    let path = app.path();
    let or_temp = |r: tauri::Result<PathBuf>| r.unwrap_or_else(|_| std::env::temp_dir().join("betelgeuse"));
    plugins::Dirs { data: or_temp(path.app_data_dir()), cache: or_temp(path.app_cache_dir()), config: or_temp(path.app_config_dir()) }
}

#[tauri::command]
pub fn plugins_list(app: AppHandle) -> Vec<plugins::PluginInfo> {
    plugins::list(&dirs(&app))
}

#[tauri::command]
pub fn plugin_file(app: AppHandle, id: String, file: String) -> Result<String, String> {
    plugins::read_file(&dirs(&app), &id, &file)
}

/// Phones have no folder of plugin builds to pick from: plugins come from the store.
#[tauri::command]
pub fn plugin_install_folder() -> Result<String, String> {
    Err("On the phone, plugins install from the plugin store.".into())
}

#[tauri::command]
pub fn plugin_uninstall(app: AppHandle, id: String) -> Result<(), String> {
    plugins::uninstall(&dirs(&app), &id)
}

#[tauri::command]
pub fn plugins_enabled(state: State<AppState>) -> Vec<String> {
    plugins::enabled(&state.workspace)
}

#[tauri::command]
pub fn plugins_set_enabled(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    plugins::set_enabled(&state.workspace, ids)
}

#[tauri::command]
pub fn plugin_data_get(app: AppHandle, state: State<AppState>, id: String, scope: String) -> Result<serde_json::Value, String> {
    plugins::data_get(&dirs(&app), &state.workspace, &id, &scope)
}

#[tauri::command]
pub fn plugin_data_set(app: AppHandle, state: State<AppState>, id: String, scope: String, value: serde_json::Value) -> Result<(), String> {
    plugins::data_set(&dirs(&app), &state.workspace, &id, &scope, value)
}

#[tauri::command]
pub async fn plugin_store_index(app: AppHandle, refresh: bool) -> Result<plugin_store::Index, String> {
    tauri::async_runtime::spawn_blocking(move || plugin_store::index(&dirs(&app), refresh)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn plugin_store_install(app: AppHandle, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || plugin_store::install(&dirs(&app), &id)).await.map_err(|e| e.to_string())?
}
