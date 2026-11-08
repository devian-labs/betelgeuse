/**
 * Takes what could identify a person, page, folder or repository out of text bound for error reports and
 * usage counts: errors carry paths and messages built from page names, and URLs carry repository names.
 * Shared by the apps (./telemetry.ts) and the web app's server (apps/web/instrumentation.ts), so it imports nothing.
 * The Rust side has its own, in crates/betelgeuse-core/src/telemetry.rs.
 */
const RULES: [RegExp, string][] = [
  // Tokens: GitHub (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_), bearer headers.
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "<token>"],
  [/\b(Bearer|token)\s+[A-Za-z0-9._~+/-]{12,}=*/gi, "$1 <token>"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>"],
  // The web app's workspace routes and GitHub's API name the repository: keep the route, drop the names.
  [/\/w\/[^/?#\s]+\/[^/?#\s]+[^?#\s"']*/g, "/w/:owner/:repo"],
  [/\/repos\/[^/?#\s]+\/[^/?#\s]+[^?#\s"']*/g, "/repos/:owner/:repo"],
  // Absolute paths, on any OS: they hold the user's name and the workspace's pages.
  [/(?:[A-Za-z]:\\|\\\\)[^\s"'`<>|]+/g, "<path>"],
  [/(?<![\w:/.])\/(?:Users|home|var|private|tmp|data|storage|sdcard|mnt|Volumes|root|opt)\/[^\s"'`<>]*/g, "<path>"],
  [/~\/[^\s"'`<>]*/g, "<path>"],
  // Relative page paths and file names.
  [/[^\s"'`<>/\\]+(?:\/[^\s"'`<>/\\]+)*\.(?:md|markdown|csv|json|ya?ml|png|jpe?g|gif|webp|svg|pdf|zip)\b/gi, "<file>"],
  // Quoted text: messages quote the page or folder they were about.
  [/"[^"\n]{1,200}"/g, '"…"'],
  [/'[^'\n]{1,200}'/g, "'…'"],
  [/“[^”\n]{1,200}”/g, "“…”"],
  [/‘[^’\n]{1,200}’/g, "‘…’"],
];

/** Removes anything from a string that could name a person, page, folder or repository. */
export function scrub(text: string): string;
export function scrub(text: string | undefined): string | undefined;
export function scrub(text: string | undefined): string | undefined {
  if (!text) return text;
  let out = text;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out.length > 2000 ? out.slice(0, 2000) + "…" : out;
}

/** A URL reduced to what can't identify anyone: origin and a scrubbed path, no query or hash. */
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    // Not `origin`: it's "null" for the desktop app's tauri:// addresses.
    return `${u.protocol}//${u.host}` + scrub(u.pathname);
  } catch {
    return scrub(url.split(/[?#]/)[0]);
  }
}

type Frame = { filename?: string; abs_path?: string; function?: string; context_line?: string; pre_context?: string[]; post_context?: string[]; vars?: unknown };
type Exception = { type?: string; value?: string; module?: string; stacktrace?: { frames?: Frame[] } };

/**
 * An error event's exceptions with their messages scrubbed. Stack frames keep the function and the bundle's
 * file and line (that's where the bug is), but lose source text, local variables and any path outside the app.
 */
export function scrubExceptions(list: Exception[]): Exception[] {
  return list.map((ex) => ({
    ...ex,
    value: scrub(ex.value),
    stacktrace: ex.stacktrace && {
      ...ex.stacktrace,
      frames: ex.stacktrace.frames?.map(({ context_line: _c, pre_context: _p, post_context: _q, vars: _v, ...frame }) => ({
        ...frame,
        filename: scrubUrl(frame.filename),
        abs_path: scrubUrl(frame.abs_path),
      })),
    },
  }));
}
