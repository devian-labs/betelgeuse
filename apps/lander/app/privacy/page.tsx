import type { Metadata } from "next";
import { PlainPage } from "@/components/PlainPage";
import { ORG, REPO, SITE_NAME, SITE_URL, jsonLd, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy: Your Pages Stay Yours | Betelgeuse",
  description: "What the Betelgeuse apps and website send: anonymous usage counts and error reports you can turn off, never your pages. The website sets no cookies.",
  path: "/privacy/",
});

const breadcrumbs = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Privacy", item: `${SITE_URL}/privacy/` },
  ],
};

/** What the website and the app process. Keep it in step with the code: no claim here may outrun it. */
export default function Privacy() {
  return (
    <PlainPage title="Privacy">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbs)} />
      <h1>Privacy</h1>
      <p className="doc-meta">Last updated November 8, 2026</p>

      <p>
        <strong>In short:</strong> your pages, their names and your repositories never reach us. The apps send anonymous counts (such as &ldquo;the app
        opened&rdquo;) and reports of errors, so we know how many people use Betelgeuse and what breaks. You can turn that off in one place, and the
        website sets no cookies.
      </p>

      <h2>Usage counts and error reports</h2>
      <p>
        The desktop, phone and web apps send these unless you turn them off under <em>Settings → Privacy</em>. The first time the app opens, it tells
        you so. Turning it off stops both at once, from that moment.
      </p>
      <ul>
        <li>
          <strong>Usage counts</strong>, to <a href="https://posthog.com/privacy">PostHog</a>: that the app opened, with its version, platform,
          operating system, browser and screen size, the country the request came from, and a random id kept in the app&apos;s own storage (never a
          cookie), so a person opening the app twice counts once. In the web app, also which kind of screen you&apos;re on (home, demo or a workspace),
          without the repository&apos;s name.
        </li>
        <li>
          <strong>Error reports</strong>, also to PostHog: what went wrong and where in the code, with the app&apos;s
          version and your operating system and browser. Before a report leaves your device, file paths, file and page names, quoted text, repository
          names, email addresses and tokens are taken out of it.
        </li>
      </ul>
      <p>
        Never sent: what&apos;s in your pages, their names or titles, your folders, your repositories, your git remote, what you type or click, your
        GitHub account, or recordings of the screen. Nothing is used for advertising or sold. PostHog is set not to store your IP address: it uses it only to find the country. Builds you
        make from source send nothing, since they don&apos;t have our keys. The code that does all this is{" "}
        <a href={`${REPO}/blob/main/packages/ui/src/lib/telemetry.ts`}>open to read</a>.
      </p>

      <h2>The desktop and phone apps</h2>
      <p>
        There is no account. Your workspace is a folder of Markdown files on your computer, and it stays there.
      </p>
      <p>Besides the usage counts and error reports above, the app connects to the internet only for these:</p>
      <ul>
        <li>
          <strong>Sync</strong> pushes to and pulls from the git remote you set up (for example a private GitHub repository). Once you&apos;ve set one up,
          it does this in the background every few minutes; turn that off under <em>Settings → Git &amp; sync</em>. The phone app keeps its access
          token on the phone.
        </li>
        <li>
          <strong>Plugins</strong>: the plugin store, plugin downloads and their updates come from GitHub Releases.
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

      <h2>The web app</h2>
      <p>
        The web app at <a href="https://app.betelgeuse.pro">app.betelgeuse.pro</a> needs a GitHub account, and sends the usage counts and error reports
        above, through our server, unless you turn them off. Your pages
        stay in the GitHub repositories you choose: your browser reads and writes them through GitHub&apos;s API directly, and they don&apos;t pass through
        our servers.
      </p>
      <p>
        A small service runs alongside the app, for GitHub sign-in, passing along the public plugin store, and forwarding the usage counts and error
        reports. Your pages never pass through it, and we keep no database.
      </p>
      <ul>
        <li>
          <strong>Your session</strong> is an encrypted cookie holding the tokens GitHub issues for you. We keep no copy and no user database. Our server
          uses it only to give your browser a current token.
        </li>
        <li>
          <strong>Your browser</strong> keeps a copy of your workspaces and any edits not yet sent to GitHub, so they open quickly and survive a closed tab.
          Signing out deletes that copy.
        </li>
        <li>
          <strong>Plugins</strong> install from the same store as the other apps, fetched through our server, and are kept in your browser. They run inside the
          page, so install only ones you trust.
        </li>
        <li>
          <strong>Hosting:</strong> it runs on <a href="https://vercel.com/legal/privacy-policy">Vercel</a>, which processes the usual request data.
        </li>
        <li>
          <strong>Images and cover photos:</strong> images your pages embed load from where they are hosted. Searching for a cover photo asks Unsplash, using the
          words you type.
        </li>
      </ul>

      <h2>This website</h2>
      <p>The site sets no cookies and keeps nothing in your browser. It runs no ads or trackers.</p>
      <ul>
        <li>
          <strong>Visits</strong> are counted with <a href="https://posthog.com/privacy">PostHog</a> in its cookieless mode: the page, the site or
          campaign you came from, your country, browser and device type, and which download or link you clicked. Unique visitors are counted with a
          hash that PostHog changes every day, so no visit can be linked to another day&apos;s, or to you.
        </li>
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
        Betelgeuse is made by <a href={ORG.url}>Devian Labs</a>. Ask about privacy in{" "}
        <a href={`${REPO}/discussions`}>GitHub Discussions</a>, or privately through a{" "}
        <a href={`${REPO}/security/advisories/new`}>security advisory</a>.
      </p>
    </PlainPage>
  );
}
