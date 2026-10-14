import { useLayoutEffect, useState } from "react";

/**
 * The visible part of a scrolling element, kept current on scroll (once per frame) and resize, so a
 * long list can render just the rows on screen. Attach `ref` to the element; it follows the element
 * as it mounts and unmounts.
 */
export function useViewport() {
  const [el, ref] = useState<HTMLElement | null>(null);
  const [view, setView] = useState({ top: 0, height: 800, width: 800 });
  useLayoutEffect(() => {
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setView((v) => (v.top === el.scrollTop && v.height === el.clientHeight && v.width === el.clientWidth ? v : { top: el.scrollTop, height: el.clientHeight, width: el.clientWidth }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [el]);
  return { el, ref, view };
}

/** Which rows to render: those on screen plus `overscan` above and below. */
export function visibleRows(view: { top: number; height: number }, offset: number, stride: number, rows: number, overscan = 3) {
  const first = Math.max(0, Math.floor((view.top - offset) / stride) - overscan);
  const last = Math.min(rows, Math.ceil((view.top - offset + view.height) / stride) + overscan);
  return { first, last };
}
