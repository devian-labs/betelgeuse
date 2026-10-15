"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * A small terminal window: one command per line, optional comments, and a copy button for the commands.
 * With `code`, it shows source code instead: no prompt, and `//` comments.
 */
export function CodeWindow({ title, lines, code = false }: { title: string; lines: [command: string, comment?: string][]; code?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.map(([c]) => c).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be blocked; the commands are still selectable.
    }
  };
  return (
    <div className="code-window">
      <div className="code-bar">
        <span className="lights">
          <i />
          <i />
          <i />
        </span>
        <span className="code-title">{title}</span>
        <button type="button" className="copy" onClick={copy} aria-label={code ? "Copy code" : "Copy commands"}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        {lines.map(([cmd, comment], i) => (
          <div key={i} className="code-line">
            {!code && (
              <span className="prompt" aria-hidden>
                $
              </span>
            )}
            <span>{cmd}</span>
            {comment && <span className="code-comment">{code ? "//" : "#"} {comment}</span>}
          </div>
        ))}
      </pre>
    </div>
  );
}
