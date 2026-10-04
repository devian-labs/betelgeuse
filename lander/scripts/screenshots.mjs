#!/usr/bin/env node
// Captures the landing page screenshots from the real app UI.
//
//   npm --prefix lander run screenshots            all shots, light and dark
//   npm --prefix lander run screenshots -- board   only the named shots
//
// Runs the app on the mocked Tauri backend in harness.mjs (Vite dev server + Chrome + in-memory
// workspace). Output: lander/public/assets/<name>-<theme>.jpg (2880×1800) and
// <name>-<theme>-1440.jpg (1440×900).

import { writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { chromium } from "playwright-core";
import { ROOT, VAULT, VIEWPORT, buildHistory, buildWorkspace, issues, openApp, settle, startVite } from "./harness.mjs";

const OUT = process.env.SCREENSHOTS_OUT ? resolve(process.env.SCREENSHOTS_OUT) : join(ROOT, "lander/public/assets");
const QUALITY = 85;

// ---------- Shots ----------

const SHOTS = {
  // The Welcome guide hub with its sub-pages expanded in the sidebar.
  editor: {
    storage: { expanded: JSON.stringify(["Welcome"]), [`open:${VAULT.path}`]: "Welcome.md", [`favorites:${VAULT.path}`]: "[]" },
    async run() {},
  },
  // The slash menu, opened on a fresh line in a page with varied blocks.
  slash: {
    storage: { [`open:${VAULT.path}`]: "Welcome/Writing and blocks.md", expanded: JSON.stringify(["Welcome"]) },
    async run(page) {
      await page.evaluate(() => {
        const h = [...document.querySelectorAll(".betelgeuse-prose h3")].find((e) => e.textContent.includes("Text and headings"));
        let el = h.parentElement;
        while (el && getComputedStyle(el).overflowY !== "auto") el = el.parentElement;
        el.scrollTop += h.getBoundingClientRect().top - 150;
      });
      // Add an empty line after the paragraph through Tiptap (the editor sits on its DOM node), then
      // type "/" for real so the slash menu opens the way it does for a person.
      await page.evaluate(() => {
        const p = [...document.querySelectorAll(".betelgeuse-prose p")].find((e) => e.textContent.startsWith("Plain text is a paragraph"));
        const editor = p.closest(".ProseMirror").editor;
        const at = editor.view.posAtDOM(p, p.childNodes.length) + 1;
        editor.chain().insertContentAt(at, { type: "paragraph" }).setTextSelection(at + 1).focus(null, { scrollIntoView: false }).run();
      });
      await page.waitForFunction(() => document.querySelector(".ProseMirror").editor.view.hasFocus());
      await page.waitForTimeout(100);
      await page.keyboard.type("/");
      await page.waitForSelector("body > div.fixed.z-50 [data-index]");
      await page.mouse.move(1000, 20);
      await page.waitForTimeout(300);
    },
  },
  board: {
    storage: { [`open:${VAULT.path}`]: "Roadmap.md", "view:Roadmap.md": "board" },
    async run(page) {
      await page.waitForSelector("text=Not started");
    },
  },
  table: {
    storage: { [`open:${VAULT.path}`]: "Roadmap.md", "view:Roadmap.md": "table" },
    async run(page) {
      await page.waitForSelector("table, [role=table], .database-view");
    },
  },
  "ai-settings": {
    storage: { [`open:${VAULT.path}`]: "Welcome.md" },
    async run(page) {
      await page.locator("aside button", { hasText: /^Settings$/ }).click();
      await page.locator("nav button", { hasText: "AI agents" }).click();
      await page.waitForSelector("text=What agents can see");
    },
  },
  history: {
    storage: { [`open:${VAULT.path}`]: "Ideas.md" },
    async run(page) {
      await page.locator('button[title="Page history"]').click();
      await page.waitForSelector("text=Page history");
      await page.locator("aside button", { hasText: "Add three agent ideas" }).click();
      await page.waitForSelector("text=Version from");
    },
  },
  agents: {
    storage: { [`open:${VAULT.path}`]: "Welcome.md" },
    async run(page) {
      await page.locator("aside button", { hasText: "Connect agents" }).click();
      await page.waitForSelector("text=Connect your AI agents");
    },
  },
};

// ---------- Output ----------

async function save(browser, png, name) {
  const full = join(OUT, `${name}.jpg`);
  const small = join(OUT, `${name}-1440.jpg`);
  // Re-encode both sizes from the lossless capture, downscaling in Chrome.
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const src = `data:image/png;base64,${png.toString("base64")}`;
  await p.setContent(`<style>html,body{margin:0}img{display:block;width:1440px;height:900px}</style><img src="${src}">`);
  await p.waitForFunction(() => document.images[0].complete);
  writeFileSync(small, await p.screenshot({ type: "jpeg", quality: QUALITY }));
  await ctx.close();
  const big = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const bp = await big.newPage();
  await bp.setContent(`<style>html,body{margin:0}img{display:block;width:1440px;height:900px}</style><img src="${src}">`);
  await bp.waitForFunction(() => document.images[0].complete);
  writeFileSync(full, await bp.screenshot({ type: "jpeg", quality: QUALITY }));
  await big.close();
  console.log(`  wrote ${relative(ROOT, full)} and ${relative(ROOT, small)}`);
}

// ---------- Main ----------

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(SHOTS);
for (const n of names) if (!SHOTS[n]) throw new Error(`Unknown shot "${n}". Shots: ${Object.keys(SHOTS).join(", ")}`);

const workspace = buildWorkspace();
const histories = { "Ideas.md": buildHistory(workspace) };
const server = await startVite();
const browser = await chromium.launch({ channel: "chrome" });
let failed = false;
try {
  for (const name of names) {
    for (const theme of ["light", "dark"]) {
      const shot = SHOTS[name];
      const { page, context, problems } = await openApp(browser, { theme, workspace, histories, localStorage: shot.storage });
      await shot.run(page);
      await settle(page);
      if (name === "slash") await page.waitForTimeout(200);
      const found = await issues(page, problems);
      if (found.length) {
        failed = true;
        console.warn(`  ${name}-${theme}: ${found.join("\n    ")}`);
      }
      const png = await page.screenshot({ type: "png" });
      await save(browser, png, `${name}-${theme}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
if (failed) process.exitCode = 1;
