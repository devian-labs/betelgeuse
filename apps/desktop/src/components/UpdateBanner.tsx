import { useEffect, useState } from "react";
import { ArrowDownToLine, LoaderCircle, X } from "lucide-react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Look for a new release this often while the app stays open. */
const EVERY = 6 * 60 * 60_000;

type State =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; done: number; total: number | null }
  | { kind: "installing"; update: Update }
  | { kind: "failed"; update: Update; message: string };

/**
 * Says when a newer Betelgeuse is out (from the latest GitHub release); one click downloads it,
 * installs it over this one and restarts. Checks quietly: offline or no release means no banner.
 */
export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) return; // a dev build is never older than a release
    let stop = false;
    const look = async () => {
      const update = await check().catch(() => null);
      if (!stop && update) setState((s) => (s.kind === "idle" || s.kind === "available" ? { kind: "available", update } : s));
    };
    void look();
    const timer = window.setInterval(look, EVERY);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  if (state.kind === "idle" || dismissed === state.update.version) return null;
  const { update } = state;

  const install = async () => {
    setState({ kind: "downloading", update, done: 0, total: null });
    let done = 0;
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") setState({ kind: "downloading", update, done: 0, total: e.data.contentLength ?? null });
        else if (e.event === "Progress") {
          done += e.data.chunkLength;
          setState((s) => (s.kind === "downloading" ? { ...s, done } : s));
        } else if (e.event === "Finished") setState({ kind: "installing", update });
      });
      await relaunch();
    } catch (e) {
      setState({ kind: "failed", update, message: String(e) });
    }
  };

  const busy = state.kind === "downloading" || state.kind === "installing";
  const percent = state.kind === "downloading" && state.total ? Math.min(100, (state.done / state.total) * 100) : null;
  const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

  return (
    <div className="mx-2 mb-2 rounded-lg border border-line bg-raised p-2.5 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-[var(--blue)]">
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowDownToLine size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">
            {state.kind === "installing" ? "Installing… Betelgeuse will restart" : state.kind === "downloading" ? `Downloading ${update.version}` : `Betelgeuse ${update.version} is out`}
          </div>
          <div className="text-xs text-muted">
            {state.kind === "downloading"
              ? percent !== null
                ? `${Math.floor(percent)}% · ${mb(state.done)} of ${mb(state.total!)}`
                : mb(state.done)
              : state.kind === "failed"
                ? `Update failed: ${state.message}`
                : state.kind === "available"
                  ? "Download, install and restart in one click."
                  : ""}
          </div>
        </div>
        {!busy && (
          <button onClick={() => setDismissed(update.version)} title="Not now" className="grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-hover hover:text-muted">
            <X size={13} />
          </button>
        )}
      </div>
      {state.kind === "downloading" && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-hover">
          <div className={`h-full rounded-full bg-[var(--blue)] transition-[width] duration-300 ${percent === null ? "w-1/3 animate-pulse" : ""}`} style={percent === null ? undefined : { width: `${percent}%` }} />
        </div>
      )}
      {(state.kind === "available" || state.kind === "failed") && (
        <button onClick={install} className="mt-2 h-7 w-full rounded-md bg-[var(--blue)] text-xs font-semibold text-white hover:opacity-90">
          {state.kind === "failed" ? "Try again" : "Update and restart"}
        </button>
      )}
    </div>
  );
}
