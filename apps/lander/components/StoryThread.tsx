"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The page's story, drawn as starlight. A line leaves Betelgeuse in the hero's sky chart, runs down the margin past
 * a star for each step of a note's life, and lands in the star above "Take your notes home." It draws itself as you
 * scroll; with reduced motion it's simply all there. Wide screens only: narrower ones have no margin to run down.
 */

/** The sections the line passes, and what happens to your note there. Two short lines each, for the margin. */
const STOPS: { id: string; caption: [string, string] }[] = [
  { id: "features", caption: ["You write", "a page"] },
  { id: "web", caption: ["It's a file", "in your repo"] },
  { id: "agents", caption: ["Agents read what", "you let them"] },
  { id: "open-source", caption: ["The code is", "open to all"] },
];

type Point = { x: number; y: number };
type Layout = { width: number; height: number; d: string; stops: (Point & { caption: [string, string] })[]; end: Point };

const WIDE = "(min-width: 1440px)";

/**
 * An element's box within `main`, from its layout position. Unlike getBoundingClientRect this ignores transforms, so
 * sections still sliding in (data-reveal) are measured where they'll come to rest.
 */
function place(el: HTMLElement, main: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = el; node && node !== main; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}

/**
 * The route out of Orion, in the sky chart's own units (components/SkyArt.tsx): from Betelgeuse across the chest,
 * between the shoulders and the belt, down under the belt between Saiph and Rigel, and out below the figure. It
 * crosses only the belt, and none of the stars or their names.
 */
const ORION_EXIT: Point[] = [
  { x: 1207, y: 176 },
  { x: 1268, y: 236 },
  { x: 1292, y: 330 },
  { x: 1312, y: 410 },
  { x: 1318, y: 520 },
];

/** Maps a point in the sky chart (1440 × 1000, centred and cropped) to `main`'s coordinates. */
function fromSky(sky: SVGSVGElement, box: DOMRect) {
  const r = sky.getBoundingClientRect();
  const scale = Math.max(r.width / 1440, r.height / 1000);
  const left = r.left - box.left + (r.width - 1440 * scale) / 2;
  const top = r.top - box.top;
  return (p: Point): Point => ({ x: left + p.x * scale, y: top + p.y * scale });
}

/** A smooth curve through every point (Catmull–Rom, as cubic Béziers), continuing an existing path. */
function through(points: Point[]) {
  let d = "";
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function measure(main: HTMLElement): Layout | null {
  const box = main.getBoundingClientRect();

  const stops = STOPS.flatMap(({ id, caption }) => {
    const section = document.getElementById(id);
    const heading = section?.querySelector("h2");
    const wrap = section?.querySelector<HTMLElement>(".wrap");
    if (!heading || !wrap) return [];
    const w = place(wrap, main);
    const right = w.x + w.width;
    // Halfway across the margin, level with the section's heading.
    return [{ x: right + (box.width - right) / 2, y: place(heading, main).y + 24, caption }];
  });
  const star = document.querySelector<HTMLElement>("#download .download-star");
  if (!stops.length || !star) return null;
  const s = place(star, main);
  const end = { x: s.x + s.width / 2, y: s.y + s.height / 2 };

  // Betelgeuse, when the hero shows Orion; otherwise the line begins at the first stop.
  const sky = document.querySelector<SVGSVGElement>(".hero-sky");
  const orion = document.querySelector(".sky-orion");
  const first = stops[0];
  let d: string;
  if (sky && orion && orion.getBoundingClientRect().width > 0) {
    const route = ORION_EXIT.map(fromSky(sky, box));
    const out = route[route.length - 1];
    // Out of Orion, then a gentle bend into the margin before the first stop.
    route.push({ x: first.x, y: out.y + 180 });
    d = `M ${route[0].x} ${route[0].y}${through(route)} L ${first.x} ${first.y}`;
  } else {
    d = `M ${first.x} ${first.y}`;
  }
  // Between stops the line sways a little, out and back, like a path drawn by hand.
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    const sway = i % 2 ? -22 : 22;
    const third = (b.y - a.y) / 3;
    d += ` C ${a.x + sway} ${a.y + third}, ${b.x + sway} ${b.y - third}, ${b.x} ${b.y}`;
  }
  // Then down the margin past the FAQ, and in to the closing star from the side, through the empty space above
  // "Take your notes home."
  const last = stops[stops.length - 1];
  const turn = end.y - 150;
  // It runs into the star's centre; the star is drawn above the line (see .story #download), so it disappears inside.
  d += ` L ${last.x} ${turn} C ${last.x} ${end.y - 10}, ${end.x + 280} ${end.y}, ${end.x} ${end.y}`;

  return { width: box.width, height: main.scrollHeight, d, stops, end };
}

