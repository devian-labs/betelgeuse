import {
  BookOpen,
  Bot,
  Check,
  Copy,
  Database,
  FilePlus2,
  FileText,
  FolderTree,
  GitCommitHorizontal,
  History,
  Info,
  PencilLine,
  Search,
  Shield,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Toggle } from "../database/PropertyMenu";
import { api, type McpInfo } from "../lib/api";
import { LINKS, open } from "../lib/links";
import { Modal } from "./Modal";

type Tool = { name: string; desc: string; icon: ReactNode };

const READ_TOOLS: Tool[] = [
  { name: "workspace_info", desc: "Location, conventions and stats", icon: <Info size={15} /> },
  { name: "list_notes", desc: "Page tree with icons and tags", icon: <FolderTree size={15} /> },
  { name: "search_notes", desc: "Full-text search with snippets", icon: <Search size={15} /> },
  { name: "read_note", desc: "Content, links and backlinks", icon: <FileText size={15} /> },
  { name: "query_database", desc: "Rows and properties, filtered and sorted", icon: <Database size={15} /> },
  { name: "note_history", desc: "Git log and any past version", icon: <History size={15} /> },
];

const WRITE_TOOLS: Tool[] = [
  { name: "create_note", desc: "New pages and database rows", icon: <FilePlus2 size={15} /> },
  { name: "update_note", desc: "Append, prepend, replace, set properties", icon: <PencilLine size={15} /> },
  { name: "rename_note", desc: "Rename and rewrite links to it", icon: <BookOpen size={15} /> },
  { name: "move_note", desc: "Move a page under another page", icon: <BookOpen size={15} /> },
  { name: "delete_note", desc: "Delete a page and its sub-pages", icon: <X size={15} /> },
];

type Client = {
  id: string;
  name: string;
  mark: ReactNode;
  steps: { text: ReactNode; code?: string }[];
};

