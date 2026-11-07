/**
 * The web app in a real browser, against the fake GitHub: signing in, choosing a repository, editing,
 * syncing both ways, reloading, databases and a plugin. `npm run e2e -w @betelgeuse/web`
 * (needs Chromium from playwright, and `npm run plugins` for the plugin part).
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { FakeGitHub } from "../fake-github.ts";

const PORT = 3123;
const APP = `http://localhost:${PORT}`;
const SHOTS = process.env.E2E_SHOTS ?? resolve(import.meta.dirname, "../../.next/e2e");
mkdirSync(SHOTS, { recursive: true });

const gh = new FakeGitHub();
const seed = (path: string) => readFileSync(resolve(import.meta.dirname, "../../../desktop/src-tauri/seed", path), "utf8");
gh.push({
  ".gitignore": ".trash/\n",
  "Welcome.md": "---\nicon: 🌟\n---\nHello from the repository. See [[Roadmap]].\n",
  // The real pages every new workspace starts with: what the app itself writes.
  "Roadmap.md": seed("Roadmap.md"),
  "Roadmap/Design the database views.md": seed("Roadmap/Design the database views.md"),
  "Roadmap/Ship the MCP server.md": seed("Roadmap/Ship the MCP server.md"),
  "Writing and blocks.md": seed("Welcome/Writing and blocks.md"),
  "Ideas.md": "An idea worth keeping.\n",
});
await gh.start();

const mode = process.env.E2E_MODE ?? "dev";
const env = {
  ...process.env,
  GITHUB_CLIENT_ID: "test-client",
  GITHUB_CLIENT_SECRET: "test-secret",
  SESSION_SECRET: "e2e-secret",
  GITHUB_WEB_URL: gh.url,
  NEXT_PUBLIC_GITHUB_API_URL: gh.url,
  NEXT_PUBLIC_GITHUB_WEB_URL: gh.url,
  NEXT_PUBLIC_GITHUB_APP_SLUG: "betelgeuse-test",
  APP_URL: APP,
};
const cwd = resolve(import.meta.dirname, "../..");
// Its own process group: `next` runs children that have to stop with it.
const next = (args: string[]): ChildProcess => spawn("npx", ["next", ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
const stopServer = (child: ChildProcess) => {
  try {
    process.kill(-child.pid!, "SIGTERM");
  } catch {
    /* already gone */
  }
};

if (mode === "start") {
  const build = next(["build"]);
  build.stderr!.on("data", (d) => process.stderr.write(d));
  const code = await new Promise((r) => build.on("exit", r));
  assert.equal(code, 0, "next build failed");
}
assert.ok(await fetch(APP).then(() => false, () => true), `Something is already running on port ${PORT}`);
const server = next(mode === "start" ? ["start", "--port", String(PORT)] : ["dev", "--port", String(PORT)]);
let serverLog = "";
server.stdout!.on("data", (d) => (serverLog += d));
server.stderr!.on("data", (d) => (serverLog += d));
for (let i = 0; ; i++) {
  if (await fetch(`${APP}/api/plugins/dev`).then(() => true, () => false)) break;
  if (i > 240) {
    stopServer(server);
    throw new Error(`The app didn't start:\n${serverLog}`);
  }
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? "chrome" });
// A dark system theme, to show the app still starts light.
const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: "dark" });
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const problems: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const toServer: { url: string; body: string | null }[] = [];
page.on("request", (r) => {
  if (r.url().startsWith(`${APP}/api/`)) toServer.push({ url: r.url(), body: r.postData() });
});

const steps: string[] = [];
const step = async (name: string, run: () => Promise<void>) => {
  console.log(`  ${name}`);
  await run();
  steps.push(name);
};
const until = async (what: string, check: () => boolean | undefined, ms = 40_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
};
const sidebar = (title: string) => page.getByText(title, { exact: true }).first(); // the sidebar comes first in the page

