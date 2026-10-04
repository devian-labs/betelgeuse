/** Notion's nine colours plus default. Each maps to --c-<name>-text / -bg / -tag CSS variables. */
export const COLORS = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type Color = (typeof COLORS)[number];

export const colorLabel = (c: Color) => c[0].toUpperCase() + c.slice(1);

export const textColor = (c: Color | string | null | undefined) => (c && c !== "default" ? `var(--c-${c}-text)` : undefined);
export const bgColor = (c: Color | string | null | undefined) => (c && c !== "default" ? `var(--c-${c}-bg)` : undefined);
export const tagColor = (c: Color | string | null | undefined) => `var(--c-${c && c !== "default" ? c : "gray"}-tag)`;

/** Rotates through colours for new select options, like Notion. */
export const nextColor = (used: number): Color => COLORS[1 + (used % (COLORS.length - 1))];