export function AgentsDialog({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<McpInfo | null>(null);
  const [tab, setTab] = useState("claude-code");
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => void api.mcpInfo().then(setInfo), []);
  if (!info) return null;

  const q = (s: string) => JSON.stringify(s);
  const flags = readOnly ? ["--read-only"] : [];
  // Full path to Node: Claude Desktop and other GUI apps don't see your shell's PATH.
  const node = info.node_path ?? "node";
  const args = [info.server_path, "--workspace", info.vault, ...flags];
  const json = JSON.stringify({ mcpServers: { betelgeuse: { command: node, args } } }, null, 2);
  const cli = `${node === "node" ? "node" : q(node)} ${q(info.server_path)} --workspace ${q(info.vault)}${readOnly ? " --read-only" : ""}`;

  const clients: Client[] = [
    {
      id: "claude-code",
      name: "Claude Code",
      mark: <Terminal size={16} />,
      steps: [
        { text: "Run this in your terminal:", code: `claude mcp add betelgeuse -- ${cli}` },
        { text: <>Start a new session and run <Kbd>/mcp</Kbd> to check that it connected.</> },
      ],
    },
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      mark: <span className="text-[13px] font-semibold">C</span>,
      steps: [
        { text: <>Open <b>Settings → Developer → Edit Config</b>, or edit this file:</>, code: "~/Library/Application Support/Claude/claude_desktop_config.json" },
        { text: "Add Betelgeuse to mcpServers:", code: json },
        { text: "Restart Claude Desktop." },
      ],
    },
    {
      id: "cursor",
      name: "Cursor",
      mark: <span className="text-[13px] font-semibold">▲</span>,
      steps: [
        { text: <>Open <b>Settings → MCP → Add new global MCP server</b>, or edit:</>, code: "~/.cursor/mcp.json" },
        { text: "Add Betelgeuse to mcpServers:", code: json },
      ],
    },
    {
      id: "http",
      name: "HTTP",
      mark: <span className="font-mono text-[11px] font-semibold">://</span>,
      steps: [
        { text: "Start the server (keep it running):", code: `${cli} --http 3917` },
        { text: "Point any client that speaks Streamable HTTP at:", code: "http://127.0.0.1:3917/mcp" },
        { text: "For example, in Claude Code:", code: "claude mcp add --transport http betelgeuse http://127.0.0.1:3917/mcp" },
      ],
    },
  ];
  const client = clients.find((c) => c.id === tab)!;

  return (
    <Modal onClose={onClose} className="max-w-[760px]">
      <div className="flex max-h-[80vh] flex-col">
        {/* Header */}
        <div className="flex items-start gap-3.5 px-6 pt-6 pb-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--c-blue-bg)] text-[var(--blue)]">
            <Bot size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-semibold text-ink">Connect your AI agents</h2>
              {info.built ? (
                <span className="flex items-center gap-1.5 rounded-full bg-[var(--c-green-bg)] px-2 py-0.5 text-xs font-medium text-[var(--c-green-text)]">
                  <span className="size-1.5 rounded-full bg-current" /> Server ready
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-[var(--c-orange-bg)] px-2 py-0.5 text-xs font-medium text-[var(--c-orange-text)]">
                  <span className="size-1.5 rounded-full bg-current" /> Not built
                </span>
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Any MCP client can read and edit this workspace. Every change an agent makes is its own git commit, so you can review or undo
              it from History.
            </p>
          </div>
          <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-muted">
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {!info.built && (
            <div className="mb-4 rounded-lg bg-[var(--c-orange-bg)] px-3.5 py-2.5 text-sm text-ink">
              The server hasn't been built yet. Run <Kbd>npm run mcp:build</Kbd> in the Betelgeuse folder.
            </div>
          )}
          {info.built && !info.node_path && (
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-[var(--c-orange-bg)] px-3.5 py-2.5 text-sm text-ink">
              <span className="flex-1">The MCP server runs on Node.js 20 or newer, which wasn't found on this computer.</span>
              <button onClick={() => open(LINKS.node)} className="shrink-0 rounded-md bg-raised px-2.5 py-1 text-xs font-medium text-ink hover:bg-hover">
                Get Node.js
              </button>
            </div>
          )}

          {/* Client picker */}
          <div className="grid grid-cols-4 gap-2">
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => setTab(c.id)}
                className={`flex h-11 items-center gap-2.5 rounded-lg border px-3 text-left text-sm transition-colors ${
                  c.id === tab ? "border-[var(--blue)] bg-[var(--c-blue-bg)] text-ink" : "border-line text-muted hover:bg-hover hover:text-ink"
                }`}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-md ${c.id === tab ? "bg-[var(--blue)] text-white" : "bg-hover text-muted"}`}
                >
                  {c.mark}
                </span>
                <span className="truncate font-medium">{c.name}</span>
              </button>
            ))}
          </div>

          {/* Steps */}
          <ol className="mt-5 space-y-4">
            {client.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-hover text-[11px] font-semibold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm text-ink">{step.text}</p>
                  {step.code && <CodeBlock code={step.code} />}
                </div>
              </li>
            ))}
          </ol>

          {/* Read-only switch */}
          <button
            onClick={() => setReadOnly((v) => !v)}
            className="mt-5 flex w-full items-center gap-3 rounded-lg border border-line px-3.5 py-3 text-left hover:bg-hover"
          >
            <Shield size={18} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">Read-only access</span>
              <span className="block text-xs text-muted">Agents can search and read, but not create, edit or delete pages.</span>
            </span>
            <Toggle on={readOnly} />
          </button>

          {/* Tools */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <ToolGroup title="Read" tools={READ_TOOLS} />
            <ToolGroup title="Write" tools={WRITE_TOOLS} disabled={readOnly} note={<><GitCommitHorizontal size={13} /> Each write is a git commit</>} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ToolGroup({ title, tools, disabled, note }: { title: string; tools: Tool[]; disabled?: boolean; note?: ReactNode }) {
  return (
    <div className={`rounded-lg border border-line transition-opacity ${disabled ? "opacity-40" : ""}`}>
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
        <span className="text-xs font-medium text-muted">
          {title} · {tools.length} tools
        </span>
        {note && <span className="flex items-center gap-1 text-[11px] text-faint">{note}</span>}
      </div>
      <ul className="p-1.5">
        {tools.map((t) => (
          <li key={t.name} className="flex items-start gap-2.5 rounded-md px-2 py-1.5">
            <span className="mt-0.5 shrink-0 text-faint">{t.icon}</span>
            <span className="min-w-0">
              <code className="block font-mono text-[12.5px] text-ink">{t.name}</code>
              <span className="block text-xs text-muted">{t.desc}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <code className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--code-inline)]">{children}</code>;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/code relative rounded-lg bg-[var(--codeblock-bg)] ring-1 ring-line">
      <pre className="px-3.5 py-3 pr-20 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap text-ink">{code}</pre>
      <button
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className={`absolute top-2 right-2 flex h-7 items-center gap-1.5 rounded-md border border-line bg-raised px-2 text-xs font-medium shadow-sm transition-colors ${
          copied ? "text-[var(--c-green-text)]" : "text-muted hover:text-ink"
        }`}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
