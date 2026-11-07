import { NAV, href, loadDoc } from "@/lib/docs";
import { APP_URL, REPO, RELEASES, SITE_URL } from "@/lib/site";

// A static export only prerenders route handlers marked static.
export const dynamic = "force-static";

/** /llms.txt (llmstxt.org): what Betelgeuse is, and every docs page with its summary, for AI assistants. */
export function GET() {
  const sections = NAV.map(
    (s) =>
      `## ${s.title}\n\n` +
      s.pages
        .map((e) => {
          const doc = loadDoc(e.slug)!;
          return `- [${doc.title}](${SITE_URL}${href(e.slug)}): ${doc.description}`;
        })
        .join("\n"),
  );
  const text = [
    "# Betelgeuse",
    "> A free, open-source app for notes, docs and databases. Every page is a Markdown file in a git repository on your own devices, synced through a repository you choose. AI agents connect over MCP and see only the pages you share, and plugins add features such as personal finance.",
    "Betelgeuse runs on macOS, Windows and Linux, with an Android app and a web app in preview. It is MIT licensed and collects no data. The desktop and phone apps need no account; the web app signs in with GitHub and opens a repository as the workspace.",
    ...sections,
    `## Links\n\n- [Download](${RELEASES}): installers for every platform\n- [Web app](${APP_URL}): in the browser, on a GitHub repository\n- [Source code](${REPO}): the GitHub repository`,
  ].join("\n\n");
  return new Response(text + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
