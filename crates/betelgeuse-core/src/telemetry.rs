//! Crash reports from the apps' Rust side (panics), to PostHog's error tracking. The interface reports its
//! own errors (packages/ui/src/lib/telemetry.ts); this covers what happens below it.
//!
//! - Only in builds with a PostHog key (`POSTHOG_KEY` at compile time, from CI secrets).
//! - On unless turned off in Settings → Privacy: the interface calls [`set_enabled`], which leaves a
//!   marker file so the choice holds from the very start of the next launch, before the interface loads.
//! - Never sends a workspace's content: paths, file names and quoted text are taken out of the message,
//!   and stack frames keep only the function and the source file inside its crate.
use std::cell::Cell;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

struct State {
    key: &'static str,
    host: String,
    release: String,
    /// Exists when reports are turned off.
    off_marker: PathBuf,
    enabled: bool,
    /// The interface's anonymous PostHog id, so a crash belongs to the same (anonymous) person.
    distinct_id: String,
}

static STATE: OnceLock<Mutex<State>> = OnceLock::new();

static AGENT: LazyLock<ureq::Agent> = LazyLock::new(|| {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(5)))
        .user_agent(concat!("Betelgeuse/", env!("CARGO_PKG_VERSION"), " (crash report)"))
        .build()
        .into()
});

thread_local! {
    /// Set while a report is being sent, so a panic inside the hook doesn't report itself forever.
    static REPORTING: Cell<bool> = const { Cell::new(false) };
}

/// Starts crash reporting at launch, unless the build has no key or the person turned it off.
/// `off_marker` is a file in the app's config folder; `host` defaults to PostHog's US cloud.
pub fn init(key: Option<&'static str>, host: Option<&'static str>, release: &str, off_marker: PathBuf) {
    let Some(key) = key.filter(|k| !k.is_empty()) else { return };
    let host = host.filter(|h| !h.is_empty()).unwrap_or("https://us.i.posthog.com").trim_end_matches('/').to_owned();
    let enabled = !off_marker.exists();
    let state = State { key, host, release: release.to_owned(), off_marker, enabled, distinct_id: fallback_id() };
    if STATE.set(Mutex::new(state)).is_err() {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        report(info);
        previous(info);
    }));
}

/// Follows the Settings switch, and remembers it for the next launch.
pub fn set_enabled(enabled: bool, distinct_id: Option<String>) -> Result<(), String> {
    let Some(state) = STATE.get() else { return Ok(()) }; // no key in this build
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if let Some(id) = distinct_id.filter(|id| !id.is_empty()) {
        state.distinct_id = id;
    }
    if enabled {
        match std::fs::remove_file(&state.off_marker) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    } else {
        if let Some(dir) = state.off_marker.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&state.off_marker, b"").map_err(|e| e.to_string())?;
    }
    state.enabled = enabled;
    Ok(())
}

/// An id for crashes before the interface has said its own: random enough, and anonymous.
fn fallback_id() -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos());
    format!("rust-{:x}{:x}", nanos, std::process::id())
}

fn report(info: &std::panic::PanicHookInfo) {
    if REPORTING.with(|r| r.replace(true)) {
        return;
    }
    // Copy what's needed and let go of the lock before the request, which can take a few seconds.
    let target = STATE.get().and_then(|s| s.lock().ok()).filter(|s| s.enabled).map(|s| {
        (s.key, s.host.clone(), s.release.clone(), s.distinct_id.clone())
    });
    if let Some((key, host, release, distinct_id)) = target {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        let location = info.location().map(|l| (short_path(l.file()), l.line(), l.column()));
        let body = event(key, &release, &distinct_id, &scrub(&message), location, frames(&std::backtrace::Backtrace::force_capture().to_string()));
        let _ = AGENT.post(format!("{host}/i/v0/e/")).content_type("application/json").send(body.to_string());
    }
    REPORTING.with(|r| r.set(false));
}

