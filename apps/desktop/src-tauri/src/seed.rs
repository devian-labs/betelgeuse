//! Fills a new workspace with the starter pages every app shares (see `betelgeuse_core::starter`).
//! The longer guide in `seed/` is the website's "Using Betelgeuse" docs.
use crate::vault::write_note;
use betelgeuse_core::starter::{pages, App};
use std::path::Path;

pub fn seed(vault: &Path) -> Result<(), String> {
    for (rel, content) in pages(App::Desktop) {
        write_note(vault, rel, &content)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{backlinks, list_notes};
    use std::fs;

    #[test]
    fn a_new_workspace_gets_the_starter_pages() {
        let dir = std::env::temp_dir().join(format!("bg-seed-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        seed(&dir).unwrap();
        let mut titles: Vec<String> = list_notes(&dir).into_iter().map(|n| n.title).collect();
        titles.sort();
        assert_eq!(titles, ["Book the venue", "Design the landing page", "Meeting notes", "Plan the team offsite", "Tasks", "Welcome", "Write the launch post"]);
        assert!(fs::read_to_string(dir.join("Welcome.md")).unwrap().contains("Connect agents"), "desktop's Welcome mentions agents");
        assert!(!backlinks(&dir, "Tasks.md").is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
