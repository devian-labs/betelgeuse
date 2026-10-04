/**
 * Animated illustrations of the app. They're plain HTML and CSS (keyframes in globals.css), loop on
 * their own, and settle on a still frame when the visitor prefers reduced motion.
 */

function Chrome({ title }: { title: string }) {
  return (
    <div className="demo-bar">
      <span className="lights">
        <i />
        <i />
        <i />
      </span>
      <span className="demo-title">{title}</span>
    </div>
  );
}

/* ---------- Write: type "/call", pick Callout, the block appears ---------- */

const menu = [
  ["T", "Text", ""],
  ["H₁", "Heading 1", "#"],
  ["☐", "To-do list", "[]"],
  ["💡", "Callout", ">"],
  ["▸", "Toggle list", ""],
];

export function SlashDemo() {
  return (
    <div className="demo slash-demo" aria-hidden>
      <Chrome title="Launch plan" />
      <div className="sd-page">
        <div className="sd-title">🚀 Launch plan</div>
        <p className="sd-text">Everything we need before the public beta.</p>
        <div className="sd-todo done">
          <span className="box">✓</span>Write the announcement
        </div>
        <div className="sd-todo">
          <span className="box" />
          Record the demo video
        </div>
        <div className="sd-slot">
          <div className="sd-line">
            <span className="sd-typed">/call</span>
            <span className="caret" />
          </div>
          <div className="sd-callout">
            <span>💡</span>
            <span>
              <strong>Beta ships Friday.</strong> Agents can read this page.
            </span>
          </div>
          <div className="sd-menu">
            <div className="sd-menu-label">Basic blocks</div>
            {menu.map(([icon, name, key], i) => (
              <div key={name} className={`sd-item${i === 3 ? " match" : ""}`}>
                <span className="sd-icon">{icon}</span>
                {name}
                <kbd>{key}</kbd>
              </div>
            ))}
            <div className="sd-hl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Organise: drag a card from In progress to Done ---------- */

function Card({ title, tag, date, status }: { title: string; tag: string; date: string; status?: [string, string] }) {
  return (
    <div className="bd-card">
      <div className="bd-card-title">📄 {title}</div>
      <div className="bd-meta">
        {status && <span className={`chip ${status[1]}`}>{status[0]}</span>}
        <span className="chip tag">{tag}</span>
        <span className="bd-date">{date}</span>
      </div>
    </div>
  );
}

export function BoardDemo() {
  return (
    <div className="demo board-demo" aria-hidden>
      <Chrome title="Roadmap · Board" />
      <div className="bd-cols">
        <div className="bd-col gray">
          <div className="bd-head">
            <span className="status gray">Not started</span>
            <span className="bd-count">2</span>
          </div>
          <Card title="Sync vault to GitHub" tag="git" date="Oct 16" />
          <Card title="Search index" tag="app" date="Oct 30" />
        </div>
        <div className="bd-col blue">
          <div className="bd-head">
            <span className="status blue">In progress</span>
            <span className="bd-count swap">
              <span>2</span>
              <span>1</span>
            </span>
          </div>
          <div className="bd-slot">
            <div className="bd-mover">
              <div className="bd-card lifted">
                <div className="bd-card-title">📄 Ship the MCP server</div>
                <div className="bd-meta">
                  <span className="chip swap-chip">
                    <span className="chip blue">In progress</span>
                    <span className="chip green">Done</span>
                  </span>
                  <span className="bd-date">Oct 9</span>
                </div>
              </div>
              <svg className="bd-cursor" viewBox="0 0 24 24" width="22" height="22">
                <path d="M5 3l14 8-6 1.5L10 19z" fill="#fff" stroke="#1b0d07" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <Card title="Write the docs" tag="docs" date="Oct 12" />
        </div>
        <div className="bd-col green">
          <div className="bd-head">
            <span className="status green">Done</span>
            <span className="bd-count swap">
              <span>1</span>
              <span>2</span>
            </span>
          </div>
          <Card title="Database views" tag="app" date="Oct 2" />
          <div className="bd-drop" />
        </div>
      </div>
    </div>
  );
}

/* ---------- Remember: an agent's commit slides into the history ---------- */

const history = [
  { who: "You", what: "Edit Roadmap", when: "4 min ago" },
  { who: "You", what: "Create “Launch plan”", when: "1 hour ago" },
  { who: "Cursor via Betelgeuse MCP", what: "Append to “Decisions”", when: "yesterday", bot: true },
  { who: "You", what: "Rename “Specs”", when: "yesterday" },
];

function Row({ who, what, when, bot, fresh }: { who: string; what: string; when: string; bot?: boolean; fresh?: boolean }) {
  return (
    <div className={`hd-row${fresh ? " fresh" : ""}`}>
      <span className={`avatar${bot ? " bot" : ""}`}>{bot ? "✦" : "Y"}</span>
      <span className="hd-commit">
        <strong>{what}</strong>
        <span>
          {who}
          {bot && <em className="bot-badge">agent</em>}
        </span>
      </span>
      <span className="hd-when">{fresh ? <span className="hd-restore">Restore</span> : when}</span>
    </div>
  );
}

export function HistoryDemo() {
  return (
    <div className="demo history-demo" aria-hidden>
      <Chrome title="History · Launch plan.md" />
      <div className="hd-list">
        <div className="hd-new">
          <Row fresh bot who="Claude Code via Betelgeuse MCP" what="Update “Launch plan”" when="just now" />
        </div>
        {history.map((h) => (
          <Row key={h.what} {...h} />
        ))}
      </div>
      <div className="hd-toast">
        <span className="hd-dot" />
        Committed to git · 3f9c2a1
      </div>
    </div>
  );
}

/* ---------- Control: hide a page, and it disappears for agents ---------- */

const pages = [
  ["📐", "Product specs"],
  ["🗺️", "Roadmap"],
  ["📓", "Journal"],
  ["🧭", "Decisions"],
];

export function PrivacyDemo() {
  return (
    <div className="demo privacy-demo" aria-hidden>
      <div className="pv-panel">
        <div className="pv-head">Your workspace</div>
        {pages.map(([icon, name]) => (
          <div key={name} className={`pv-row${name === "Journal" ? " target" : ""}`}>
            <span>{icon}</span>
            <span className="pv-name">{name}</span>
            <span className="switch">
              <i />
            </span>
          </div>
        ))}
        <div className="pv-row locked">
          <span>💰</span>
          <span className="pv-name">Finances</span>
          <span className="switch off">
            <i />
          </span>
        </div>
      </div>
      <div className="pv-arrow">
        <span />
      </div>
      <div className="pv-panel agent">
        <div className="pv-head">
          <span className="pv-bot">✦</span> What your agent sees
        </div>
        {pages.map(([icon, name]) => (
          <div key={name} className={`pv-seen${name === "Journal" ? " target" : ""}`}>
            <span>{icon}</span>
            {name}
          </div>
        ))}
        <div className="pv-hidden">
          <span className="pv-lock">🔒</span>
          <span className="pv-hidden-count">
            <span>1 page hidden</span>
            <span>2 pages hidden</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Plain files: the same page, as you see it and as it's stored ---------- */

export function FilesDemo() {
  return (
    <div className="demo files-demo" aria-hidden>
      <div className="fd-bar">
        <span className="lights">
          <i />
          <i />
          <i />
        </span>
        <div className="fd-switch">
          <span className="fd-pill" />
          <span className="fd-opt a">In Betelgeuse</span>
          <span className="fd-opt b">On disk</span>
        </div>
        <span className="demo-title">Ship the MCP server.md</span>
      </div>
      <div className="fd-stage">
        <div className="fd-face fd-rendered">
          <div className="fd-h">🔌 Ship the MCP server</div>
          <div className="fd-props">
            <span className="fd-prop">Status</span>
            <span className="chip blue">In progress</span>
            <span className="fd-prop">Due</span>
            <span>Oct 9, 2026</span>
            <span className="fd-prop">Tags</span>
            <span className="chip tag">agents</span>
          </div>
          <div className="fd-callout">💡 Every agent write is its own git commit.</div>
          <div className="sd-todo done">
            <span className="box">✓</span>Bundle the server
          </div>
          <div className="sd-todo">
            <span className="box" />
            Publish to the registry
          </div>
        </div>
        <pre className="fd-face fd-source">
          <span className="k-dim">---</span>
          {"\n"}
          <span className="k-key">Status</span>: <span className="k-str">In progress</span>
          {"\n"}
          <span className="k-key">Due</span>: 2026-10-09
          {"\n"}
          <span className="k-key">Tags</span>: [agents]
          {"\n"}
          <span className="k-dim">---</span>
          {"\n"}
          <span className="k-dim">&gt; [!yellow] 💡</span>
          {"\n"}
          <span className="k-dim">&gt;</span> Every agent write is its own git commit.
          {"\n\n"}
          <span className="k-key">- [x]</span> Bundle the server
          {"\n"}
          <span className="k-key">- [ ]</span> Publish to the registry
        </pre>
      </div>
    </div>
  );
}
