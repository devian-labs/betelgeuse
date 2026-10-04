"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Line = { kind: "prompt"; text: string } | { kind: "out"; node: ReactNode; pause?: number };

const script: Line[] = [
  { kind: "prompt", text: "What's still open on the roadmap?" },
  {
    kind: "out",
    node: (
      <>
        <span className="t-tool">⏺ betelgeuse.query_database</span>
        <span className="t-dim">(Roadmap, Status ≠ Done)</span>
      </>
    ),
    pause: 700,
  },
  { kind: "out", node: <span className="t-dim">{"  ⎿ 2 rows"}</span> },
  {
    kind: "out",
    node: (
      <>
        {"  • "}
        <strong>Ship the MCP server</strong>
        <span className="t-dim"> · in progress · Oct 9</span>
      </>
    ),
  },
  {
    kind: "out",
    node: (
      <>
        {"  • "}
        <strong>Sync vault to GitHub</strong>
        <span className="t-dim"> · not started · Oct 16</span>
      </>
    ),
  },
  { kind: "prompt", text: "Mark the first one done." },
  {
    kind: "out",
    node: (
      <>
        <span className="t-tool">⏺ betelgeuse.update_note</span>
        <span className="t-dim">(Roadmap/Ship the MCP server)</span>
      </>
    ),
    pause: 700,
  },
  { kind: "out", node: <span className="t-ok">{"  ⎿ ✓ Committed as “Claude Code via Betelgeuse MCP”"}</span> },
];

/** A Claude Code session typing itself out, looping while it's on screen. */
export function TerminalDemo() {
  const [line, setLine] = useState(script.length);
  const [chars, setChars] = useState(0);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    setLine(0);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const current = script[line];
    let delay: number;
    let next: () => void;
    if (!current) {
      delay = 3200;
      next = () => {
        setLine(0);
        setChars(0);
      };
    } else if (current.kind === "prompt" && chars < current.text.length) {
      delay = chars === 0 ? 500 : 38;
      next = () => setChars((c) => c + 1);
    } else {
      delay = current.kind === "prompt" ? 450 : (current.pause ?? 260);
      next = () => {
        setLine((l) => l + 1);
        setChars(0);
      };
    }
    const id = setTimeout(next, delay);
    return () => clearTimeout(id);
  }, [visible, line, chars]);

  return (
    <div className="demo terminal-demo" ref={ref} aria-label="An AI agent querying and updating the Betelgeuse workspace" role="img">
      <div className="demo-bar">
        <span className="lights">
          <i />
          <i />
          <i />
        </span>
        <span className="demo-title">claude · ~/code/betelgeuse</span>
      </div>
      <pre>
        {script.map((l, i) => {
          if (i > line) return null;
          if (l.kind === "prompt") {
            const typing = i === line;
            return (
              <div key={i} className="t-line t-ask">
                <span className="t-prompt">&gt;</span> {typing ? l.text.slice(0, chars) : l.text}
                {typing && <span className="t-caret" />}
              </div>
            );
          }
          if (i === line) return null;
          return (
            <div key={i} className="t-line t-out">
              {l.node}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
