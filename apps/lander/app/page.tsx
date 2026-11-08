import type { Metadata } from "next";
import {
  Bot,
  EyeOff,
  FileText,
  GitBranch,
  GitFork,
  Globe,
  Heart,
  History,
  Lock,
  MessageSquarePlus,
  ServerOff,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Command } from "@/components/Command";
import { DownloadButton } from "@/components/DownloadButton";
import { Downloads } from "@/components/Downloads";
import { CodeWindow } from "@/components/CodeWindow";
import { Laptop, Phone } from "@/components/Devices";
import { Features } from "@/components/Features";
import { Contributors, GitHubProvider, RepoCard, StarButton } from "@/components/GitHub";
import { Logo } from "@/components/Logo";
import { NavDownload } from "@/components/NavDownload";
import { OsIcon } from "@/components/OsIcon";
import { RevealObserver } from "@/components/Reveal";
import { Shot } from "@/components/Shot";
import { Tabs } from "@/components/Tabs";
import { getSnapshot } from "@/lib/github";
import { APP_URL, DEMO_URL, ORG, RELEASES, REPO, SITE_NAME, SITE_URL, jsonLd, pageMetadata } from "@/lib/site";

const description =
  "Free, open-source app for notes, docs and databases. Every page is a Markdown file in git, on your devices or in your own GitHub repository, with AI agents and plugins.";

export const metadata: Metadata = pageMetadata({ title: "Open-Source Markdown Notes & Docs App | Betelgeuse", description, path: "/" });

/** What connecting an agent gives you, next to the MCP illustration. */
const agentPoints: { Icon: typeof FileText; title: string; body: string }[] = [
  { Icon: Bot, title: "Copy-paste setup", body: "Claude Code, Claude Desktop, Cursor or any MCP client." },
  { Icon: EyeOff, title: "You choose what they see", body: "Hidden pages stay out of every search and tool." },
  { Icon: History, title: "Every change can be undone", body: "Each agent edit is its own git commit." },
  { Icon: Lock, title: "Read-only if you like", body: "Let an agent read, but never write." },
];

/** An agent working in the workspace, as a terminal transcript. */
const session: [kind: "you" | "tool" | "reply", text: string][] = [
  ["you", "Mark the MCP server done and add a task to write its docs"],
  ["tool", "query_database  Roadmap"],
  ["tool", "update_note     Roadmap/Ship the MCP server.md"],
  ["tool", "create_note     Roadmap/Write the MCP docs.md"],
  ["reply", "Done. Both are commits you can undo."],
];

/** What the web app promises: keep each of these true of apps/web. */
const webPoints: { Icon: typeof FileText; title: string; body: string }[] = [
  { Icon: Lock, title: "You choose the repositories", body: "It only reaches the ones you select." },
  { Icon: History, title: "Every edit is a commit", body: "Plain Markdown, made as you." },
  { Icon: GitFork, title: "Works with your other devices", body: "Open the same repository in the desktop or phone app." },
];

/** Question, answer, and the answer as plain text when it isn't a string already (for the FAQPage structured data). */
const faqs: [string, React.ReactNode, string?][] = [
  ["Is it really free?", "Yes. It's open source under the MIT license, with no subscription or paid tier. The desktop and phone apps need no account, and the web app signs in with your own GitHub account."],
  [
    "Where are my notes stored?",
    <>
      On the desktop, in a folder on your computer (<code>~/Betelgeuse</code> by default), as Markdown files in a git repository. Nothing leaves your
      machine unless you add a git remote to sync. In the web app, in the GitHub repository you open, with a copy in your browser so it opens quickly.
    </>,
    "On the desktop, in a folder on your computer (~/Betelgeuse by default), as Markdown files in a git repository. Nothing leaves your machine unless you add a git remote to sync. In the web app, in the GitHub repository you open, with a copy in your browser so it opens quickly.",
  ],
  [
    "Can I use it in a browser?",
    "Yes. The web app opens a GitHub repository as your workspace, with the same editor and databases and nothing to install. You sign in with GitHub and choose which repositories it can reach. Your browser talks to GitHub directly, so your pages stay in your repository. AI agents and importing need the desktop app.",
  ],
  [
    "Do you keep a copy of my notes?",
    "No. We have no database and no copy of your pages, and your browser talks to GitHub directly, so they don't pass through our servers. A small service does handle GitHub sign-in, keeping your session in an encrypted cookie in your browser, and it passes along the public plugin store. Your notes are on GitHub under GitHub's terms, so use a private repository, and signing out deletes the copy in your browser.",
  ],
  [
    "What can AI agents see?",
    "Only what you share. Pages you hide are left out of agent searches, listings and every MCP tool. That boundary covers agents connected through Betelgeuse's MCP server. An agent you separately give access to the folder itself can read the files.",
  ],
  ["Which AI tools work with it?", "Any MCP client: Claude Code, Claude Desktop, Cursor and others. The app gives you copy-paste setup for each."],
];

