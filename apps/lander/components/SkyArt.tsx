/*
 * Line art from a star atlas, for the landing page. Betelgeuse is the red shoulder of Orion, so the hero carries
 * a page of the sky around it: a coordinate grid, the constellation, and field stars. Everything is drawn with the
 * page's colour tokens so it follows light and dark mode. All of it is decoration, hidden from screen readers.
 */

/* ---------- Hero: a chart of the sky around Orion ---------- */

// The chart is drawn on a 1440 × 1000 page; it is centred and cropped on narrower screens.
const W = 1440;
const H = 1000;
// The grid's arcs are circles around a point far below the page, like a planisphere.
const POLE = { x: W / 2, y: 2600 };
const ARCS = [1750, 1900, 2050, 2200, 2350];
// Hour lines, as angles from the vertical through the pole. Right ascension grows to the left (east).
const HOURS: [number, string][] = [
  [-15, "9h"],
  [-7.5, "8h"],
  [0, "7h"],
  [7.5, "6h"],
  [15, "5h"],
];

type Star = { x: number; y: number; mag: number; name?: string; anchor?: "start" | "end"; dx?: number; dy?: number };

// Orion, between the 6h and 5h lines on the right of the page. Sizes follow each star's real brightness.
const ORION: Record<string, Star> = {
  betelgeuse: { x: 1207, y: 176, mag: 0.5, name: "Betelgeuse", anchor: "start", dx: 12, dy: 18 },
  bellatrix: { x: 1357, y: 196, mag: 1.6, name: "Bellatrix", anchor: "end", dx: -9, dy: -9 },
  meissa: { x: 1281, y: 122, mag: 3.4 },
  alnitak: { x: 1267, y: 318, mag: 1.8 },
  alnilam: { x: 1291, y: 306, mag: 1.7 },
  mintaka: { x: 1315, y: 294, mag: 2.2 },
  saiph: { x: 1241, y: 446, mag: 2.1, name: "Saiph", anchor: "end", dx: -10, dy: 4 },
  rigel: { x: 1385, y: 430, mag: 0.1, name: "Rigel", anchor: "start", dx: 11, dy: 4 },
  // The club, raised above Betelgeuse.
  club1: { x: 1189, y: 128, mag: 4.4 },
  club2: { x: 1175, y: 86, mag: 4.2 },
  club3: { x: 1197, y: 58, mag: 4.6 },
  // The shield, held out past Bellatrix.
  shield1: { x: 1399, y: 168, mag: 3.7 },
  shield2: { x: 1413, y: 198, mag: 3.2 },
  shield3: { x: 1415, y: 232, mag: 3.7 },
  shield4: { x: 1403, y: 262, mag: 4.4 },
};

const ORION_LINES: [keyof typeof ORION, keyof typeof ORION][] = [
  ["meissa", "betelgeuse"],
  ["meissa", "bellatrix"],
  ["betelgeuse", "alnitak"],
  ["bellatrix", "mintaka"],
  ["alnitak", "alnilam"],
  ["alnilam", "mintaka"],
  ["alnitak", "saiph"],
  ["mintaka", "rigel"],
  ["betelgeuse", "club1"],
  ["club1", "club2"],
  ["club2", "club3"],
  ["bellatrix", "shield2"],
  ["shield1", "shield2"],
  ["shield2", "shield3"],
  ["shield3", "shield4"],
];

/** A star's dot radius from its magnitude: brighter (lower) is bigger. */
const radius = (mag: number) => Math.max(1.1, 4.6 - mag * 0.78);

/** Faint field stars, from a fixed seed so the server and the browser draw the same sky. */
function fieldStars(): { x: number; y: number; r: number; o: number }[] {
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const stars = [];
  while (stars.length < 70) {
    const x = rand() * W;
    const y = 40 + rand() * 640;
    const r = 0.6 + rand() * 1.1;
    const o = 0.25 + rand() * 0.5;
    // Keep the headline, the buttons and Orion's own patch clear.
    if (x > 300 && x < 1140 && y > 140 && y < 640) continue;
    if (x > 1135 && x < 1440 && y > 40 && y < 480) continue;
    stars.push({ x, y, r, o });
  }
  return stars;
}

const FIELD = fieldStars();

function arcPath(r: number) {
  // The visible part of the circle, from the left edge of the page to the right.
  const dx = W / 2 + 40;
  const dy = Math.sqrt(r * r - dx * dx);
  return `M ${POLE.x - dx} ${POLE.y - dy} A ${r} ${r} 0 0 1 ${POLE.x + dx} ${POLE.y - dy}`;
}

function hourLine(deg: number) {
  const a = (deg * Math.PI) / 180;
  const top = 30;
  const bottom = 760;
  const at = (y: number) => POLE.x + (POLE.y - y) * Math.tan(a);
  return { x1: at(bottom), y1: bottom, x2: at(top), y2: top, labelX: at(top), labelY: top };
}

