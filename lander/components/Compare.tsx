const rows: [string, string, string, string][] = [
  ["Rich block editor", "yes", "yes", "Varies"],
  ["Database views", "yes", "yes", "With plugins"],
  ["Plain Markdown files", "yes", "Export only", "yes"],
  ["Full version history in git", "yes", "Varies", "Manual setup"],
  ["Works offline, no account", "yes", "Varies", "yes"],
  ["AI agents with per-page access", "yes", "Varies", "With setup"],
  ["Open source", "yes", "Varies", "Varies"],
];

function Cell({ v }: { v: string }) {
  if (v === "yes")
    return (
      <svg className="mark ok" viewBox="0 0 20 20" aria-label="Yes">
        <path d="M5 10.5l3.2 3L15 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return <span className="cmp-soft">{v}</span>;
}

/** Betelgeuse next to the two kinds of tools people already use. Categories, not products. */
export function Compare() {
  return (
    <div className="compare-table" role="table" aria-label="Betelgeuse compared with cloud workspaces and Markdown editors">
      <div className="cmp-row cmp-head" role="row">
        <span role="columnheader" />
        <span role="columnheader" className="cmp-us">
          Betelgeuse
        </span>
        <span role="columnheader">Cloud workspaces</span>
        <span role="columnheader">Markdown editors</span>
      </div>
      {rows.map(([label, ...cells]) => (
        <div className="cmp-row" role="row" key={label}>
          <span role="rowheader">{label}</span>
          {cells.map((c, i) => (
            <span role="cell" key={i} className={i === 0 ? "cmp-us" : undefined}>
              <Cell v={c} />
            </span>
          ))}
        </div>
      ))}
      <p className="cmp-note">Comparing general kinds of tools, not specific products. Features vary by tool and plan.</p>
    </div>
  );
}
