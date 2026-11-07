//! The pages a new workspace starts with, the same in every app (`packages/starter-pages`). The web
//! app reads that folder at build time; the desktop and phone apps get them from here.
//!
//! Sample dates are written `today+3`, so a task list is never out of date when someone first sees it.
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

#[derive(Clone, Copy, PartialEq)]
pub enum App {
    Desktop,
    Phone,
}

macro_rules! page {
    ($rel:literal) => {
        ($rel, include_str!(concat!("../../../packages/starter-pages/", $rel)))
    };
}

const WELCOME_DESKTOP: &str = include_str!("../../../packages/starter-pages/Welcome.desktop.md");
const WELCOME_PHONE: &str = include_str!("../../../packages/starter-pages/Welcome.phone.md");

/// Every page but Welcome, which each app words for itself.
const PAGES: &[(&str, &str)] = &[
    page!("Meeting notes.md"),
    page!("Tasks.md"),
    page!("Tasks/Book the venue.md"),
    page!("Tasks/Design the landing page.md"),
    page!("Tasks/Plan the team offsite.md"),
    page!("Tasks/Write the launch post.md"),
];

fn templates(app: App) -> impl Iterator<Item = (&'static str, &'static str)> {
    let welcome = if app == App::Desktop { WELCOME_DESKTOP } else { WELCOME_PHONE };
    std::iter::once(("Welcome.md", welcome)).chain(PAGES.iter().copied())
}

/// (year, month, day) of a count of days since 1970-01-01.
fn civil(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// Finds `today+3` or `today-3` at `at`: its offset and length.
fn placeholder(text: &str, at: usize) -> Option<(i64, usize)> {
    let rest = text[at..].strip_prefix("today")?;
    let sign = match rest.chars().next()? {
        '+' => 1,
        '-' => -1,
        _ => return None,
    };
    let digits: String = rest[1..].chars().take_while(char::is_ascii_digit).collect();
    let before_ok = !text[..at].ends_with(|c: char| c.is_alphanumeric());
    (before_ok && !digits.is_empty()).then(|| (sign * digits.parse::<i64>().unwrap_or(0), 5 + 1 + digits.len()))
}

/// Replaces each placeholder with what `fill` makes of its offset.
fn replace_placeholders(text: &str, fill: impl Fn(i64) -> String) -> String {
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < text.len() {
        if let Some((offset, len)) = placeholder(text, i) {
            out.push_str(&fill(offset));
            i += len;
        } else {
            let c = text[i..].chars().next().unwrap();
            out.push(c);
            i += c.len_utf8();
        }
    }
    out
}

pub fn fill_dates(text: &str, today: i64) -> String {
    replace_placeholders(text, |offset| {
        let (y, m, d) = civil(today + offset);
        format!("{y:04}-{m:02}-{d:02}")
    })
}

fn today() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| (d.as_secs() / 86_400) as i64)
}

/// The pages to write into a new workspace, with today's dates.
pub fn pages(app: App) -> Vec<(&'static str, String)> {
    let day = today();
    templates(app).map(|(rel, text)| (rel, fill_dates(text, day))).collect()
}

/// Whether a line is a date in the form `fill_dates` writes, at the same place as a template's.
fn same_but_dates(template: &str, actual: &str) -> bool {
    const MARK: char = '\u{1}';
    let masked = replace_placeholders(template, |_| MARK.to_string());
    let mut rest = actual;
    let mut parts = masked.split(MARK).peekable();
    while let Some(part) = parts.next() {
        let Some(after) = rest.strip_prefix(part) else { return false };
        rest = after;
        if parts.peek().is_some() {
            let date = rest.get(..10).unwrap_or("");
            let shape = date.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() });
            if date.len() != 10 || !shape {
                return false;
            }
            rest = &rest[10..];
        }
    }
    rest.is_empty()
}

/// Whether a file is a starter page exactly as an app wrote it, on any day.
fn matches_template(app: App, rel: &str, bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else { return false };
    templates(app).any(|(page, template)| page == rel && same_but_dates(template, text))
}

/// Whether `rel` is a sample nobody has touched: not worth keeping when a device connects to a
/// repository that already has pages. A page with sub-pages counts only if all of them are untouched
/// samples too, and so does each of those sub-pages, so nothing in a list someone has added to is lost.
pub fn is_untouched(workspace: &Path, app: App, rel: &str, bytes: &[u8]) -> bool {
    if !matches_template(app, rel, bytes) {
        return false;
    }
    let top = rel.split('/').next().unwrap_or(rel).trim_end_matches(".md");
    let parent = format!("{top}.md");
    let same_file = |path: &str| std::fs::read(workspace.join(path)).is_ok_and(|b| matches_template(app, path, &b));
    if parent != rel && workspace.join(&parent).exists() && !same_file(&parent) {
        return false;
    }
    WalkDir::new(workspace.join(top)).into_iter().filter_map(Result::ok).filter(|e| e.file_type().is_file()).all(|e| {
        let path = e.path().strip_prefix(workspace).unwrap_or(e.path()).components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
        same_file(&path)
    })
}

