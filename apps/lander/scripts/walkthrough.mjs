#!/usr/bin/env node
// Records the silent product walkthrough on the landing page from the real app UI.
//
//   npm --prefix lander run walkthrough
//   npm --prefix lander run walkthrough -- --keep   also keep the raw frames (path is printed)
//
// Runs the app on the mocked Tauri backend in harness.mjs, drives it like a person would (a fake
// cursor shows where the pointer is, since recordings have none) and captures every painted frame
// through Chrome's screencast. ffmpeg then turns the frames into a constant 30 fps video.
// Output in apps/lander/public/assets: walkthrough.mp4 (H.264), walkthrough.webm (VP9) and
// walkthrough-poster.jpg (the slash menu, pointing at To-do list), all 1440×900, silent, looping cleanly.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { chromium } from "playwright-core";
import { CLAUDE, CURSOR, DAY, HOUR, MIN, ME, ROOT, VAULT, VIEWPORT, buildHistory, buildWorkspace, commits, issues, openApp, startVite } from "./harness.mjs";

const OUT = join(ROOT, "apps/lander/public/assets");
const FFMPEG = process.env.FFMPEG ?? (statSync("/opt/homebrew/bin/ffmpeg", { throwIfNoEntry: false }) ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg");
const FPS = 30;
const FADE_IN = 0.3;
const FADE_OUT = 0.6;
const keep = process.argv.includes("--keep");

// ---------- Workspace ----------

/** The Roadmap's history: the card moved in the video, plus edits from agents over MCP. */
function roadmapHistory(files) {
  const current = files["Roadmap.md"].content;
  return commits(
    [
      { ago: 0, author: ME, subject: "Update Notion importer" },
      { ago: 18 * MIN, author: CLAUDE, subject: "mcp: Add Agent suggestions inbox and Windows and Linux builds" },
      { ago: 52 * MIN, author: ME, subject: "Update Roadmap, Read-only agent access" },
      { ago: 3 * HOUR, author: CURSOR, subject: "mcp: Set due dates from the planning notes" },
      { ago: 26 * HOUR, author: CLAUDE, subject: "mcp: Mark Page history and restore as done" },
      { ago: 2 * DAY, author: ME, subject: "Add a Calendar view to Roadmap" },
      { ago: 21 * DAY, author: "Betelgeuse", subject: "Initialize Betelgeuse workspace" },
    ],
    current,
    0x2545f491,
  );
}

// ---------- Fake cursor (runs in the page) ----------

/** A pointer that follows the mouse, with a ripple on click and a lifted copy of a dragged card. */
function installCursor(start) {
  const style = document.createElement("style");
  style.textContent = `
    #wt-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 26px; height: 26px;
      transform-origin: 4px 3px; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.35)); transition: scale .12s ease-out; }
    #wt-cursor.down { scale: .86; }
    .wt-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
      background: color-mix(in srgb, var(--accent) 38%, transparent); border: 1.5px solid color-mix(in srgb, var(--accent) 70%, transparent);
      animation: wt-ripple .5s cubic-bezier(.2,.7,.3,1) forwards; }
    @keyframes wt-ripple { from { transform: scale(.25); opacity: 1; } to { transform: scale(1); opacity: 0; } }
    #wt-ghost { position: fixed; z-index: 2147483645; pointer-events: none; rotate: 2.5deg; background: var(--card-hover) !important;
      box-shadow: 0 12px 28px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.06); border-radius: 6px; }
  `;
  document.head.append(style);
  const cursor = document.createElement("div");
  cursor.id = "wt-cursor";
  cursor.innerHTML = `<svg viewBox="0 0 26 26" width="26" height="26"><path d="M4 3 L4 21 L8.6 16.6 L11.8 23.4 L14.9 22 L11.8 15.4 L18.2 15.4 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  document.body.append(cursor);
  const place = (x, y) => (cursor.style.translate = `${x - 4}px ${y - 3}px`);
  place(start.x, start.y);
  addEventListener("mousemove", (e) => place(e.clientX, e.clientY), true);
  addEventListener("mousedown", (e) => {
    cursor.classList.add("down");
    const r = document.createElement("div");
    r.className = "wt-ripple";
    r.style.left = `${e.clientX}px`;
    r.style.top = `${e.clientY}px`;
    document.body.append(r);
    setTimeout(() => r.remove(), 600);
  }, true);
  addEventListener("mouseup", () => cursor.classList.remove("down"), true);

  // Native drag images aren't painted into the screencast, so draw one.
  let ghost = null;
  let offset = { x: 0, y: 0 };
  addEventListener("dragstart", (e) => {
    const card = e.target.closest?.("[draggable=true]");
    if (!card) return;
    const box = card.getBoundingClientRect();
    offset = { x: e.clientX - box.left, y: e.clientY - box.top };
    ghost = card.cloneNode(true);
    ghost.id = "wt-ghost";
    ghost.style.width = `${box.width}px`;
    ghost.style.left = `${box.left}px`;
    ghost.style.top = `${box.top}px`;
    document.body.append(ghost);
    card.style.opacity = "0.35";
    ghost.__source = card;
  }, true);
  const follow = (e) => {
    if (e.clientX || e.clientY) place(e.clientX, e.clientY);
    if (ghost && (e.clientX || e.clientY)) {
      ghost.style.left = `${e.clientX - offset.x}px`;
      ghost.style.top = `${e.clientY - offset.y}px`;
    }
  };
  addEventListener("drag", follow, true);
  addEventListener("dragover", follow, true);
  const drop = () => {
    if (!ghost) return;
    ghost.__source.style.opacity = "";
    ghost.remove();
    ghost = null;
    cursor.classList.remove("down");
  };
  addEventListener("drop", drop, true);
  addEventListener("dragend", drop, true);
}

// ---------- Acting ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function actor(page) {
  let pos = { x: 150, y: 560 }; // the empty part of the sidebar, clear of any hover state
  // Deterministic jitter, so typing has a human rhythm but every run is the same.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const self = {
    get pos() {
      return pos;
    },
    /** Glides the pointer to (x, y) along a slight arc, easing in and out. */
    async move(x, y, ms) {
      const from = pos;
      const dist = Math.hypot(x - from.x, y - from.y);
      ms ??= Math.min(700, Math.max(280, 200 + dist * 0.4));
      const bend = Math.min(60, dist * 0.08);
      const nx = dist ? -(y - from.y) / dist : 0;
      const ny = dist ? (x - from.x) / dist : 0;
      const t0 = Date.now();
      for (;;) {
        const t = Math.min(1, (Date.now() - t0) / ms);
        const e = ease(t);
        const arc = Math.sin(Math.PI * e) * bend;
        pos = { x: from.x + (x - from.x) * e + nx * arc, y: from.y + (y - from.y) * e + ny * arc };
        await page.mouse.move(pos.x, pos.y);
        if (t === 1) break;
        await sleep(12);
      }
    },
    async to(locator, { dx = 0.5, dy = 0.5, x, y, ms } = {}) {
      await locator.waitFor({ state: "visible" });
      const b = await locator.boundingBox();
      await self.move(b.x + (x ?? b.width * dx), b.y + (y ?? b.height * dy), ms);
    },
    async click(locator, opts) {
      await self.to(locator, opts);
      await sleep(90);
      await page.mouse.down();
      await sleep(60);
      await page.mouse.up();
    },
    /** Types at roughly 15 characters a second, a little slower after spaces and punctuation. */
    async type(text, cps = 17) {
      let due = Date.now();
      for (const ch of text) {
        await page.keyboard.type(ch);
        due += (1000 / cps) * (0.6 + rand() * 0.8) + (/[ ,.]/.test(ch) ? 40 : 0);
        await sleep(due - Date.now());
      }
    },
    /** Types while the pointer drifts out of the way, as a hand leaves the trackpad. */
    async typeAway(text, dx, dy) {
      await Promise.all([self.type(text), sleep(150).then(() => self.move(pos.x + dx, pos.y + dy, 700))]);
    },
    async press(key, after = 120) {
      await page.keyboard.press(key);
      await sleep(after);
    },
  };
  return self;
}

// ---------- Storyboard ----------

async function story(page, act, mark) {
  const sidebar = page.locator("aside").first();

  // 1. A new page from the sidebar, titled "Launch plan".
  mark("Start on Ideas");
  await sleep(650);
  await act.click(page.locator('button[title="New page (⌘N)"]'));
  await page.waitForFunction(() => document.querySelector("input.page-title")?.value === "Untitled");
  mark("New page");
  await sleep(450);
  await act.click(page.locator("input.page-title"), { dx: 0.1 });
  await page.keyboard.press("Meta+A");
  await sleep(250);
  await act.typeAway("Launch plan", 420, -16);
  await sleep(200);
  await act.press("Enter", 300);

  // 2. A line of text, then a to-do list from the slash menu.
  await act.click(page.locator(".ProseMirror").first(), { x: 30, y: 14 });
  await sleep(200);
  mark("Typing");
  await act.typeAway("Shipping v0.4 on Friday.", 380, 90);
  await act.press("Enter", 250);
  await act.type("/");
  await page.waitForSelector("body > div.fixed.z-50 [data-index]");
  mark("Slash menu");
  await sleep(900);
  const todo = page.locator("body > div.fixed.z-50 button", { hasText: "To-do list" });
  await act.to(todo, { dx: 0.55 });
  mark("Pick To-do list");
  await sleep(300);
  await act.click(todo, { dx: 0.55, ms: 150 });
  await sleep(250);
  mark("To-do list");
  await act.typeAway("Record the demo", 260, 40);
  await act.press("Enter", 120);
  await act.type("Write the post");
  await act.press("Enter", 120);
  await act.type("Tag the release");
  await sleep(350);
  await act.click(page.locator('.betelgeuse-prose ul[data-type="taskList"] input[type="checkbox"]').first());
  await sleep(500);

  // 3. The Roadmap database: table, then board, then a card dragged to Done.
  await act.click(sidebar.locator("span.truncate", { hasText: /^Roadmap$/ }).first(), { dx: 0.25 });
  await page.waitForSelector(".database-view");
  mark("Roadmap table");
  await sleep(700);
  await act.click(page.locator(".database-view button", { hasText: /^Board$/ }).first());
  await page.waitForSelector("text=Not started");
  mark("Board");
  await sleep(800);
  const card = page.locator("[draggable=true]", { hasText: "Notion importer" });
  const done = page.locator(".database-view .w-64", { hasText: "Done" }).first();
  await act.to(card, { dx: 0.4, dy: 0.3 });
  await sleep(200);
  await page.mouse.down();
  await sleep(100);
  mark("Drag");
  const box = await done.boundingBox();
  await act.move(act.pos.x + 30, act.pos.y + 10, 180);
  await act.move(box.x + box.width * 0.45, box.y + Math.min(box.height - 30, 140), 950);
  await sleep(200);
  await page.mouse.up();
  await page.waitForFunction(() => {
    const col = [...document.querySelectorAll(".database-view .w-64")].find((c) => c.textContent.includes("Done"));
    return col?.textContent.includes("Notion importer");
  });
  await sleep(700);

  // 4. Page history, with an agent's commit.
  await act.click(page.locator('button[title="Page history"]'));
  await page.waitForSelector("text=Page history");
  mark("History");
  await sleep(600);
  // Rest the pointer at the end of the agent's commit message, clear of the text.
  await act.to(page.locator("aside button", { hasText: "Add Agent suggestions inbox" }), { dx: 0.9, y: 12 });
  await sleep(1200);

  // 5. Connect agents.
  await act.click(sidebar.locator("button", { hasText: "Connect agents" }));
  await page.waitForSelector("text=Connect your AI agents");
  mark("Connect agents");
  await sleep(300);
  await act.move(act.pos.x + 520, act.pos.y + 140, 600);
  await sleep(1500);
}

// ---------- Recording ----------

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}

const workspace = buildWorkspace();
const histories = { "Ideas.md": buildHistory(workspace), "Roadmap.md": roadmapHistory(workspace) };
const server = await startVite();
const browser = await chromium.launch({ channel: "chrome" });
const dir = mkdtempSync(join(tmpdir(), "betelgeuse-walkthrough-"));
const frames = [];
const marks = [];
let failed = false;
let end = 0;
try {
  const { page, context, problems } = await openApp(browser, {
    theme: "dark",
    workspace,
    histories,
    deviceScaleFactor: 1,
    still: false,
    localStorage: { [`open:${VAULT.path}`]: "Ideas.md", "view:Roadmap.md": "table" },
  });
  const act = actor(page);
  await page.evaluate(installCursor, act.pos);
  await page.mouse.move(act.pos.x, act.pos.y);
  await sleep(500);

  const cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height });
  // Nudge a repaint so the first frame arrives now rather than at the first change.
  await page.mouse.move(act.pos.x + 1, act.pos.y);
  await sleep(300);
  const t0 = Date.now() / 1000;
  const mark = (label) => marks.push({ label, t: Date.now() / 1000 - t0 });
  await story(page, act, mark);
  end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await sleep(200);

  const found = await issues(page, problems);
  if (found.length) {
    failed = true;
    console.warn(`  problems while recording:\n    ${found.join("\n    ")}`);
  }
  // Screencast timestamps and our clock share the wall clock; shift so the story starts at 0.
  const lead = t0 - frames[0].t;
  if (Math.abs(lead) > 5) throw new Error(`Screencast clock is off by ${lead.toFixed(1)}s`);
  await context.close();

  // ----- Frames → video -----
  const start = t0;
  const usable = frames.filter((f, i) => i === frames.length - 1 || frames[i + 1].t > start);
  let list = "";
  usable.forEach((f, i) => {
    const name = `f${String(i).padStart(5, "0")}.jpg`;
    writeFileSync(join(dir, name), Buffer.from(f.data, "base64"));
    const from = Math.max(f.t, start);
    const to = i + 1 < usable.length ? usable[i + 1].t : end;
    list += `file '${name}'\nduration ${Math.max(0, to - from).toFixed(4)}\n`;
  });
  list += `file 'f${String(usable.length - 1).padStart(5, "0")}.jpg'\n`;
  writeFileSync(join(dir, "frames.txt"), list);
  const duration = end - start;
  const fades = `fade=t=in:st=0:d=${FADE_IN},fade=t=out:st=${(duration - FADE_OUT).toFixed(3)}:d=${FADE_OUT}`;
  const input = ["-f", "concat", "-safe", "0", "-i", join(dir, "frames.txt")];
  // Chrome's JPEG frames are full-range BT.601; players expect limited-range BT.709.
  const vf = `fps=${FPS},${fades},scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p`;
  const color = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
  mkdirSync(OUT, { recursive: true });
  const mp4 = join(OUT, "walkthrough.mp4");
  const webm = join(OUT, "walkthrough.webm");
  console.log("Encoding H.264…");
  ffmpeg([...input, "-vf", vf, "-t", duration.toFixed(3), "-an", "-c:v", "libx264", "-preset", "veryslow", "-crf", "24", "-tune", "animation", "-pix_fmt", "yuv420p", ...color, "-movflags", "+faststart", mp4]);
  console.log("Encoding VP9…");
  const vp9 = ["-vf", vf, "-t", duration.toFixed(3), "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", ...color, "-row-mt", "1", "-deadline", "good", "-cpu-used", "2"];
  ffmpeg([...input, ...vp9, "-pass", "1", "-passlogfile", join(dir, "vp9"), "-f", "null", "/dev/null"]);
  ffmpeg([...input, ...vp9, "-pass", "2", "-passlogfile", join(dir, "vp9"), webm]);

  // ----- Poster: the slash menu, re-encoded by Chrome at quality 80 -----
  const at = start + marks.find((m) => m.label === "Pick To-do list").t + 0.2;
  const posterFrame = usable.filter((f) => f.t <= at).pop();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(`<style>html,body{margin:0}img{display:block;width:1440px;height:900px}</style><img src="data:image/jpeg;base64,${posterFrame.data}">`);
  await p.waitForFunction(() => document.images[0].complete);
  const poster = join(OUT, "walkthrough-poster.jpg");
  writeFileSync(poster, await p.screenshot({ type: "jpeg", quality: 80 }));
  await ctx.close();

  for (const f of [mp4, webm, poster]) console.log(`  wrote ${relative(ROOT, f)} (${(statSync(f).size / 1024).toFixed(0)} KB)`);
  console.log(`  ${duration.toFixed(1)} s, ${usable.length} captured frames`);
  for (const m of marks) console.log(`  ${m.t.toFixed(1).padStart(5)} s  ${m.label}`);
} finally {
  await browser.close();
  server?.kill();
  if (keep) console.log(`  frames kept in ${dir}`);
  else rmSync(dir, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