let failed: unknown = null;
try {
  await step("signed out, the page offers GitHub sign-in", async () => {
    await page.goto(APP);
    await page.getByText("Sign in with GitHub").waitFor();
    await page.screenshot({ path: `${SHOTS}/1-sign-in.png` });
  });

  await step("signing in leads to the repositories this app can open", async () => {
    await page.getByText("Sign in with GitHub").click();
    await page.getByText("Choose a workspace").waitFor();
    await page.getByRole("button", { name: "octo/notes" }).waitFor();
    await page.screenshot({ path: `${SHOTS}/2-repositories.png` });
    const cookies = await context.cookies(`${APP}/api/auth/token`);
    const session = cookies.find((c) => c.name === "bg_session");
    assert.ok(session?.httpOnly, "the session cookie is out of the page's reach");
    assert.ok(!(await page.evaluate(() => document.cookie)).includes("bg_session"));
  });

  await step("opening one shows its pages in the shared interface", async () => {
    await page.getByRole("button", { name: "octo/notes" }).click();
    await page.waitForURL("**/w/octo/notes");
    await page.getByText("Hello from the repository.").waitFor();
    await sidebar("Ideas").waitFor();
    await sidebar("Roadmap").waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/3-workspace.png` });
  });

  await step("it starts on the light theme with the orange accent, even with a dark system theme", async () => {
    const theme = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      palette: document.documentElement.dataset.palette,
      accent: document.documentElement.style.getPropertyValue("--blue"),
    }));
    assert.deepEqual(theme, { theme: "light", palette: "betelgeuse", accent: "#e2582b" });
  });

  await step("what only a computer can do isn't offered", async () => {
    assert.equal(await page.getByText("Connect agents").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Import" }).count(), 0);
  });

  await step("typing commits to the repository", async () => {
    await page.locator(".ProseMirror").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Typed in a browser.");
    await until("the edit to reach GitHub", () => gh.text("Welcome.md")?.includes("Typed in a browser."));
    assert.ok(gh.text("Welcome.md")!.includes("icon: 🌟"), "frontmatter survives");
    assert.match(gh.log()[0].message, /^Update Welcome/);
  });

  await step("a new page reaches the repository", async () => {
    await page.getByTitle(/New page/).click();
    await until("the new page", () => gh.files().some((f) => f.startsWith("Untitled")));
  });

  await step("reloading comes back from this browser's copy, with the same pages", async () => {
    await page.reload();
    await sidebar("Ideas").waitFor();
    await page.locator(".ProseMirror").first().waitFor();
  });

  await step("another device's change arrives", async () => {
    gh.push({ "From phone.md": "Written on a phone.\n" });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await sidebar("From phone").waitFor();
  });

  await step("just reading pages changes nothing", async () => {
    const commits = gh.log().length;
    await sidebar("Ideas").click();
    await page.getByText("An idea worth keeping.").waitFor();
    await sidebar("Writing and blocks").click();
    await page.locator(".ProseMirror").first().waitFor();
    await sidebar("Roadmap").click();
    await page.getByText("Ship the MCP server").first().waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/4-database.png` });
    await page.waitForTimeout(10_000); // past the auto-commit delay
    assert.equal(gh.log().length, commits, `opening pages made commits: ${gh.log().slice(0, 3).map((c) => c.message)}`);
  });

  await step("a page's history comes from GitHub, and restoring is a commit", async () => {
    await sidebar("Welcome").click();
    await page.getByTitle("Page history").click();
    await page.getByText("Page history", { exact: true }).waitFor();
    await page.getByText("From elsewhere").first().click();
    await page.getByRole("button", { name: "Restore" }).click();
    await until("the restore to reach GitHub", () => /^Restore Welcome/.test(gh.log()[0].message));
    assert.ok(!gh.text("Welcome.md")!.includes("Typed in a browser."));
    await page.getByTitle("Page history").click();
  });

  await step("search finds text in pages", async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("worth keeping");
    await page.getByText("Ideas").last().waitFor();
    await page.keyboard.press("Escape");
  });

  await step("deleting moves to the trash and out of the repository, and restoring brings it back", async () => {
    await sidebar("From phone").click({ button: "right" });
    await page.getByText("Move to Trash").click();
    await until("the deletion to reach GitHub", () => !gh.files().includes("From phone.md"));
    assert.ok(!gh.files().some((f) => f.startsWith(".trash")));
    await page.getByRole("button", { name: "Trash", exact: true }).click();
    await page.getByText("From phone").last().hover();
    await page.locator("[data-popover] button:has(svg.lucide-undo-2)").first().click();
    await until("the restored page to reach GitHub", () => gh.files().includes("From phone.md"));
    await page.keyboard.press("Escape");
  });

  if (mode === "dev") {
    await step("a plugin made for the web turns on, and one that isn't says so", async () => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.locator("nav").getByRole("button", { name: "Plugins" }).click();
      await page.getByText("in this browser").first().waitFor();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/5-plugins.png` });
      assert.ok(await page.getByText("It isn't made for the web app.").count(), "media library explains itself");
      await page.getByRole("switch", { name: /Finance/ }).click();
      await until("the plugin choice to reach GitHub", () => gh.text(".betelgeuse/plugins.json")?.includes("finance"));
      await page.locator("div.fixed button:has(svg.lucide-x)").first().click();
    });

    await step("the plugin's view runs", async () => {
      await sidebar("Finance").click();
      await page.getByRole("button", { name: "Set up Finance" }).click();
      await page.getByText("Overview", { exact: true }).first().waitFor();
      await until("Finance's databases to reach GitHub", () => gh.files().includes("Finance.md"));
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/6-plugin.png` });
      assert.equal(await page.getByText("Try again").count(), 0, "the plugin didn't crash");
    });
  }

  await step("notes only ever go to GitHub, never through this server", async () => {
    const allowed = /\/api\/(auth\/(token|login|callback)|plugins\/(index|dev|zip))/;
    for (const r of toServer) {
      assert.match(r.url, allowed, `unexpected call to the server: ${r.url}`);
      assert.ok(!r.body?.includes("Typed in a browser"), "page text reached the server");
    }
  });

  await step("signing out removes this browser's copy", async () => {
    await page.goto(APP + "/?choose");
    await page.getByText("Sign out").click();
    await page.getByText("Sign in with GitHub").waitFor();
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    assert.deepEqual(dbs.filter((d) => d?.startsWith("betelgeuse:") && d !== "betelgeuse:plugins"), []);
  });

  // A failed sign-in probe logs a 401 by design; everything else counts.
  const real = problems.filter((p) => !/401/.test(p) && !/Unauthorized/.test(p) && !/favicon/.test(p));
  assert.deepEqual(real, [], "no errors in the browser console");
} catch (e) {
  failed = e;
  await page.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {});
  console.error("\nFAILED:", e);
  console.error("\nBrowser problems:\n" + problems.join("\n"));
  console.error("\nServer log (end):\n" + serverLog.slice(-1500));
}
await browser.close();
stopServer(server);
await gh.stop();
console.log(`\n${steps.length} steps passed${failed ? ", then one failed" : ""}. Screenshots in ${SHOTS}`);
process.exit(failed ? 1 : 0);
