//! The workspace engine shared by the Betelgeuse apps (desktop and mobile): a folder of
//! Markdown pages with YAML frontmatter, sub-pages in folders, databases, wikilinks and backlinks,
//! the Trash, and the git history behind it all. It knows nothing about any app's interface.
pub mod git;
#[cfg(feature = "libgit2")]
pub mod git_lib;
pub mod vault;
#[cfg(feature = "plugins")]
pub mod plugin_store;
#[cfg(feature = "plugins")]
pub mod plugins;
