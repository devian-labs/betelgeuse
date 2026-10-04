"use client";

import { useState, type ReactNode } from "react";

export function Tabs({ label, tabs }: { label: string; tabs: { id: string; title: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id);
  return (
    <div className="tabs">
      <div className="tab-list" role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            className="tab"
            onClick={() => setActive(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
