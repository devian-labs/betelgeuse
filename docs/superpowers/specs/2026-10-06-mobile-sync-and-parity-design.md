# Mobile sync, GitHub sign-in and parity: design

Date: 2026-10-06 · Status: draft for review

## Goal

Finish the mobile app (`apps/mobile`, Tauri iOS/Android) so a phone and a desktop share one
workspace, and the phone has the everyday features the desktop has. Add "Sign in with GitHub" to
both apps so setting up sync needs no repository addresses, SSH keys or tokens.

Success looks like:

1. On the desktop, a user signs in with GitHub, creates (or picks) a private repository, and pushes
   their workspace, without touching a terminal.
2. On a phone, the same user signs in, picks that repository, and gets the same pages. Edits on
   either device reach the other on the next sync, automatically on the phone.
3. When both devices change the same lines of a page, no text is lost.
4. The phone has page history, Trash, Settings (theme, palette, sync) and a full page menu.

## Scope

Two milestones, each with its own implementation plan:

- **Milestone 1: sync.** Git engine for phones, GitHub sign-in (both apps), automatic sync and
  conflict copies on the phone, page history on the phone.
- **Milestone 2: parity.** Trash, Settings, and the full page menu on the phone; documentation updates.

Out of scope: import and AI agents/MCP on the phone, tabs on the phone, a conflict view, and conflict
handling in the desktop's sync (the desktop pulls conflict copies like any other page).

## Background: what exists today

- `crates/betelgeuse-core` holds the workspace engine shared by both apps. `git.rs` shells out to the
  `git` program for status, commit, log, show, pull/push and remote settings.
- The desktop (`apps/desktop/src-tauri`) registers 35 commands, including git, Trash, import, AI
  policy, auto-commit (a background thread commits after 8 s idle) and a file watcher.
- The phone (`apps/mobile/src-tauri`) registers 14 commands (pages, databases, assets, search,
  backlinks) and has no git: phones have no `git` program. Its interface reuses the desktop's
  editor, databases and styles through the `@desktop` alias.

## Part 1: Git engine with two backends

`crates/betelgeuse-core/src/git.rs` becomes a module, `git/`, with one public API and two backends
selected by Cargo feature:

| File | Feature | Used by | Notes |
|---|---|---|---|
| `git/mod.rs` | — | both | Public types (`Change`, `Commit`, `RepoStatus`, `GitSettings`, `SyncOutcome`, `Credentials`) and functions; re-exports the selected backend. |
| `git/cli.rs` | `git-cli` (default) | desktop | Today's code, unchanged in behaviour, plus optional credentials (below). |
| `git/lib2.rs` | `libgit2` | phone | Built on the `git2` crate with vendored libgit2 (and vendored OpenSSL on Android). |

Exactly one backend feature is enabled; enabling both or neither is a compile error.

**API.** Existing functions keep their names and signatures (`ensure_repo`, `status`, `commit_all`,
`auto_message`, `log`, `show`, `settings`, `set_remote`, `set_identity`), so desktop call sites don't
change. Network functions gain an optional credential:

```rust
pub struct Credentials { pub username: String, pub token: String } // GitHub: "x-access-token" + user token

pub fn sync(vault: &Path, creds: Option<&Credentials>) -> Result<SyncOutcome, String>;
pub fn test_remote(vault: &Path, creds: Option<&Credentials>) -> Result<String, String>;
pub fn publish(vault: &Path, creds: Option<&Credentials>) -> Result<String, String>;
pub fn clone_into(url: &str, dest: &Path, creds: Option<&Credentials>) -> Result<(), String>; // new

pub struct SyncOutcome { pub summary: String, pub conflicts: Vec<String> } // conflict-copy paths
```

**CLI backend and credentials.** With `creds`, the token is handed to `git` through environment
variables only (`GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=http.https://github.com/.extraHeader`,
`GIT_CONFIG_VALUE_0=Authorization: Basic <base64(username:token)>`, plus `GIT_TERMINAL_PROMPT=0`).
It never appears in process arguments, `.git/config` or the remote URL. Without `creds`, behaviour is
exactly today's (the user's SSH keys and credential helpers). The CLI backend's `sync` keeps today's
`pull --rebase --autostash` + `push` and returns `conflicts: []`.

**libgit2 backend sync algorithm.**

1. Commit any uncommitted changes (`auto_message`, suffixed with the device, see Part 3).
2. Fetch `origin`.
3. If the remote branch is an ancestor of HEAD: go to 5. If HEAD is an ancestor of the remote:
   fast-forward. Otherwise merge.
