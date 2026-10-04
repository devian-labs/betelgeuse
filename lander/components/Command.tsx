"use client";

import { useState } from "react";

/** A shell command with a copy button. */
export function Command({ children, prompt = "$" }: { children: string; prompt?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be blocked; the command is still selectable.
    }
  };
  return (
    <div className="command">
      <code>
        <span className="prompt" aria-hidden>
          {prompt}
        </span>
        {children}
      </code>
      <button type="button" className="copy" onClick={copy} aria-label="Copy command">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
