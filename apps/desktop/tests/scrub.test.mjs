import assert from "node:assert/strict";
import { test } from "node:test";
import { scrub, scrubExceptions, scrubUrl } from "../../../packages/ui/src/lib/scrub.ts";

// Error reports and usage counts must never carry a page, folder, repository or person.

test("paths on every OS become <path>", () => {
  assert.equal(scrub("ENOENT: no such file, open /Users/ana/Betelgeuse/Diary"), "ENOENT: no such file, open <path>");
  assert.equal(scrub("failed at C:\\Users\\ana\\Notes\\x"), "failed at <path>");
  assert.equal(scrub("in /data/user/0/dev.devianlabs.betelgeuse/files/ws"), "in <path>");
  assert.equal(scrub("see ~/Notes/today"), "see <path>");
});

test("page files and quoted names are taken out", () => {
  assert.equal(scrub("couldn't move Projects/Plan.md"), "couldn't move <file>");
  assert.equal(scrub('Page "Taxes 2026" already exists'), 'Page "…" already exists');
  assert.equal(scrub("Folder 'Health' is not empty"), "Folder '…' is not empty");
  assert.equal(scrub("“Diary” changed here and elsewhere"), "“…” changed here and elsewhere");
});

test("tokens and email addresses are taken out", () => {
  assert.equal(scrub("bad token ghp_abcdefghijklmnopqrstuvwxyz0123"), "bad token <token>");
  assert.equal(scrub("Authorization: Bearer abcdefghijklmnop.qrs"), "Authorization: Bearer <token>");
  assert.equal(scrub("committed as ana@example.com"), "committed as <email>");
});

test("repository names are taken out of URLs, with queries and hashes", () => {
  assert.equal(scrubUrl("https://app.betelgeuse.pro/w/ana/private-diary/Some%20Page?x=1#h"), "https://app.betelgeuse.pro/w/:owner/:repo");
  assert.equal(scrubUrl("https://api.github.com/repos/ana/private-diary/contents/Diary.md"), "https://api.github.com/repos/:owner/:repo");
  assert.equal(scrubUrl("https://app.betelgeuse.pro/demo"), "https://app.betelgeuse.pro/demo");
  assert.equal(scrubUrl("https://app.betelgeuse.pro/api/auth/callback?code=secret"), "https://app.betelgeuse.pro/api/auth/callback");
});

test("ordinary error text is left alone", () => {
  assert.equal(scrub("TypeError: Cannot read properties of undefined (reading 'x')"), "TypeError: Cannot read properties of undefined (reading '…')");
  assert.equal(scrub("Network request failed"), "Network request failed");
  assert.equal(scrub(undefined), undefined);
});

test("error events lose messages' names, source text and variables, but keep where the bug is", () => {
  const [ex] = scrubExceptions([
    {
      type: "Error",
      value: 'Page "Taxes 2026" not found',
      stacktrace: {
        type: "raw",
        frames: [
          { platform: "web:javascript", function: "openPage", filename: "https://app.betelgeuse.pro/w/ana/diary/_next/static/chunks/app.js?v=1", lineno: 3, colno: 9, context_line: "const secret = 1", vars: { title: "Diary" } },
          { platform: "web:javascript", function: "load", filename: "tauri://localhost/assets/index-abc.js", lineno: 1, colno: 2 },
        ],
      },
    },
  ]);
  assert.equal(ex.value, 'Page "…" not found');
  const [web, tauri] = ex.stacktrace.frames;
  assert.equal(web.filename, "https://app.betelgeuse.pro/w/:owner/:repo");
  assert.equal(web.function, "openPage");
  assert.equal(web.lineno, 3);
  assert.equal("context_line" in web || "vars" in web, false);
  assert.equal(tauri.filename, "tauri://localhost/assets/index-abc.js");
});
