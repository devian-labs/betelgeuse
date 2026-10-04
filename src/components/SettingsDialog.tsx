import {
  Bot,
  Check,
  Coffee,
  Heart,
  Download,
  Eye,
  FileText,
  Lock,
  CircleAlert,
  FolderOpen,
  GitBranch,
  GitFork,
  Info,
  Laptop,
  LoaderCircle,
  Moon,
  Palette as PaletteIcon,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { aiAccess } from "../lib/ai";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api, type AiPolicy, type GitSettings, type ImportReport, type RepoStatus, type VaultInfo } from "../lib/api";
import { LINKS, open } from "../lib/links";
import { useVault } from "../lib/vault";
import { PageIcon } from "./PageIcon";
import { ACCENTS, PALETTES, updateSettings, useSettings, type Mode, type TextSize } from "../lib/settings";
import { Logo } from "./Logo";
import { Modal } from "./Modal";

export type Section = "appearance" | "git" | "vault" | "import" | "agents" | "about";

type Props = {
  vault: VaultInfo;
  status: RepoStatus | null;
  pageCount: number;
  initial?: Section;
  onClose: () => void;
  onSwitchVault: () => void;
  onOpenAgents: () => void;
  onChanged: () => void;
  aiPolicy: AiPolicy;
  onAiPolicy: (policy: AiPolicy) => Promise<void>;
};

