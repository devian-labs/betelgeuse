import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";

export type MenuItem = {
  id: string;
  title: string;
  hint?: string;
  shortcut?: string;
  icon: ReactNode;
  section?: string;
  run: () => void;
};

export type MenuHandle = { onKeyDown: (e: KeyboardEvent) => boolean };

/** Keyboard-driven popup list shared by the slash menu, `[[` links and `@` mentions. */
export const SuggestionMenu = forwardRef<MenuHandle, { items: MenuItem[]; empty: string }>(({ items, empty }, ref) => {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setActive(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (!items.length) return false;
      if (e.key === "ArrowDown") return setActive((a) => (a + 1) % items.length), true;
      if (e.key === "ArrowUp") return setActive((a) => (a - 1 + items.length) % items.length), true;
      if (e.key === "Enter" || e.key === "Tab") return items[active]?.run(), true;
      return false;
    },
  }));

  return (
    <div ref={listRef} className="max-h-[360px] w-80 overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-pop">
      {items.length === 0 && <div className="px-2 py-1.5 text-sm text-faint">{empty}</div>}
      {items.map((item, i) => (
        <div key={item.id}>
          {item.section && item.section !== items[i - 1]?.section && (
            <div className={`px-2 pb-1 text-xs text-faint ${i ? "mt-1.5 border-t border-line pt-2" : "pt-1"}`}>{item.section}</div>
          )}
          <button
            data-index={i}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              item.run();
            }}
            className={`flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left ${i === active ? "bg-hover" : ""}`}
          >
            <span className="grid size-[22px] shrink-0 place-items-center rounded-[5px] border border-line bg-surface text-ink [&_svg]:size-[15px]">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.title}</span>
            {(item.shortcut || item.hint) && (
              <span className="max-w-32 shrink-0 truncate text-xs text-faint">{item.shortcut ?? item.hint}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
});
