import { useEffect, useState, type RefObject } from "react";

type Heading = { el: HTMLElement; text: string; level: number };

/** Notion's table-of-contents rail: dashes per heading that expand into a clickable outline on hover. */
export function Outline({ scroller }: { scroller: RefObject<HTMLDivElement | null> }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const collect = () => {
      const els = [...root.querySelectorAll<HTMLElement>(".betelgeuse-prose > h1, .betelgeuse-prose > h2, .betelgeuse-prose > h3")];
      setHeadings(els.filter((el) => el.textContent?.trim()).map((el) => ({ el, text: el.textContent!.trim(), level: Number(el.tagName[1]) })));
    };
    const onScroll = () => {
      const top = root.getBoundingClientRect().top + 80;
      const els = [...root.querySelectorAll<HTMLElement>(".betelgeuse-prose > h1, .betelgeuse-prose > h2, .betelgeuse-prose > h3")].filter((el) => el.textContent?.trim());
      let idx = 0;
      els.forEach((el, i) => el.getBoundingClientRect().top <= top && (idx = i));
      setActive(idx);
    };
    collect();
    onScroll();
    const observer = new MutationObserver(collect);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener("scroll", onScroll);
    };
  }, [scroller]);

  if (headings.length < 2) return null;

  return (
    <div onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} className="absolute top-24 right-3 z-20 flex justify-end">
      {open ? (
        <nav className="max-h-[60vh] w-60 overflow-y-auto rounded-lg border border-line bg-raised p-1.5 shadow-pop">
          {headings.map((h, i) => (
            <button
              key={i}
              onClick={() => h.el.scrollIntoView({ behavior: "smooth", block: "start" })}
              style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
              className={`block w-full truncate rounded-md py-1 pr-2 text-left text-[13px] hover:bg-hover ${i === active ? "text-[var(--blue)]" : "text-muted"}`}
            >
              {h.text}
            </button>
          ))}
        </nav>
      ) : (
        <div className="flex flex-col items-end gap-[9px] py-2 pl-4">
          {headings.map((h, i) => (
            <span
              key={i}
              style={{ width: h.level === 1 ? 16 : h.level === 2 ? 12 : 8 }}
              className={`h-[2px] rounded-full ${i === active ? "bg-ink" : "bg-[var(--line-strong)]"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
