import { useEffect, useRef, useState, type CSSProperties } from "react";
import { COLORS, colorLabel } from "../lib/colors";

/** Covers are stored in frontmatter as `cover: gradient_3`, `cover: color_blue` or an image URL. */
export const GRADIENTS = [
  "linear-gradient(120deg, #f6d365 0%, #fda085 100%)",
  "linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)",
  "linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
  "linear-gradient(120deg, #fbc2eb 0%, #a6c1ee 100%)",
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #e8471c 0%, #ffb35c 60%, #fff4e0 100%)",
  "linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)",
];

export function coverStyle(cover: string): CSSProperties {
  const g = /^gradient_(\d+)$/.exec(cover);
  if (g) return { background: GRADIENTS[(Number(g[1]) - 1) % GRADIENTS.length] };
  const c = /^color_([a-z]+)$/.exec(cover);
  if (c) return { background: `var(--c-${c[1]}-text)` };
  return { backgroundImage: `url("${cover}")`, backgroundSize: "cover", backgroundPosition: "center" };
}

export function CoverPicker({ onPick, onClose }: { onPick: (cover: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"gallery" | "link">("gallery");
  const [link, setLink] = useState("");
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute top-full left-0 z-40 mt-2 w-[420px] rounded-lg border border-line bg-raised shadow-pop">
      <div className="flex gap-3 border-b border-line px-3 text-sm">
        {(["gallery", "link"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 py-2 capitalize ${tab === t ? "border-ink text-ink" : "border-transparent text-muted"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "gallery" ? (
        <div className="max-h-80 overflow-y-auto p-3">
          <div className="mb-1.5 text-xs text-faint">Gradients</div>
          <div className="grid grid-cols-4 gap-2">
            {GRADIENTS.map((_, i) => (
              <button key={i} onClick={() => onPick(`gradient_${i + 1}`)} className="h-14 rounded-md hover:opacity-80" style={coverStyle(`gradient_${i + 1}`)} />
            ))}
          </div>
          <div className="mt-3 mb-1.5 text-xs text-faint">Colors</div>
          <div className="grid grid-cols-4 gap-2">
            {COLORS.filter((c) => c !== "default").map((c) => (
              <button key={c} title={colorLabel(c)} onClick={() => onPick(`color_${c}`)} className="h-14 rounded-md hover:opacity-80" style={coverStyle(`color_${c}`)} />
            ))}
          </div>
        </div>
      ) : (
        <form
          className="flex gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) onPick(link.trim());
          }}
        >
          <input
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste an image link…"
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-side px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
          />
          <button className="h-8 rounded-md bg-[var(--blue)] px-3 text-sm font-medium text-white">Submit</button>
        </form>
      )}
    </div>
  );
}