export function SettingsDialog(p: Props) {
  const [section, setSection] = useState<Section>(p.initial ?? "appearance");
  const nav: { id: Section; label: string; icon: ReactNode }[] = [
    { id: "appearance", label: "Appearance", icon: <PaletteIcon size={16} /> },
    { id: "git", label: "Git & sync", icon: <GitBranch size={16} /> },
    { id: "vault", label: "Workspace", icon: <FolderOpen size={16} /> },
    { id: "import", label: "Import", icon: <Download size={16} /> },
    { id: "agents", label: "AI agents", icon: <Bot size={16} /> },
    { id: "about", label: "About", icon: <Info size={16} /> },
  ];

  return (
    <Modal onClose={p.onClose} className="max-w-[860px]">
      <div className="flex h-[min(600px,80vh)]">
        <nav className="flex w-52 shrink-0 flex-col gap-px border-r border-line bg-side p-2">
          <div className="px-2 pt-1.5 pb-2 text-xs font-medium text-faint">Settings</div>
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-sm ${section === n.id ? "bg-hover font-medium text-ink" : "text-muted hover:bg-hover"}`}
            >
              <span className={section === n.id ? "text-[var(--blue)]" : "text-faint"}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="relative min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <button onClick={p.onClose} className="absolute top-4 right-4 grid size-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-muted">
            <X size={17} />
          </button>
          {section === "appearance" && <Appearance />}
          {section === "git" && <GitSection status={p.status} onChanged={p.onChanged} />}
          {section === "vault" && <VaultSection vault={p.vault} pageCount={p.pageCount} onSwitchVault={p.onSwitchVault} />}
          {section === "import" && <ImportSection onChanged={p.onChanged} />}
          {section === "agents" && <AgentsSection onOpenAgents={p.onOpenAgents} policy={p.aiPolicy} onPolicy={p.onAiPolicy} />}
          {section === "about" && <About />}
        </div>
      </div>
    </Modal>
  );
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5 border-b border-line pb-3">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-6 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-hover p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-sm ${value === o.id ? "bg-raised font-medium text-ink shadow-card" : "text-muted hover:text-ink"}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Appearance() {
  const s = useSettings();
  return (
    <>
      <Heading title="Appearance" hint="Make Betelgeuse yours. These settings are stored on this device." />

      <div className="mb-2 text-sm font-medium text-ink">Theme</div>
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { id: "system", label: "System", icon: <Laptop size={14} /> },
            { id: "light", label: "Light", icon: <Sun size={14} /> },
            { id: "dark", label: "Dark", icon: <Moon size={14} /> },
          ] as { id: Mode; label: string; icon: ReactNode }[]
        ).map((m) => (
          <button key={m.id} onClick={() => updateSettings({ mode: m.id })} className="group text-left">
            <ThemePreview mode={m.id} selected={s.mode === m.id} />
            <span className={`mt-1.5 flex items-center gap-1.5 text-sm ${s.mode === m.id ? "font-medium text-ink" : "text-muted group-hover:text-ink"}`}>
              {m.icon} {m.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 mb-2 text-sm font-medium text-ink">Palette</div>
      <div className="grid grid-cols-3 gap-3">
        {PALETTES.map((pal) => (
          <button
            key={pal.id}
            onClick={() => updateSettings({ palette: pal.id })}
            className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
              s.palette === pal.id ? "border-[var(--blue)] ring-1 ring-[var(--blue)]" : "border-line hover:bg-hover"
            }`}
          >
            <span className="flex -space-x-1.5">
              {pal.swatch.map((c, i) => (
                <span key={i} className="size-5 rounded-full border-2 border-[var(--raised)]" style={{ background: c }} />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{pal.label}</span>
              <span className="block truncate text-xs text-muted">{pal.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-2 divide-y divide-[var(--line)]">
        <Row label="Accent color" hint="Buttons, selection, checkboxes and links.">
          <div className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                title={a.label}
                onClick={() => updateSettings({ accent: a.id })}
                className="grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-[var(--raised)] transition-transform hover:scale-110"
                style={{ background: a.color, boxShadow: s.accent === a.id ? `0 0 0 2px var(--raised), 0 0 0 4px ${a.color}` : undefined }}
              >
                {s.accent === a.id && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Text size" hint="Size of page text in the editor.">
          <Segmented<TextSize>
            value={s.textSize}
            onChange={(textSize) => updateSettings({ textSize })}
            options={[
              { id: "small", label: "Small" },
              { id: "default", label: "Default" },
              { id: "large", label: "Large" },
            ]}
          />
        </Row>
      </div>
    </>
  );
}

function ThemePreview({ mode, selected }: { mode: Mode; selected: boolean }) {
  const half = (dark: boolean) => (
    <div className="flex h-full flex-1" style={{ background: dark ? "#1d1a18" : "#fbf9f7" }}>
      <div className="w-1/3" style={{ background: dark ? "#25211e" : "#f1ede9" }} />
      <div className="flex-1 space-y-1.5 p-2">
        <div className="h-1.5 w-3/4 rounded-full" style={{ background: dark ? "#5b534d" : "#cfc8c1" }} />
        <div className="h-1.5 w-1/2 rounded-full" style={{ background: dark ? "#47403b" : "#ddd7d1" }} />
        <div className="h-1.5 w-2/3 rounded-full bg-[var(--blue)] opacity-80" />
      </div>
    </div>
  );
  return (
    <div className={`flex h-20 overflow-hidden rounded-lg border ${selected ? "border-[var(--blue)] ring-1 ring-[var(--blue)]" : "border-line"}`}>
      {mode === "system" ? (
        <>
          {half(false)}
          {half(true)}
        </>
      ) : (
        half(mode === "dark")
      )}
    </div>
  );
}

const AUTOCOMMIT_OPTIONS: [number, string][] = [
  [0, "Off"],
  [5, "After 5 seconds of quiet"],
  [8, "After 8 seconds of quiet"],
  [30, "After 30 seconds of quiet"],
  [60, "After 1 minute of quiet"],
  [300, "After 5 minutes of quiet"],
];

function GitSection({ status, onChanged }: { status: RepoStatus | null; onChanged: () => void }) {
  const s = useSettings();
  const [git, setGit] = useState<GitSettings | null>(null);
  const [remote, setRemote] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    api.gitSettings().then((g) => {
      setGit(g);
      setRemote(g.remote_url ?? "");
      setName(g.user_name ?? "");
      setEmail(g.user_email ?? "");
    });
  useEffect(() => void load(), []);

  const act = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    setResult(null);
    try {
      const out = await fn();
      setResult({ ok: true, text: out || "Saved" });
      await load();
      onChanged();
    } catch (e) {
      setResult({ ok: false, text: String(e) });
    } finally {
      setBusy(null);
    }
  };

  const changes = status?.changes.length ?? 0;
  const remoteDirty = remote.trim() !== (git?.remote_url ?? "");
  const identityDirty = name.trim() !== (git?.user_name ?? "") || email.trim() !== (git?.user_email ?? "");

  return (
    <>
      <Heading title="Git & sync" hint="Your workspace is a git repository. Every change is versioned, and you can sync it to GitHub, GitLab or any git remote." />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Branch" value={git?.branch || "—"} icon={<GitBranch size={14} />} />
        <Stat label="Commits" value={git ? git.commits.toLocaleString() : "—"} />
        <Stat label="Uncommitted" value={String(changes)} tone={changes ? "warn" : "ok"} />
      </div>

      <div className="mt-4 rounded-lg border border-line p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <GitFork size={16} /> Remote repository
          {git?.remote_url ? (
            <span className="rounded-full bg-[var(--c-green-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--c-green-text)]">Connected</span>
          ) : (
            <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium text-muted">Local only</span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Create an empty repository, then paste its HTTPS or SSH URL. Betelgeuse uses your system git and its credentials (SSH keys, credential helper or
          GitHub CLI).
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={remote}
            onChange={(e) => setRemote(e.target.value)}
            placeholder="git@github.com:you/notes.git"
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-[var(--search-bg)] px-2.5 font-mono text-[13px] text-ink outline-none focus:border-[var(--blue)]"
          />
          <Button primary disabled={!remoteDirty || !!busy} onClick={() => act("remote", () => api.gitSetRemote(remote))}>
            {remote.trim() || !git?.remote_url ? "Save" : "Disconnect"}
          </Button>
        </div>
        {git?.remote_url && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={!!busy} onClick={() => act("test", api.gitTestRemote)}>
              {busy === "test" ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Test connection
            </Button>
            <Button disabled={!!busy} onClick={() => act("publish", api.gitPublish)}>
              {busy === "publish" ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />} Push
            </Button>
            <Button disabled={!!busy} onClick={() => act("sync", api.gitSync)}>
              {busy === "sync" ? <LoaderCircle size={14} className="animate-spin" /> : <GitBranch size={14} />} Sync (pull + push)
            </Button>
          </div>
        )}
        {result && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
              result.ok ? "bg-[var(--c-green-bg)] text-[var(--c-green-text)]" : "bg-[var(--c-red-bg)] text-[var(--c-red-text)]"
            }`}
          >
            {result.ok ? <Check size={14} className="mt-px shrink-0" /> : <CircleAlert size={14} className="mt-px shrink-0" />}
            <span className="font-mono break-all whitespace-pre-wrap">{result.text}</span>
          </div>
        )}
      </div>

      <div className="mt-2 divide-y divide-[var(--line)]">
        <Row label="Auto-commit" hint="Commit your edits automatically once you stop typing. Agent edits are always committed individually.">
          <select
            value={s.autocommit}
            onChange={(e) => updateSettings({ autocommit: Number(e.target.value) })}
            className="h-8 rounded-md border border-line bg-[var(--search-bg)] px-2 text-sm text-ink outline-none"
          >
            {AUTOCOMMIT_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Row>
        <div className="py-3.5">
          <div className="text-sm font-medium text-ink">Commit author</div>
          <div className="mt-0.5 text-xs text-muted">Used for commits in this workspace only. Leave empty to use your global git config.</div>
          <div className="mt-2.5 flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-[var(--search-bg)] px-2.5 text-sm text-ink outline-none focus:border-[var(--blue)]" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-[var(--search-bg)] px-2.5 text-sm text-ink outline-none focus:border-[var(--blue)]" />
            <Button primary disabled={!identityDirty || !!busy} onClick={() => act("identity", () => api.gitSetIdentity(name, email))}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: string; icon?: ReactNode; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border border-line px-3.5 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={`mt-1 flex items-center gap-1.5 truncate text-[15px] font-semibold ${
          tone === "warn" ? "text-[var(--c-orange-text)]" : tone === "ok" ? "text-[var(--c-green-text)]" : "text-ink"
        }`}
      >
        {icon}
        {value}
      </div>
    </div>
  );
}

function Button({ children, onClick, primary, disabled }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-40 ${
        primary ? "bg-[var(--blue)] text-white enabled:hover:brightness-110" : "border border-line text-ink enabled:hover:bg-hover"
      }`}
    >
      {children}
    </button>
  );
}

function VaultSection({ vault, pageCount, onSwitchVault }: { vault: VaultInfo; pageCount: number; onSwitchVault: () => void }) {
  return (
    <>
      <Heading title="Workspace" hint="A workspace is a folder of Markdown files. Any editor, Obsidian included, can open it." />
      <div className="rounded-lg border border-line p-4">
        <div className="flex items-center gap-3">
          <Logo className="size-8" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{vault.name}</div>
            <div className="truncate font-mono text-xs text-muted" title={vault.path}>
              {vault.path}
            </div>
          </div>
          <Button onClick={onSwitchVault}>
            <FolderOpen size={14} /> Open another…
          </Button>
        </div>
      </div>
      <div className="mt-2 divide-y divide-[var(--line)]">
        <Row label="Pages" hint="Including database rows.">
          <span className="text-sm text-muted">{pageCount.toLocaleString()}</span>
        </Row>
        <Row label="Uploaded images" hint={<>Custom icons are stored in the workspace's hidden <code className="font-mono">.assets</code> folder and versioned in git.</>}>
          <span className="text-sm text-muted">.assets/</span>
        </Row>
      </div>
    </>
  );
}

function AgentsSection({ onOpenAgents, policy, onPolicy }: { onOpenAgents: () => void; policy: AiPolicy; onPolicy: (p: AiPolicy) => Promise<void> }) {
  const { notes, openPage, setPageAi } = useVault();
  const explicit = notes.filter((n) => (policy === "all" ? n.ai === false : n.ai === true));
  const visibleCount = notes.filter((n) => aiAccess(n.path, notes, policy).visible).length;

  return (
    <>
      <Heading title="AI agents" hint="Betelgeuse includes an MCP server, so Claude, Cursor and other agents can read and edit your workspace." />
      <div className="rounded-lg border border-line p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-[var(--blue)]">
            <Bot size={20} />
          </span>
          <div className="flex-1 text-sm text-muted">Every write an agent makes is its own git commit, so you can review or undo it from page history.</div>
          <Button primary onClick={onOpenAgents}>
            Connect agents
          </Button>
        </div>
      </div>

      <div className="mt-6 mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">What agents can see</span>
        <span className="text-xs text-muted">
          {visibleCount} of {notes.length} pages visible
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["all", "All pages, except ones I hide", "Good default. Hide private pages one by one.", <Eye size={16} key="e" />],
            ["shared", "Only pages I share", "Nothing is visible until you share it. Pages agents create are shared.", <Lock size={16} key="l" />],
          ] as [AiPolicy, string, string, ReactNode][]
        ).map(([id, label, hint, icon]) => (
          <button
            key={id}
            onClick={() => onPolicy(id)}
            className={`rounded-lg border p-3 text-left transition-colors ${policy === id ? "border-[var(--blue)] ring-1 ring-[var(--blue)]" : "border-line hover:bg-hover"}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <span className={policy === id ? "text-[var(--blue)]" : "text-muted"}>{icon}</span>
              {label}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">{hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-line">
        <div className="border-b border-line px-3.5 py-2 text-xs font-medium text-muted">
          {policy === "all" ? "Hidden from agents" : "Shared with agents"} · {explicit.length}
        </div>
        {explicit.length === 0 ? (
          <p className="px-3.5 py-3 text-sm text-muted">
            {policy === "all"
              ? "No hidden pages. Use “Hide from AI agents” in a page’s ••• menu or the sidebar."
              : "Nothing shared yet. Use “Share with AI agents” in a page’s ••• menu or the sidebar."}
          </p>
        ) : (
          <ul className="max-h-56 overflow-y-auto p-1">
            {explicit.map((n) => (
              <li key={n.path} className="group flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-hover">
                {n.icon ? <PageIcon icon={n.icon} size={16} /> : <FileText size={15} className="text-faint" />}
                <button onClick={() => openPage(n.path)} className="min-w-0 flex-1 truncate text-left text-sm text-ink">
                  {n.title}
                  {n.path.includes("/") && <span className="ml-2 text-xs text-faint">{n.path.slice(0, n.path.lastIndexOf("/"))}</span>}
                </button>
                <span className="text-[11px] text-faint">{policy === "all" ? "and its sub-pages" : "with sub-pages"}</span>
                <button onClick={() => setPageAi(n.path, policy === "all")} className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:text-ink">
                  {policy === "all" ? "Unhide" : "Unshare"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 flex gap-1.5 text-xs leading-relaxed text-faint">
        <Info size={13} className="mt-0.5 shrink-0" />
        This applies to agents using the Betelgeuse MCP server. An agent you give direct access to the workspace folder can still read the files.
      </p>
    </>
  );
}

function ImportSection({ onChanged }: { onChanged: () => void }) {
  const { openPage, refresh } = useVault();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: true; report: ImportReport } | { ok: false; error: string } | null>(null);

  const run = async (source: "notion" | "obsidian", directory: boolean) => {
    const picked = await openDialog(
      directory
        ? { directory: true, title: source === "notion" ? "Choose the unzipped Notion export" : "Choose your Obsidian vault folder" }
        : { title: "Choose the Notion export (.zip)", filters: [{ name: "Notion export", extensions: ["zip"] }] },
    );
    if (typeof picked !== "string") return;
    setBusy(source);
    setResult(null);
    try {
      const report = await api.importPages(source, picked);
      setResult({ ok: true, report });
      await refresh();
      onChanged();
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Heading title="Import" hint="Bring your pages in. Everything lands under one new page, as plain Markdown, and is committed to git as a single change you can undo." />

      <div className="space-y-3">
        <div className="rounded-lg border border-line p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-hover text-lg font-bold text-ink">N</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">Notion</div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs leading-relaxed text-muted">
                <li>
                  In Notion, open <b>Settings → General → Export all workspace content</b> (or a page’s <b>••• → Export</b>).
                </li>
                <li>
                  Choose <b>Markdown &amp; CSV</b> and turn on <b>Include subpages</b>.
                </li>
                <li>Pick the downloaded .zip here. Databases become Betelgeuse databases with their columns and values.</li>
              </ol>
            </div>
          </div>
          <div className="mt-3 flex gap-2 pl-12">
            <Button primary disabled={!!busy} onClick={() => run("notion", false)}>
              {busy === "notion" ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />} Choose .zip…
            </Button>
            <Button disabled={!!busy} onClick={() => run("notion", true)}>
              <FolderOpen size={14} /> Unzipped folder…
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-line p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-hover text-lg text-ink">◆</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">Obsidian</div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Pick your vault folder. Pages, folders and [[links]] carry over as they are; attachments and image embeds are copied in, and callouts get
                matching colours and icons. Settings in .obsidian are skipped.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2 pl-12">
            <Button primary disabled={!!busy} onClick={() => run("obsidian", true)}>
              {busy === "obsidian" ? <LoaderCircle size={14} className="animate-spin" /> : <FolderOpen size={14} />} Choose vault folder…
            </Button>
          </div>
        </div>
      </div>

      {result && (
        <div
          className={`mt-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm ${
            result.ok ? "bg-[var(--c-green-bg)] text-[var(--c-green-text)]" : "bg-[var(--c-red-bg)] text-[var(--c-red-text)]"
          }`}
        >
          {result.ok ? <Check size={16} className="mt-0.5 shrink-0" /> : <CircleAlert size={16} className="mt-0.5 shrink-0" />}
          <div className="min-w-0 flex-1">
            {result.ok ? (
              <>
                Imported {result.report.pages} page{result.report.pages === 1 ? "" : "s"}
                {result.report.databases > 0 && `, ${result.report.databases} database${result.report.databases === 1 ? "" : "s"}`}
                {result.report.assets > 0 && ` and ${result.report.assets} file${result.report.assets === 1 ? "" : "s"}`} into “
                {result.report.root.replace(/\.md$/, "")}”.
                {result.report.skipped.length > 0 && <div className="mt-1 text-xs">Skipped (unreadable): {result.report.skipped.join(", ")}</div>}
              </>
            ) : (
              <span className="break-words">{result.error}</span>
            )}
          </div>
          {result.ok && (
            <button onClick={() => openPage(result.report.root)} className="shrink-0 rounded-md bg-raised px-2 py-1 text-xs font-medium text-ink hover:bg-hover">
              Open
            </button>
          )}
        </div>
      )}
    </>
  );
}

function About() {
  return (
    <>
      <Heading title="About" />
      <div className="flex items-center gap-4">
        <Logo className="size-14" />
        <div>
          <div className="text-lg font-semibold text-ink">Betelgeuse</div>
          <div className="text-sm text-muted">Version 0.1.0 · Free and open source (MIT)</div>
          <div className="mt-1 text-xs text-faint">Plain Markdown + git workspace · Tauri · React · Tiptap · MCP</div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => open(LINKS.repo)}>
          <GitFork size={14} /> Source code
        </Button>
        <Button onClick={() => open(LINKS.issues)}>
          <CircleAlert size={14} /> Report an issue
        </Button>
        <Button onClick={() => open(LINKS.website)}>
          <Info size={14} /> Website
        </Button>
      </div>
      <div className="mt-6 rounded-lg border border-line p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--c-pink-bg)] text-[var(--c-pink-text)]">
            <Heart size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink">Support Betelgeuse</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Betelgeuse is built in the open, without ads or tracking. Sponsorships pay for things like an Apple developer account, so the app can be signed and
              installed with a double-click.
            </p>
            <div className="mt-3 flex gap-2">
              <Button primary onClick={() => open(LINKS.sponsor)}>
                <Heart size={14} /> Sponsor on GitHub
              </Button>
              <Button onClick={() => open(LINKS.kofi)}>
                <Coffee size={14} /> One-off tip on Ko-fi
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
