/** Nine colours plus default. Each maps to --c-<name>-text / -bg / -tag CSS variables. */
export const COLORS = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type Color = (typeof COLORS)[number];

export const colorLabel = (c: Color) => c[0].toUpperCase() + c.slice(1);

export const textColor = (c: Color | string | null | undefined) => (c && c !== "default" ? `var(--c-${c}-text)` : undefined);
export const bgColor = (c: Color | string | null | undefined) => (c && c !== "default" ? `var(--c-${c}-bg)` : undefined);
export const tagColor = (c: Color | string | null | undefined) => `var(--c-${c && c !== "default" ? c : "gray"}-tag)`;

/** The order new select options take colours in: the vivid ones first, gray last. */
const ROTATION: Color[] = ["blue", "green", "orange", "purple", "pink", "yellow", "red", "brown", "gray"];

/** A colour for a new option: the first in the rotation its siblings don't use yet. */
export function nextColor(used: (Color | string | undefined)[]): Color {
  return ROTATION.find((c) => !used.includes(c)) ?? ROTATION[used.length % ROTATION.length];
}

/** A status option's colour from what it means: done is green, in progress blue, blocked red… */
export function statusColor(name: string): Color | null {
  const n = name.toLowerCase();
  if (/\b(done|complete|completed|finished|shipped|published|released|resolved|active|live|approved)\b/.test(n)) return "green";
  if (/\b(in progress|doing|ongoing|started|working|wip|in review|review|editing|recording|writing)\b/.test(n)) return "blue";
  if (/\b(blocked|stuck|failed|cancel(l)?ed|rejected|overdue|urgent)\b/.test(n)) return "red";
  if (/\b(paused|on hold|waiting|pending|dormant|someday|later)\b/.test(n)) return "yellow";
  if (/\b(planned|planning|next|scheduled|ready|idea|ideas|draft)\b/.test(n)) return "purple";
  if (/\b(archived|inactive|dropped)\b/.test(n)) return "brown";
  if (/\b(not started|to ?do|backlog|new|open|inbox)\b/.test(n)) return "gray";
  return null;
}

/** A fixed colour per label (page tags), so the same tag looks the same everywhere. */
export function labelColor(name: string): Color {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ROTATION[h % (ROTATION.length - 1)]; // never gray
}
