import { FolderInput, Link2, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseSchema, type Property } from "../database/model";
import { api, type Pipeline } from "../lib/api";
import { joinNote, patchFrontmatter, splitNote } from "../lib/frontmatter";
import { channelNoise, homeFolder, loadProductions, savePipeline, suggestFolders } from "../lib/pipeline";
import { useStudio } from "../lib/studio";
import { useVault } from "../lib/vault";

/** Settings → Creator Studio → Pipeline: which database holds the productions, and where their folders go. */
export function PipelineSettings() {
  const { status, version } = useStudio();
  const { notes } = useVault();
  const pipeline = status?.settings.pipeline;
  const [props, setProps] = useState<Property[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [template, setTemplate] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const databases = useMemo(() => notes.filter((n) => n.kind === "database").sort((a, b) => a.path.localeCompare(b.path)), [notes]);

  useEffect(() => {
    if (!pipeline?.database) return setProps([]);
    api
      .readNote(pipeline.database)
      .then((t) => setProps(parseSchema(splitNote(t).body).properties))
      .catch(() => setProps([]));
  }, [pipeline?.database]);
  useEffect(() => {
    api.libraryFolders().then((f) => setFolders(f.map(([id]) => id)));
  }, [version]);

  if (!pipeline) return null;
  const choices = props.filter((p) => p.type === "select" || p.type === "status");
  const channelProp = props.find((p) => p.name === pipeline.channelProperty);
  const channels = channelProp?.options?.map((o) => o.name) ?? [];
  const save = (patch: Partial<Pipeline>) => savePipeline(patch);

  /** Links productions without a folder to the folder that clearly matches their title. */
  const linkAll = async () => {
    setLinking(true);
    setReport(null);
    try {
      const all = (await api.libraryFolders()).map(([id]) => id);
      const productions = await loadProductions(pipeline);
      const missing = productions.filter((p) => !p.folder);
      let linked = 0;
      for (const p of missing) {
        const home = homeFolder(pipeline, p.channel);
        const scope = home ? all.filter((id) => id.startsWith(`${home}/`)) : all;
        const [best, next] = suggestFolders(p.title, scope, 0.75, channelNoise(pipeline, p.channel));
        // Only when there's one clear winner.
        if (!best || (next && next.score === best.score)) continue;
        const text = await api.readNote(p.path);
        const { frontmatter, body } = splitNote(text);
        await api.writeNote(p.path, joinNote(patchFrontmatter(frontmatter, { [pipeline.folderProperty]: best.id }), body));
        linked++;
      }
      setReport(missing.length ? `Linked ${linked} of ${missing.length} productions without a folder.` : "Every production already has a folder.");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="mt-6">
      <h3 className="mb-1 text-sm font-semibold text-ink">Pipeline</h3>
      <p className="mb-3 text-xs text-muted">
        Each row of the pipeline database is a production (a video, a post). Its page shows an Assets panel with the files in its project folder.
      </p>
      <div className="divide-y divide-[var(--line)] rounded-lg border border-line">
        <Line label="Pipeline database">
          <select
            value={pipeline.database ?? ""}
            onChange={(e) => save({ database: e.target.value || null })}
            className="max-w-72 rounded-md border border-line bg-transparent px-2 py-1 text-sm"
          >
            <option value="">None</option>
            {databases.map((d) => (
              <option key={d.path} value={d.path}>
                {d.path.replace(/\.md$/, "")}
              </option>
            ))}
          </select>
        </Line>

        {pipeline.database && (
          <>
            <Line label="Channel property" hint="The select property that says who a production is for.">
              <select
                value={pipeline.channelProperty}
                onChange={(e) => save({ channelProperty: e.target.value })}
                className="rounded-md border border-line bg-transparent px-2 py-1 text-sm"
              >
                {!choices.some((c) => c.name === pipeline.channelProperty) && <option value={pipeline.channelProperty}>{pipeline.channelProperty}</option>}
                {choices.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Line>

            <div className="px-3 py-3">
              <div className="text-sm font-medium text-ink">Where project folders go</div>
              <div className="mt-0.5 mb-2 text-xs text-muted">A library folder per channel. New productions get their folder inside it.</div>
              <datalist id="library-folders">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <div className="grid grid-cols-[minmax(110px,auto)_1fr] items-center gap-x-3 gap-y-1.5">
                {channels.map((c) => (
                  <FolderField key={c} label={c} value={pipeline.channelFolders[c] ?? ""} onSave={(v) => save({ channelFolders: { ...pipeline.channelFolders, [c]: v } })} />
                ))}
                <FolderField label={channels.length ? "Anything else" : "Project folders"} value={pipeline.defaultFolder ?? ""} onSave={(v) => save({ defaultFolder: v || null })} />
              </div>
            </div>

            <div className="px-3 py-3">
              <div className="text-sm font-medium text-ink">Folder template</div>
              <div className="mt-0.5 mb-2 text-xs text-muted">Sub-folders every new project folder starts with, one per line.</div>
              <textarea
                value={template ?? pipeline.template.join("\n")}
                onChange={(e) => setTemplate(e.target.value)}
                onBlur={() => {
                  if (template == null) return;
                  save({ template: template.split("\n").map((l) => l.trim()).filter(Boolean) });
                  setTemplate(null);
                }}
                rows={6}
                className="w-full resize-y rounded-md border border-line bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--line-strong)]"
              />
            </div>

            <ImportProjects pipeline={pipeline} channels={channels} />

            <Line label="Link existing folders" hint={report ?? "Finds the project folder for productions that don't have one yet, when its name clearly matches the title."}>
              <button
                onClick={linkAll}
                disabled={linking}
                className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-muted hover:bg-hover hover:text-ink disabled:opacity-50"
              >
                {linking ? <LoaderCircle size={13} className="animate-spin" /> : <Link2 size={13} />}
                Link folders
              </button>
            </Line>
          </>
        )}
      </div>
    </div>
  );
}

function Line({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function FolderField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [ok, setOk] = useState(true);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (!text) return setOk(true);
    api.libraryFolderExists(text).then(setOk);
  }, [text]);
  return (
    <>
      <span className="truncate text-[13px] text-muted">{label}</span>
      <div className="min-w-0">
        <input
          list="library-folders"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.replace(/\/+$/, "") !== value && onSave(text.replace(/\/+$/, ""))}
          placeholder="e.g. Studio/YouTube"
          className={`w-full rounded-md border bg-transparent px-2 py-1 font-mono text-xs outline-none ${ok ? "border-line focus:border-[var(--line-strong)]" : "border-[var(--c-red-text)]"}`}
        />
        {!ok && <div className="mt-0.5 text-[11px] text-[var(--c-red-text)]">No such folder in the Library.</div>}
      </div>
    </>
  );
}

/** Folders that hold a channel's assets rather than one video. */
const NOT_A_PRODUCTION = /brand|asset|toolkit|logo|font|template|misc|archive|stock|resources?$/i;

type Candidate = { id: string; name: string; channel: string | null; checked: boolean };

/**
 * Creates productions for project folders that don't have one yet, so videos made before
 * Creator Studio are in the pipeline too.
 */
function ImportProjects({ pipeline, channels }: { pipeline: Pipeline; channels: string[] }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const find = async () => {
    setBusy(true);
    setReport(null);
    try {
      const linked = (await loadProductions(pipeline)).map((p) => p.folder).filter((f): f is string => !!f);
      const homes: [string | null, string][] = channels.filter((c) => pipeline.channelFolders[c]).map((c) => [c, pipeline.channelFolders[c]]);
      if (pipeline.defaultFolder && !homes.some(([, f]) => f === pipeline.defaultFolder)) homes.push([null, pipeline.defaultFolder]);
      const found: Candidate[] = [];
      for (const [channel, home] of homes) {
        const names = await api.librarySubfolders(home).catch(() => []);
        for (const name of names) {
          const id = `${home}/${name}`;
          // Skip folders already linked, the inside of one, or another channel's home.
          if (linked.some((f) => f === id || id.startsWith(`${f}/`) || f.startsWith(`${id}/`))) continue;
          if (homes.some(([, h]) => h === id || h.startsWith(`${id}/`))) continue;
          found.push({ id, name, channel, checked: !NOT_A_PRODUCTION.test(name) });
        }
      }
      setCandidates(found);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!candidates || !pipeline.database) return;
    setBusy(true);
    let made = 0;
    try {
      for (const c of candidates.filter((c) => c.checked)) {
        const row = await api.createNote(pipeline.database, c.name);
        const values: Record<string, unknown> = { [pipeline.folderProperty]: c.id };
        if (c.channel) values[pipeline.channelProperty] = c.channel;
        await api.writeNote(row, joinNote(patchFrontmatter("", values), ""));
        made++;
      }
      setReport(`Created ${made} ${made === 1 ? "production" : "productions"}. Set their status on the pipeline board.`);
      setCandidates(null);
    } finally {
      setBusy(false);
    }
  };

  const chosen = candidates?.filter((c) => c.checked).length ?? 0;
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink">Import existing projects</div>
          <div className="mt-0.5 text-xs text-muted">
            {report ?? "Adds a production for each project folder in the channel folders that doesn't have one, so older videos are in the pipeline too."}
          </div>
        </div>
        {!candidates && (
          <button
            onClick={find}
            disabled={busy}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-muted hover:bg-hover hover:text-ink disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={13} className="animate-spin" /> : <FolderInput size={13} />}
            Find folders
          </button>
        )}
      </div>
      {candidates && (
        <div className="mt-3">
          {candidates.length === 0 ? (
            <p className="text-xs text-faint">Every project folder already has a production.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border border-line">
              {candidates.map((c, i) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-line px-2.5 py-1.5 text-[13px] last:border-b-0 hover:bg-hover">
                  <input
                    type="checkbox"
                    checked={c.checked}
                    onChange={(e) => setCandidates(candidates.map((x, k) => (k === i ? { ...x, checked: e.target.checked } : x)))}
                    className="accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                  <span className="shrink-0 text-xs text-faint">{c.channel ?? "No channel"}</span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={create}
              disabled={busy || !chosen}
              className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy && <LoaderCircle size={13} className="animate-spin" />}
              Create {chosen} {chosen === 1 ? "production" : "productions"}
            </button>
            <button onClick={() => setCandidates(null)} className="h-7 px-2 text-xs text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
