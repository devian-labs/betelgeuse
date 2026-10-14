import { REPO } from "@/lib/site";
import { href, loadDoc, navTitles, neighbours, sourcePath } from "@/lib/docs";

/** One documentation page: navigation, the page, and what's on it. */
export function DocPage({ slug }: { slug: string }) {
  const doc = loadDoc(slug)!;
  const nav = navTitles();
  const { prev, next } = neighbours(slug);
  const source = sourcePath(slug);
  return (
    <div className="docs">
      <aside className="docs-nav" aria-label="Documentation">
        <a href="/" className="docs-home">
          ← Betelgeuse
        </a>
        {nav.map((s) => (
          <nav key={s.title}>
            <div className="docs-nav-title">{s.title}</div>
            {s.pages.map((p) => (
              <a key={p.slug} href={href(p.slug)} aria-current={p.slug === slug ? "page" : undefined}>
                {p.title}
              </a>
            ))}
          </nav>
        ))}
      </aside>

      <main className="docs-main doc">
        <p className="docs-section">{doc.section}</p>
        <h1>{doc.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
        <footer className="docs-footer">
          <div className="docs-pager">
            {prev ? (
              <a href={href(prev.slug)}>
                <span>Previous</span>
                {prev.title}
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a href={href(next.slug)} className="next">
                <span>Next</span>
                {next.title}
              </a>
            )}
          </div>
          {source && (
            <a className="docs-edit" href={`${REPO}/edit/main/${source}`}>
              Edit this page on GitHub
            </a>
          )}
        </footer>
      </main>

      {doc.headings.length > 1 && (
        <aside className="docs-toc" aria-label="On this page">
          <div className="docs-nav-title">On this page</div>
          {doc.headings.map((h) => (
            <a key={h.id} href={`#${h.id}`} className={h.level === 3 ? "sub" : undefined}>
              {h.text}
            </a>
          ))}
        </aside>
      )}
    </div>
  );
}
