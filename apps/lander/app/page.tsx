import type { Metadata } from "next";
import { Bot, FileText, GitFork, Heart, MessageSquarePlus, ShieldCheck, Wrench } from "lucide-react";
import { Command } from "@/components/Command";
import { Compare } from "@/components/Compare";
import { BoardDemo, FilesDemo, FolderDemo, HistoryDemo, ImportDemo, PrivacyDemo, SlashDemo } from "@/components/Demos";
import { DownloadButton } from "@/components/DownloadButton";
import { Downloads } from "@/components/Downloads";
import { CodeWindow } from "@/components/CodeWindow";
import { Contributors, GitHubProvider, RepoCard, StarButton } from "@/components/GitHub";
import { Logo } from "@/components/Logo";
import { ProductTour } from "@/components/ProductTour";
import { RevealObserver } from "@/components/Reveal";
import { Tabs } from "@/components/Tabs";
import { TerminalDemo } from "@/components/TerminalDemo";
import { Walkthrough } from "@/components/Walkthrough";
import { getSnapshot } from "@/lib/github";
import { ORG, RELEASES, REPO, SITE_NAME, SITE_URL, jsonLd, pageMetadata } from "@/lib/site";

const description =
  "Free, open-source app for notes, docs and databases. Every page is a Markdown file in git on your computer, and AI agents read only the pages you share.";

export const metadata: Metadata = pageMetadata({ title: "Open-Source Markdown Notes & Docs App | Betelgeuse", description, path: "/" });

type Feature = { id: string; kicker: string; title: string; body: React.ReactNode; demo: React.ReactNode };

function FeatureRows({ items, offset = 0 }: { items: Feature[]; offset?: number }) {
  return (
    <div className="wrap tour-rows">
      {items.map((f, i) => (
        <article key={f.id} className={`feature${(i + offset) % 2 ? " flip" : ""}`} data-reveal>
          <div className="feature-copy">
            <p className="kicker">{f.kicker}</p>
            <h2>{f.title}</h2>
            <p>{f.body}</p>
          </div>
          <div className="feature-visual">{f.demo}</div>
        </article>
      ))}
    </div>
  );
}

