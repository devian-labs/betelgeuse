import { Bot, History, RotateCcw, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Commit } from "../lib/api";
import { timeAgo } from "../lib/time";

const isAgent = (c: Commit) => c.subject.startsWith("mcp:") || /\bmcp\b|agent/i.test(c.author);

export function HistoryPanel({
  path,
  refreshKey,
  onRestore,
  onClose,
}: {
  path: string;
  refreshKey: number;
  onRestore: (content: string, commit: Commit) => void;
  onClose: () => void;
}) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [selected, setSelected] = useState<Commit | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    api.gitLog(path, 100).then(setCommits).catch(() => setCommits([]));
  }, [path, refreshKey]);

  useEffect(() => {
    setPreview(null);
    if (selected) api.gitShow(selected.hash, path).then(setPreview).catch((e) => setPreview(`Could not load this version: ${e}`));
  }, [selected, path]);

  useEffect(() => setSelected(null), [path]);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-line bg-surface">
      <div data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 px-4">
        <History size={15} className="text-faint" />
        <span className="flex-1 text-sm font-medium text-ink">Page history</span>
        <button onClick={onClose} className="rounded p-1 text-faint hover:bg-hover">
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {commits?.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted">No commits yet. Changes are committed after a few seconds of quiet.</p>
        )}
        {commits?.map((c) => (
          <button
            key={c.hash}
            onClick={() => setSelected(selected?.hash === c.hash ? null : c)}
            className={`flex w-full gap-2.5 rounded-md px-2 py-2 text-left ${selected?.hash === c.hash ? "bg-hover" : "hover:bg-hover"}`}
          >
            <span
              className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
                isAgent(c) ? "bg-accent-soft text-accent" : "bg-hover text-muted"
              }`}
            >
              {isAgent(c) ? <Bot size={13} /> : <User size={13} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm text-ink">{c.subject.replace(/^mcp:\s*/, "")}</span>
              <span className="block truncate text-xs text-muted">
                {c.author} · {timeAgo(c.timestamp)} · <span className="font-mono">{c.short}</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="flex max-h-[55%] flex-col border-t border-line">
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="flex-1 truncate text-xs text-muted">
              Version from {timeAgo(selected.timestamp)}
            </span>
            <button
              disabled={preview === null}
              onClick={() => preview !== null && onRestore(preview, selected)}
              className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <RotateCcw size={12} /> Restore
            </button>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto px-4 pb-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-muted">
            {preview ?? "Loading…"}
          </pre>
        </div>
      )}
    </aside>
  );
}
