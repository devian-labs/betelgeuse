import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { COLORS, colorLabel } from "../lib/colors";
import { assetUrl } from "./PageIcon";
import { Popover } from "./Popover";
import { Search, X } from "lucide-react";
import { updateSettings, useSettings } from "../lib/settings";
import { open } from "../lib/links";
import { reportDownload, searchUnsplash, UNSPLASH_APPS, UNSPLASH_HOME, UnsplashError, unsplashKey, type Credit, type UnsplashPhoto } from "../lib/unsplash";

/**
 * Covers are stored in frontmatter as `cover: gradient_3`, `cover: color_blue`, an image URL or
 * an image in the workspace (`.assets/…`, e.g. from a Notion import).
 */
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

/**
 * Free photos from Picsum (Unsplash pictures, no key or attribution needed). A seed always gives the
 * same photo, so the cover stays put: `https://picsum.photos/seed/<seed>/1600/600`.
 */
const randomSeed = () => Math.random().toString(36).slice(2, 10);
// 3:2, like most photos: tall enough to reposition (a 1600×600 band left only the middle to show).
export const photoCover = (seed = randomSeed()) => `https://picsum.photos/seed/${seed}/1800/1200`;
const photoThumb = (seed: string) => `https://picsum.photos/seed/${seed}/400/160`;

/** Shown under a web image: while it loads, and instead of it when offline. */
const FALLBACK = "linear-gradient(135deg, var(--hover) 0%, var(--side) 100%)";

/** `y` is the vertical position (0–100, frontmatter `coverY`); images are centred by default. */
/** Covers picked before photos were fetched whole were cut to a 1600×600 band: ask for the whole photo. */
export const uncropped = (cover: string) =>
  cover
    .replace(/^(https:\/\/picsum\.photos\/seed\/[^/]+)\/1600\/600$/, "$1/1800/1200")
    .replace(/^(https:\/\/images\.unsplash\.com\/.*)&w=1600&h=600&fit=crop/, "$1&w=2000");

export function coverStyle(cover: string, y = 50): CSSProperties {
  const g = /^gradient_(\d+)$/.exec(cover);
  if (g) return { background: GRADIENTS[(Number(g[1]) - 1) % GRADIENTS.length] };
  const c = /^color_([a-z]+)$/.exec(cover);
  if (c) return { background: `var(--c-${c[1]}-text)` };
  return { backgroundImage: `url("${uncropped(cover)}"), ${FALLBACK}`, backgroundSize: "cover", backgroundPosition: `center ${y}%` };
}

const isImage = (cover: string) => !/^(gradient|color)_/.test(cover);

/**
 * A cover band; workspace images (`.assets/…`) are loaded the way page icons are. With
 * `onPosition`, dragging the image up or down moves it within the band (reposition mode).
 */
