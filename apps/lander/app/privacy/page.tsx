import type { Metadata } from "next";
import { REPO } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy · Betelgeuse",
  description: "What the Betelgeuse website and app do with your data: the app collects nothing; the website keeps no cookies or analytics.",
};

/** What the website and the app process. Keep it in step with the code: no claim here may outrun it. */
export default function Privacy() {
  return (
    <main className="wrap narrow doc">
      <p>
        <a href="/">← Betelgeuse</a>
      </p>
      <h1>Privacy</h1>
      <p className="doc-meta">Last updated October 4, 2026</p>

      <h2>The app</h2>
      <p>
        Betelgeuse collects nothing. There is no account, no telemetry and no analytics. Your workspace is a folder of Markdown files on your
        computer, and it stays there.
      </p>
      <p>The app connects to the internet only when you ask it to:</p>
      <ul>
        <li>
          <strong>Sync</strong> pushes to and pulls from the git remote you set up (for example a private GitHub repository).
        </li>
        <li>
          <strong>Import from Notion</strong> downloads the images your pages show from where they are hosted (such as Notion&apos;s cover gallery),
          so the imported pages are fully local.
        </li>
        <li>
          <strong>Links</strong> you open go to your browser.
        </li>
      </ul>
      <p>
        <strong>AI agents.</strong> When you connect an AI agent (Claude Code, Cursor and others) to your workspace, the agent reads and writes the
        pages it can see and may send them to its AI provider. That is between you and the agent&apos;s provider, under their terms. Pages you hide
        from AI stay out of the agent&apos;s reach through Betelgeuse; an agent you give direct access to the folder can still read them.
      </p>

      <h2>This website</h2>
      <p>The site sets no cookies and runs no analytics, ads or trackers.</p>
      <ul>
        <li>
          It is hosted on <a href="https://vercel.com/legal/privacy-policy">Vercel</a>, which processes the usual request data (IP address, browser,
          time and page) to serve and protect the site, and keeps it for a short time.
        </li>
        <li>
          To show the star count, latest release and contributors, your browser asks <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">GitHub</a>{" "}
          and <a href="https://shields.io">shields.io</a> directly, so they see that request like any other.
        </li>
        <li>Downloads come from GitHub Releases.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Betelgeuse is made by <a href="https://devianlabs.com">Devian Labs</a>. Ask about privacy in{" "}
        <a href={`${REPO}/discussions`}>GitHub Discussions</a>, or privately through a{" "}
        <a href={`${REPO}/security/advisories/new`}>security advisory</a>.
      </p>
    </main>
  );
}
