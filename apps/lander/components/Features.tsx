"use client";

import { Blocks, FileText, MonitorSmartphone, Table2, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CodeWindow } from "./CodeWindow";
import { Laptop, Phone } from "./Devices";
import { Shot } from "./Shot";

const PLATFORMS: [string, string?][] = [["macOS"], ["Windows"], ["Linux"], ["Android", "preview"], ["iOS", "soon"]];

const features: { id: string; Icon: LucideIcon; title: string; body: ReactNode; visual: ReactNode }[] = [
  {
    id: "blocks",
    Icon: Blocks,
    title: "Write in blocks",
    body: (
      <>
        Type <kbd>/</kbd> for every block you need in your daily driver.
      </>
    ),
    visual: <Shot theme="light" name="slash" alt="The slash menu, listing blocks to add to a page" />,
  },
  {
    id: "databases",
    Icon: Table2,
    title: "Databases, with every view",
    body: "Table, board, list, gallery and calendar. Every row is a page.",
    visual: (
      <>
        <Shot theme="light" name="table" alt="A roadmap database as a table with totals" />
        <Phone theme="light" kind="android" name="board" alt="The same roadmap as a board on an Android phone" className="feature-phone" />
      </>
    ),
  },
  {
    id: "files",
    Icon: FileText,
    title: "No cloud. Just Markdown and git.",
    body: "Every page is a .md file you own. Every change is a git commit.",
    visual: (
      <>
        <Shot theme="light" name="history" alt="A page's history, with a version ready to restore" />
        <div className="feature-file">
          <CodeWindow
            code
            title="Roadmap/Ship the MCP server.md"
            lines={[
              ["---"],
              ["Status: In progress"],
              ["Priority: High"],
              ["Estimate: 3"],
              ["Due: 2026-10-09"],
              ["Tags: [agents]"],
              ["---"],
              ["Agents can query this database with `query_database`."],
            ]}
          />
        </div>
      </>
    ),
  },
  {
    id: "everywhere",
    Icon: MonitorSmartphone,
    title: "On every computer and phone",
    body: "Synced in the background through your own git repository.",
    visual: (
      <div className="devices feature-devices">
        <Laptop>
          <Shot theme="light" name="editor" alt="The Betelgeuse editor on a computer" />
        </Laptop>
        <Phone theme="light" kind="android" name="sync" alt="Sync settings on an Android phone" className="device-left" />
        <Phone theme="light" kind="ios" name="welcome" alt="The Welcome page on an iPhone" className="device-right" />
      </div>
    ),
  },
];

const INTERVAL = 7000;

/** Features on the right; picking one (or waiting, while it's on screen) swaps the picture on the left. */
export function Features() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const playing = auto && visible;
  useEffect(() => {
    if (!playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % features.length), INTERVAL);
    return () => clearTimeout(id);
  }, [playing, active]);

  return (
    <div className="wrap features" ref={ref}>
      <div className="feature-stage">
        {features.map((f, i) => (
          <div key={f.id} id={`feature-${f.id}`} role="tabpanel" className={`feature-slide feature-${f.id}${i === active ? " active" : ""}`} aria-hidden={i !== active}>
            {f.visual}
          </div>
        ))}
      </div>
      <div className="feature-list" role="tablist" aria-label="Features" aria-orientation="vertical">
        {features.map(({ id, Icon, title, body }, i) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls={`feature-${id}`}
            className={`feature-item${i === active ? " active" : ""}`}
            onClick={() => {
              setActive(i);
              setAuto(false);
            }}
          >
            <span className="feature-icon">
              <Icon size={19} />
            </span>
            <span className="feature-text">
              <strong>{title}</strong>
              <span className="feature-body">
                <span>
                  {body}
                  {id === "everywhere" && (
                    <span className="feature-platforms">
                      {PLATFORMS.map(([os, note]) => (
                        <span key={os} className="feature-platform">
                          {os}
                          {note && <small>{note}</small>}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </span>
            </span>
            {i === active && playing && <span key={active} className="feature-progress" style={{ animationDuration: `${INTERVAL}ms` }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