const workspace: Feature[] = [
  {
    id: "write",
    kicker: "Write",
    title: "Every block, one keystroke away.",
    body: (
      <>
        Type <kbd>/</kbd> for headings, to-dos, callouts, code, tables and columns. Link pages with <kbd>[[</kbd>.
      </>
    ),
    demo: <SlashDemo />,
  },
  {
    id: "organise",
    kicker: "Organise",
    title: "Databases made of plain files.",
    body: "Table, board, list, gallery and calendar views. Every row is a page, and every property lives in the file.",
    demo: <BoardDemo />,
  },
  {
    id: "remember",
    kicker: "Remember",
    title: "Every change saved. Every version back.",
    body: "Your work is committed to git as you go. Restore any version in a click, including an agent's.",
    demo: <HistoryDemo />,
  },
];

const agents: Feature[] = [
  {
    id: "connect",
    kicker: "Connect",
    title: "A knowledge base for your agents.",
    body: "Claude Code, Cursor and any MCP client can search, read and update your notes. Every edit is its own commit.",
    demo: <TerminalDemo />,
  },
  {
    id: "control",
    kicker: "Control",
    title: "You decide what AI can see.",
    body: "Hide any page with one switch, or share only the pages you pick. Hidden pages are left out of every agent search, listing and tool.",
    demo: <PrivacyDemo />,
  },
];

/** Question, answer, and the answer as plain text when it isn't a string already (for the FAQPage structured data). */
const faqs: [string, React.ReactNode, string?][] = [
  ["Is it really free?", "Yes. It's open source under the MIT license, with no account, subscription or paid tier."],
  [
    "Where are my notes stored?",
    <>
      In a folder on your computer (<code>~/Betelgeuse</code> by default), as Markdown files in a git repository. Nothing
      leaves your machine unless you add a git remote to sync.
    </>,
    "In a folder on your computer (~/Betelgeuse by default), as Markdown files in a git repository. Nothing leaves your machine unless you add a git remote to sync.",
  ],
  [
    "What can AI agents see?",
    "Only what you share. Pages you hide are left out of agent searches, listings and every MCP tool. That boundary covers agents connected through Betelgeuse's MCP server. An agent you separately give access to the folder itself can read the files.",
  ],
  ["Which AI tools work with it?", "Any MCP client: Claude Code, Claude Desktop, Cursor and others. The app gives you copy-paste setup for each."],
  ["Can I use it on more than one computer?", "Yes, with git. Connect the workspace to a private repository you control and Betelgeuse pulls and pushes when you sync."],
  [
    "Why does my computer warn me when I open it?",
    "The builds aren't code-signed yet (certificates cost money). Confirm once and it opens normally, or build from source to skip the warning entirely.",
  ],
  [
    "What doesn't it do yet?",
    "It's an early preview. Search is basic, databases don't have formulas or relations, there's no sharing or comments, and if you and an agent edit the same page at the same moment the last save wins (git keeps both).",
  ],
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
        operatingSystem: "macOS, Windows, Linux",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />
      <RevealObserver />
      <header className="nav">
        <div className="wrap">
          <a className="brand" href="#top">
            <Logo size={24} />
            Betelgeuse
          </a>
          <nav className="nav-links" aria-label="Sections">
            <a className="optional" href="#files">Your files</a>
            <a className="optional" href="#features">Features</a>
            <a className="optional" href="#agents">AI agents</a>
            <a className="optional" href="#import">Import</a>
            <a className="optional" href="#open-source">Open source</a>
          </nav>
          <StarButton className="button small" label="Star" />
        </div>
      </header>

      <main id="top">
        {/* ---------- Hero ---------- */}
        <div className="hero night">
          <div className="stars" aria-hidden />
          <div className="wrap">
            <a className="pill" href={REPO}>
              <span className="dot" aria-hidden />
              Open source · Local first
              <span aria-hidden>→</span>
            </a>
            <h1>
              Your knowledge deserves a home, <em>not a subscription.</em>
            </h1>
            <p className="lede">
              The freedom of Markdown with the power of a modern workspace. Write documents, organise databases and
              connect AI agents, all on your own files, with git keeping your history.
            </p>
            <div className="cta">
              <DownloadButton suffix=" — free" />
              <StarButton className="button ghost" label="Explore on GitHub" />
            </div>
            <p className="fineprint">macOS · Windows · Linux · MIT licensed · No account required</p>

            <div className="hero-visual">
              <ProductTour />
              <div className="float float-file" aria-hidden>
                <span className="float-icon">
                  <FileText size={17} />
                </span>
                <span>
                  <strong>Welcome.md</strong>
                  <small>Saved · committed to git</small>
                </span>
              </div>
              <div className="float float-agent" aria-hidden>
                <span className="float-icon accent">
                  <Bot size={18} />
                </span>
                <span>
                  <strong>Claude Code read 3 pages</strong>
                  <small>2 hidden from agents</small>
                </span>
              </div>
            </div>
          </div>
        </div>

        <ul className="works-with wrap" aria-label="Works with">
          <li>Works with</li>
          <li>Claude Code</li>
          <li>Cursor</li>
          <li>Any MCP client</li>
          <li>Obsidian</li>
          <li>VS Code</li>
          <li>git</li>
        </ul>

        {/* ---------- Problem ---------- */}
        <section id="problem">
          <div className="wrap center" data-reveal>
            <p className="kicker">The problem</p>
            <h2 className="center">
              Our notes got beautiful.
              <br />
              Then they stopped being ours.
            </h2>
            <p className="intro center">
              Modern tools made writing easier than ever, but our notes ended up tied to proprietary storage,
              subscriptions and AI ecosystems. Local tools give us ownership, but ask us to give up the polish.{" "}
              <strong>Betelgeuse brings both together.</strong>
            </p>
          </div>
          <div className="wrap narrow-wide" data-reveal>
            <Compare />
          </div>
        </section>

        {/* ---------- Walkthrough ---------- */}
        <section id="demo">
          <div className="wrap center" data-reveal>
            <p className="kicker">See it in action</p>
            <h2 className="center">From a blank page to your first agent.</h2>
          </div>
          <div className="wrap" data-reveal>
            <Walkthrough />
          </div>
        </section>

        {/* ---------- Own everything ---------- */}
        <div className="night band" id="files">
          <div className="wrap center" data-reveal>
            <p className="kicker">Own everything</p>
            <h2 className="center">Your workspace is just a folder.</h2>
            <p className="intro center">No proprietary database. No account. No export ritual.</p>
          </div>
          <div className="wrap own" data-reveal>
            <FolderDemo />
            <FilesDemo />
          </div>
          <div className="wrap center" data-reveal>
            <p className="open-with">
              Open it in <span>Obsidian</span> <span>VS Code</span> <span>Zed</span> <span>any Markdown editor</span> or{" "}
              <span>git</span>
            </p>
          </div>
        </div>

        {/* ---------- Workspace features ---------- */}
        <section id="features">
          <div className="wrap center" data-reveal>
            <p className="kicker">Write beautifully</p>
            <h2 className="center">A workspace that feels complete.</h2>
          </div>
          <FeatureRows items={workspace} />
        </section>

        {/* ---------- AI ---------- */}
        <section id="agents">
          <div className="wrap center" data-reveal>
            <p className="kicker">Connect anything</p>
            <h2 className="center">
              AI on <em>your</em> terms.
            </h2>
            <p className="intro center">
              Bring the agents you already use. They work inside the permissions you set, and you can undo anything they
              change.
            </p>
          </div>
          <FeatureRows items={agents} offset={1} />
          <p className="wrap fine-note" data-reveal>
            Visibility rules apply to agents connected through the Betelgeuse MCP server. An agent you separately give
            access to the folder can read the files directly.
          </p>
        </section>

        {/* ---------- Import ---------- */}
        <section id="import">
          <div className="wrap import" data-reveal>
            <div className="feature-copy">
              <p className="kicker">Bring your notes</p>
              <h2>Easy to migrate.</h2>
              <p>
                Import from Notion or Obsidian. Your pages, databases, links and images come with you, as a single git
                commit.
              </p>
              <ol className="steps">
                <li>
                  <span>
                    <strong>Export</strong> from Notion as <em>HTML</em> (keeps icons and colours) or <em>Markdown &amp; CSV</em>, or pick your Obsidian vault.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Import</strong> it from the sidebar in Betelgeuse.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Done.</strong> Databases come with table views, plus board and calendar views where they fit.
                  </span>
                </li>
              </ol>
            </div>
            <ImportDemo />
          </div>
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
            <div className="oss-card oss-main night">
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
            <a className="oss-card" href="https://github.com/sponsors/devian-labs">
              <Heart className="oss-icon" />
              <strong>Sponsor</strong>
              <span>Help fund signed builds and development.</span>
            </a>
            <div className="oss-next">
              <p className="oss-label">Up next</p>
              <ul>
                <li>Faster full-text search</li>
                <li>Formulas and relations in databases</li>
                <li>Signed builds for macOS and Windows</li>
                <li>Handling edits from you and an agent at the same time</li>
                <li>
                  <span>
                    <strong>Use it as a CMS.</strong> Connect an external database or spreadsheet, and edit a website&apos;s
                    FAQs, blog posts or any content right here. Your changes update the source.
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
                  { id: "unix", title: "macOS & Linux", content: <Command>{`git clone ${REPO} && cd betelgeuse && ./scripts/install.sh`}</Command> },
                  { id: "windows", title: "Windows", content: <Command prompt=">">{`git clone ${REPO}; cd betelgeuse; .\\scripts\\install.ps1`}</Command> },
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
            <a href="#agents">AI agents</a>
            <a href="#import">Import</a>
            <a href="#download">Download</a>
          </nav>
          <nav aria-label="Project">
            <strong>Project</strong>
            <a href={REPO}>GitHub</a>
            <a href={`${REPO}/releases`}>Releases</a>
            <a href={`${REPO}/blob/main/CONTRIBUTING.md`}>Contributing</a>
            <a href={`${REPO}/blob/main/SECURITY.md`}>Security</a>
            <a href="/privacy/">Privacy</a>
          </nav>
          <nav aria-label="Community">
            <strong>Community</strong>
            <a href={`${REPO}/discussions`}>Discussions</a>
            <a href={`${REPO}/issues`}>Issues</a>
            <a href="https://github.com/sponsors/devian-labs">Sponsor</a>
            <a href={`${REPO}/blob/main/LICENSE`}>MIT License</a>
          </nav>
        </div>
        <div className="wrap legal">
          © 2026 Devian Labs and contributors. Built by <a href={ORG.url}>Devian Labs</a>. Betelgeuse™ is a trademark of
          Devian Labs.
        </div>
      </footer>
    </GitHubProvider>
  );
}
