import { icons } from "lucide-react";
import { Search, Shuffle, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import emojiGroups from "unicode-emoji-json/data-by-group.json";
import { api } from "../lib/api";
import { COLORS, colorLabel, textColor } from "../lib/colors";
import { PageIcon, lucideIcon } from "./PageIcon";

type Tab = "emoji" | "icons" | "upload";

// Newer emoji than the system font knows render as boxes; Unicode 15.0 is safe on current macOS.
const GROUPS = (emojiGroups as { name: string; slug: string; emojis: { emoji: string; name: string; emoji_version: string }[] }[])
  .map((g) => ({ ...g, emojis: g.emojis.filter((e) => parseFloat(e.emoji_version) <= 15) }))
  .filter((g) => g.emojis.length);

const GROUP_GLYPH: Record<string, string> = {
  smileys_emotion: "😀",
  people_body: "👋",
  animals_nature: "🐻",
  food_drink: "🍔",
  travel_places: "✈️",
  activities: "⚽",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
};

/** Splits PascalCase icon names into searchable words: "CalendarCheck2" -> "calendar check 2". */
const ICON_NAMES = Object.keys(icons).map((name) => ({ name, words: name.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase() }));

/** Everyday icons shown first, like Notion's default icon set. */
const SUGGESTED = [
  "FileText", "Book", "BookOpen", "Bookmark", "Notebook", "Briefcase", "Calendar", "SquareCheckBig", "ClipboardList", "ListTodo",
  "Code", "Terminal", "Bot", "Database", "Rocket", "Lightbulb", "Target", "Flag", "Trophy", "Star",
  "Heart", "Flame", "Zap", "Sparkles", "Sun", "Moon", "Cloud", "Leaf", "Globe", "Map",
  "Compass", "House", "Building2", "Users", "User", "MessageCircle", "Mail", "Inbox", "Bell", "Phone",
  "Camera", "Music", "Palette", "PenLine", "Pin", "Paperclip", "Link", "Tag", "Lock", "Key",
  "Settings", "Wrench", "Hammer", "ShoppingCart", "Wallet", "PiggyBank", "ChartLine", "ChartPie", "GraduationCap", "Coffee",
].filter((n) => n in icons);

const RECENTS_KEY = "icon-recents";
const readRecents = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
};

/** Notion-style icon picker: emoji, coloured flat icons, or a custom image. */
export function IconPicker({ onPick, onClose, current }: { onPick: (icon: string | null) => void; onClose: () => void; current?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>(() => (current?.startsWith("lucide:") ? "icons" : current?.startsWith(".assets/") ? "upload" : "emoji"));
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<string>(() => (current?.startsWith("lucide:") ? current.split(":")[2] ?? "default" : "default"));
  const [recents, setRecents] = useState(readRecents);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const pick = (icon: string) => {
    const next = [icon, ...recents.filter((r) => r !== icon)].slice(0, 24);
    setRecents(next);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* convenience only */
    }
    onPick(icon);
  };

  const random = () => {
    if (tab === "icons") {
      const { name } = ICON_NAMES[Math.floor(Math.random() * ICON_NAMES.length)];
      pick(lucideIcon(name, color));
    } else {
      const all = GROUPS.flatMap((g) => g.emojis);
      pick(all[Math.floor(Math.random() * all.length)].emoji);
    }
  };

  return (
    <div ref={ref} className="absolute top-full left-0 z-40 mt-1 flex h-[400px] w-[408px] flex-col overflow-hidden rounded-lg border border-line bg-raised text-sm shadow-pop">
      <div className="flex items-center gap-1 border-b border-line px-2">
        {(["emoji", "icons", "upload"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setQuery("");
            }}
            className={`relative px-2 py-2.5 capitalize ${tab === t ? "text-ink" : "text-muted hover:text-ink"}`}
          >
            {t === "emoji" ? "Emoji" : t === "icons" ? "Icons" : "Upload"}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
          </button>
        ))}
        <span className="flex-1" />
        {current && (
          <button onClick={() => onPick(null)} className="rounded-md px-2 py-1 text-muted hover:bg-hover">
            Remove
          </button>
        )}
      </div>

      {tab !== "upload" && (
        <div className="flex items-center gap-1.5 px-2 pt-2 pb-1">
          <label className="flex h-8 flex-1 items-center gap-2 rounded-md border border-line bg-[var(--search-bg)] px-2 focus-within:border-[var(--blue)]">
            <Search size={14} className="text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            />
          </label>
          <button title="Random" onClick={random} className="grid size-8 place-items-center rounded-md border border-line text-muted hover:bg-hover">
            <Shuffle size={15} />
          </button>
          {tab === "icons" && <ColorDots color={color} setColor={setColor} />}
        </div>
      )}

      {tab === "emoji" && <EmojiGrid query={query} recents={recents.filter((r) => !r.startsWith("lucide:") && !r.startsWith(".") && !r.startsWith("http"))} onPick={pick} />}
      {tab === "icons" && <IconGrid query={query} color={color} recents={recents.filter((r) => r.startsWith("lucide:"))} onPick={pick} />}
      {tab === "upload" && <UploadPane onPick={pick} />}
    </div>
  );
}