export function CoverBox({
  cover,
  position = 50,
  onPosition,
  className,
  children,
}: {
  cover: string;
  position?: number;
  onPosition?: (y: number) => void;
  className?: string;
  children?: ReactNode;
}) {
  const local = cover.startsWith(".assets/");
  const box = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!local) return;
    let alive = true;
    setUrl(null);
    assetUrl(cover)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cover, local]);
  const style = local ? (url ? coverStyle(url, position) : { background: "var(--hover)" }) : coverStyle(cover, position);

  // The image's size, to know how far it can move: it's scaled to fill the band's width, and only
  // the part taller than the band can be shown or hidden.
  const src = local ? url : isImage(cover) ? uncropped(cover) : null;
  const repositioning = !!onPosition;
  useEffect(() => {
    if (!src || !repositioning) return;
    const img = new window.Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src, repositioning]);

  /** How many pixels of the image are hidden (above plus below the band). */
  const slackOf = () => {
    const rect = box.current!.getBoundingClientRect();
    const shown = natural ? Math.max(rect.height, (rect.width * natural.h) / natural.w) : rect.height * 2;
    return shown - rect.height;
  };
  const clamp = (y: number) => Math.round(Math.min(100, Math.max(0, y)));

  // Scrolling moves the image too (like dragging it), all the way to its top or bottom edge.
  const latest = useRef(position);
  latest.current = position;
  useEffect(() => {
    const el = box.current;
    if (!el || !onPosition) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const slack = slackOf();
      if (slack > 1) onPosition(clamp(latest.current + (e.deltaY / slack) * 100));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  const drag = (e: React.MouseEvent) => {
    if (!onPosition || !box.current || e.button !== 0) return;
    e.preventDefault();
    const slack = slackOf();
    if (slack <= 1) return;
    const startY = e.clientY;
    const start = position;
    const move = (ev: MouseEvent) => onPosition(clamp(start - ((ev.clientY - startY) / slack) * 100));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "grabbing";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div ref={box} className={`${className ?? ""} ${repositioning ? "cursor-grab select-none" : ""}`} style={style} onMouseDown={repositioning ? drag : undefined}>
      {repositioning && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rounded-md bg-black/55 px-2.5 py-1 text-xs text-white">Drag or scroll the image to reposition</span>
        </div>
      )}
      {children}
    </div>
  );
}