4. Merge conflicts are resolved without losing text:
   - Both sides changed a file: the local version stays at the path; the remote version is written
     to `<Title> (conflict).md` (or `<name> (conflict).<ext>` for assets), named with the existing
     `vault::unique_path` so it never overwrites anything.
   - One side deleted, the other changed: the changed version is kept.
   - The merge commit message: "Sync: kept both versions of <Title>" (or "Merge from GitHub" when
     there was nothing to keep).
5. Push. If the push is rejected because the remote moved on, repeat from 2 once, then report.

**Tests.** One shared test suite in `git/tests.rs` runs against whichever backend is compiled, using
local bare repositories as remotes: init, commit, log/show, clone, fast-forward, clean merge,
conflict copy (text and asset), delete-vs-modify, rejected push then retry, and a check that no file
under the workspace or `.git/` contains the token. CI runs it twice:
`cargo test -p betelgeuse-core` and `cargo test -p betelgeuse-core --no-default-features --features libgit2`.

## Part 2: GitHub sign-in (both apps)

**GitHub App, device flow.** Betelgeuse signs in as a GitHub App (not an OAuth App) using the device
flow, so tokens reach only the repositories the user installs the app on, and no client secret
ships in the apps. Per GitHub's docs, device-flow user tokens can be refreshed without a client
secret; access tokens last 8 hours and refresh tokens 6 months.

**Client ID.** Public by design and committed in source:
`option_env!("BETELGEUSE_GITHUB_CLIENT_ID").unwrap_or(DEVIAN_LABS_CLIENT_ID)`. Every build (releases,
source builds, forks) uses the Devian Labs app; a fork may set the variable at build time to use its
own. Until the app is registered, `DEVIAN_LABS_CLIENT_ID` is empty and the sign-in button is hidden
(the manual options below still work).

**Core module `github.rs`** (feature `github`, using `ureq` 3 with rustls, which the desktop already
depends on), shared by both apps:

- `start_device_flow() -> DeviceCode { user_code, verification_uri, device_code, interval, expires_in }`
- `poll_token(&DeviceCode) -> Poll::{Pending, SlowDown, Done(Tokens), Expired, Denied}`
- `refresh(&Tokens) -> Tokens` (called automatically when the access token is within 5 min of expiry)
- `user(&Tokens) -> GithubUser { login, name, id }`; commit identity defaults to `name` (or `login`) and
  `<id>+<login>@users.noreply.github.com`, so no email permission is needed.
- `repositories(&Tokens) -> Vec<Repo>`: every repository across the user's installations of the app.
- `create_private_repo(&Tokens, name) -> Repo`. **To verify during implementation:** which permission a
  GitHub App user token needs for `POST /user/repos`. GitHub states repositories the app creates are
  automatically added to its installation. If creation isn't possible, the button instead opens
  `https://github.com/new?name=<name>&visibility=private`, then the app's installation page.
- The API base URL is injectable so tests run against a local mock server.

**Token storage, `auth.rs`.** Tokens are stored in the system credential store with the `keyring`
crate (v4): macOS/iOS Keychain, Windows Credential Manager, Linux Secret Service, Android Keystore.
They're never written to the workspace (which is synced) or to `.git/`. If the Android store can't be
initialised, the fallback is a file in the app's private data directory, outside the workspace,
readable only by the app.

**Desktop UI** (Settings → Git & sync, `SettingsDialog.tsx`):

1. **Sign in with GitHub** opens a small dialog: the 8-character code with **Copy code & open GitHub**
   (opens `verification_uri`), and a spinner while polling. Cancel stops polling.
2. Signed in: "Signed in as @login · Sign out", then a repository picker listing the repositories
   from step `repositories`, **Create a private repository** (default name `betelgeuse-notes`), and
   **Choose which repositories Betelgeuse can use** (opens `github.com/apps/<slug>/installations/new`).
3. Picking a repository sets `origin` to its HTTPS URL, sets the commit identity if none is set, and
   publishes. Sync then uses the stored token for `github.com` remotes.
4. The existing manual remote field stays below for GitLab and other hosts, and for people who prefer
   their own git credentials.

Signing in never changes an existing remote by itself; only picking a repository does.

## Part 3: Phone sync

**Local repository.** On first launch the phone's workspace becomes a git repository (libgit2), so
history works with or without sync. Without sync, pages commit after 8 s without edits (the
desktop's default); with sync, the sync 5 s after the last edit commits them (step 1 of the sync
algorithm). Messages read like "Update Groceries (iOS)" or "(Android)".