export function HeroSky() {
  return (
    <svg className="hero-sky" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice" aria-hidden focusable="false">
      <defs>
        {/* Clears the grid behind the headline and fades it out towards the devices. */}
        <radialGradient id="sky-clear">
          <stop offset="0.5" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </radialGradient>
        <linearGradient id="sky-fall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#fff" />
          <stop offset="0.85" stopColor="#000" />
        </linearGradient>
        <mask id="sky-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect width={W} height={H} fill="#fff" />
          <ellipse cx="720" cy="380" rx="600" ry="360" fill="url(#sky-clear)" />
        </mask>
        <mask id="sky-fade" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect width={W} height={H} fill="url(#sky-fall)" />
        </mask>
        <radialGradient id="betelgeuse-glow">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g mask="url(#sky-fade)">
        <g className="sky-grid" mask="url(#sky-mask)">
          {ARCS.map((r, i) => (
            <path key={r} d={arcPath(r)} strokeDasharray={i % 2 ? "2 7" : undefined} />
          ))}
          {HOURS.map(([deg, label]) => {
            const l = hourLine(deg);
            return (
              <g key={label}>
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
                <text className="sky-hour" x={l.labelX + 6} y={l.labelY + 14}>
                  {label}
                </text>
              </g>
            );
          })}
        </g>

        <g className="sky-field">
          {FIELD.map((s, i) => (
            <circle key={i} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={s.r.toFixed(2)} opacity={s.o.toFixed(2)} />
          ))}
        </g>
      </g>

      <g className="sky-orion">
        <g className="sky-figure">
          {ORION_LINES.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={ORION[a].x} y1={ORION[a].y} x2={ORION[b].x} y2={ORION[b].y} />
          ))}
        </g>
        {Object.entries(ORION).map(([id, s]) =>
          id === "betelgeuse" ? null : <circle key={id} className="sky-star" cx={s.x} cy={s.y} r={radius(s.mag)} />,
        )}
        <circle className="sky-betelgeuse-glow" cx={ORION.betelgeuse.x} cy={ORION.betelgeuse.y} r="26" fill="url(#betelgeuse-glow)" />
        <circle className="sky-betelgeuse" cx={ORION.betelgeuse.x} cy={ORION.betelgeuse.y} r={radius(ORION.betelgeuse.mag) + 0.6} />
        {Object.values(ORION)
          .filter((s) => s.name)
          .map((s) => (
            <text
              key={s.name}
              className={s.name === "Betelgeuse" ? "sky-name sky-name-accent" : "sky-name"}
              x={s.x + (s.dx ?? 0)}
              y={s.y + (s.dy ?? 0)}
              textAnchor={s.anchor}
            >
              {s.name}
            </text>
          ))}
        <text className="sky-constellation" x="1186" y="392">
          Orion
        </text>
      </g>
    </svg>
  );
}

/* ---------- A git history, drawn as a constellation ---------- */

/** Four points, like a star's glint: the merge and the newest commit. */
function Glint({ x, y, r, className }: { x: number; y: number; r: number; className?: string }) {
  const t = r * 0.22;
  return (
    <path
      className={className}
      d={`M ${x} ${y - r} L ${x + t} ${y - t} L ${x + r} ${y} L ${x + t} ${y + t} L ${x} ${y + r} L ${x - t} ${y + t} L ${x - r} ${y} L ${x - t} ${y - t} Z`}
    />
  );
}

/**
 * A short branch off main that merges back, every commit a star. It sits above the Features heading as a quiet
 * pointer to what's underneath: every change to a page is a git commit.
 */
export function CommitConstellation() {
  const main = [40, 110, 180, 330, 470, 540, 610];
  const branch = [255, 330, 405];
  return (
    <svg className="commit-sky" viewBox="0 0 650 96" aria-hidden focusable="false">
      <defs>
        <linearGradient id="commit-fade" x1="0" x2="1">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.12" stopColor="#fff" />
          <stop offset="0.88" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id="commit-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="650" height="96">
          <rect width="650" height="96" fill="url(#commit-fade)" />
        </mask>
      </defs>
      <g className="commit-lines" mask="url(#commit-mask)">
        <line x1="0" y1="66" x2="650" y2="66" />
        <path d="M 180 66 C 215 66 215 26 255 26 L 405 26 C 445 26 440 66 470 66" />
      </g>
      {main.map((x) =>
        x === 470 ? null : <circle key={x} className="commit-star" cx={x} cy={66} r={x === 330 ? 2 : 2.6} opacity={x === 40 ? 0.5 : 1} />,
      )}
      {branch.map((x) => (
        <circle key={x} className="commit-star" cx={x} cy={26} r={x === 330 ? 3.2 : 2.2} />
      ))}
      <circle className="commit-glow" cx="470" cy="66" r="16" />
      <Glint x={470} y={66} r={10} className="commit-merge" />
      <Glint x={610} y={66} r={6} className="commit-star" />
    </svg>
  );
}
