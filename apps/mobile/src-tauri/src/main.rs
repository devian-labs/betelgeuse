// Lets `tauri dev` run the mobile app in a desktop window, handy while building its interface.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    betelgeuse_mobile_lib::run()
}
