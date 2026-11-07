//! Thin wrapper over the `git` CLI. Shelling out keeps the vault compatible
//! with the user's own git config, hooks, credentials and remotes.

use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct Change {
    pub path: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct Commit {
    pub hash: String,
    pub short: String,
    pub author: String,
    pub timestamp: i64,
    pub subject: String,
}

#[derive(Serialize)]
pub struct RepoStatus {
    pub branch: String,
    pub changes: Vec<Change>,
    pub has_remote: bool,
}

fn run(vault: &Path, args: &[&str]) -> Result<String, String> {
    let out = crate::process::command("git")
        .arg("-C")
        .arg(vault)
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .output()
        .map_err(|e| format!("could not run git: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Falls back to a local identity so commits work on machines without git config.
fn commit(vault: &Path, message: &str) -> Result<(), String> {
    let has_identity = run(vault, &["config", "user.email"]).is_ok_and(|s| !s.trim().is_empty());
    let mut args = vec![];
    if !has_identity {
        args.extend(["-c", "user.name=Betelgeuse", "-c", "user.email=betelgeuse@localhost"]);
    }
    args.extend(["commit", "--quiet", "-m", message]);
    run(vault, &args).map(|_| ())
}

pub fn ensure_repo(vault: &Path) -> Result<(), String> {
    let fresh = !vault.join(".git").exists();
    if fresh {
        run(vault, &["init", "--quiet", "-b", "main"])?;
    }
    ensure_ignored(vault, IGNORED)?;
    if fresh {
        commit_all(vault, "Initialize Betelgeuse workspace")?;
    }
    Ok(())
}

/// What every workspace repository ignores: the Trash (git history keeps every version) and OS clutter.
pub(crate) const IGNORED: &[&str] = &[".DS_Store", ".obsidian/workspace*.json", ".trash/"];

/// Adds any missing lines to .gitignore (the trash is ignored; git history keeps every version).
pub(crate) fn ensure_ignored(vault: &Path, patterns: &[&str]) -> Result<(), String> {
    let path = vault.join(".gitignore");
    let current = std::fs::read_to_string(&path).unwrap_or_default();
    let missing: Vec<&str> = patterns.iter().copied().filter(|p| !current.lines().any(|l| l.trim() == *p)).collect();
    if missing.is_empty() {
        return Ok(());
    }
    let sep = if current.is_empty() || current.ends_with('\n') { "" } else { "\n" };
    std::fs::write(&path, format!("{current}{sep}{}\n", missing.join("\n"))).map_err(|e| e.to_string())
}

pub fn status(vault: &Path) -> Result<RepoStatus, String> {
    let raw = run(vault, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    let mut changes = Vec::new();
    let mut entries = raw.split('\0').filter(|s| s.len() > 3);
    while let Some(entry) = entries.next() {
        let (code, path) = entry.split_at(3);
        if code.starts_with('R') || code.starts_with('C') {
            entries.next(); // -z emits the original path of a rename as its own entry
        }
        let status = match code.trim() {
            "??" | "A" | "AM" => "added",
            c if c.contains('D') => "deleted",
            c if c.starts_with('R') => "renamed",
            _ => "modified",
        };
        changes.push(Change { path: path.to_string(), status: status.into() });
    }
    let branch = run(vault, &["branch", "--show-current"]).map(|s| s.trim().to_string()).unwrap_or_default();
    let has_remote = run(vault, &["remote"]).is_ok_and(|s| !s.trim().is_empty());
    Ok(RepoStatus { branch, changes, has_remote })
}

/// Stages everything and commits. Returns `None` when there was nothing to commit.
pub fn commit_all(vault: &Path, message: &str) -> Result<Option<String>, String> {
    run(vault, &["add", "-A"])?;
    if run(vault, &["diff", "--cached", "--quiet"]).is_ok() {
        return Ok(None);
    }
    commit(vault, message)?;
    run(vault, &["rev-parse", "--short", "HEAD"]).map(|s| Some(s.trim().to_string()))
}

/// Summarises staged-to-be changes as e.g. "Update Ideas, Welcome and 2 more".
pub fn auto_message(vault: &Path) -> Option<String> {
    summarize(vault, &status(vault).ok()?.changes)
}

/// A commit message naming the changed pages (shared with the libgit2 backend).
pub(crate) fn summarize(vault: &Path, changes: &[Change]) -> Option<String> {
    if changes.is_empty() {
        return None;
    }
    // Agents can read the git log, so commits never name pages hidden from them.
    let policy = crate::vault::ai_policy(vault);
    let mut hidden = 0;
    let mut names: Vec<String> = changes
        .iter()
        .filter_map(|c| {
            let path = c.path.trim_end_matches('/');
            if path.ends_with(".md") && !crate::vault::ai_visible(vault, path, &policy) {
                hidden += 1;
                return None;
            }
            Some(crate::vault::title_of(path))
        })
        .collect();
    if hidden > 0 {
        names.push(if hidden == 1 { "1 private page".into() } else { format!("{hidden} private pages") });
    }
    let shown = names.iter().take(3).cloned().collect::<Vec<_>>().join(", ");
    Some(match names.len() {
        n if n > 3 => format!("Update {shown} and {} more", n - 3),
        _ => format!("Update {shown}"),
    })
}

pub fn log(vault: &Path, path: Option<&str>, limit: usize) -> Result<Vec<Commit>, String> {
    let n = limit.to_string();
    let mut args = vec!["log", "-n", &n, "--format=%H%x1f%h%x1f%an%x1f%at%x1f%s"];
    if let Some(p) = path {
        args.extend(["--follow", "--", p]);
    }
    let out = run(vault, &args).or_else(|e| if e.contains("does not have any commits") { Ok(String::new()) } else { Err(e) })?;
    Ok(out
        .lines()
        .filter_map(|l| {
            let f: Vec<&str> = l.split('\u{1f}').collect();
            (f.len() == 5).then(|| Commit {
                hash: f[0].into(),
                short: f[1].into(),
                author: f[2].into(),
                timestamp: f[3].parse().unwrap_or(0),
                subject: f[4].into(),
            })
        })
        .collect())
}

pub fn show(vault: &Path, rev: &str, path: &str) -> Result<String, String> {
    if rev.starts_with('-') {
        return Err("invalid revision".into());
    }
    let hash = run(vault, &["rev-parse", "--verify", &format!("{rev}^{{commit}}")])?.trim().to_string();
    // The note may have had another name at that revision; --follow history records it.
    let log = run(vault, &["log", "--follow", "--name-only", "--format=%x1e%H", "--", path]).unwrap_or_default();
    let name_then = log
        .split('\u{1e}')
        .find(|b| b.trim_start().starts_with(&hash))
        .and_then(|b| b.trim().lines().skip(1).find(|l| !l.is_empty()).map(str::to_string))
        .unwrap_or_else(|| path.to_string());
    run(vault, &["show", &format!("{hash}:{name_then}")])
}

/// Whether the workspace has a remote to sync with.
pub fn has_remote(vault: &Path) -> bool {
    run(vault, &["remote"]).is_ok_and(|s| !s.trim().is_empty())
}

/// Syncs without ever stopping half way: fetches and pushes with the `git` program (the person's
/// own credentials and SSH keys), but merges with libgit2 the way the phone apps do, so a page
/// changed both here and elsewhere is kept twice ("(conflicted copy)") instead of leaving a rebase
/// stopped with conflict markers in it. Safe to run unattended.
#[cfg(feature = "libgit2")]
pub fn sync_merging(vault: &Path, samples: Option<crate::starter::App>) -> Result<crate::git_lib::Integrated, String> {
    if run(vault, &["branch", "--show-current"])?.trim().is_empty() {
        return Err("Not on a branch: sync from a terminal".into());
    }
    run(vault, &["fetch", "--quiet", "origin"])?;
    let adopted = match samples {
        Some(app) => adopt_repository(vault, app)?,
        None => None,
    };
    let done = match adopted {
        Some(done) => done,
        None => crate::git_lib::integrate(vault)?,
    };
    let branch = run(vault, &["branch", "--show-current"])?.trim().to_string();
    // Sets the upstream the first time (a fresh, empty remote).
    run(vault, &["push", "--quiet", "--set-upstream", "origin", &branch])?;
    Ok(done)
}

/// The first sync with a repository that already has pages: its pages are the workspace now. Samples
/// nobody touched go, and with nothing else here the workspace becomes the repository, without a trace
/// of them in its history. Returns None to carry on with a normal merge: anything someone wrote is kept.
#[cfg(feature = "libgit2")]
fn adopt_repository(vault: &Path, app: crate::starter::App) -> Result<Option<crate::git_lib::Integrated>, String> {
    if run(vault, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok() {
        return Ok(None);
    }
    // No HEAD to point at: an empty repository, which this workspace fills.
    let refs = run(vault, &["ls-remote", "--symref", "origin", "HEAD"]).unwrap_or_default();
    let Some(remote) = refs.lines().find_map(|l| l.strip_prefix("ref: refs/heads/")?.split_whitespace().next().map(str::to_string)) else {
        return Ok(None);
    };
    // Take its branch's name, so this doesn't push a second branch beside it.
    if run(vault, &["branch", "--show-current"])?.trim() != remote {
        run(vault, &["branch", "-M", &remote])?;
    }
    let removed = crate::starter::remove_untouched(vault, app);
    if crate::vault::markdown_files(vault).next().is_none() {
        run(vault, &["add", "--all"])?;
        run(vault, &["reset", "--hard", &format!("origin/{remote}")])?;
        run(vault, &["branch", &format!("--set-upstream-to=origin/{remote}")])?;
        return Ok(Some(crate::git_lib::Integrated { updated: true, conflicts: vec![] }));
    }
    if removed > 0 {
        commit_all(vault, "Remove the starter pages")?;
    }
    Ok(None)
}

pub fn sync(vault: &Path) -> Result<String, String> {
    // Nothing to pull from until the branch has an upstream (e.g. a fresh, empty remote).
    if run(vault, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_err() {
        return publish(vault);
    }
    let pull = run(vault, &["pull", "--rebase", "--autostash"])?;
    let push = run(vault, &["push"])?;
    Ok(format!("{pull}{push}").trim().to_string())
}

#[derive(Serialize)]
pub struct GitSettings {
    pub branch: String,
    pub remote_url: Option<String>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub commits: usize,
}

fn config_value(vault: &Path, key: &str) -> Option<String> {
    run(vault, &["config", key]).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

pub fn settings(vault: &Path) -> Result<GitSettings, String> {
    Ok(GitSettings {
        branch: run(vault, &["branch", "--show-current"]).map(|s| s.trim().to_string()).unwrap_or_default(),
        remote_url: config_value(vault, "remote.origin.url"),
        user_name: config_value(vault, "user.name"),
        user_email: config_value(vault, "user.email"),
        commits: run(vault, &["rev-list", "--count", "HEAD"]).ok().and_then(|s| s.trim().parse().ok()).unwrap_or(0),
    })
}

/// Points `origin` at `url`, or removes it when `url` is empty.
pub fn set_remote(vault: &Path, url: &str) -> Result<(), String> {
    let url = url.trim();
    let has_origin = run(vault, &["remote"]).is_ok_and(|s| s.lines().any(|l| l == "origin"));
    match (url.is_empty(), has_origin) {
        (true, true) => run(vault, &["remote", "remove", "origin"]).map(|_| ()),
        (true, false) => Ok(()),
        (false, true) => run(vault, &["remote", "set-url", "origin", url]).map(|_| ()),
        (false, false) => run(vault, &["remote", "add", "origin", url]).map(|_| ()),
    }
}

/// Sets the commit identity for this vault only (not the user's global git config).
pub fn set_identity(vault: &Path, name: &str, email: &str) -> Result<(), String> {
    for (key, value) in [("user.name", name.trim()), ("user.email", email.trim())] {
        if value.is_empty() {
            let _ = run(vault, &["config", "--unset", key]);
        } else {
            run(vault, &["config", key, value])?;
        }
    }
    Ok(())
}

/// Checks the remote is reachable with the user's credentials.
pub fn test_remote(vault: &Path) -> Result<String, String> {
    run(vault, &["ls-remote", "--heads", "origin"]).map(|out| {
        let branches = out.lines().count();
        format!("Connected · {branches} branch{}", if branches == 1 { "" } else { "es" })
    })
}

/// First push of a branch needs an upstream; later syncs pull then push.
pub fn publish(vault: &Path) -> Result<String, String> {
    let branch = run(vault, &["branch", "--show-current"])?.trim().to_string();
    run(vault, &["push", "-u", "origin", &branch]).map(|_| format!("Pushed {branch} to origin"))
}

#[cfg(all(test, feature = "libgit2"))]
mod sync_tests {
    use super::*;

    /// A bare repository (its default branch named `branch`) holding `Mine.md`.
    fn remote_with_a_page(root: &Path, branch: &str) -> std::path::PathBuf {
        let (remote, seed) = (root.join("remote.git"), root.join("seed"));
        std::fs::create_dir_all(&remote).unwrap();
        run(&remote, &["init", "--quiet", "--bare", "--initial-branch", branch]).unwrap();
        std::fs::create_dir_all(&seed).unwrap();
        run(&seed, &["init", "--quiet", "--initial-branch", branch]).unwrap();
        run(&seed, &["config", "user.name", "T"]).unwrap();
        run(&seed, &["config", "user.email", "t@t"]).unwrap();
        std::fs::write(seed.join("Mine.md"), "mine\n").unwrap();
        run(&seed, &["add", "."]).unwrap();
        run(&seed, &["commit", "--quiet", "-m", "mine"]).unwrap();
        run(&seed, &["push", "--quiet", remote.to_str().unwrap(), branch]).unwrap();
        remote
    }

    /// A new workspace: starter pages, committed, connected to `remote`.
    fn new_workspace(root: &Path, remote: &Path) -> std::path::PathBuf {
        let a = root.join("a");
        std::fs::create_dir_all(&a).unwrap();
        for (rel, content) in crate::starter::pages(crate::starter::App::Desktop) {
            crate::vault::write_note(&a, rel, &content).unwrap();
        }
        ensure_repo(&a).unwrap();
        run(&a, &["config", "user.name", "A"]).unwrap();
        run(&a, &["config", "user.email", "a@a"]).unwrap();
        commit_all(&a, "Start").unwrap();
        set_remote(&a, remote.to_str().unwrap()).unwrap();
        a
    }

    fn pages_in(dir: &Path) -> Vec<String> {
        let mut pages: Vec<String> = crate::vault::markdown_files(dir).map(|p| crate::vault::rel_string(dir, &p)).collect();
        pages.sort();
        pages
    }

    #[test]
    fn connecting_a_repository_leaves_only_its_pages() {
        let desktop = Some(crate::starter::App::Desktop);
        let root = std::env::temp_dir().join(format!("bg-adopt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let remote = remote_with_a_page(&root, "trunk");
        let a = new_workspace(&root, &remote);

        let done = sync_merging(&a, desktop).unwrap();
        assert!(done.updated);
        assert_eq!(pages_in(&a), ["Mine.md"], "only the repository's pages");
        assert_eq!(run(&a, &["branch", "--show-current"]).unwrap().trim(), "trunk");
        assert_eq!(run(&remote, &["branch", "--list"]).unwrap().split_whitespace().filter(|b| *b != "*").collect::<Vec<_>>(), ["trunk"], "no second branch");
        let history = run(&remote, &["log", "--all", "--name-only", "--format="]).unwrap();
        assert!(!history.contains("Welcome.md") && !history.contains("Tasks"), "no sample in the repository, even in its history: {history}");

        // From then on it's a normal workspace: its pages stay, and new ones are synced.
        std::fs::write(a.join("Next.md"), "next\n").unwrap();
        sync_merging(&a, desktop).unwrap();
        assert_eq!(pages_in(&a), ["Mine.md", "Next.md"]);
        assert!(run(&remote, &["ls-tree", "--name-only", "trunk"]).unwrap().contains("Next.md"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn connecting_keeps_what_someone_wrote_or_edited() {
        let root = std::env::temp_dir().join(format!("bg-adopt-kept-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let remote = remote_with_a_page(&root, "main");
        let a = new_workspace(&root, &remote);
        std::fs::write(a.join("Written here.md"), "new\n").unwrap();
        std::fs::write(a.join("Meeting notes.md"), "edited\n").unwrap();

        sync_merging(&a, Some(crate::starter::App::Desktop)).unwrap();
        assert_eq!(pages_in(&a), ["Meeting notes.md", "Mine.md", "Written here.md"], "untouched samples go, the rest stays");
        assert_eq!(std::fs::read_to_string(a.join("Meeting notes.md")).unwrap(), "edited\n");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn an_empty_repository_gets_the_starter_pages() {
        let root = std::env::temp_dir().join(format!("bg-adopt-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let remote = root.join("remote.git");
        std::fs::create_dir_all(&remote).unwrap();
        run(&remote, &["init", "--quiet", "--bare", "--initial-branch", "main"]).unwrap();
        let a = new_workspace(&root, &remote);

        sync_merging(&a, Some(crate::starter::App::Desktop)).unwrap();
        assert_eq!(pages_in(&a).len(), 7, "the samples stay");
        assert!(run(&remote, &["ls-tree", "--name-only", "main"]).unwrap().contains("Welcome.md"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn sync_merging_never_stops_half_way() {
        let root = std::env::temp_dir().join(format!("bg-sync-merging-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let (remote, a, b) = (root.join("remote.git"), root.join("a"), root.join("b"));
        std::fs::create_dir_all(&remote).unwrap();
        run(&remote, &["init", "--quiet", "--bare", "-b", "main"]).unwrap();
        let ident = |dir: &Path| {
            run(dir, &["config", "user.name", "T"]).unwrap();
            run(dir, &["config", "user.email", "t@t"]).unwrap();
        };
        std::fs::create_dir_all(&a).unwrap();
        ensure_repo(&a).unwrap();
        ident(&a);
        set_remote(&a, remote.to_str().unwrap()).unwrap();
        std::fs::write(a.join("Plan.md"), "v1\n").unwrap();
        // A fresh, empty remote: the first sync publishes.
        sync_merging(&a, None).unwrap();

        std::process::Command::new("git").args(["clone", "--quiet"]).arg(&remote).arg(&b).status().unwrap();
        ident(&b);
        assert_eq!(std::fs::read_to_string(b.join("Plan.md")).unwrap(), "v1\n");

        // The same page changed on both: both kept, nothing left half done.
        std::fs::write(a.join("Plan.md"), "from a\n").unwrap();
        sync_merging(&a, None).unwrap();
        std::fs::write(b.join("Plan.md"), "from b\n").unwrap();
        let got = sync_merging(&b, None).unwrap();
        assert_eq!(got.conflicts, vec!["Plan.md".to_string()]);
        assert_eq!(std::fs::read_to_string(b.join("Plan.md")).unwrap(), "from a\n");
        assert_eq!(std::fs::read_to_string(b.join("Plan (conflicted copy).md")).unwrap(), "from b\n");
        assert!(!b.join(".git/rebase-merge").exists() && status(&b).unwrap().changes.is_empty());
        sync_merging(&a, None).unwrap();
        assert!(a.join("Plan (conflicted copy).md").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