/// The `$exception` event PostHog's error tracking reads.
fn event(key: &str, release: &str, distinct_id: &str, message: &str, location: Option<(String, u32, u32)>, mut frames: Vec<serde_json::Value>) -> serde_json::Value {
    if frames.is_empty() {
        if let Some((file, line, col)) = &location {
            frames.push(serde_json::json!({ "platform": "custom", "lang": "rust", "resolved": true, "in_app": true, "filename": file, "lineno": line, "colno": col }));
        }
    }
    serde_json::json!({
        "api_key": key,
        "event": "$exception",
        "distinct_id": distinct_id,
        "timestamp": chrono_now(),
        "properties": {
            "$exception_level": "fatal",
            "$exception_list": [{
                "type": "panic",
                "value": message,
                "mechanism": { "handled": false, "synthetic": false, "type": "panic" },
                "stacktrace": { "type": "raw", "frames": frames },
            }],
            "where": "rust",
            "platform": if cfg!(any(target_os = "android", target_os = "ios")) { "mobile" } else { "desktop" },
            "app_version": release,
            "environment": if cfg!(debug_assertions) { "development" } else { "production" },
            "$os": std::env::consts::OS,
            "$lib": "betelgeuse-rust",
            "$process_person_profile": false,
        },
    })
}

/// RFC 3339 in UTC, without a date crate.
fn chrono_now() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let (days, rem) = (secs / 86_400, secs % 86_400);
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// Stack frames from a backtrace's text, oldest call first (as PostHog expects), without the panic machinery.
fn frames(backtrace: &str) -> Vec<serde_json::Value> {
    let mut out: Vec<serde_json::Value> = Vec::new();
    for line in backtrace.lines() {
        let line = line.trim();
        if let Some(at) = line.strip_prefix("at ") {
            if let Some(last) = out.last_mut() {
                let mut parts = at.rsplitn(3, ':');
                let col = parts.next().and_then(|c| c.parse::<u32>().ok());
                let lineno = parts.next().and_then(|l| l.parse::<u32>().ok());
                if let (Some(col), Some(lineno), Some(file)) = (col, lineno, parts.next()) {
                    last["filename"] = short_path(file).into();
                    last["lineno"] = lineno.into();
                    last["colno"] = col.into();
                }
            }
        } else if let Some((n, function)) = line.split_once(": ") {
            if n.chars().all(|c| c.is_ascii_digit()) {
                let function = function.trim().to_owned();
                let in_app = function.starts_with("betelgeuse");
                out.push(serde_json::json!({ "platform": "custom", "lang": "rust", "resolved": true, "function": function, "in_app": in_app }));
            }
        }
    }
    let machinery = |f: &serde_json::Value| {
        let name = f["function"].as_str().unwrap_or("");
        ["std::", "core::", "alloc::", "rust_begin_unwind", "__rust", "betelgeuse_core::telemetry::", "<alloc::boxed::Box"].iter().any(|p| name.starts_with(p))
    };
    // Drop the hook's own frames and the panic runtime's, up to where the panic was raised.
    let first_real = out.iter().position(|f| !machinery(f)).unwrap_or(0);
    let mut out: Vec<_> = out.into_iter().skip(first_real).take(60).collect();
    out.reverse();
    out
}

/// A source path cut down to its crate and the file inside it: `betelgeuse-core-0.1.0/src/vault.rs`, `src/lib.rs`.
fn short_path(path: &str) -> String {
    // A leading slash, so a relative `src/lib.rs` is found like any other.
    let path = format!("/{}", path.replace('\\', "/").trim_start_matches('/'));
    match path.rfind("/src/") {
        Some(i) => {
            let start = path[..i].rfind('/').map_or(0, |j| j + 1);
            path[start..].trim_start_matches('/').to_owned()
        }
        None => path.rsplit('/').next().unwrap_or("").to_owned(),
    }
}