export default async function Home() {
  const github = await getSnapshot();
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        description,
        url: `${SITE_URL}/`,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Notes, documents and databases",
        operatingSystem: "macOS, Windows, Linux, Android, Web",
        ...(github.release ? { softwareVersion: github.release.version.replace(/^v/, "") } : {}),
        downloadUrl: RELEASES,
        installUrl: RELEASES,
        image: `${SITE_URL}/opengraph-image.jpg`,
        screenshot: `${SITE_URL}/assets/editor-light.jpg`,
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@id": `${ORG.url}/#organization` },
        sameAs: [REPO],
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": `${SITE_URL}/#source`,
        name: SITE_NAME,
        codeRepository: REPO,
        license: "https://opensource.org/licenses/MIT",
        targetProduct: { "@id": `${SITE_URL}/#app` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: faqs.map(([q, a, text]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: text ?? a },
        })),
      },
    ],
  };
  return (
    <GitHubProvider initial={github}>
      <div className="landing">
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />
        <RevealObserver />
        <header className="nav">
          <div className="wrap">
            <a className="brand" href="#top">
              <Logo size={24} />
              Betelgeuse
            </a>
            <nav className="nav-links" aria-label="Sections">
              <a className="optional" href="#features">
                Features
              </a>
              <a className="optional" href="#agents">
                MCP
              </a>
              <a href="/docs/">Docs</a>
            </nav>
            <StarButton className="button small" label="Star" />
            <NavDownload />
          </div>
        </header>

        <main id="top">
          {/* ---------- Hero ---------- */}
          <div className="hero">
            <div className="wrap">
              <a className="pill" href={REPO}>
                <span className="dot" aria-hidden />
                Open source · Local first
                <span aria-hidden>→</span>
              </a>
              <h1>
                Your knowledge deserves a home, <em>not a subscription.</em>
              </h1>
              <p className="lede">Notes, docs and databases as Markdown files you own, synced with git across all your devices.</p>
              <div className="cta">
                <DownloadButton suffix=" — free" />
                <a className="button ghost" href={DEMO_URL}>
                  Try it in your browser
                </a>
              </div>
              <p className="fineprint">macOS · Windows · Linux · Web · Android preview · MIT licensed · No account needed on your computer</p>

              <div className="hero-visual">
                <div className="devices hero-devices">
                  <Laptop>
                    <Shot name="editor" theme="light" priority alt="The Betelgeuse editor on a computer, with the Welcome guide open" />
                  </Laptop>
                  <Phone
                    kind="android"
                    name="board"
                    theme="light"
                    eager
                    alt="A roadmap database as a board on an Android phone"
                    className="device-left"
                  />
                  <Phone kind="ios" name="welcome" theme="light" eager alt="The Welcome page on an iPhone" className="device-right" />
                </div>
              </div>
            </div>
          </div>

          <ul className="works-with wrap" aria-label="Works on">
            <li>Works on</li>
            {(["macOS", "Windows", "Linux", "Android", "Web"] as const).map((os) => (
              <li key={os} className="works-on">
                <OsIcon os={os} size={20} />
                {os}
              </li>
            ))}
            <li className="works-on">
              <OsIcon os="iOS" size={20} />
              iOS <span className="badge quiet">Soon</span>
            </li>
          </ul>

          {/* ---------- Features ---------- */}
          <section id="features">
            <div className="wrap center" data-reveal>
              <p className="kicker">Features</p>
              <h2 className="center">
                If you know Notion, <em>you know this.</em>
              </h2>
              <p className="intro center">
                The blocks and databases you&apos;re used to, without our cloud: your pages are files on your own devices or in your own GitHub repository, and git keeps them in sync.
              </p>
            </div>
            <div data-reveal>
              <Features />
            </div>
          </section>

          {/* ---------- Web app ---------- */}
          <section id="web">
            <div className="wrap center" data-reveal>
              <p className="kicker">In your browser</p>
              <h2 className="center">
                Your notes stay on your GitHub. <em>Not with us.</em>
              </h2>
              <p className="intro center">The same editor and databases, with nothing to install. Sign in with GitHub and pick a repository.</p>
              <div className="cta">
                <a className="button primary" href={DEMO_URL}>
                  Try the demo
                </a>
                <a className="button" href={APP_URL}>
                  Sign in with GitHub
                </a>
              </div>
            </div>
            <div className="wrap" data-reveal>
              <div className="web-flow" role="img" aria-label="Your browser and your GitHub repository exchange your notes directly. Betelgeuse's servers aren't part of that path.">
                <div className="web-flow-path">
                  <span className="web-flow-node">
                    <Globe size={18} /> Your browser
                  </span>
                  <span className="web-flow-line">
                    <span>your notes</span>
                  </span>
                  <span className="web-flow-node">
                    <GitBranch size={18} /> Your repository
                  </span>
                </div>
                <div className="web-flow-off">
                  <ServerOff size={15} /> Betelgeuse&apos;s servers never see your pages
                </div>
              </div>
              <ul className="web-points">
                {webPoints.map(({ Icon, title, body }) => (
                  <li key={title}>
                    <Icon className="plugin-point-icon" />
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ---------- AI agents ---------- */}
          <section id="agents">
            <div className="wrap agents" data-reveal>
              <div>
                <p className="kicker">MCP</p>
                <h2>
                  Your AI agents, <em>on your terms.</em>
                </h2>
                <p className="intro">A built-in MCP server lets your agents search, read and update the pages you share.</p>
                <ul className="plugin-points">
                  {agentPoints.map(({ Icon, title, body }) => (
                    <li key={title}>
                      <Icon className="plugin-point-icon" />
                      <span>
                        <strong>{title}</strong>
                        <span>{body}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="agents-visual">
                <Shot name="ai-settings" theme="light" alt="Settings that choose which pages AI agents can see" />
                <div className="code-window agents-session" aria-label="An agent updating the Roadmap through Betelgeuse">
                  <div className="code-bar">
                    <span className="lights">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="code-title">Claude Code</span>
                  </div>
                  <pre>
                    {session.map(([kind, text]) => (
                      <div key={text} className={`session-line session-${kind}`}>
                        <span className="session-mark" aria-hidden>
                          {kind === "you" ? ">" : kind === "tool" ? "⏺" : "✓"}
                        </span>
                        <span>
                          {kind === "tool" && <span className="session-server">betelgeuse · </span>}
                          {text}
                        </span>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            </div>
            <p className="wrap fine-note" data-reveal>
              Agents see only what you share when they connect through the Betelgeuse MCP server. An agent you separately give access to the folder
              can read the files directly.
            </p>
          </section>

          {/* ---------- Open source ---------- */}
          <section id="open-source">
            <div className="wrap center" data-reveal>
              <p className="kicker">Open source</p>
              <h2 className="center">
                Built by people who believe <em>your data should be free.</em>
              </h2>
              <p className="intro center">MIT licensed and developed in the open. Use it, change it, make it better.</p>
            </div>
            <div className="wrap oss" data-reveal>
              <div className="oss-card oss-main">
                <RepoCard>
                  <div className="oss-cta">
                    <StarButton className="button primary" />
                    <a className="button" href={`${REPO}/fork`}>
                      <GitFork size={16} /> Fork
                    </a>
                  </div>
                </RepoCard>
              </div>
              <a className="oss-card" href={`${REPO}/blob/main/CONTRIBUTING.md`}>
                <Wrench className="oss-icon" />
                <strong>Contribute</strong>
                <span>Set up in four commands. Start with a good first issue.</span>
              </a>
              <a className="oss-card" href={`${REPO}/discussions`}>
                <MessageSquarePlus className="oss-icon" />
                <strong>Request a feature</strong>
                <span>Share ideas and vote in Discussions.</span>
              </a>
              <a className="oss-card" href={`${REPO}/security/advisories/new`}>
                <ShieldCheck className="oss-icon" />
                <strong>Report a security issue</strong>
                <span>Privately, and we&apos;ll reply within a week.</span>
              </a>
              <a className="oss-card" href="/sponsor/">
                <Heart className="oss-icon" />
                <strong>Sponsor</strong>
                <span>Help fund signed builds and development.</span>
              </a>
              <div className="oss-next">
                <p className="oss-label">Up next</p>
                <ul>
                  <li>Faster full-text search</li>
                  <li>Formulas in databases</li>
                  <li>More plugins in the store</li>
                  <li>Signed builds for macOS and Windows</li>
                  <li>The iPhone app</li>
                  <li>Handling edits from you and an agent at the same time</li>
                  <li>
                    <span>
                      <strong>Use it as a CMS.</strong> Connect an external database or spreadsheet, and edit a website&apos;s FAQs, blog posts or any
                      content right here. Your changes update the source.
                    </span>
                  </li>
                </ul>
              </div>
              <div className="oss-hack">
                <div className="oss-hack-head">
                  <div>
                    <p className="oss-label">Hack on it</p>
                    <strong>Run it locally in a few minutes.</strong>
                  </div>
                  <a href={`${REPO}/blob/main/CONTRIBUTING.md`}>Contributing guide →</a>
                </div>
                <CodeWindow
                  title="Terminal"
                  lines={[
                    [`git clone ${REPO}`],
                    ["cd betelgeuse"],
                    ["npm install && npm --prefix mcp install"],
                    ["npm run app", "starts the app with hot reload"],
                  ]}
                />
              </div>
            </div>
            <div className="wrap">
              <Contributors />
            </div>
          </section>

          {/* ---------- FAQ ---------- */}
          <section id="faq">
            <div className="wrap faq-grid" data-reveal>
              <div>
                <p className="kicker">FAQ</p>
                <h2>Questions, answered.</h2>
                <p className="intro">
                  Something else?{" "}
                  <a href={`${REPO}/discussions`} className="text-link">
                    Ask on GitHub
                  </a>
                  .
                </p>
              </div>
              <div className="faq">
                {faqs.map(([q, a]) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* ---------- Download ---------- */}
          <section id="download" className="download">
            <div className="wrap center" data-reveal>
              <div className="download-star">
                <Logo size={64} />
              </div>
              <h2 className="center">Take your notes home.</h2>
              <p className="intro center">Free. Open source. Yours to keep.</p>
            </div>
            <div className="wrap" data-reveal>
              <Downloads />
              <div className="card build-card">
                <h3>
                  Build from source <span className="badge">No warnings</span>
                </h3>
                <p>Needs git, Node.js 20+ and Rust. The script checks for anything else.</p>
                <Tabs
                  label="Operating system"
                  tabs={[
                    {
                      id: "unix",
                      title: "macOS & Linux",
                      content: <Command>{`git clone ${REPO} && cd betelgeuse && ./scripts/install.sh`}</Command>,
                    },
                    {
                      id: "windows",
                      title: "Windows",
                      content: <Command prompt=">">{`git clone ${REPO}; cd betelgeuse; .\\scripts\\install.ps1`}</Command>,
                    },
                  ]}
                />
              </div>
              <p className="feedback">
                Tried it? <a href={`${REPO}/issues/new/choose`}>Tell us what worked and what didn&apos;t</a>.
              </p>
            </div>
          </section>
        </main>

        <footer>
          <div className="wrap footer-grid">
            <div>
              <a className="brand" href="#top">
                <Logo size={22} />
                Betelgeuse
              </a>
              <p>A beautiful workspace that stays yours.</p>
              <StarButton className="button small" />
            </div>
            <nav aria-label="Product">
              <strong>Product</strong>
              <a href="#features">Features</a>
              <a href="/docs/plugins/">Plugins</a>
              <a href="#agents">AI agents</a>
              <a href="/docs/">Docs</a>
              <a href="/docs/developers/plugins/">Build a plugin</a>
              <a href="#download">Download</a>
              <a href={APP_URL}>Web app</a>
            </nav>
            <nav aria-label="Project">
              <strong>Project</strong>
              <a href={REPO}>GitHub</a>
              <a href={`${REPO}/releases`}>Releases</a>
              <a href="/stats/">Stats</a>
              <a href={`${REPO}/blob/main/CONTRIBUTING.md`}>Contributing</a>
              <a href={`${REPO}/blob/main/SECURITY.md`}>Security</a>
              <a href="/privacy/">Privacy</a>
            </nav>
            <nav aria-label="Community">
              <strong>Community</strong>
              <a href={`${REPO}/discussions`}>Discussions</a>
              <a href={`${REPO}/issues`}>Issues</a>
              <a href="/sponsor/">Sponsor</a>
              <a href={`${REPO}/blob/main/LICENSE`}>MIT License</a>
            </nav>
          </div>
          <div className="wrap legal">
            © 2026 Devian Labs and contributors. Built by <a href={ORG.url}>Devian Labs</a>. Betelgeuse™ is a trademark of Devian Labs.
          </div>
        </footer>
      </div>
    </GitHubProvider>
  );
}