function ColorDots({ color, setColor }: { color: string; setColor: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button title="Icon color" onClick={() => setOpen((o) => !o)} className="grid size-8 place-items-center rounded-md border border-line hover:bg-hover">
        <span className="size-4 rounded-full border border-line" style={{ background: textColor(color) ?? "var(--muted)" }} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-10 mt-1 grid w-44 grid-cols-5 gap-1.5 rounded-lg border border-line bg-raised p-2 shadow-pop">
          {COLORS.map((c) => (
            <button
              key={c}
              title={colorLabel(c)}
              onClick={() => {
                setColor(c);
                setOpen(false);
              }}
              className={`grid size-7 place-items-center rounded-full hover:bg-hover ${c === color ? "ring-2 ring-[var(--blue)]" : ""}`}
            >
              <span className="size-4 rounded-full" style={{ background: textColor(c) ?? "var(--muted)" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmojiGrid({ query, recents, onPick }: { query: string; recents: string[]; onPick: (e: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const sections = useMemo(() => {
    if (q) {
      const hits = GROUPS.flatMap((g) => g.emojis).filter((e) => e.name.includes(q) || e.emoji === q);
      return [{ slug: "results", name: hits.length ? "Results" : "No emoji found", emojis: hits.map((e) => ({ emoji: e.emoji, name: e.name })) }];
    }
    const recent = recents.length ? [{ slug: "recent", name: "Recent", emojis: recents.map((emoji) => ({ emoji, name: emoji })) }] : [];
    return [...recent, ...GROUPS.map((g) => ({ slug: g.slug, name: g.name, emojis: g.emojis }))];
  }, [q, recents]);

  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sections.map((s) => (
          <section key={s.slug} data-group={s.slug}>
            <div className="sticky top-0 z-10 bg-raised px-1 pt-2 pb-1 text-xs font-medium text-faint">{s.name}</div>
            <div className="grid grid-cols-12">
              {s.emojis.map((e) => (
                <button key={e.emoji} title={e.name} onClick={() => onPick(e.emoji)} className="grid aspect-square w-full place-items-center rounded-md text-[22px] leading-none hover:bg-hover">
                  {e.emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {!q && (
        <div className="flex justify-between border-t border-line px-2 py-1">
          {GROUPS.map((g) => (
            <button
              key={g.slug}
              title={g.name}
              onClick={() => scroller.current?.querySelector(`[data-group="${g.slug}"]`)?.scrollIntoView({ block: "start" })}
              className="grid size-7 place-items-center rounded-md text-base opacity-60 grayscale hover:bg-hover hover:opacity-100 hover:grayscale-0"
            >
              {GROUP_GLYPH[g.slug] ?? g.emojis[0].emoji}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function IconGrid({ query, color, recents, onPick }: { query: string; color: string; recents: string[]; onPick: (icon: string) => void }) {
  const [limit, setLimit] = useState(240);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? ICON_NAMES.filter((i) => i.words.includes(q)) : ICON_NAMES), [q]);
  useEffect(() => setLimit(240), [q]);

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight > el.scrollHeight - 200) setLimit((l) => Math.min(l + 240, matches.length));
      }}
    >
      {!q && recents.length > 0 && (
        <>
          <div className="px-1 pt-2 pb-1 text-xs font-medium text-faint">Recent</div>
          <div className="grid grid-cols-12">
            {recents.map((r) => {
              const recolored = lucideIcon(r.split(":")[1], color);
              return (
                <button key={r} onClick={() => onPick(recolored)} className="grid aspect-square w-full place-items-center rounded-md hover:bg-hover">
                  <PageIcon icon={recolored} size={20} />
                </button>
              );
            })}
          </div>
        </>
      )}
      {!q && (
        <>
          <div className="px-1 pt-2 pb-1 text-xs font-medium text-faint">Suggested</div>
          <div className="grid grid-cols-12">
            {SUGGESTED.map((name) => (
              <button key={name} title={name} onClick={() => onPick(lucideIcon(name, color))} className="grid aspect-square w-full place-items-center rounded-md hover:bg-hover">
                <PageIcon icon={lucideIcon(name, color)} size={20} />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="px-1 pt-2 pb-1 text-xs font-medium text-faint">{q ? (matches.length ? `${matches.length} icons` : "No icons found") : "All icons"}</div>
      <div className="grid grid-cols-12">
        {matches.slice(0, limit).map(({ name, words }) => {
          const Icon = icons[name as keyof typeof icons];
          return (
            <button key={name} title={words} onClick={() => onPick(lucideIcon(name, color))} className="grid aspect-square w-full place-items-center rounded-md hover:bg-hover">
              <Icon size={20} style={{ color: textColor(color) ?? "var(--muted)" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Downscales an image to at most 256px (keeping GIFs and SVGs as they are) and returns its bytes. */
async function prepareImage(file: File): Promise<number[]> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") return [...new Uint8Array(await file.arrayBuffer())];
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
  return [...new Uint8Array(await blob.arrayBuffer())];
}

function UploadPane({ onPick }: { onPick: (icon: string) => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file (PNG, JPG, GIF, SVG or WebP).");
    setBusy(true);
    setError(null);
    try {
      const bytes = await prepareImage(file);
      const name = file.type === "image/gif" || file.type === "image/svg+xml" ? file.name : file.name.replace(/\.\w+$/, ".png");
      onPick(await api.saveAsset(name, bytes));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-3 p-3">
      <button
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files[0]);
        }}
        className={`flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted transition-colors ${
          dragging ? "border-[var(--blue)] bg-[var(--c-blue-bg)]" : "border-line-strong border-[var(--line-strong)] hover:bg-hover"
        }`}
      >
        <Upload size={22} />
        <span className="font-medium text-ink">{busy ? "Uploading…" : "Upload an image"}</span>
        <span className="text-xs">or drop it here · recommended 280 × 280 px</span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (/^https?:\/\//.test(link.trim())) onPick(link.trim());
          else setError("Paste a link that starts with http:// or https://");
        }}
        className="flex gap-2"
      >
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="…or paste an image link"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-[var(--search-bg)] px-2 text-sm text-ink outline-none focus:border-[var(--blue)]"
        />
        <button className="h-8 rounded-md bg-[var(--blue)] px-3 text-sm font-medium text-white hover:brightness-110">Submit</button>
      </form>
      {error && <p className="text-xs text-[var(--c-red-text)]">{error}</p>}
      <p className="text-[11px] text-faint">Images are saved in the workspace's .assets folder, so they're versioned in git with your pages.</p>
    </div>
  );
}
