//! Git through libgit2, for the phone apps: phones have no `git` program to shell out to (see
//! git.rs, which the desktop app uses with the person's own git config and credentials). Remotes
//! are reached over HTTPS with an access token.
//!
//! Syncing is three steps, so an app can keep the network out of its workspace lock: `fetch`
//! (network), `integrate` (commits local edits and merges what was fetched into the files) and
//! `push` (network). A page changed on both sides never fails the sync: the remote's version takes
//! the page's place and this device's version is kept beside it as "Page (conflicted copy)".

use crate::git::{Change, Commit, GitSettings, RepoStatus};
use git2::{
    build::CheckoutBuilder, AutotagOption, BranchType, Cred, Direction, FetchOptions, IndexAddOption, IndexEntry, Oid, PushOptions, RemoteCallbacks,
    Repository, Signature, StatusOptions,
};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Arc, Once};
#[cfg(test)]
use std::path::PathBuf;

/// HTTPS credentials: a username (any name works for GitHub) and an access token as the password,
/// plus who to tell how a download or upload is going.
#[derive(Clone, Default)]
pub struct Auth {
    pub username: String,
    pub token: String,
    pub progress: Option<OnProgress>,
}

/// How far a transfer has got: objects `done` of `total`, and the bytes moved so far.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct Progress {
    /// "download", "index" (unpacking what arrived) or "upload".
    pub phase: &'static str,
    pub done: usize,
    pub total: usize,
    pub bytes: usize,
}

pub type OnProgress = Arc<dyn Fn(Progress) + Send + Sync>;

/// What `integrate` did to the workspace.
#[derive(Serialize, Default, Debug, PartialEq)]
pub struct Integrated {
    /// Files in the workspace changed (pages from elsewhere arrived): the app should reload.
    pub updated: bool,
    /// Pages changed both here and elsewhere, kept as "(conflicted copy)" pages.
    pub conflicts: Vec<String>,
}

const FALLBACK_NAME: &str = "Betelgeuse";
const FALLBACK_EMAIL: &str = "betelgeuse@localhost";

fn err(e: git2::Error) -> String {
    e.message().to_string()
}

fn open(vault: &Path) -> Result<Repository, String> {
    Repository::open(vault).map_err(err)
}

/// HTTPS remotes only. An SSH address of the kind the desktop app may use
/// (`git@github.com:me/notes.git`) becomes its HTTPS form.
pub fn https_url(url: &str) -> Result<String, String> {
    let url = url.trim();
    if url.starts_with("https://") || url.starts_with("file://") {
        return Ok(url.to_string());
    }
    if let Some(rest) = url.strip_prefix("git@").or_else(|| url.strip_prefix("ssh://git@")) {
        if let Some((host, path)) = rest.split_once(':').or_else(|| rest.split_once('/')) {
            return Ok(format!("https://{host}/{}", path.trim_start_matches('/')));
        }
    }
    Err("Use the repository's https:// address".into())
}

/// libgit2 otherwise waits forever on a connection that stops sending, leaving a sync spinning.
fn limit_stalls() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| unsafe {
        let _ = git2::opts::set_server_connect_timeout_in_milliseconds(20_000);
        let _ = git2::opts::set_server_timeout_in_milliseconds(60_000);
    });
}

/// Calls `report` only when the percentage or the megabytes moved change, not per object.
fn throttled(report: OnProgress) -> impl FnMut(Progress) {
    let mut last = None;
    move |p: Progress| {
        let step = (p.phase, (p.done * 100).checked_div(p.total).unwrap_or(0), p.bytes >> 20);
        if last != Some(step) {
            last = Some(step);
            report(p);
        }
    }
}

