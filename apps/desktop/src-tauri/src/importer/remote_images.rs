//! Downloads the images imported pages link to on the web (Notion's cover gallery, icons and images
//! hosted elsewhere) into the workspace, so the pages don't depend on, or call out to, those servers.

use regex::{Captures, Regex};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use walkdir::WalkDir;

/// `cover: https://…` / `icon: https://…` in a page's frontmatter.
static FRONTMATTER_IMAGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?m)^((?:cover|icon): )"?(https?://[^\s"]+)"?[ \t]*$"#).unwrap());
/// `![alt](https://…)`
static MARKDOWN_IMAGE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(!\[[^\]\n]*\]\()(https?://[^)\s]+)(\))").unwrap());
/// `<img src="https://…">`
static HTML_IMAGE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(<img\b[^>]*\bsrc=")(https?://[^"]+)(")"#).unwrap());

/// Downloads at once, and the limits on each.
const WORKERS: usize = 8;
const TIMEOUT: Duration = Duration::from_secs(20);
const MAX_BYTES: u64 = 25 * 1024 * 1024;

/// A downloaded image: its bytes and file extension.
pub(super) type Image = (Vec<u8>, &'static str);

/// What `localize` did: images now in the workspace, and the web addresses it couldn't fetch.
pub(super) struct Localized {
    pub downloaded: usize,
    pub failed: Vec<String>,
}

/// Downloads every web image the pages under `dir` show (covers, icons and images in the text) with
/// `fetch`, stores each once via `store` (which returns its workspace path), and points the pages at
/// the copies. Images that can't be fetched keep their web address.
pub(super) fn localize(
    dir: &Path,
    fetch: impl Fn(&str) -> Option<Image> + Sync,
    mut store: impl FnMut(&str, &[u8], &str) -> Option<String>,
) -> Localized {
    let pages: Vec<_> = WalkDir::new(dir)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && e.path().extension().is_some_and(|x| x == "md"))
        .map(|e| e.into_path())
        .collect();
    let mut urls: Vec<String> = vec![];
    let mut seen = HashSet::new();
    for page in &pages {
        let Ok(text) = fs::read_to_string(page) else { continue };
        let (fm, body) = crate::vault::split_frontmatter(&text);
        let found = FRONTMATTER_IMAGE.captures_iter(fm).chain(MARKDOWN_IMAGE.captures_iter(body)).chain(HTML_IMAGE.captures_iter(body));
        for c in found {
            if seen.insert(c[2].to_string()) {
                urls.push(c[2].to_string());
            }
        }
    }
    if urls.is_empty() {
        return Localized { downloaded: 0, failed: vec![] };
    }

    // Download in parallel; each worker takes the next address until none are left.
    let next = AtomicUsize::new(0);
    let results: Mutex<Vec<Option<Image>>> = Mutex::new(vec![None; urls.len()]);
    std::thread::scope(|s| {
        for _ in 0..WORKERS.min(urls.len()) {
            s.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                let Some(url) = urls.get(i) else { break };
                let got = fetch(url);
                results.lock().unwrap()[i] = got;
            });
        }
    });

    let mut local: HashMap<&str, String> = HashMap::new();
    let mut failed = vec![];
    for (url, got) in urls.iter().zip(results.into_inner().unwrap()) {
        match got.and_then(|(bytes, ext)| store(&name_hint(url, ext), &bytes, url)) {
            Some(path) => {
                local.insert(url.as_str(), path);
            }
            None => failed.push(url.clone()),
        }
    }

    for page in &pages {
        let Ok(text) = fs::read_to_string(page) else { continue };
        let (fm, body) = crate::vault::split_frontmatter(&text);
        let swap = |c: &Captures| match local.get(&c[2]) {
            Some(path) => format!("{}{path}{}", &c[1], c.get(3).map_or("", |m| m.as_str())),
            None => c[0].to_string(),
        };
        let new_fm = FRONTMATTER_IMAGE.replace_all(fm, swap);
        let new_body = HTML_IMAGE.replace_all(&MARKDOWN_IMAGE.replace_all(body, swap), swap).into_owned();
        if new_fm != fm || new_body != body {
            let _ = fs::write(page, splice(&text, fm, &new_fm, body, &new_body));
        }
    }
    Localized { downloaded: local.len(), failed }
}

/// The page text with its frontmatter and body (slices of `text`, from `split_frontmatter`)
/// replaced, keeping the `---` lines around them.
fn splice(text: &str, fm: &str, new_fm: &str, body: &str, new_body: &str) -> String {
    let body_at = text.len() - body.len();
    if body_at == 0 {
        return new_body.to_string(); // no frontmatter
    }
    let fm_at = fm.as_ptr() as usize - text.as_ptr() as usize;
    format!("{}{new_fm}{}{new_body}", &text[..fm_at], &text[fm_at + fm.len()..body_at])
}