/// Removes paths, file names and quoted text: panic messages quote the page or folder they were about.
pub fn scrub(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        let close = match c {
            '"' => Some('"'),
            '\'' => Some('\''),
            '`' => Some('`'),
            '“' => Some('”'),
            '‘' => Some('’'),
            _ => None,
        };
        if let Some(close) = close {
            // Quoted text, up to its closing quote on the same line; a lone quote (it's) stays.
            let rest: String = chars.clone().take_while(|&ch| ch != '\n').collect();
            if let Some(end) = rest.find(close).filter(|&i| i > 0 && i <= 200 * 4) {
                let skip = rest[..end].chars().count() + 1;
                for _ in 0..skip {
                    chars.next();
                }
                out.push(c);
                out.push('…');
                out.push(close);
                continue;
            }
        }
        out.push(c);
    }
    out.split_inclusive(char::is_whitespace)
        .map(|word| {
            let trimmed = word.trim_end();
            let tail = &word[trimmed.len()..];
            let bare = trimmed.trim_matches(|ch: char| matches!(ch, '(' | ')' | ',' | ';' | ':' | '[' | ']'));
            let is_path = bare.starts_with('/')
                || bare.starts_with("~/")
                || bare.starts_with("\\\\")
                || (bare.len() > 2 && bare.as_bytes()[1] == b':' && matches!(bare.as_bytes()[2], b'\\' | b'/'));
            let is_file = [".md", ".markdown", ".csv", ".json", ".yml", ".yaml", ".png", ".jpg", ".jpeg", ".zip"]
                .iter()
                .any(|ext| bare.to_ascii_lowercase().ends_with(ext));
            if is_path {
                format!("<path>{tail}")
            } else if is_file {
                format!("<file>{tail}")
            } else {
                word.to_owned()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{chrono_now, frames, scrub, short_path};

    #[test]
    fn frames_keep_the_app_and_drop_the_panic_machinery() {
        let bt = "   0: std::backtrace::Backtrace::force_capture
             at /rustc/abc/library/std/src/backtrace.rs:331:13
   1: betelgeuse_core::telemetry::report
             at /Users/runner/work/betelgeuse/crates/betelgeuse-core/src/telemetry.rs:90:9
   2: std::panicking::rust_panic_with_hook
   3: betelgeuse_lib::read_note
             at /Users/runner/work/betelgeuse/apps/desktop/src-tauri/src/lib.rs:120:5
   4: tauri::app::run
             at /Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.9.0/src/app.rs:44:1";
        let f = frames(bt);
        assert_eq!(f.len(), 2);
        assert_eq!(f[0]["function"], "tauri::app::run");
        assert_eq!(f[0]["filename"], "tauri-2.9.0/src/app.rs");
        assert_eq!(f[0]["in_app"], false);
        assert_eq!(f[1]["function"], "betelgeuse_lib::read_note");
        assert_eq!(f[1]["filename"], "src-tauri/src/lib.rs");
        assert_eq!(f[1]["lineno"], 120);
        assert_eq!(f[1]["in_app"], true);
    }

    #[test]
    fn short_paths_hold_no_home_folder() {
        assert_eq!(short_path("/Users/ana/code/betelgeuse/crates/betelgeuse-core/src/vault.rs"), "betelgeuse-core/src/vault.rs");
        assert_eq!(short_path(r"C:\Users\ana\b\apps\desktop\src-tauri\src\lib.rs"), "src-tauri/src/lib.rs");
        assert_eq!(short_path("src/lib.rs"), "src/lib.rs");
    }

    #[test]
    fn timestamps_are_rfc3339() {
        let t = chrono_now();
        assert_eq!(t.len(), 20);
        assert!(t.starts_with("20") && t.ends_with('Z'), "{t}");
    }

    #[test]
    fn takes_out_paths_files_and_quoted_text() {
        assert_eq!(scrub("can't read /Users/ana/Betelgeuse/Diary.md: No such file"), "can't read <path> No such file");
        assert_eq!(scrub(r"open C:\Users\ana\Notes failed"), "open <path> failed");
        assert_eq!(scrub("page \"Taxes 2026\" not found"), "page \"…\" not found");
        assert_eq!(scrub("moved Projects/Plan.md to Archive"), "moved <file> to Archive");
        assert_eq!(scrub("called `Option::unwrap()` on a `None` value"), "called `…` on a `…` value");
        assert_eq!(scrub("index out of bounds: the len is 3 but the index is 7"), "index out of bounds: the len is 3 but the index is 7");
    }
}