/// Removes the samples nobody has touched. Returns how many.
pub fn remove_untouched(workspace: &Path, app: App) -> usize {
    let samples: Vec<_> = crate::vault::markdown_files(workspace)
        .filter(|abs| {
            let rel = crate::vault::rel_string(workspace, abs);
            std::fs::read(abs).is_ok_and(|bytes| is_untouched(workspace, app, &rel, &bytes))
        })
        .collect();
    for abs in &samples {
        let _ = std::fs::remove_file(abs);
        // A folder left empty (the sample was its only content) goes too.
        if let Some(parent) = abs.parent().filter(|p| *p != workspace) {
            let _ = std::fs::remove_dir(parent);
        }
    }
    samples.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault;
    use std::fs;

    fn workspace(name: &str, app: App) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("bg-starter-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        for (rel, content) in pages(app) {
            vault::write_note(&dir, rel, &content).unwrap();
        }
        dir
    }

    #[test]
    fn dates_fill_in_from_today() {
        // 2026-12-30.
        let day = 20_817;
        assert_eq!(civil(day), (2026, 12, 30));
        assert_eq!(civil(0), (1970, 1, 1));
        assert_eq!(civil(11_016), (2000, 2, 29));
        assert_eq!(fill_dates("Due: today+2 today-3, and today stays a word", day), "Due: 2027-01-01 2026-12-27, and today stays a word");
    }

    #[test]
    fn every_app_gets_all_the_pages_with_working_links() {
        for (app, extra) in [(App::Desktop, vec![]), (App::Phone, vec!["Inbox"])] {
            let all = pages(app);
            assert_eq!(all.len(), 7);
            for (rel, content) in &all {
                assert!(!content.contains("today+") && !content.contains("today-"), "{rel} still has a placeholder");
                for target in vault::wikilinks(content) {
                    assert!(extra.contains(&target) || all.iter().any(|(page, _)| vault::link_matches(target, page)), "{rel} links to missing [[{target}]]");
                }
            }
        }
    }

    #[test]
    fn untouched_samples_are_recognised_on_any_day() {
        let dir = workspace("untouched", App::Phone);
        for (rel, _) in pages(App::Phone) {
            assert!(is_untouched(&dir, App::Phone, rel, &fs::read(dir.join(rel)).unwrap()), "{rel}");
        }
        // Written on another day: still the sample.
        let old = fill_dates(PAGES.iter().find(|(p, _)| *p == "Tasks/Book the venue.md").unwrap().1, 100);
        vault::write_note(&dir, "Tasks/Book the venue.md", &old).unwrap();
        assert!(is_untouched(&dir, App::Phone, "Tasks/Book the venue.md", old.as_bytes()));
        assert!(is_untouched(&dir, App::Phone, "Tasks.md", &fs::read(dir.join("Tasks.md")).unwrap()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn anything_edited_or_added_is_kept() {
        let bytes = |dir: &Path, rel: &str| fs::read(dir.join(rel)).unwrap();

        // An edited page.
        let dir = workspace("edited", App::Phone);
        vault::write_note(&dir, "Meeting notes.md", "mine").unwrap();
        assert!(!is_untouched(&dir, App::Phone, "Meeting notes.md", b"mine"));
        assert!(is_untouched(&dir, App::Phone, "Welcome.md", &bytes(&dir, "Welcome.md")));

        // A changed date is an edit too.
        let row = "Tasks/Book the venue.md";
        let changed = String::from_utf8(bytes(&dir, row)).unwrap().replace("Low", "High");
        vault::write_note(&dir, row, &changed).unwrap();
        assert!(!is_untouched(&dir, App::Phone, row, changed.as_bytes()));
        // Its list and the other rows stay with it.
        assert!(!is_untouched(&dir, App::Phone, "Tasks.md", &bytes(&dir, "Tasks.md")));
        let other = "Tasks/Plan the team offsite.md";
        assert!(!is_untouched(&dir, App::Phone, other, &bytes(&dir, other)));
        let _ = fs::remove_dir_all(&dir);

        // A row someone added keeps the whole list.
        let dir = workspace("added", App::Phone);
        vault::write_note(&dir, "Tasks/Mine.md", "mine").unwrap();
        assert!(!is_untouched(&dir, App::Phone, "Tasks.md", &bytes(&dir, "Tasks.md")));
        assert!(!is_untouched(&dir, App::Phone, "Tasks/Write the launch post.md", &bytes(&dir, "Tasks/Write the launch post.md")));
        // A sub-page under a sample that isn't otherwise one.
        vault::write_note(&dir, "Welcome/Note.md", "mine").unwrap();
        assert!(!is_untouched(&dir, App::Phone, "Welcome.md", &bytes(&dir, "Welcome.md")));
        let _ = fs::remove_dir_all(&dir);

        // Another page at a sample's path, and a date in the wrong shape.
        let dir = workspace("other", App::Phone);
        assert!(!is_untouched(&dir, App::Phone, "Ideas.md", b"anything"));
        let bad = fill_dates(PAGES[2].1, 0).replace("1970-", "19x0-");
        assert!(!is_untouched(&dir, App::Phone, PAGES[2].0, bad.as_bytes()));
        let _ = fs::remove_dir_all(&dir);
    }
}