/// A file name for a downloaded image: the address's last path segment, with the right extension.
fn name_hint(url: &str, ext: &str) -> String {
    // The path after `scheme://host/`, without query or fragment.
    let path = url.splitn(4, '/').nth(3).unwrap_or("").split(['?', '#']).next().unwrap_or("");
    let last = path.trim_end_matches('/').rsplit('/').next().unwrap_or("");
    let stem = last.rsplit_once('.').map_or(last, |(s, _)| s);
    let stem = super::percent_decode(stem);
    let stem = if stem.trim().is_empty() || stem.len() > 80 { "image".to_string() } else { stem };
    format!("web-{stem}.{ext}")
}

/// Downloads `url` if it is an image (judged by its bytes, not the server's word), up to `MAX_BYTES`.
pub(super) fn fetch(url: &str) -> Option<Image> {
    static AGENT: LazyLock<ureq::Agent> = LazyLock::new(|| {
        ureq::Agent::config_builder()
            .timeout_global(Some(TIMEOUT))
            .user_agent("Betelgeuse (importing a user's own pages)")
            .build()
            .into()
    });
    let mut response = AGENT.get(url).call().ok()?;
    let bytes = response.body_mut().with_config().limit(MAX_BYTES).read_to_vec().ok()?;
    let ext = image_ext(&bytes)?;
    Some((bytes, ext))
}

/// The extension for image bytes, from their signature; None for anything else (e.g. an error page).
fn image_ext(b: &[u8]) -> Option<&'static str> {
    let head = String::from_utf8_lossy(&b[..b.len().min(512)]).to_lowercase();
    Some(match b {
        [0x89, b'P', b'N', b'G', ..] => "png",
        [0xFF, 0xD8, 0xFF, ..] => "jpg",
        [b'G', b'I', b'F', b'8', ..] => "gif",
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => "webp",
        [0, 0, 1, 0, ..] => "ico",
        [_, _, _, _, b'f', b't', b'y', b'p', b'a', b'v', b'i', b'f', ..] => "avif",
        _ if head.trim_start().starts_with("<svg") || (head.trim_start().starts_with("<?xml") && head.contains("<svg")) => "svg",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 1, 2, 3];

    #[test]
    fn recognises_images_by_their_bytes() {
        assert_eq!(image_ext(PNG), Some("png"));
        assert_eq!(image_ext(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(image_ext(b"<?xml version=\"1.0\"?><svg xmlns=\"\"/>"), Some("svg"));
        assert_eq!(image_ext(b"<!doctype html><html>Sign in</html>"), None);
        assert_eq!(name_hint("https://img.example.com/covers/My%20Cover.jpeg?w=1200", "jpg"), "web-My Cover.jpg");
        assert_eq!(name_hint("https://example.com/", "png"), "web-image.png");
    }

    #[test]
    fn downloads_web_images_and_points_pages_at_them() {
        let dir = std::env::temp_dir().join(format!("bg-remote-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Sub")).unwrap();
        let page = "---\nicon: https://cdn.example.com/i/star.png\ncover: \"https://cdn.example.com/c/sky.jpg?x=1\"\norder: 1\n---\nText ![shot](https://cdn.example.com/i/star.png) and ![gone](https://dead.example.com/x.png).\n\n<img src=\"https://cdn.example.com/c/sky.jpg?x=1\" width=\"200\">\n\n[a link](https://cdn.example.com/c/sky.jpg?x=1)\n";
        fs::write(dir.join("Page.md"), page).unwrap();
        fs::write(dir.join("Sub/Row.md"), "![again](https://cdn.example.com/i/star.png)\n").unwrap();

        let fetched = Mutex::new(vec![]);
        let fake = |url: &str| {
            fetched.lock().unwrap().push(url.to_string());
            (!url.contains("dead")).then(|| (PNG.to_vec(), "png"))
        };
        let mut stored = vec![];
        let result = localize(&dir, fake, |name, _bytes, _url| {
            stored.push(name.to_string());
            Some(format!(".assets/batch/{name}"))
        });

        // Each address is downloaded once, however many pages show it.
        assert_eq!(fetched.lock().unwrap().len(), 3);
        assert_eq!(result.downloaded, 2);
        assert_eq!(result.failed, ["https://dead.example.com/x.png"]);
        assert_eq!(
            fs::read_to_string(dir.join("Page.md")).unwrap(),
            "---\nicon: .assets/batch/web-star.png\ncover: .assets/batch/web-sky.png\norder: 1\n---\nText ![shot](.assets/batch/web-star.png) and ![gone](https://dead.example.com/x.png).\n\n<img src=\".assets/batch/web-sky.png\" width=\"200\">\n\n[a link](https://cdn.example.com/c/sky.jpg?x=1)\n"
        );
        assert_eq!(fs::read_to_string(dir.join("Sub/Row.md")).unwrap(), "![again](.assets/batch/web-star.png)\n");
        let _ = fs::remove_dir_all(&dir);
    }
}
