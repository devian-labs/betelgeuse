import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Cloud,
  Eye,
  EyeOff,
  GitBranch,
  Info,
  KeyRound,
  Link2,
  LoaderCircle,
  Lock,
  Mail,
  PenLine,
  RefreshCw,
  User,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { open } from "@desktop/lib/links";
import { timeAgo } from "@desktop/lib/time";
import { useVault } from "@desktop/lib/vault";
import { useMobile } from "./mobile";
import { progressLabel, syncApi, useSyncProgress, type SyncProgress } from "./sync";
import { Confirm, TopBar } from "./ui";

/** Connects the phone to the workspace's git repository, or shows how syncing is going. */
export function SyncScreen() {
  const m = useMobile();
  const { status } = m.sync;
  return (
    <div className="screen-in safe-top flex h-full flex-col bg-side">
      <TopBar onBack={m.back} title="Sync" />
      {status?.configured ? (
        <main className="safe-bottom min-h-0 flex-1 overflow-y-auto px-4 pb-10">
          <Connected />
        </main>
      ) : (
        <Setup />
      )}
    </div>
  );
}

function Connected() {
  const m = useMobile();
  const { status, syncing, error } = m.sync;
  const [disconnecting, setDisconnecting] = useState(false);
  const progress = useSyncProgress(syncing);
  if (!status) return null;
  return (
    <>
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-raised">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className={`grid size-10 shrink-0 place-items-center rounded-full ${error ? "bg-[var(--c-red-bg)] text-[var(--c-red-text)]" : "bg-accent-soft text-[var(--blue)]"}`}>
            {error ? <CircleAlert size={20} /> : <Cloud size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-ink">{syncing ? (progress ? progressLabel(progress) : "Syncing…") : error ? "Last sync failed" : "Synced"}</div>
            <div className="text-[13px] text-muted">
              {status.last_sync ? `Last synced ${timeAgo(status.last_sync / 1000)}` : "Not synced yet"}
              {status.changes > 0 && ` · ${status.changes} change${status.changes === 1 ? "" : "s"} to send`}
            </div>
          </div>
        </div>
        {syncing && progress && <ProgressBar progress={progress} className="mx-4 mb-4" />}
        {error && <p className="border-t border-line px-4 py-3 text-[13px] leading-relaxed text-[var(--c-red-text)]">{error}</p>}
        <button
          onClick={() => m.sync.sync(true)}
          disabled={syncing}
          className="flex h-12 w-full items-center justify-center gap-2 border-t border-line text-[15px] font-medium text-[var(--blue)] active:bg-hover disabled:opacity-60"
        >
          <RefreshCw size={17} className={syncing ? "animate-spin" : ""} /> Sync now
        </button>
      </div>

      <Group label="Repository">
        <Line label="Address">
          <span className="min-w-0 truncate text-[14px] text-muted">{status.url?.replace(/^https:\/\//, "")}</span>
        </Line>
        {status.git && (
          <>
            <Line label="Branch">
              <span className="flex items-center gap-1 text-[14px] text-muted">
                <GitBranch size={14} /> {status.git.branch}
              </span>
            </Line>
            <Line label="Versions saved">
              <span className="text-[14px] text-muted">{status.git.commits.toLocaleString()}</span>
            </Line>
            {(status.git.user_name || status.git.user_email) && (
              <Line label="Changes signed as">
                <span className="min-w-0 truncate text-[14px] text-muted">{status.git.user_name ?? status.git.user_email}</span>
              </Line>
            )}
          </>
        )}
      </Group>
      <p className="px-1 pt-2 text-xs leading-relaxed text-faint">
        Syncs when the app opens, when you come back to it and when you leave it, soon after you stop editing, and every couple of minutes while it's open. A page changed on two devices keeps both versions.
      </p>

      <button onClick={() => setDisconnecting(true)} className="mt-6 h-12 w-full rounded-2xl border border-line bg-raised text-[15px] font-medium text-[var(--c-red-text)] active:bg-hover">
        Stop syncing
      </button>
      {disconnecting && (
        <Confirm
          title="Stop syncing?"
          message="Your pages stay on this phone, but changes no longer go to or come from the repository. The access token is forgotten."
          action="Stop syncing"
          onClose={() => setDisconnecting(false)}
          onConfirm={async () => {
            await syncApi.disconnect();
            await m.sync.reload();
          }}
        />
      )}
    </>
  );
}

/** Recognises the repository typed in, to confirm it and to link to the right token page. */
function parseRepo(raw: string): { host: string; repo: string; provider: string; tokenUrl?: string } | null {
  const url = raw.trim().replace(/^ssh:\/\//, "");
  const m = /^(?:https:\/\/|git@)?([^/:\s]+\.[^/:\s]+)[/:]([^\s]+?)(?:\.git)?\/?$/.exec(url);
  if (!m) return null;
  const [, host, repo] = m;
  if (host === "github.com") return { host, repo, provider: "GitHub", tokenUrl: "https://github.com/settings/personal-access-tokens/new" };
  if (host === "gitlab.com") return { host, repo, provider: "GitLab", tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens" };
  if (host === "bitbucket.org") return { host, repo, provider: "Bitbucket" };
  return { host, repo, provider: host };
}

function Setup() {
  const m = useMobile();
  const { refresh } = useVault();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useSyncProgress(busy);
  useEffect(() => {
    const git = m.sync.status?.git;
    if (git?.user_name) setName(git.user_name);
    if (git?.user_email) setEmail(git.user_email);
  }, [m.sync.status]);

  const repo = parseRepo(url);
  const badUrl = url.trim().length > 8 && !repo;
  const ready = !!repo && !!token.trim() && !busy;

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      // "github.com/you/notes" is fine too: it's the https address without its scheme.
      const address = /^(https|ssh|file):\/\/|^git@/.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
      const message = await syncApi.connect({ url: address, username, token, name, email });
      await Promise.all([m.sync.reload(), refresh()]);
      m.toast({ message });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const typed = { autoCapitalize: "off", autoCorrect: "off", spellCheck: false } as const;

  return (
    <>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="flex items-start gap-3.5 px-1 pt-3 pb-1">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-[var(--blue)]">
            <Cloud size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[18px] leading-tight font-semibold text-ink">Sync with your desktop</h2>
            <p className="mt-1 text-[14px] leading-snug text-muted">Connect the git repository your workspace already syncs with.</p>
          </div>
        </div>

        <Card>
          <Field
            icon={<Link2 size={17} />}
            label="Repository"
            hint={
              badUrl ? (
                <span className="flex items-center gap-1 text-[var(--c-red-text)]">
                  <CircleAlert size={13} /> Paste the address from the repository's Code button
                </span>
              ) : repo ? (
                <span className="flex min-w-0 items-center gap-1 text-muted">
                  <Check size={13} className="shrink-0 text-[var(--c-green-text)]" />
                  <span className="truncate">
                    {repo.provider} · {repo.repo}
                  </span>
                </span>
              ) : undefined
            }
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="github.com/you/notes"
              inputMode="url"
              enterKeyHint="next"
              {...typed}
              className="w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
            />
          </Field>
          <Field
            icon={<KeyRound size={17} />}
            label="Access token"
            action={
              <button type="button" onClick={() => setShowToken((v) => !v)} aria-label={showToken ? "Hide token" : "Show token"} className="grid size-9 place-items-center rounded-full text-faint active:bg-hover">
                {showToken ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            }
          >
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type={showToken ? "text" : "password"}
              placeholder="Paste your token"
              enterKeyHint="go"
              onKeyDown={(e) => e.key === "Enter" && ready && connect()}
              {...typed}
              className="w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
            />
          </Field>
        </Card>

        <div className="flex items-start gap-2.5 px-1 pt-3 text-[13px] leading-snug text-muted">
          <Info size={15} className="mt-px shrink-0 text-faint" />
          <span>
            Give the token read and write access to this repository's contents.{" "}
            {repo?.tokenUrl && (
              <button onClick={() => open(repo.tokenUrl!)} className="inline-flex items-center gap-0.5 font-medium text-[var(--blue)]">
                Create one on {repo.provider} <ArrowUpRight size={13} />
              </button>
            )}
          </span>
        </div>

        <button onClick={() => setMore((v) => !v)} aria-expanded={more} className="mt-5 flex h-10 w-full items-center gap-1.5 px-1 text-[14px] font-medium text-muted">
          <ChevronRight size={16} className={`transition-transform ${more ? "rotate-90" : ""}`} />
          More options
        </button>
        {more && (
          <Card>
            <Field icon={<User size={17} />} label="Username" hint="Only if your host asks for one (GitHub doesn't)">
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Optional" {...typed} className="w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" />
            </Field>
            <Field icon={<PenLine size={17} />} label="Sign changes as">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" />
            </Field>
            <Field icon={<Mail size={17} />} label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" inputMode="email" {...typed} className="w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" />
            </Field>
          </Card>
        )}

        {error && (
          <div className="mt-4 flex gap-2.5 rounded-2xl bg-[var(--c-red-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--c-red-text)]">
            <CircleAlert size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </main>

      <footer className="safe-bottom shrink-0 border-t border-line bg-side px-4 pt-3">
        <button
          onClick={connect}
          disabled={!ready}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--blue)] text-[16px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-35"
        >
          {busy && <LoaderCircle size={18} className="animate-spin" />}
          {busy ? (progress ? progressLabel(progress) : "Connecting…") : "Connect"}
        </button>
        {busy && progress && <ProgressBar progress={progress} className="mt-2.5" />}
        <p className="flex items-center justify-center gap-1.5 pt-2.5 pb-3 text-center text-[12px] text-faint">
          <Lock size={12} /> Your token stays on this phone
        </p>
      </footer>
    </>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-line bg-raised">{children}</div>;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="px-1 pb-1.5 text-xs font-medium text-faint">{label}</h3>
      <div className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-line bg-raised">{children}</div>
    </section>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2">
      <span className="shrink-0 text-[15px] text-ink">{label}</span>
      <span className="flex min-w-0 flex-1 justify-end">{children}</span>
    </div>
  );
}

function Field({ icon, label, hint, action, children }: { icon: ReactNode; label: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex items-center gap-3 py-2.5 pr-2 pl-4">
      <span className="shrink-0 text-faint">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-faint">{label}</span>
        <span className="block">{children}</span>
        {hint && <span className="block pt-1 text-[12px] text-faint">{hint}</span>}
      </span>
      {action}
    </label>
  );
}

/** A thin bar for how far the current transfer phase has got. */
function ProgressBar({ progress, className = "" }: { progress: SyncProgress; className?: string }) {
  const percent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-hover ${className}`}>
      <div className="h-full rounded-full bg-[var(--blue)] transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
}
