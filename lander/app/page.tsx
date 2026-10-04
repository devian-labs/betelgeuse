import { Command } from "@/components/Command";
import { BoardDemo, FilesDemo, HistoryDemo, PrivacyDemo, SlashDemo } from "@/components/Demos";
import { DownloadButton } from "@/components/DownloadButton";
import { Contributors, GitHubIcon, StarButton } from "@/components/GitHub";
import { Logo } from "@/components/Logo";
import { ProductTour } from "@/components/ProductTour";
import { RevealObserver } from "@/components/Reveal";
import { Tabs } from "@/components/Tabs";
import { TerminalDemo } from "@/components/TerminalDemo";
import { REPO } from "@/lib/site";

function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <svg className="mark ok" viewBox="0 0 20 20" aria-label="Yes">
      <path d="M5 10.5l3.2 3L15 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className="mark no" viewBox="0 0 20 20" aria-label="No">
      <path d="M6.5 6.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const choices = [
  {
    label: "Cloud workspaces",
    title: "Polished, but not yours.",
    items: [
      [true, "A lovely editor"],
      [false, "Your notes on their servers"],
      [false, "AI on their terms, for a fee"],
    ],
  },
  {
    label: "Local Markdown apps",
    title: "Yours, but unpolished.",
    items: [
      [true, "Plain files on your disk"],
      [false, "Polish takes plugins and setup"],
      [false, "Built for tinkerers first"],
    ],
  },
  {
    label: "Betelgeuse",
    title: "Polished, and yours.",
    items: [
      [true, "An editor that just works"],
      [true, "Plain Markdown and git, on your disk"],
      [true, "Any AI, reading only what you share"],
    ],
  },
] as const;

const features = [
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
    body: "Table, board, list, gallery and calendar views. Every row is a page, every property lives in the file.",
    demo: <BoardDemo />,
  },
  {
    id: "remember",
    kicker: "Remember",
    title: "Every change saved. Every version back.",
    body: "Your work is committed to git as you go. Restore any version in a click, including an agent's.",
    demo: <HistoryDemo />,
  },
  {
    id: "connect",
    kicker: "Connect",
    title: "A knowledge base for your agents.",
    body: "Claude Code, Cursor and any MCP client can search, read and update your notes. Every edit is a commit.",
    demo: <TerminalDemo />,
  },
  {
    id: "control",
    kicker: "Control",
    title: "You decide what AI can see.",
    body: "Hide any page with one switch, or share only what you choose. Hidden pages don't exist for agents.",
    demo: <PrivacyDemo />,
  },
];

const faqs: [string, React.ReactNode][] = [
  ["Is it really free?", "Yes. MIT licensed, no account, no subscription, no paid tier."],
  [
    "Where are my notes?",
    <>
      In a folder on your computer (<code>~/Betelgeuse</code>), as Markdown in a git repo. Nothing leaves your machine
      unless you add a remote.
    </>,
  ],
  ["Does it send my notes to an AI?", "No. Betelgeuse has no AI or cloud of its own. Agents you connect see only the pages you share."],
  ["Which AI tools work?", "Any MCP client: Claude Code, Claude Desktop, Cursor and more. The app gives you copy-paste setup."],
  ["Can I bring my notes?", "Yes. Import Markdown & CSV workspace exports (databases included) and Markdown vaults."],
  ["Is it ready?", "It's an early preview. Expect rough edges, and tell us about them on GitHub."],
];