fn callbacks(auth: &Auth) -> RemoteCallbacks<'_> {
    limit_stalls();
    let mut cb = RemoteCallbacks::new();
    if let Some(report) = &auth.progress {
        let mut send = throttled(report.clone());
        cb.transfer_progress(move |s| {
            let downloading = s.received_objects() < s.total_objects();
            send(Progress {
                phase: if downloading { "download" } else { "index" },
                done: if downloading { s.received_objects() } else { s.indexed_deltas() },
                total: if downloading { s.total_objects() } else { s.total_deltas() },
                bytes: s.received_bytes(),
            });
            true
        });
        let mut send = throttled(report.clone());
        cb.push_transfer_progress(move |done, total, bytes| send(Progress { phase: "upload", done, total, bytes }));
    }
    let mut tries = 0;
    cb.credentials(move |_url, _user, _allowed| {
        // libgit2 asks again after a rejected token; stop rather than loop.
        tries += 1;
        if tries > 1 {
            return Err(git2::Error::from_str("The repository didn't accept the access token"));
        }
        let user = if auth.username.trim().is_empty() { "git" } else { auth.username.trim() };
        Cred::userpass_plaintext(user, auth.token.trim())
    });
    cb
}

fn signature(repo: &Repository) -> Result<Signature<'static>, String> {
    repo.signature().or_else(|_| Signature::now(FALLBACK_NAME, FALLBACK_EMAIL)).map_err(err)
}

fn branch_name(repo: &Repository) -> String {
    match repo.head() {
        Ok(head) => head.shorthand().unwrap_or("main").to_string(),
        // No commits yet: HEAD still names the branch the first commit will start.
        Err(_) => repo
            .find_reference("HEAD")
            .ok()
            .and_then(|r| r.symbolic_target().ok().flatten().map(|t| t.trim_start_matches("refs/heads/").to_string()))
            .unwrap_or_else(|| "main".into()),
    }
}

/// Makes the workspace a repository (branch `main`, the usual .gitignore) if it isn't one yet.
pub fn ensure_repo(vault: &Path) -> Result<(), String> {
    let fresh = Repository::open(vault).is_err();
    if fresh {
        let mut opts = git2::RepositoryInitOptions::new();
        opts.initial_head("main");
        Repository::init_opts(vault, &opts).map_err(err)?;
    }
    crate::git::ensure_ignored(vault, crate::git::IGNORED)?;
    if fresh {
        commit_all(vault, "Initialize Betelgeuse workspace")?;
    }
    Ok(())
}

/// Writes the index (as `git status` does) with the timestamps of files it found unchanged, so the
/// next status compares timestamps rather than reading every such file: hold the workspace's lock.
pub fn status(vault: &Path) -> Result<RepoStatus, String> {
    status_with(vault, true)
}

/// `status` without writing the index, for when the workspace's lock is taken: slower, as it reads
/// again every file whose timestamp the index doesn't have.
pub fn status_unsaved(vault: &Path) -> Result<RepoStatus, String> {
    status_with(vault, false)
}

fn status_with(vault: &Path, save: bool) -> Result<RepoStatus, String> {
    let repo = open(vault)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true).renames_head_to_index(true).update_index(save);
    let changes = repo
        .statuses(Some(&mut opts))
        .map_err(err)?
        .iter()
        .filter_map(|e| {
            let s = e.status();
            let status = if s.is_wt_new() || s.is_index_new() {
                "added"
            } else if s.is_wt_deleted() || s.is_index_deleted() {
                "deleted"
            } else if s.is_wt_renamed() || s.is_index_renamed() {
                "renamed"
            } else if s.is_ignored() {
                return None;
            } else {
                "modified"
            };
            Some(Change { path: e.path().ok()?.to_string(), status: status.into() })
        })
        .collect();
    let has_remote = repo.find_remote("origin").is_ok();
    Ok(RepoStatus { branch: branch_name(&repo), changes, has_remote })
}

/// Stages everything and commits. Returns `None` when there was nothing to commit.
pub fn commit_all(vault: &Path, message: &str) -> Result<Option<String>, String> {
    let repo = open(vault)?;
    let mut index = repo.index().map_err(err)?;
    index.add_all(["*"], IndexAddOption::DEFAULT, None).map_err(err)?;
    index.update_all(["*"], None).map_err(err)?; // picks up deleted files
    index.write().map_err(err)?;
    let tree_id = index.write_tree().map_err(err)?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    if parent.as_ref().is_some_and(|p| p.tree_id() == tree_id) {
        return Ok(None);
    }
    let tree = repo.find_tree(tree_id).map_err(err)?;
    let sig = signature(&repo)?;
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    let id = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents).map_err(err)?;
    Ok(Some(short(id)))
}

fn short(id: Oid) -> String {
    id.to_string()[..7].to_string()
}

