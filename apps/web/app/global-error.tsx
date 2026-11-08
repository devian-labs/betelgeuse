"use client";

import { useEffect } from "react";

/** The last resort when the whole page fails: reports it, and offers a reload. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void import("@betelgeuse/ui/lib/telemetry").then((t) => t.captureError(error, "global-error"));
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#6b6460" }}>Your edits are kept in this browser. Reload to carry on.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
