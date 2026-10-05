//! The pages a new workspace starts with. They describe this app's interface, so they live with the
//! desktop app rather than in the shared core.
use crate::vault::write_note;
use std::path::Path;

/// Embeds `seed/<path>` for each workspace path; the `seed/` folder mirrors the workspace layout.
macro_rules! seed_pages {
    ($($rel:literal),* $(,)?) => {
        &[$(($rel, include_str!(concat!("../seed/", $rel)))),*]
    };
}

/// The pages a new workspace starts with: the Welcome guide, plus a page and a database to try things on.
const SEED: &[(&str, &str)] = seed_pages![
    "Welcome.md",
    "Welcome/Appearance.md",
    "Welcome/Connect your AI agents.md",
    "Welcome/Databases.md",
    "Welcome/Formatting and colours.md",
    "Welcome/Getting around.md",
    "Welcome/History and sync.md",
    "Welcome/Import.md",
    "Welcome/Keyboard shortcuts.md",
    "Welcome/Links and backlinks.md",
    "Welcome/Pages and sub-pages.md",
    "Welcome/Trash.md",
    "Welcome/What AI agents can see.md",
    "Welcome/Writing and blocks.md",
    "Welcome/Your files on disk.md",
    "Ideas.md",
    "Roadmap.md",
    "Roadmap/Design the database views.md",
    "Roadmap/Ship the MCP server.md",
    "Roadmap/Sync vault to GitHub.md",
];

pub fn seed(vault: &Path) -> Result<(), String> {
    for (rel, content) in SEED {
        write_note(vault, rel, content)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{backlinks, link_matches, list_notes, markdown_files, rel_string, wikilinks};
    use std::fs;

    #[test]
    fn seed_writes_every_seed_file_with_working_links() {
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("seed");
        let mut on_disk: Vec<String> = markdown_files(&src).map(|p| rel_string(&src, &p)).collect();
        let mut embedded: Vec<String> = SEED.iter().map(|(rel, _)| rel.to_string()).collect();
        on_disk.sort();
        embedded.sort();
        assert_eq!(embedded, on_disk, "list every file in src-tauri/seed in SEED");

        let dir = std::env::temp_dir().join(format!("bg-seed-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        seed(&dir).unwrap();
        assert_eq!(list_notes(&dir).len(), SEED.len());
        for (rel, content) in SEED {
            assert_eq!(fs::read_to_string(dir.join(rel)).unwrap(), *content);
            for target in wikilinks(content) {
                assert!(SEED.iter().any(|(page, _)| link_matches(target, page)), "{rel} links to missing [[{target}]]");
            }
        }
        assert!(!backlinks(&dir, "Welcome/Databases.md").is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