/// Commits whatever changed, with a message naming the pages. Returns `None` when nothing had.
pub fn commit_changes(vault: &Path) -> Result<Option<String>, String> {
    let changes = status(vault)?.changes;
    match crate::git::summarize(vault, &changes) {
        Some(message) => commit_all(vault, &message),
        None => Ok(None),
    }
}

pub fn log(vault: &Path, path: Option<&str>, limit: usize) -> Result<Vec<Commit>, String> {
    let repo = open(vault)?;
    let mut walk = repo.revwalk().map_err(err)?;
    if walk.push_head().is_err() {
        return Ok(vec![]); // no commits yet
    }
    let mut out = vec![];
    for id in walk {
        let commit = repo.find_commit(id.map_err(err)?).map_err(err)?;
        if let Some(p) = path {
            // Only commits that changed this page.
            let blob = |c: &git2::Commit| c.tree().ok().and_then(|t| t.get_path(Path::new(p)).ok()).map(|e| e.id());
            let now = blob(&commit);
            let before = commit.parent(0).ok().and_then(|parent| blob(&parent));
            if now.is_none() || now == before {
                continue;
            }
        }
        out.push(Commit {
            hash: commit.id().to_string(),
            short: short(commit.id()),
            author: commit.author().name().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            subject: commit.summary().ok().flatten().unwrap_or("").to_string(),
        });
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
}

/// A page's content at an earlier commit.
pub fn show(vault: &Path, rev: &str, path: &str) -> Result<String, String> {
    let repo = open(vault)?;
    let commit = repo.revparse_single(rev).and_then(|o| o.peel_to_commit()).map_err(err)?;
    let entry = commit.tree().map_err(err)?.get_path(Path::new(path)).map_err(err)?;
    let blob = repo.find_blob(entry.id()).map_err(err)?;
    Ok(String::from_utf8_lossy(blob.content()).into_owned())
}

pub fn settings(vault: &Path) -> Result<GitSettings, String> {
    let repo = open(vault)?;
    let config = repo.config().map_err(err)?;
    let value = |key: &str| config.get_string(key).ok().filter(|s| !s.is_empty());
    let commits = repo.revwalk().ok().map(|mut w| if w.push_head().is_ok() { w.count() } else { 0 }).unwrap_or(0);
    Ok(GitSettings {
        branch: branch_name(&repo),
        remote_url: repo.find_remote("origin").ok().and_then(|r| r.url().ok().map(str::to_string)),
        user_name: value("user.name"),
        user_email: value("user.email"),
        commits,
    })
}

/// Sets the commit identity for this workspace.
pub fn set_identity(vault: &Path, name: &str, email: &str) -> Result<(), String> {
    let mut config = open(vault)?.config().map_err(err)?;
    for (key, value) in [("user.name", name.trim()), ("user.email", email.trim())] {
        if value.is_empty() {
            let _ = config.remove(key);
        } else {
            config.set_str(key, value).map_err(err)?;
        }
    }
    Ok(())
}

/// Stops syncing: forgets the remote (the history stays).
pub fn disconnect(vault: &Path) -> Result<(), String> {
    let repo = open(vault)?;
    if repo.find_remote("origin").is_ok() {
        repo.remote_delete("origin").map_err(err)?;
    }
    Ok(())
}

/// The branch the remote's HEAD points at, or `None` for an empty repository.
fn remote_default_branch(repo: &Repository, auth: &Auth) -> Result<Option<String>, String> {
    let mut remote = repo.find_remote("origin").map_err(err)?;
    let conn = remote.connect_auth(Direction::Fetch, Some(callbacks(auth)), None).map_err(err)?;
    let heads: Vec<String> = conn.list().map_err(err)?.iter().map(|h| h.name().to_string()).collect();
    let default = conn.default_branch().ok().and_then(|b| b.as_str().ok().map(str::to_string));
    let branch = default
        .or_else(|| heads.iter().find(|h| h.as_str() == "refs/heads/main" || h.as_str() == "refs/heads/master").cloned())
        .or_else(|| heads.iter().find(|h| h.starts_with("refs/heads/")).cloned());
    Ok(branch.map(|b| b.trim_start_matches("refs/heads/").to_string()))
}

/// Downloads what's new on the remote.
pub fn fetch(vault: &Path, auth: &Auth) -> Result<(), String> {
    let repo = open(vault)?;
    let mut remote = repo.find_remote("origin").map_err(|_| "Sync isn't set up".to_string())?;
    let mut opts = FetchOptions::new();
    opts.remote_callbacks(callbacks(auth)).download_tags(AutotagOption::None);
    remote.fetch(&[] as &[&str], Some(&mut opts), None).map_err(err)
}

/// Commits local edits, then brings in what `fetch` downloaded: a fast-forward, or a merge commit
/// when both sides changed. Call it with the workspace locked against writes.
pub fn integrate(vault: &Path) -> Result<Integrated, String> {
    commit_changes(vault)?;
    let repo = open(vault)?;
    let branch = branch_name(&repo);
    let Ok(theirs_ref) = repo.find_reference(&format!("refs/remotes/origin/{branch}")) else {
        return Ok(Integrated::default()); // nothing on the remote yet
    };
    let theirs = theirs_ref.peel_to_commit().map_err(err)?;
    let ours = repo.head().map_err(err)?.peel_to_commit().map_err(err)?;
    let annotated = repo.find_annotated_commit(theirs.id()).map_err(err)?;
    let (analysis, _) = repo.merge_analysis(&[&annotated]).map_err(err)?;

    if analysis.is_up_to_date() {
        return Ok(Integrated::default());
    }
    if analysis.is_fast_forward() {
        repo.find_reference(&format!("refs/heads/{branch}"))
            .and_then(|mut r| r.set_target(theirs.id(), "Sync: fast-forward"))
            .map_err(err)?;
        // Everything local was just committed, so forcing only ever writes the remote's changes.
        repo.checkout_head(Some(CheckoutBuilder::new().force())).map_err(err)?;
        return Ok(Integrated { updated: true, conflicts: vec![] });
    }

    let mut index = repo.merge_commits(&ours, &theirs, None).map_err(err)?;
    let conflicts = resolve_conflicts(&mut index)?;
    let tree = repo.find_tree(index.write_tree_to(&repo).map_err(err)?).map_err(err)?;
    let sig = signature(&repo)?;
    let message = if conflicts.is_empty() { "Merge changes from other devices".to_string() } else { format!("Merge changes from other devices ({} conflicted)", conflicts.len()) };
    repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&ours, &theirs]).map_err(err)?;
    repo.checkout_head(Some(CheckoutBuilder::new().force())).map_err(err)?;
    Ok(Integrated { updated: true, conflicts })
}

