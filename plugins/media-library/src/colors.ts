/** Tag colours, matching the app's: each tag name always gets the same colour. */
const ROTATION = ["blue", "green", "orange", "purple", "pink", "yellow", "red", "brown"];

export function labelColor(name: string) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ROTATION[h % ROTATION.length];
}
export const tagColor = (c: string) => `var(--c-${c}-tag)`;