export function StoryThread() {
  const svg = useRef<SVGSVGElement>(null);
  const lit = useRef<SVGPathElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [reached, setReached] = useState(-1);

  // Lay the line out against the page, again whenever the page changes size (fonts, images, an opened FAQ).
  useEffect(() => {
    const main = svg.current?.parentElement;
    if (!main) return;
    const wide = window.matchMedia(WIDE);
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setLayout(wide.matches ? measure(main) : null));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    wide.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      wide.removeEventListener("change", update);
    };
  }, []);

  // Draw as far down the line as the reader has scrolled.
  useEffect(() => {
    const path = lit.current;
    const main = svg.current?.parentElement;
    if (!layout || !path || !main) return;
    const length = path.getTotalLength();
    // Where along the line each height is reached. The line only ever runs downwards, so this is a simple lookup.
    const samples: { len: number; y: number }[] = [];
    for (let i = 0; i <= 400; i++) {
      const len = (length * i) / 400;
      samples.push({ len, y: path.getPointAtLength(len).y });
    }
    const lengthAt = (y: number) => samples.find((s) => s.y >= y)?.len ?? length;
    const startY = samples[0].y;
    const stopLengths = layout.stops.map((s) => lengthAt(s.y - 1));

    path.style.strokeDasharray = `${length}`;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // The line follows a point 62% of the way down the screen, but starts empty: at the top of the page it holds
        // back to the line's start, and catches up over the first screenful of scrolling.
        const mainTop = main.getBoundingClientRect().top + window.scrollY;
        const ahead = window.scrollY + window.innerHeight * 0.62 - mainTop;
        const lag = Math.max(0, ahead - startY) * Math.max(0, 1 - window.scrollY / window.innerHeight);
        const drawn = still ? length : window.scrollY < 2 ? 0 : lengthAt(ahead - lag);
        path.style.strokeDashoffset = `${length - drawn}`;
        setReached(stopLengths.filter((l) => drawn >= l).length - 1 + (drawn >= length - 1 ? 1 : 0));
      });
    };
    draw();
    window.addEventListener("scroll", draw, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", draw);
    };
  }, [layout]);

  return (
    <svg
      ref={svg}
      className="story-thread"
      width={layout?.width ?? 0}
      height={layout?.height ?? 0}
      viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined}
      aria-hidden
      focusable="false"
    >
      {layout && (
        <>
          <path className="thread-trail" d={layout.d} />
          <path ref={lit} className="thread-light" d={layout.d} />
          {layout.stops.map((s, i) => (
            <g key={s.caption.join(" ")} className={i <= reached ? "thread-stop on" : "thread-stop"} transform={`translate(${s.x} ${s.y})`}>
              <circle className="thread-halo" r="14" />
              <path className="thread-glint" d="M 0 -8 L 1.8 -1.8 L 8 0 L 1.8 1.8 L 0 8 L -1.8 1.8 L -8 0 L -1.8 -1.8 Z" />
              <text className="thread-caption" y="30">
                <tspan x="0">{s.caption[0]}</tspan>
                <tspan x="0" dy="16">
                  {s.caption[1]}
                </tspan>
              </text>
            </g>
          ))}
          <defs>
            <radialGradient id="thread-home-glow">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="0.35" stopColor="var(--accent)" stopOpacity="0.12" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle
            className={reached >= layout.stops.length ? "thread-home on" : "thread-home"}
            cx={layout.end.x}
            cy={layout.end.y}
            r="90"
            fill="url(#thread-home-glow)"
          />
        </>
      )}
    </svg>
  );
}
