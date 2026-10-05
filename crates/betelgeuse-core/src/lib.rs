//! The workspace engine shared by the Betelgeuse apps (desktop now, mobile next): a folder of
//! Markdown pages with YAML frontmatter, sub-pages in folders, databases, wikilinks and backlinks,
//! the Trash, and the git history behind it all. It knows nothing about any app's interface.
pub mod git;
pub mod vault;
