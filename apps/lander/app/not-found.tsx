import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Page Not Found | Betelgeuse" },
  description: "This page doesn't exist. Betelgeuse is a free, open-source workspace for notes, docs and databases stored as Markdown in git.",
};

/** Exported as 404.html. */
export default function NotFound() {
  return (
    <main className="wrap narrow doc">
      <p>
        <a href="/">← Betelgeuse</a>
      </p>
      <h1>Page not found</h1>
      <p>There&apos;s nothing at this address. It may have moved, or the link may be mistyped.</p>
      <p>
        <a href="/">Go to the Betelgeuse home page</a>
      </p>
    </main>
  );
}
