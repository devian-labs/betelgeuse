"use client";

import { useEffect, useState } from "react";
import { Shot } from "./Shot";

const slides = [
  { name: "editor", label: "Write", alt: "The Betelgeuse editor with the Welcome guide open" },
  { name: "board", label: "Board", alt: "A roadmap database on a board view" },
  { name: "table", label: "Table", alt: "The roadmap as a table with totals" },
  { name: "history", label: "History", alt: "Page history with edits by you and by AI agents, and a version ready to restore" },
  { name: "ai-settings", label: "AI privacy", alt: "Settings that choose which pages AI agents can see" },
  { name: "agents", label: "Agents", alt: "Connect agents dialog with setup for Claude Code, Cursor and others" },
];

const INTERVAL = 5000;

/** The hero screenshot: cycles through the app until the visitor picks a tab. */
export function ProductTour() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((i) => (i + 1) % slides.length), INTERVAL);
    return () => clearInterval(id);
  }, [auto]);

  return (
    <div className="tour-hero">
      <div className="tour-stage">
        {slides.map((s, i) => (
          <div key={s.name} className={`tour-slide${i === active ? " active" : ""}`} aria-hidden={i !== active}>
            <Shot name={s.name} theme="dark" eager priority={i === 0} alt={s.alt} />
          </div>
        ))}
      </div>
      <div className="tour-tabs" role="tablist" aria-label="Product tour">
        {slides.map((s, i) => (
          <button
            key={s.name}
            role="tab"
            aria-selected={i === active}
            className={`tour-tab${i === active ? " active" : ""}${auto ? " auto" : ""}`}
            onClick={() => {
              setActive(i);
              setAuto(false);
            }}
          >
            {s.label}
            {i === active && auto && <span className="tour-progress" style={{ animationDuration: `${INTERVAL}ms` }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