**Connecting** (Settings → Sync): Sign in with GitHub (same flow as the desktop, styled as a sheet),
then pick a repository. The manual option is "Other git host": an HTTPS address plus an access token,
stored like the GitHub tokens.

- **Repository has pages:** it is cloned into a fresh folder, which replaces the workspace. If the
  phone had pages of its own (anything beyond the untouched welcome pages), they are moved into a
  page called "From this phone" in the cloned workspace and committed, so nothing is lost.
- **Repository is empty:** the phone's workspace is pushed to it.

**Automatic sync.** One sync runs at a time (a second request while one runs is folded into it).
Triggers: app launch, app returning to the foreground, 5 s after the last edit, pull-to-refresh on
the home screen, and **Sync now** in Settings. Offline or failing syncs keep the local commits and
retry on the next trigger.

**Status.** The home screen header shows one line: "Synced 2 min ago", "Syncing…", "Offline · changes
will sync", "Sync failed" (tap for the message), or "N pages had edits on both devices" (tap lists
the conflict copies). The app emits a `sync-status` event that the interface listens to.

**Page history on the phone.** Page menu → History opens a full-screen list of the page's commits
(who, when, message; the desktop's agent icon where relevant). Tapping one shows that version
read-only with **Restore**, which writes it back and commits "Restore <Title>".

**New phone commands:** `git_status`, `git_log`, `git_show`, `git_sync`, `git_settings`,
`git_set_identity`, `github_start`, `github_poll`, `github_user`, `github_sign_out`, `github_repos`,
`github_create_repo`, `connect_repo`, `connect_manual`, `disconnect`. Names match the desktop's where
the desktop has the same command, so shared interface code calls one `api`.

## Part 4: Phone parity (milestone 2)

- **Trash screen** (from Home and Settings): deleted pages with **Restore** and **Delete forever**, and
  **Empty Trash**. Uses the core's existing `list_trash`, `restore_trash`, `purge_trash`.
- **Settings screen**: Appearance (theme: System, Light, Dark, Black; palette: Betelgeuse, Graphite,
  Midnight, using the desktop's settings store), Sync (Part 3), Trash, and About (version, licence,
  website, source code).
- **Page menu** (•••): Icon (the desktop's `IconPicker` in a bottom sheet), New sub-page, Duplicate,
  Move to… (a page picker sheet, using `move_note`), History, Move to Trash.
- **Docs**: the phone's Welcome page, the desktop guide's "History and sync" page, the README and the
  release notes describe GitHub sign-in and phone sync instead of "sync is coming".

## Registering the GitHub App (one-time, Devian Labs)

At `https://github.com/organizations/devian-labs/settings/apps/new`:

- **Name:** Betelgeuse · **Homepage URL:** `https://betelgeuse.devianlabs.com`
- **Callback URL:** `https://betelgeuse.devianlabs.com` (not used by the device flow, but GitHub may ask)
- **Expire user authorization tokens:** on · **Request user authorization during installation:** off
- **Enable Device Flow:** on
- **Webhook:** Active off
- **Repository permissions:** Contents: Read and write; Metadata: Read (mandatory); Administration:
  Read and write only if creating repositories needs it (see Part 2)
- **Account permissions:** none
- **Where can this app be installed:** Any account

Then copy the **Client ID** (not the App ID) and the app's URL slug into the code (`DEVIAN_LABS_CLIENT_ID`,
`GITHUB_APP_SLUG`). No client secret or private key is needed or stored anywhere.

## Testing

- **Rust:** the shared git suite against both backends (Part 1); `github.rs` against a local mock
  server (device code, pending/slow-down/expired/denied polling, refresh, repository listing); the
  phone's connect flow (clone into empty phone, clone with phone pages to keep, push to empty repo).
- **TypeScript:** existing tests keep passing; typecheck for desktop, mobile and MCP.
- **Manual:** iPhone simulator and Android emulator, syncing against a test GitHub repository with the
  desktop app: edit on each side, edit the same line on both, go offline and back, delete on one side
  and edit on the other.

## Risks

- **libgit2 on mobile builds:** vendored libgit2/OpenSSL adds a few MB and build time; Android needs
  the NDK toolchain the release workflow already installs.
- **Repository creation permission** for GitHub App user tokens is unverified; the fallback is
  described in Part 2.
- **Android credential store** initialisation; the fallback is described in Part 2.
- **Two devices, one branch:** the desktop still uses rebase and fails on true conflicts as today;
  the phone's conflict copies keep the shared branch clean for the desktop to pull.
