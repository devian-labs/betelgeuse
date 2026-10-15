import { getVersion } from "@tauri-apps/api/app";
import { Bug, Check, ChevronRight, Cloud, GitFork, Globe, Heart, Laptop, Monitor, Moon, MoonStar, Sun, Trash2 } from "lucide-react";
import { timeAgo } from "@desktop/lib/time";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@desktop/components/Logo";
import { LINKS, open } from "@desktop/lib/links";
import { ACCENTS, PALETTES, updateSettings, useSettings, type Mode, type TextSize } from "@desktop/lib/settings";
import { useVault } from "@desktop/lib/vault";
import { useMobile } from "./mobile";
import { PluginSettingsRows } from "./plugins";
import { TopBar } from "./ui";

/** Settings → Appearance, Workspace and About, as in the desktop app, as one scrolling list. */
export function SettingsScreen() {
  const s = useSettings();
  const { notes } = useVault();
  const m = useMobile();
  const [version, setVersion] = useState("");
  useEffect(() => void getVersion().then(setVersion).catch(() => {}), []);

  return (
    <div className="screen-in safe-top flex h-full flex-col bg-side">
      <TopBar onBack={m.back} title="Settings" />
      <main className="safe-bottom min-h-0 flex-1 overflow-y-auto px-4 pb-10">
        <Group label="Theme">
          <div className="grid grid-cols-4 gap-2 p-3">
            {(
              [
                { id: "system", label: "System", icon: <Laptop size={14} /> },
                { id: "light", label: "Light", icon: <Sun size={14} /> },
                { id: "dark", label: "Dark", icon: <Moon size={14} /> },
                { id: "black", label: "Black", icon: <MoonStar size={14} /> },
              ] as { id: Mode; label: string; icon: ReactNode }[]
            ).map((mode) => (
              <button key={mode.id} onClick={() => updateSettings({ mode: mode.id })} className="text-left">
                <ThemePreview mode={mode.id} selected={s.mode === mode.id} />
                <span className={`mt-1.5 flex items-center justify-center gap-1 text-[13px] ${s.mode === mode.id ? "font-medium text-ink" : "text-muted"}`}>
                  {mode.icon} {mode.label}
                </span>
              </button>
            ))}
          </div>
        </Group>

        <Group label="Palette">
          {PALETTES.map((pal) => (
            <button key={pal.id} onClick={() => updateSettings({ palette: pal.id })} className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-hover">
              <span className="flex -space-x-1.5">
                {pal.swatch.map((c, i) => (
                  <span key={i} className="size-6 rounded-full border-2 border-[var(--raised)]" style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-ink">{pal.label}</span>
                <span className="block truncate text-[13px] text-muted">{pal.hint}</span>
              </span>
              {s.palette === pal.id && <Check size={19} className="text-[var(--blue)]" />}
            </button>
          ))}
        </Group>

        <Group label="Accent color">
          <div className="flex flex-wrap justify-between gap-2 px-4 py-3.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                aria-label={a.label}
                onClick={() => updateSettings({ accent: a.id })}
                className="grid size-9 place-items-center rounded-full"
                style={{ background: a.color, boxShadow: s.accent === a.id ? `0 0 0 2px var(--raised), 0 0 0 4px ${a.color}` : undefined }}
              >
                {s.accent === a.id && <Check size={16} className="text-white" />}
              </button>
            ))}
          </div>
        </Group>

        <Group label="Text">
          <Line label="Text size">
            <Segmented<TextSize>
              value={s.textSize}
              onChange={(textSize) => updateSettings({ textSize })}
              options={[
                { id: "small", label: "Small" },
                { id: "default", label: "Default" },
                { id: "large", label: "Large" },
              ]}
            />
          </Line>
          <Line label="Recent pages on Home">
            <Segmented<"3" | "5" | "8">
              value={String(s.recentRows) as "3" | "5" | "8"}
              onChange={(v) => updateSettings({ recentRows: Number(v) })}
              options={[
                { id: "3", label: "3" },
                { id: "5", label: "5" },
                { id: "8", label: "8" },
              ]}
            />
          </Line>
        </Group>

        <Group label="Plugins">
          <PluginSettingsRows />
        </Group>

        <Group label="Sync">
          <button onClick={() => m.go({ name: "sync" })} className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-hover">
            <Cloud size={19} className="text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] text-ink">{m.sync.status?.configured ? "Git sync" : "Set up sync"}</span>
              <span className="block truncate text-[13px] text-muted">
                {m.sync.status?.configured
                  ? m.sync.error
                    ? "Last sync failed"
                    : m.sync.status.last_sync
                      ? `Synced ${timeAgo(m.sync.status.last_sync / 1000)}`
                      : "Not synced yet"
                  : "With the repository your desktop workspace uses"}
              </span>
            </span>
            <ChevronRight size={18} className="text-faint" />
          </button>
        </Group>

        <Group label="Workspace" hint="Your pages are Markdown files, kept on this phone.">
          <Line label="Pages">
            <span className="text-[15px] text-muted">{notes.length.toLocaleString()}</span>
          </Line>
          <button onClick={() => m.go({ name: "trash" })} className="flex min-h-12 w-full items-center gap-3 px-4 text-left active:bg-hover">
            <Trash2 size={18} className="text-muted" />
            <span className="flex-1 text-[15px] text-ink">Trash</span>
            <ChevronRight size={18} className="text-faint" />
          </button>
        </Group>

        <Group label="On the desktop">
          <div className="flex gap-3 px-4 py-3.5">
            <Monitor size={20} className="mt-0.5 shrink-0 text-muted" />
            <p className="text-[14px] leading-relaxed text-muted">
              Plugins and AI agents over MCP are part of the Betelgeuse desktop app for macOS, Windows and Linux.
            </p>
          </div>
        </Group>

        <Group label="About">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Logo className="size-9" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-ink">Betelgeuse</div>
              <div className="text-[13px] text-muted">{version ? `Version ${version} · ` : ""}MIT License</div>
            </div>
          </div>
          <LinkRow icon={<Globe size={18} />} label="Website" onClick={() => open(LINKS.website)} />
          <LinkRow icon={<GitFork size={18} />} label="Source code" onClick={() => open(LINKS.repo)} />
          <LinkRow icon={<Bug size={18} />} label="Report an issue" onClick={() => open(LINKS.issues)} />
          <LinkRow icon={<Heart size={18} />} label="Support Betelgeuse" onClick={() => open(LINKS.sponsor)} />
        </Group>
      </main>
    </div>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="px-1 pb-1.5 text-xs font-medium text-faint">{label}</h2>
      <div className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-line bg-raised">{children}</div>
      {hint && <p className="px-1 pt-1.5 text-xs text-faint">{hint}</p>}
    </section>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1 text-[15px] text-ink">{label}</span>
      {children}
    </div>
  );
}

function LinkRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-h-12 w-full items-center gap-3 px-4 text-left active:bg-hover">
      <span className="text-muted">{icon}</span>
      <span className="flex-1 text-[15px] text-ink">{label}</span>
      <ChevronRight size={18} className="text-faint" />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 rounded-lg bg-hover p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`h-8 rounded-md px-3 text-[14px] ${value === o.id ? "bg-raised font-medium text-ink shadow-card" : "text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A miniature of the app in a theme (the desktop Settings shows the same). */
function ThemePreview({ mode, selected }: { mode: Mode; selected: boolean }) {
  const half = (tone: "light" | "dark" | "black") => (
    <div className="flex h-full flex-1" style={{ background: { light: "#fbf9f7", dark: "#1d1a18", black: "#000000" }[tone] }}>
      <div className="flex-1 space-y-1 p-1.5">
        <div className="h-1 w-3/4 rounded-full" style={{ background: { light: "#cfc8c1", dark: "#5b534d", black: "#5a5a5a" }[tone] }} />
        <div className="h-1 w-1/2 rounded-full" style={{ background: { light: "#ddd7d1", dark: "#47403b", black: "#3a3a3a" }[tone] }} />
        <div className="h-1 w-2/3 rounded-full bg-[var(--blue)] opacity-80" />
      </div>
    </div>
  );
  return (
    <div className={`flex h-14 overflow-hidden rounded-lg border ${selected ? "border-[var(--blue)] ring-1 ring-[var(--blue)]" : "border-line"}`}>
      {mode === "system" ? (
        <>
          {half("light")}
          {half("dark")}
        </>
      ) : (
        half(mode)
      )}
    </div>
  );
}
