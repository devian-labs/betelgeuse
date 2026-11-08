import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

/** A plain text page (Privacy, 404) set like the docs, and so like a page in the app: a top bar and the page, no sidebar. */
/** `wide` gives a page with charts or cards (Stats, Support) more room than reading text needs. */
export function PlainPage({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className="docs docs-plain">
      <div className="docs-body">
        <div className="docs-topbar">
          <a href="/" className="docs-brand">
            <Logo size={18} />
            Betelgeuse
          </a>
          <span aria-hidden>/</span>
          <span className="docs-topbar-page">{title}</span>
          <a href="/docs/" className="docs-topbar-site">
            Docs
          </a>
          <a href="/#download" className="docs-topbar-site docs-download">
            <Download size={14} />
            Download
          </a>
        </div>
        <main className={`docs-main doc${wide ? " docs-main-wide" : ""}`}>{children}</main>
      </div>
    </div>
  );
}