/** Opens under the button that asked for it (Change cover), kept inside the window. */
/** `credit` is the photographer, for Unsplash photos (shown on the cover, as Unsplash asks). */
export function CoverPicker({ anchor, onPick, onClose }: { anchor: HTMLElement | null; onPick: (cover: string, credit?: Credit) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"photos" | "gallery" | "link">("photos");
  const [seeds, setSeeds] = useState(() => Array.from({ length: 12 }, randomSeed));
  const [link, setLink] = useState("");
  return (
    <Popover anchor={anchor} onClose={onClose} placement="bottom-end" className="w-[420px]">
      <div className="flex gap-3 border-b border-line px-3 text-sm">
        {(["photos", "gallery", "link"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 py-2 capitalize ${tab === t ? "border-ink text-ink" : "border-transparent text-muted"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "photos" ? (
        <div className="max-h-96 overflow-y-auto p-3">
          <UnsplashSearch onPick={onPick} />
          <div className="mt-3 mb-1.5 flex items-center text-xs text-faint">
            <span className="flex-1">Random photos from Unsplash, via Picsum</span>
            <button onClick={() => setSeeds(Array.from({ length: 12 }, randomSeed))} className="rounded px-1.5 py-0.5 text-muted hover:bg-hover hover:text-ink">
              More
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {seeds.map((seed) => (
              <button
                key={seed}
                onClick={() => onPick(photoCover(seed))}
                className="h-16 rounded-md bg-hover bg-cover bg-center hover:opacity-80"
                style={{ backgroundImage: `url("${photoThumb(seed)}")` }}
              />
            ))}
          </div>
        </div>
      ) : tab === "gallery" ? (
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
    </Popover>
  );
}

/**
 * Search box for Unsplash photos. Without an Access Key it explains how to get one (free) and
 * keeps it on this computer; the random photos below work either way.
 */
function UnsplashSearch({ onPick }: { onPick: (cover: string, credit?: Credit) => void }) {
  const { unsplashKey: ownKey } = useSettings();
  const key = unsplashKey(ownKey);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");

  const run = async (q: string, p: number) => {
    if (!q.trim() || !key) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchUnsplash(key, q.trim(), p);
      setPhotos((prev) => (p === 1 ? r.photos : [...prev, ...r.photos]));
      setPages(r.pages);
      setPage(p);
      setSubmitted(q.trim());
    } catch (e) {
      setError(e instanceof UnsplashError ? e.message : "Couldn't reach Unsplash. Are you online?");
    } finally {
      setBusy(false);
    }
  };

  // Search as you type, after a pause.
  useEffect(() => {
    if (!query.trim()) return (setPhotos([]), setSubmitted(""), setError(null));
    const t = window.setTimeout(() => run(query, 1), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, key]);

  return (
    <div>
      <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-side px-2 focus-within:border-[var(--blue)]">
        <Search size={14} className="shrink-0 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Unsplash: mountains, desk, ocean…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-faint hover:text-ink">
            <X size={13} />
          </button>
        )}
      </label>

      {query.trim() && (!key || (error && !ownKey && /limit|accept/i.test(error))) && (
        <div className="mt-2 rounded-md bg-hover p-2.5 text-xs text-muted">
          {key ? "You can use your own free Unsplash Access Key instead." : "Searching needs a free Unsplash Access Key."}{" "}
          <button onClick={() => open(UNSPLASH_APPS)} className="text-[var(--blue)] hover:underline">
            Create an app on Unsplash
          </button>
          , copy its Access Key and paste it here. It's kept on this computer.
          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (keyInput.trim()) updateSettings({ unsplashKey: keyInput.trim() });
            }}
          >
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Access Key"
              className="h-7 min-w-0 flex-1 rounded border border-line bg-side px-2 font-mono text-xs text-ink outline-none focus:border-[var(--blue)]"
            />
            <button className="h-7 rounded bg-[var(--blue)] px-2.5 text-xs font-medium text-white">Save</button>
          </form>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-2 text-xs text-[var(--c-red-text)]">
          <span className="flex-1">{error}</span>
          {/unsplash didn't accept/i.test(error) && ownKey && (
            <button onClick={() => updateSettings({ unsplashKey: "" })} className="text-muted underline hover:text-ink">
              Stop using my key
            </button>
          )}
        </div>
      )}

      {submitted && !error && !busy && photos.length === 0 && <div className="mt-2 text-xs text-faint">No photos for "{submitted}".</div>}

      {photos.length > 0 && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="group/photo relative">
                <button
                  onClick={() => (reportDownload(key, p), onPick(p.cover, { name: p.author, url: p.authorUrl }))}
                  title={`Photo by ${p.author} on Unsplash`}
                  className="block h-16 w-full rounded-md bg-cover bg-center hover:opacity-80"
                  style={{ backgroundImage: `url("${p.thumb}")`, backgroundColor: p.color ?? undefined }}
                />
                <button
                  onClick={() => open(p.authorUrl)}
                  className="absolute inset-x-0 bottom-0 truncate rounded-b-md bg-black/55 px-1 text-left text-[10px] text-white/90 opacity-0 group-hover/photo:opacity-100 hover:underline"
                >
                  {p.author}
                </button>
              </div>
            ))}
          </div>
          {page < pages && (
            <button onClick={() => run(submitted, page + 1)} disabled={busy} className="mt-2 w-full rounded-md py-1 text-xs text-muted hover:bg-hover hover:text-ink disabled:opacity-50">
              {busy ? "Loading…" : "More results"}
            </button>
          )}
        </>
      )}
      {busy && photos.length === 0 && <div className="mt-2 text-xs text-faint">Searching…</div>}
    </div>
  );
}

/** "Photo by <name> on Unsplash", on covers from Unsplash (their guidelines ask for it). */
export function CoverCredit({ name, url }: Credit) {
  return (
    // Top right: the page icon overlaps the cover's bottom left, and the cover buttons sit bottom right.
    <div className="absolute top-3 right-4 z-20 rounded bg-black/45 px-1.5 py-0.5 text-[11px] text-white/85 opacity-0 transition-opacity group-hover/cover:opacity-100 hover:opacity-100">
      Photo by{" "}
      <button onClick={() => open(url)} className="underline-offset-2 hover:underline">
        {name}
      </button>{" "}
      on{" "}
      <button onClick={() => open(UNSPLASH_HOME)} className="underline-offset-2 hover:underline">
        Unsplash
      </button>
    </div>
  );
}