/// Settles every conflict in a merge index: the remote's version keeps the path, this device's
/// version goes beside it as "(conflicted copy)". A page deleted on one side and edited on the
/// other is kept, edited. Returns the paths that got a conflicted copy.
fn resolve_conflicts(index: &mut git2::Index) -> Result<Vec<String>, String> {
    if !index.has_conflicts() {
        return Ok(vec![]);
    }
    let found: Vec<git2::IndexConflict> = index.conflicts().map_err(err)?.collect::<Result<_, _>>().map_err(err)?;
    let mut taken: Vec<String> = index.iter().map(|e| String::from_utf8_lossy(&e.path).into_owned()).collect();
    let mut copies = vec![];
    for c in found {
        let path_of = |e: &IndexEntry| String::from_utf8_lossy(&e.path).into_owned();
        let Some(path) = c.our.as_ref().or(c.their.as_ref()).or(c.ancestor.as_ref()).map(path_of) else { continue };
        index.conflict_remove(Path::new(&path)).map_err(err)?;
        let stage0 = |mut e: IndexEntry, path: &str| {
            e.flags &= !0x3000; // the conflict stage bits
            e.flags = (e.flags & !0x0fff) | (path.len().min(0x0fff) as u16);
            e.path = path.as_bytes().to_vec();
            e
        };
        match (c.our, c.their) {
            (Some(ours), Some(theirs)) => {
                let differ = ours.id != theirs.id;
                index.add(&stage0(theirs, &path)).map_err(err)?;
                if differ {
                    let copy = conflicted_copy_path(&path, &taken);
                    taken.push(copy.clone());
                    index.add(&stage0(ours, &copy)).map_err(err)?;
                    copies.push(path);
                }
            }
            (Some(only), None) | (None, Some(only)) => index.add(&stage0(only, &path)).map_err(err)?,
            (None, None) => {}
        }
    }
    Ok(copies)
}

