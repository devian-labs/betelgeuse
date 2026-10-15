//! Thin wrapper over the `git` CLI. Shelling out keeps the vault compatible
//! with the user's own git config, hooks, credentials and remotes.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

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
    let out = Command::new("git")
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
pub fn sync_merging(vault: &Path) -> Result<crate::git_lib::Integrated, String> {
    let branch = run(vault, &["branch", "--show-current"])?.trim().to_string();
    if branch.is_empty() {
        return Err("Not on a branch: sync from a terminal".into());
    }
    run(vault, &["fetch", "--quiet", "origin"])?;
    let done = crate::git_lib::integrate(vault)?;
    // Sets the upstream the first time (a fresh, empty remote).
    run(vault, &["push", "--quiet", "--set-upstream", "origin", &branch])?;
    Ok(done)
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
        sync_merging(&a).unwrap();

        std::process::Command::new("git").args(["clone", "--quiet"]).arg(&remote).arg(&b).status().unwrap();
        ident(&b);
        assert_eq!(std::fs::read_to_string(b.join("Plan.md")).unwrap(), "v1\n");

        // The same page changed on both: both kept, nothing left half done.
        std::fs::write(a.join("Plan.md"), "from a\n").unwrap();
        sync_merging(&a).unwrap();
        std::fs::write(b.join("Plan.md"), "from b\n").unwrap();
        let got = sync_merging(&b).unwrap();
        assert_eq!(got.conflicts, vec!["Plan.md".to_string()]);
        assert_eq!(std::fs::read_to_string(b.join("Plan.md")).unwrap(), "from a\n");
        assert_eq!(std::fs::read_to_string(b.join("Plan (conflicted copy).md")).unwrap(), "from b\n");
        assert!(!b.join(".git/rebase-merge").exists() && status(&b).unwrap().changes.is_empty());
        sync_merging(&a).unwrap();
        assert!(a.join("Plan (conflicted copy).md").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