export default function Home() {
  return (
    <>
      <RevealObserver />
      <header className="nav">
        <div className="wrap">
          <a className="brand" href="#top">
            <Logo size={24} />
            Betelgeuse
          </a>
          <nav className="nav-links" aria-label="Sections">
            <a className="optional" href="#features">Features</a>
            <a className="optional" href="#how">How it works</a>
            <a className="optional" href="#open-source">Open source</a>
            <a className="optional" href="#faq">FAQ</a>
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
              Open source · MIT · Star us on GitHub
              <span aria-hidden>→</span>
            </a>
            <h1>
              A beautiful workspace
              <br /> that <em>stays yours.</em>
            </h1>
            <p className="lede">Notes, docs and databases saved as plain files on your computer. Your AI agents read only what you share.</p>
            <div className="cta">
              <DownloadButton />
              <StarButton className="button ghost" />
            </div>
            <p className="fineprint">macOS · Windows · Linux — free, no account</p>

            <div className="hero-visual">
              <ProductTour />
              <div className="float float-file" aria-hidden>
                <span className="float-icon">📄</span>
                <span>
                  <strong>Welcome.md</strong>
                  <small>Saved · committed to git</small>
                </span>
              </div>
              <div className="float float-agent" aria-hidden>
                <span className="float-icon accent">✦</span>
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
          <li>Claude Desktop</li>
          <li>Cursor</li>
          <li>Any MCP client</li>
          <li>git</li>
          <li>Any Markdown editor</li>
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
              Polished tools keep our notes on their servers and sell AI back to us. Local tools give us the files, but not
              the polish. You shouldn&apos;t have to choose.
            </p>
          </div>
          <div className="wrap choices">
            {choices.map((c, i) => (
              <div className={`choice${i === 2 ? " answer" : ""}`} key={c.label} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
                <p className="choice-label">{c.label}</p>
                <h3>{c.title}</h3>
                <ul>
                  {c.items.map(([ok, text]) => (
                    <li key={text}>
                      <Check ok={ok} />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Solution ---------- */}
        <section id="solution">
          <div className="wrap center" data-reveal>
            <p className="kicker">Introducing Betelgeuse</p>
            <h2 className="center">
              The polish of a modern workspace.
              <br />
              <em>The freedom of plain files.</em>
            </h2>
            <p className="intro center">What you see in the app is a Markdown file you can open anywhere.</p>
          </div>
          <div className="wrap files-wrap" data-reveal>
            <FilesDemo />
          </div>
        </section>

        {/* ---------- Feature tour ---------- */}
        <section id="features" className="tour">
          <div className="wrap">
            {features.map((f, i) => (
              <article key={f.id} className={`feature${i % 2 ? " flip" : ""}`} data-reveal>
                <div className="feature-copy">
                  <p className="kicker">{f.kicker}</p>
                  <h2>{f.title}</h2>
                  <p>{f.body}</p>
                </div>
                <div className="feature-visual">{f.demo}</div>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <div className="night band" id="how">
          <div className="wrap center" data-reveal>
            <p className="kicker">How it works</p>
            <h2 className="center">The folder is the product.</h2>
            <p className="intro center">No servers. No sync service. No export button. Just files.</p>
            <div className="flow">
              <div className="node">
                <Logo size={30} />
                <strong>Betelgeuse</strong>
                <span>Where you write</span>
              </div>
              <div className="link" aria-hidden />
              <div className="node core">
                <span className="node-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                    <path d="M3.5 7.5a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />
                  </svg>
                </span>
                <strong>Your folder</strong>
                <span>Markdown + git</span>
              </div>
              <div className="link reverse" aria-hidden />
              <div className="node">
                <span className="node-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </span>
                <strong>MCP server</strong>
                <span>Filters what&apos;s hidden</span>
              </div>
              <div className="link reverse" aria-hidden />
              <div className="node">
                <span className="node-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="4.5" y="8" width="15" height="11" rx="3" />
                    <path d="M12 8V4.5M9 13h.01M15 13h.01" />
                  </svg>
                </span>
                <strong>Your agents</strong>
                <span>Claude Code, Cursor…</span>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- Open source ---------- */}
        <section id="open-source">
          <div className="wrap center" data-reveal>
            <p className="kicker">Open source</p>
            <h2 className="center">
              Built in the open. <em>Yours to shape.</em>
            </h2>
            <p className="intro center">MIT licensed and developed on GitHub. Star it, fork it, make it better.</p>
          </div>
          <div className="wrap oss" data-reveal>
            <div className="oss-card oss-main night">
              <a className="oss-repo" href={REPO}>
                <GitHubIcon size={22} />
                <span>
                  devian-labs / <strong>betelgeuse</strong>
                </span>
              </a>
              <p>A beautiful workspace on plain Markdown and git, open to AI agents over MCP.</p>
              <div className="oss-langs">
                <span>
                  <i style={{ background: "#3178c6" }} />
                  TypeScript
                </span>
                <span>
                  <i style={{ background: "#dea584" }} />
                  Rust
                </span>
                <span>MIT</span>
              </div>
              <div className="oss-cta">
                <StarButton className="button primary" />
                <a className="button" href={`${REPO}/fork`}>
                  Fork
                </a>
              </div>
            </div>
            <a className="oss-card" href={`${REPO}/issues?q=is%3Aopen+label%3A%22good+first+issue%22`}>
              <span className="oss-icon">🌱</span>
              <strong>Good first issues</strong>
              <span>Small, well-scoped tasks to start with.</span>
            </a>
            <a className="oss-card" href={`${REPO}/blob/main/CONTRIBUTING.md`}>
              <span className="oss-icon">🛠️</span>
              <strong>Contributing guide</strong>
              <span>Set up, ground rules and how to ship.</span>
            </a>
            <a className="oss-card" href={`${REPO}/discussions`}>
              <span className="oss-icon">💬</span>
              <strong>Discussions</strong>
              <span>Ideas, questions and show-and-tell.</span>
            </a>
            <a className="oss-card" href="https://github.com/sponsors/devian-labs">
              <span className="oss-icon">💛</span>
              <strong>Sponsor</strong>
              <span>Help fund signed builds.</span>
            </a>
            <div className="oss-hack">
              <p className="oss-hack-label">Hack on it</p>
              <Command>{`git clone ${REPO} && cd betelgeuse && npm install && npm --prefix mcp install && npm run app`}</Command>
              <div className="stack">
                {["Tauri 2", "Rust", "React 19", "Tiptap 3", "TypeScript", "MCP"].map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
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
                More on{" "}
                <a href={`${REPO}/discussions`} className="text-link">
                  GitHub Discussions
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
            <p className="intro center">Free and open source, on every desktop.</p>
            <div className="install">
              <div className="card">
                <h3>Download</h3>
                <p>For macOS, Windows and Linux. Builds aren&apos;t code-signed yet, so confirm on first launch.</p>
                <DownloadButton />
              </div>
              <div className="card">
                <h3>
                  Build from source <span className="badge">No warnings</span>
                </h3>
                <Tabs
                  label="Operating system"
                  tabs={[
                    { id: "unix", title: "macOS & Linux", content: <Command>{`git clone ${REPO} && cd betelgeuse && ./scripts/install.sh`}</Command> },
                    { id: "windows", title: "Windows", content: <Command prompt=">">{`git clone ${REPO}; cd betelgeuse; .\\scripts\\install.ps1`}</Command> },
                  ]}
                />
              </div>
            </div>
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
            <a href="#how">How it works</a>
            <a href="#download">Download</a>
            <a href={`${REPO}/releases`}>Releases</a>
          </nav>
          <nav aria-label="Project">
            <strong>Project</strong>
            <a href={REPO}>GitHub</a>
            <a href={`${REPO}/blob/main/CONTRIBUTING.md`}>Contributing</a>
            <a href={`${REPO}/blob/main/SECURITY.md`}>Security</a>
            <a href={`${REPO}/blob/main/LICENSE`}>MIT License</a>
          </nav>
          <nav aria-label="Community">
            <strong>Community</strong>
            <a href={`${REPO}/discussions`}>Discussions</a>
            <a href={`${REPO}/issues`}>Issues</a>
            <a href="https://github.com/sponsors/devian-labs">Sponsor</a>
          </nav>
        </div>
        <div className="wrap legal">
          © 2026 Betelgeuse contributors · Built by{" "}
          <a href="https://devianlabs.com">Devian Labs</a>
        </div>
      </footer>
    </>
  );
}