/// `Notes/Plan.md` → `Notes/Plan (conflicted copy).md`, numbered if that's taken too.
fn conflicted_copy_path(path: &str, taken: &[String]) -> String {
    let (stem, ext) = match path.rfind('.') {
        Some(dot) if dot > path.rfind('/').map_or(0, |s| s + 1) => (&path[..dot], &path[dot..]),
        _ => (path, ""),
    };
    let mut n = 1;
    loop {
        let candidate = if n == 1 { format!("{stem} (conflicted copy){ext}") } else { format!("{stem} (conflicted copy {n}){ext}") };
        if !taken.contains(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

/// Uploads this branch. A rejected push (the remote moved on meanwhile) is an error; the next
/// sync merges and pushes again.
pub fn push(vault: &Path, auth: &Auth) -> Result<(), String> {
    let repo = open(vault)?;
    let branch = branch_name(&repo);
    let mut remote = repo.find_remote("origin").map_err(|_| "Sync isn't set up".to_string())?;
    let mut rejected: Option<String> = None;
    {
        let mut cb = callbacks(auth);
        cb.push_update_reference(|_, status| {
            if let Some(s) = status {
                rejected = Some(s.to_string());
            }
            Ok(())
        });
        let mut opts = PushOptions::new();
        opts.remote_callbacks(cb);
        let spec = format!("refs/heads/{branch}:refs/heads/{branch}");
        remote.push(&[spec.as_str()], Some(&mut opts)).map_err(err)?;
    }
    if let Some(reason) = rejected {
        return Err(format!("The remote didn't take the changes ({reason}); sync again"));
    }
    // Remember where the remote is now, so status and the next merge know.
    if let Ok(head) = repo.head().and_then(|h| h.peel_to_commit()) {
        let _ = repo.reference(&format!("refs/remotes/origin/{branch}"), head.id(), true, "Sync: pushed");
    }
    Ok(())
}

/// Connects the workspace to a remote repository for the first time. An empty remote gets this
/// workspace's pages. Otherwise the workspace becomes the remote's, and any page written on this
/// device first is kept: added where the remote has nothing at that path, or beside the remote's
/// page as "(from this device)" when both have one. `keep` decides which local files count as
/// pages worth keeping (an app can leave out its untouched welcome pages).
pub fn connect(vault: &Path, url: &str, auth: &Auth, keep: &dyn Fn(&str, &[u8]) -> bool) -> Result<String, String> {
    let url = https_url(url)?;
    ensure_repo(vault)?;
    let repo = open(vault)?;
    if repo.find_remote("origin").is_ok() {
        repo.remote_set_url("origin", &url).map_err(err)?;
    } else {
        repo.remote("origin", &url).map_err(err)?;
    }

    let Some(branch) = remote_default_branch(&repo, auth)? else {
        // An empty repository: this workspace becomes its first content.
        commit_changes(vault)?;
        push(vault, auth)?;
        return Ok("Connected · this phone's pages are now in the repository".into());
    };

    fetch(vault, auth)?;
    let theirs = repo
        .find_reference(&format!("refs/remotes/origin/{branch}"))
        .and_then(|r| r.peel_to_commit())
        .map_err(err)?;

    // What this device has, to put back once the workspace holds the remote's pages.
    let mine: BTreeMap<String, Vec<u8>> = workspace_files(vault)
        .into_iter()
        .filter_map(|rel| std::fs::read(vault.join(&rel)).ok().map(|bytes| (rel, bytes)))
        .filter(|(rel, bytes)| rel != ".gitignore" && keep(rel, bytes))
        .collect();

    // Become the remote's branch, files and all (the Trash and .git stay as they are).
    for rel in workspace_files(vault) {
        let _ = std::fs::remove_file(vault.join(&rel));
    }
    let local = repo.find_branch(&branch, BranchType::Local);
    match local {
        Ok(mut b) => {
            b.get_mut().set_target(theirs.id(), "Sync: adopt remote").map_err(err)?;
        }
        Err(_) => {
            repo.branch(&branch, &theirs, true).map_err(err)?;
        }
    }
    repo.set_head(&format!("refs/heads/{branch}")).map_err(err)?;
    repo.checkout_head(Some(CheckoutBuilder::new().force().remove_untracked(true))).map_err(err)?;
    // The branch this workspace started on (e.g. `main` when the remote uses `master`) is history now.
    for b in repo.branches(Some(BranchType::Local)).map_err(err)?.flatten() {
        let (mut b, _) = b;
        if b.name().ok().flatten() != Some(branch.as_str()) {
            let _ = b.delete();
        }
    }
    let mut cfg = repo.config().map_err(err)?;
    let _ = cfg.set_str(&format!("branch.{branch}.remote"), "origin");
    let _ = cfg.set_str(&format!("branch.{branch}.merge"), &format!("refs/heads/{branch}"));

    let mut kept = 0;
    for (rel, bytes) in mine {
        let target = vault.join(&rel);
        let dest = match std::fs::read(&target) {
            Err(_) => target,
            Ok(theirs) if theirs == bytes => continue,
            Ok(_) => vault.join(from_device_path(vault, &rel)),
        };
        if let Some(dir) = dest.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
        kept += 1;
    }
    crate::git::ensure_ignored(vault, crate::git::IGNORED)?;
    if commit_all(vault, "Add pages from this phone")?.is_some() {
        push(vault, auth)?;
    }
    Ok(match kept {
        0 => "Connected · your pages are on this phone".into(),
        1 => "Connected · 1 page from this phone was added".into(),
        n => format!("Connected · {n} pages from this phone were added"),
    })
}

fn from_device_path(vault: &Path, rel: &str) -> String {
    let (stem, ext) = rel.rsplit_once('.').map(|(s, e)| (s.to_string(), format!(".{e}"))).unwrap_or((rel.to_string(), String::new()));
    let mut n = 1;
    loop {
        let candidate = if n == 1 { format!("{stem} (from this phone){ext}") } else { format!("{stem} (from this phone {n}){ext}") };
        if !vault.join(&candidate).exists() {
            return candidate;
        }
        n += 1;
    }
}

/// Every file in the workspace (relative paths), apart from `.git` and the Trash.
fn workspace_files(vault: &Path) -> Vec<String> {
    walkdir::WalkDir::new(vault)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            e.depth() == 0 || !(name == ".git" || name == ".trash")
        })
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .map(|e| crate::vault::rel_string(vault, e.path()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bg-gitlib-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn bare(name: &str) -> (PathBuf, String) {
        let dir = temp(name);
        Repository::init_bare(&dir).unwrap();
        let url = format!("file://{}", dir.display());
        (dir, url)
    }

    const AUTH: fn() -> Auth = Auth::default;

    fn sync(vault: &Path) -> Integrated {
        fetch(vault, &AUTH()).unwrap();
        let done = integrate(vault).unwrap();
        push(vault, &AUTH()).unwrap();
        done
    }

    #[test]
    fn https_urls() {
        assert_eq!(https_url("git@github.com:me/notes.git").unwrap(), "https://github.com/me/notes.git");
        assert_eq!(https_url("ssh://git@gitlab.com/me/notes.git").unwrap(), "https://gitlab.com/me/notes.git");
        assert_eq!(https_url(" https://github.com/me/notes ").unwrap(), "https://github.com/me/notes");
        assert!(https_url("notes").is_err());
    }

    #[test]
    fn connects_syncs_and_keeps_both_sides_of_a_conflict() {
        let (_remote, url) = bare("remote");

        // A phone connects to an empty repository: its pages go up.
        let a = temp("a");
        std::fs::write(a.join("Plan.md"), "from a\n").unwrap();
        connect(&a, &url, &AUTH(), &|_, _| true).unwrap();

        // A second phone with a page of its own, and an untouched page it shouldn't keep.
        let b = temp("b");
        std::fs::write(b.join("Ideas.md"), "from b\n").unwrap();
        std::fs::write(b.join("Plan.md"), "b's own plan\n").unwrap();
        std::fs::write(b.join("Welcome.md"), "seed\n").unwrap();
        let msg = connect(&b, &url, &AUTH(), &|rel, _| rel != "Welcome.md").unwrap();
        assert!(msg.contains("2 pages"), "{msg}");
        assert_eq!(std::fs::read_to_string(b.join("Plan.md")).unwrap(), "from a\n");
        assert_eq!(std::fs::read_to_string(b.join("Plan (from this phone).md")).unwrap(), "b's own plan\n");
        assert!(b.join("Ideas.md").exists() && !b.join("Welcome.md").exists());

        // A fast-forward brings b's pages to a.
        let got = sync(&a);
        assert_eq!(got, Integrated { updated: true, conflicts: vec![] });
        assert!(a.join("Ideas.md").exists());

        // Both edit the same page: the remote's version wins the path, the other is kept beside it.
        std::fs::write(a.join("Plan.md"), "a edits\n").unwrap();
        assert_eq!(sync(&a), Integrated::default());
        std::fs::write(b.join("Plan.md"), "b edits\n").unwrap();
        std::fs::write(b.join("New.md"), "new on b\n").unwrap();
        let got = sync(&b);
        assert_eq!(got.conflicts, vec!["Plan.md".to_string()]);
        assert_eq!(std::fs::read_to_string(b.join("Plan.md")).unwrap(), "a edits\n");
        assert_eq!(std::fs::read_to_string(b.join("Plan (conflicted copy).md")).unwrap(), "b edits\n");
        assert!(status(&b).unwrap().changes.is_empty());

        // And a gets all of it.
        sync(&a);
        assert!(a.join("New.md").exists() && a.join("Plan (conflicted copy).md").exists());
        assert!(log(&a, Some("Plan.md"), 10).unwrap().len() >= 2);
    }

    #[test]
    fn deleted_here_edited_there_keeps_the_edit() {
        let (_remote, url) = bare("remote2");
        let a = temp("a2");
        std::fs::write(a.join("Note.md"), "v1\n").unwrap();
        connect(&a, &url, &AUTH(), &|_, _| true).unwrap();
        let b = temp("b2");
        connect(&b, &url, &AUTH(), &|_, _| true).unwrap();

        std::fs::write(a.join("Note.md"), "v2\n").unwrap();
        sync(&a);
        std::fs::remove_file(b.join("Note.md")).unwrap();
        std::fs::write(b.join("Other.md"), "x\n").unwrap();
        sync(&b);
        assert_eq!(std::fs::read_to_string(b.join("Note.md")).unwrap(), "v2\n");
    }

    /// Reaches a real HTTPS remote (needs the network): `cargo test --features libgit2 -- --ignored`.
    #[test]
    #[ignore]
    fn fetches_over_https() {
        let dir = temp("https");
        ensure_repo(&dir).unwrap();
        open(&dir).unwrap().remote("origin", "https://github.com/octocat/Hello-World.git").unwrap();
        let repo = open(&dir).unwrap();
        assert_eq!(remote_default_branch(&repo, &AUTH()).unwrap().as_deref(), Some("master"));
        fetch(&dir, &AUTH()).unwrap();
        assert!(repo.find_reference("refs/remotes/origin/master").is_ok());
    }

    #[test]
    fn status_saves_what_it_learns_to_the_index() {
        let dir = temp("refresh");
        std::fs::write(dir.join("Page.md"), "text\n").unwrap();
        ensure_repo(&dir).unwrap();
        // Touched but unchanged: the index's timestamp no longer matches, so status reads the file.
        let touched = std::time::SystemTime::now() + std::time::Duration::from_secs(3600);
        std::fs::File::options().write(true).open(dir.join("Page.md")).unwrap().set_modified(touched).unwrap();
        let mtime = || Repository::open(&dir).unwrap().index().unwrap().get_path(Path::new("Page.md"), 0).unwrap().mtime.seconds();
        let before = mtime();
        assert!(status_unsaved(&dir).unwrap().changes.is_empty());
        assert_eq!(mtime(), before, "status_unsaved leaves the index alone");
        assert!(status(&dir).unwrap().changes.is_empty());
        // It keeps the new timestamp, so the next status doesn't read every such file again.
        let index = Repository::open(&dir).unwrap().index().unwrap();
        let entry = index.get_path(Path::new("Page.md"), 0).unwrap();
        let secs = touched.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        assert_eq!(entry.mtime.seconds() as u64, secs);
    }
}
